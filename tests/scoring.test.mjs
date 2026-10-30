// Scoring for both question types, audience routing, option shuffling and client overrides.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import base from '../src/content/questions.json' with { type: 'json' };
import config from '../src/content/config.json' with { type: 'json' };
import { buildBank } from '../src/bank.js';
import { ROLES, audienceFor } from '../src/roles.js';
import {
  buildResults,
  correctIndex,
  knowledgeBand,
  optionOrders,
  questionsFor,
  readinessBand,
} from '../src/scoring.js';

const bank = buildBank(base, null, config.irpVersion);
const bands = config.knowledgeBands;
const CSIRT = 'CSIRT Lead';
const STAFF = 'Staff (Supervised Person)';

const allBest = (qs) => Object.fromEntries(qs.map((q) => [q.id, q.type === 'knowledge' ? correctIndex(q) : 0]));
const allWorst = (qs) =>
  Object.fromEntries(qs.map((q) => [q.id, q.type === 'knowledge' ? (correctIndex(q) + 1) % 4 : q.options.length - 1]));

// ---------- Routing ----------

test('every role maps to an audience; leadership roles take the CSIRT path', () => {
  for (const r of ROLES) assert.ok(['csirt', 'staff'].includes(audienceFor(r.label)), r.label);
  for (const r of ['Chief Compliance Officer', 'Owner or Principal', 'CSIRT Lead', 'Secondary Lead', 'Operations']) {
    assert.equal(audienceFor(r), 'csirt', r);
  }
  assert.equal(audienceFor(STAFF), 'staff');
  assert.equal(audienceFor('Intern'), null);
  assert.deepEqual(questionsFor(bank, 'Intern'), []);
});

test('CSIRT path gets the full bank; staff get knowledge questions marked for staff only', () => {
  assert.equal(questionsFor(bank, CSIRT).length, bank.questions.length);
  const staff = questionsFor(bank, STAFF);
  assert.equal(staff.length, 11);
  assert.ok(staff.every((q) => q.type === 'knowledge' && q.audience.includes('staff')));
});

// ---------- Scoring ----------

test('CSIRT, all best answers: both scores 100 and no findings', () => {
  const qs = questionsFor(bank, CSIRT);
  const r = buildResults({ bank, role: CSIRT, answers: allBest(qs) }, bands);
  assert.equal(r.readiness.score, 100);
  assert.equal(r.readiness.band.label, 'Exam-ready');
  assert.equal(r.knowledge.score, 100);
  assert.equal(r.knowledge.band.label, 'Ready to respond');
  assert.equal(r.gaps.length, 0);
  assert.equal(r.missed.length, 0);
});

test('CSIRT, all worst answers: both scores 0, every readiness gap and every knowledge miss listed', () => {
  const qs = questionsFor(bank, CSIRT);
  const r = buildResults({ bank, role: CSIRT, answers: allWorst(qs) }, bands);
  assert.equal(r.readiness.score, 0);
  assert.equal(r.readiness.band.label, 'High exposure');
  assert.equal(r.knowledge.score, 0);
  assert.equal(r.knowledge.band.label, 'Retraining needed');
  assert.equal(r.gaps.length, qs.filter((q) => q.type === 'readiness').length);
  assert.equal(r.missed.length, qs.filter((q) => q.type === 'knowledge').length);
  assert.deepEqual(r.missedBySection.map((g) => g.section.id), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('readiness uses the Reg S-P math: average of section percentages', () => {
  const qs = questionsFor(bank, CSIRT);
  const answers = allBest(qs);
  // Section 1 has two readiness questions. Drop one to 1 point: section 1 = 3/4 = 75%.
  answers.roles_tabletop = 1;
  const r = buildResults({ bank, role: CSIRT, answers }, bands);
  const sectionsWithReadiness = r.readiness.sections.length;
  assert.equal(r.readiness.sections.find((s) => s.id === 1).percent, 75);
  assert.equal(r.readiness.score, Math.round((75 + 100 * (sectionsWithReadiness - 1)) / sectionsWithReadiness));
  assert.ok(!r.readiness.sections.some((s) => s.id === 2 || s.id === 4), 'sections without readiness items are not averaged');
  assert.deepEqual(r.gaps.map((g) => g.q.id), ['roles_tabletop']);
});

test('readiness gaps sort lowest points first, ties in question order', () => {
  const qs = questionsFor(bank, CSIRT);
  const answers = allBest(qs);
  answers.roles_tabletop = 1;
  answers.records_ready = 2;
  answers.vendor_diligence = 2;
  const r = buildResults({ bank, role: CSIRT, answers }, bands);
  assert.deepEqual(r.gaps.map((g) => g.q.id), ['vendor_diligence', 'records_ready', 'roles_tabletop']);
});

test('knowledge is percent correct; unanswered counts as missed', () => {
  const qs = questionsFor(bank, STAFF);
  const answers = allBest(qs);
  delete answers[qs[0].id];
  answers[qs[1].id] = (correctIndex(qs[1]) + 1) % 4;
  const r = buildResults({ bank, role: STAFF, answers }, bands);
  assert.equal(r.knowledge.correct, 9);
  assert.equal(r.knowledge.total, 11);
  assert.equal(r.knowledge.score, 82);
  assert.equal(r.knowledge.band.label, 'Refresher recommended');
  assert.deepEqual(r.missed.map((q) => q.id), [qs[0].id, qs[1].id]);
});

test('staff never get a readiness score', () => {
  const qs = questionsFor(bank, STAFF);
  const r = buildResults({ bank, role: STAFF, answers: allBest(qs) }, bands);
  assert.equal(r.readiness, null);
  assert.ok(r.crosswalk.every((row) => row.readiness === null));
});

test('band thresholds', () => {
  assert.equal(knowledgeBand(90, bands).label, 'Ready to respond');
  assert.equal(knowledgeBand(89, bands).label, 'Refresher recommended');
  assert.equal(knowledgeBand(70, bands).label, 'Refresher recommended');
  assert.equal(knowledgeBand(69, bands).label, 'Retraining needed');
  assert.equal(readinessBand(85).tone, 'success');
  assert.equal(readinessBand(84).tone, 'warning');
  assert.equal(readinessBand(60).tone, 'warning');
  assert.equal(readinessBand(59).tone, 'danger');
});

test('crosswalk has one row per section seen, with IRP section, rule and result', () => {
  const csirt = buildResults({ bank, role: CSIRT, answers: allBest(questionsFor(bank, CSIRT)) }, bands);
  assert.equal(csirt.crosswalk.length, 8);
  for (const row of csirt.crosswalk) {
    assert.ok(row.irp_sections && row.regsp_requirement);
    assert.ok(row.knowledge.total > 0, `section ${row.id} has knowledge items`);
  }
  assert.equal(csirt.crosswalk.find((r) => r.id === 2).readiness, null);
  assert.equal(csirt.crosswalk.find((r) => r.id === 1).readiness.percent, 100);

  const staff = buildResults({ bank, role: STAFF, answers: {} }, bands);
  assert.deepEqual(staff.crosswalk.map((r) => r.id), [1, 2, 3, 4]);
});

// ---------- Shuffling ----------

test('knowledge options shuffle deterministically; readiness keeps best to worst', () => {
  const qs = questionsFor(bank, CSIRT);
  const a = optionOrders(qs, 12345);
  assert.deepEqual(a, optionOrders(qs, 12345), 'same seed, same order');
  assert.notDeepEqual(a, optionOrders(qs, 54321), 'different seed, different order');
  for (const q of qs) {
    assert.deepEqual([...a[q.id]].sort(), q.options.map((_, i) => i), `${q.id} is a permutation`);
    if (q.type === 'readiness') assert.deepEqual(a[q.id], [0, 1, 2]);
  }
  // Across the bank the correct answer should not sit in one position.
  const positions = new Set(qs.filter((q) => q.type === 'knowledge').map((q) => a[q.id].indexOf(correctIndex(q))));
  assert.ok(positions.size >= 3);
});

// ---------- Client overrides ----------

test('overrides change facts, hide, replace and add questions, and set the IRP version', () => {
  const added = { ...base.questions.find((q) => q.id === 'records_incident_log'), id: 'acme_extra', section: 2, title: 'Extra' };
  const b = buildBank(
    base,
    {
      irpVersion: 'Acme IRP v2.1',
      facts: { level1Response: '30 minutes', carrier: 'Acme Mutual' },
      hide: ['roles_tabletop'],
      replace: { notice_ag_delay: { title: 'Replaced title' } },
      add: [added],
    },
    config.irpVersion
  );
  assert.equal(b.irpVersion, 'Acme IRP v2.1');
  assert.ok(!b.questions.some((q) => q.id === 'roles_tabletop'));
  assert.equal(b.questions.find((q) => q.id === 'notice_ag_delay').title, 'Replaced title');
  const l1 = b.questions.find((q) => q.id === 'crit_level1_response');
  assert.ok(l1.options.some((o) => o.correct && o.label.includes('30 minutes')));
  assert.ok(l1.explanation.includes('30 minutes'));
  assert.ok(b.questions.find((q) => q.id === 'contain_carrier_counsel').explanation.includes('Acme Mutual'));
  const order = b.questions.map((q) => q.section);
  assert.deepEqual(order, [...order].sort((x, y) => x - y), 'added question placed in section order');
  assert.equal(b.questions.filter((q) => q.section === 2).at(-1).id, 'acme_extra');
});

test('default bank has every placeholder filled and leaves the source untouched', () => {
  assert.equal(buildBank(base, null, config.irpVersion).irpVersion, config.irpVersion);
  assert.ok(!JSON.stringify(bank.questions).includes('{{'));
  assert.ok(JSON.stringify(base.questions).includes('{{level1Response}}'));
});

test('every client override file builds a valid bank', () => {
  const dir = 'src/content/clients';
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  for (const f of files) {
    const b = buildBank(base, JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')), config.irpVersion);
    const ids = b.questions.map((q) => q.id);
    assert.equal(new Set(ids).size, ids.length, `${f}: duplicate ids`);
    assert.ok(!JSON.stringify(b.questions).includes('{{'), `${f}: unfilled placeholder`);
    for (const q of b.questions) {
      if (q.type === 'knowledge') assert.equal(q.options.filter((o) => o.correct).length, 1, `${f}: ${q.id}`);
      else assert.deepEqual(q.options.map((o) => o.points), [2, 1, 0], `${f}: ${q.id}`);
      for (const k of ['irp_ref', 'regsp_ref', 'tie_in']) assert.ok(q[k], `${f}: ${q.id} ${k}`);
    }
  }
});
