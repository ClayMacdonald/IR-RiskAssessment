// Scoring for both question types. Pure functions over a bank from src/bank.js.
//
// Answers are stored as the option's index in the bank (not its shuffled position on screen),
// so shuffling never changes a score.
//
// Program Readiness: readiness questions only, the Reg S-P Readiness Score math. Each section with
//   readiness questions scores points earned over points possible; the score is the average of those
//   section percentages. Bands: 85 and up Exam-ready, 60 and up Gaps an examiner would note.
// IRP Knowledge: percent of knowledge questions answered correctly. Bands from config.json.
import { audienceFor } from './roles.js';

export function questionsFor(bank, role) {
  const audience = audienceFor(role);
  return audience ? bank.questions.filter((q) => q.audience.includes(audience)) : [];
}

export function showsReadiness(role) {
  return audienceFor(role) === 'csirt';
}

// Small seeded generator (mulberry32) so the shuffled order stays the same when going Back.
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Display order per question: knowledge options shuffled, readiness options kept best to worst.
export function optionOrders(questions, seed) {
  const next = random(seed);
  return Object.fromEntries(
    questions.map((q) => {
      const order = q.options.map((_, i) => i);
      if (q.type === 'knowledge') {
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
      }
      return [q.id, order];
    })
  );
}

export const maxPoints = (q) => Math.max(...q.options.map((o) => o.points));
export const correctIndex = (q) => q.options.findIndex((o) => o.correct);
export const isCorrect = (q, answer) => answer != null && q.options[answer]?.correct === true;

export function readinessBand(score) {
  if (score >= 85) return { label: 'Exam-ready', tone: 'success' };
  if (score >= 60) return { label: 'Gaps an examiner would note', tone: 'warning' };
  return { label: 'High exposure', tone: 'danger' };
}

export function knowledgeBand(score, bands) {
  if (score >= bands.ready) return { label: 'Ready to respond', tone: 'success' };
  if (score >= bands.refresher) return { label: 'Refresher recommended', tone: 'warning' };
  return { label: 'Retraining needed', tone: 'danger' };
}

export function readinessScore(sections, questions, answers) {
  const scored = sections
    .map((s) => {
      const qs = questions.filter((q) => q.section === s.id && q.type === 'readiness');
      if (!qs.length) return null;
      const possible = qs.reduce((sum, q) => sum + maxPoints(q), 0);
      const earned = qs.reduce((sum, q) => sum + (q.options[answers[q.id]]?.points ?? 0), 0);
      return { id: s.id, earned, possible, percent: Math.round((earned / possible) * 100) };
    })
    .filter(Boolean);
  if (!scored.length) return null;
  const score = Math.round(scored.reduce((sum, s) => sum + (s.earned / s.possible) * 100, 0) / scored.length);
  return { score, sections: scored };
}

export function knowledgeScore(questions, answers) {
  const qs = questions.filter((q) => q.type === 'knowledge');
  if (!qs.length) return null;
  const correct = qs.filter((q) => isCorrect(q, answers[q.id])).length;
  return { score: Math.round((correct / qs.length) * 100), correct, total: qs.length };
}

// One row per lifecycle section the person saw: IRP sections, the Reg S-P requirement, and their result.
export function crosswalk(sections, questions, answers, readiness) {
  return sections
    .map((s) => {
      const qs = questions.filter((q) => q.section === s.id);
      if (!qs.length) return null;
      const k = qs.filter((q) => q.type === 'knowledge');
      return {
        ...s,
        readiness: readiness?.sections.find((r) => r.id === s.id) ?? null,
        knowledge: k.length ? { correct: k.filter((q) => isCorrect(q, answers[q.id])).length, total: k.length } : null,
      };
    })
    .filter(Boolean);
}

// Readiness answers below full credit, lowest points first, ties in question order.
export function readinessGaps(questions, answers) {
  return questions
    .map((q, index) => ({ q, index }))
    .filter(({ q }) => q.type === 'readiness')
    .map(({ q, index }) => ({ q, index, points: q.options[answers[q.id]]?.points ?? 0 }))
    .filter((g) => g.points < maxPoints(g.q))
    .sort((a, b) => a.points - b.points || a.index - b.index)
    .map(({ q, points }) => ({ q, points }));
}

export function missedKnowledge(questions, answers) {
  return questions.filter((q) => q.type === 'knowledge' && !isCorrect(q, answers[q.id]));
}

export function buildResults({ bank, role, answers }, bands) {
  const questions = questionsFor(bank, role);
  const readiness = showsReadiness(role) ? readinessScore(bank.sections, questions, answers) : null;
  const knowledge = knowledgeScore(questions, answers);
  const missed = missedKnowledge(questions, answers);
  return {
    questions,
    readiness: readiness && { ...readiness, band: readinessBand(readiness.score) },
    knowledge: knowledge && { ...knowledge, band: knowledgeBand(knowledge.score, bands) },
    crosswalk: crosswalk(bank.sections, questions, answers, readiness),
    gaps: readinessGaps(questions, answers),
    missed,
    // Missed knowledge questions grouped by section, in section order.
    missedBySection: bank.sections
      .map((s) => ({ section: s, questions: missed.filter((q) => q.section === s.id) }))
      .filter((g) => g.questions.length),
  };
}
