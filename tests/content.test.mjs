// Checks the question bank's structure and copy. Run with: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import bank from '../src/content/questions.json' with { type: 'json' };
import config from '../src/content/config.json' with { type: 'json' };

export const BANNED = [
  /\u2014/,
  /\u2013/,
  /--/,
  /\bcompliant\b/i,
  /\bcertified\b/i,
  /\bpass(ed|es|ing)?\b/i,
  /\bfail(s|ed|ing|ure)?\b/i,
];
const COMMON = ['id', 'section', 'type', 'audience', 'title', 'question', 'options', 'irp_ref', 'regsp_ref', 'tie_in', 'mapped_service'];
const BY_TYPE = { knowledge: ['explanation'], readiness: ['exam_finding', 'help'] };
const AUDIENCES = ['csirt', 'staff'];

const textOf = (q) =>
  [q.title, q.question, q.help, q.explanation, q.exam_finding, q.irp_ref, q.regsp_ref, q.tie_in, ...q.options.map((o) => o.label)]
    .filter(Boolean)
    .join(' ');

test('every question has the required fields for its type', () => {
  for (const q of bank.questions) {
    assert.ok(BY_TYPE[q.type], `${q.id}: unknown type ${q.type}`);
    for (const f of [...COMMON, ...BY_TYPE[q.type]]) assert.ok(q[f] !== undefined && q[f] !== '', `${q.id} missing ${f}`);
  }
});

test('question ids are unique and use snake case', () => {
  const ids = bank.questions.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z][a-z0-9_]+$/);
});

test('sections exist, carry crosswalk text, and questions are grouped in section order', () => {
  const ids = bank.sections.map((s) => s.id);
  assert.deepEqual(ids, [1, 2, 3, 4, 5, 6, 7, 8]);
  for (const s of bank.sections) for (const f of ['name', 'irp_sections', 'regsp_requirement']) assert.ok(s[f], `section ${s.id} ${f}`);
  const order = bank.questions.map((q) => q.section);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  for (const s of bank.sections) assert.ok(order.includes(s.id), `section ${s.id} has questions`);
});

test('knowledge questions have four options and exactly one correct answer', () => {
  for (const q of bank.questions.filter((x) => x.type === 'knowledge')) {
    assert.equal(q.options.length, 4, `${q.id} option count`);
    assert.equal(q.options.filter((o) => o.correct === true).length, 1, `${q.id} correct count`);
    for (const o of q.options) assert.ok(!('points' in o), `${q.id} knowledge option has points`);
    assert.equal(new Set(q.options.map((o) => o.label)).size, 4, `${q.id} duplicate options`);
  }
});

test('readiness questions score 2, 1, 0 and a "No" answer always scores 0', () => {
  for (const q of bank.questions.filter((x) => x.type === 'readiness')) {
    assert.deepEqual(q.options.map((o) => o.points), [2, 1, 0], `${q.id} option points`);
    for (const o of q.options) {
      assert.ok(!('correct' in o), `${q.id} readiness option marked correct`);
      if (/^(No\b|Never\b|Neither\b)/.test(o.label)) assert.equal(o.points, 0, `${q.id}: "${o.label}"`);
    }
    assert.ok(q.audience.includes('csirt') && !q.audience.includes('staff'), `${q.id} readiness is CSIRT only`);
  }
});

test('audiences are valid and every question reaches the CSIRT path', () => {
  for (const q of bank.questions) {
    assert.ok(Array.isArray(q.audience) && q.audience.length, `${q.id} audience`);
    for (const a of q.audience) assert.ok(AUDIENCES.includes(a), `${q.id} audience ${a}`);
    assert.ok(q.audience.includes('csirt'), `${q.id} not on CSIRT path`);
  }
});

test('bank size: about 28 to 35 questions, staff path 10 to 12', () => {
  const staff = bank.questions.filter((q) => q.audience.includes('staff'));
  assert.ok(bank.questions.length >= 28 && bank.questions.length <= 35, `bank has ${bank.questions.length}`);
  assert.ok(staff.length >= 10 && staff.length <= 12, `staff path has ${staff.length}`);
  assert.ok(staff.every((q) => q.type === 'knowledge'), 'staff see knowledge only');
});

test('every regsp_ref cites the CFR or says "none:" with a reason', () => {
  for (const q of bank.questions) {
    assert.ok(/^17 CFR \d/.test(q.regsp_ref) || /^none: \S.{10,}/.test(q.regsp_ref), `${q.id} regsp_ref: ${q.regsp_ref}`);
  }
});

test('every irp_ref names an IRP section or appendix', () => {
  for (const q of bank.questions) {
    assert.match(q.irp_ref, /(Section \d|Appendix [A-F]|Revision History|Document Information)/, q.id);
  }
});

test('every placeholder resolves to a default fact', () => {
  for (const q of bank.questions) {
    for (const [, name] of textOf(q).matchAll(/\{\{(\w+)\}\}/g)) assert.ok(name in bank.facts, `${q.id}: {{${name}}}`);
  }
});

test('copy has no dashes or banned claims', () => {
  const strings = [
    ...bank.questions.map((q) => [q.id, textOf(q)]),
    ...bank.sections.map((s) => [`section ${s.id}`, `${s.name} ${s.irp_sections} ${s.regsp_requirement}`]),
    ['facts', Object.values(bank.facts).join(' ')],
    ['config', JSON.stringify(config)],
  ];
  for (const [where, text] of strings) for (const re of BANNED) assert.ok(!re.test(text), `${where} matches ${re}`);
});

test('no personal names in content (role titles only)', () => {
  const all = JSON.stringify(bank) + JSON.stringify(config);
  for (const name of ['Coniglio', 'Philip']) assert.ok(!all.includes(name), name);
});

test('knowledge bands are configured from highest to lowest', () => {
  const b = config.knowledgeBands;
  assert.ok(b.ready > b.refresher && b.refresher > 0 && b.ready <= 100);
});
