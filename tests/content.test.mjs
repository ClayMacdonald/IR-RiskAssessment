// Checks the question bank's structure and copy. Run with: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import bank from '../src/content/questions.json' with { type: 'json' };

const BANNED = [/—/, /–/, /--/, /\bcompliant\b/i, /\bcertified\b/i, /\bpass(ed|es|ing)?\b/i];
const REQUIRED = ['id', 'section', 'title', 'question', 'options', 'help', 'exam_finding', 'mapped_service'];

test('every question has the required fields and a valid section', () => {
  const sectionIds = bank.sections.map((s) => s.id);
  for (const q of bank.questions) {
    for (const f of REQUIRED) assert.ok(q[f] !== undefined && q[f] !== '', `${q.id} missing ${f}`);
    assert.ok(sectionIds.includes(q.section), `${q.id} has unknown section ${q.section}`);
  }
});

test('question ids are unique', () => {
  const ids = bank.questions.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every question scores its options 2, 1, 0 from best to worst', () => {
  for (const q of bank.questions) {
    assert.deepEqual(q.options.map((o) => o.points), [2, 1, 0], `${q.id} option points`);
  }
});

test('every section has at least one question and questions are grouped by section', () => {
  const order = bank.questions.map((q) => q.section);
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'questions are in section order');
  for (const s of bank.sections) assert.ok(order.includes(s.id), `section ${s.id} has questions`);
});

test('copy has no dashes or banned claims', () => {
  for (const q of bank.questions) {
    const text = [q.title, q.question, q.help, q.exam_finding, ...q.options.map((o) => o.label)].join(' ');
    for (const re of BANNED) assert.ok(!re.test(text), `${q.id} matches ${re}`);
  }
});

test('a "No", "Never" or "Neither" answer always scores 0', () => {
  for (const q of bank.questions) {
    for (const o of q.options) {
      if (/^(No\b|Never\b|Neither\b)/.test(o.label)) assert.equal(o.points, 0, `${q.id}: "${o.label}" scores ${o.points}`);
    }
  }
});
