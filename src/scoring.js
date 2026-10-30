import bank from './content/questions.json';
import config from './content/config.json';

export const SECTIONS = bank.sections;
export const QUESTIONS = bank.questions;

export const AUM_OPTIONS = ['Under $100M', '$100M to $500M', '$500M to $1.5B', '$1.5B or more'];
export const LARGE_AUM = '$1.5B or more';

export const EXAM_OPTIONS = ['No', 'Yes', 'An exam is underway now', 'Not sure'];

export function complianceDate(aum) {
  return aum === LARGE_AUM ? config.complianceDates.large : config.complianceDates.small;
}

export function maxPoints(question) {
  return Math.max(...question.options.map((o) => o.points));
}

export function sectionScores(answers) {
  return SECTIONS.map((section) => {
    const qs = QUESTIONS.filter((q) => q.section === section.id);
    const possible = qs.reduce((sum, q) => sum + maxPoints(q), 0);
    const earned = qs.reduce((sum, q) => sum + (q.options[answers[q.id]]?.points ?? 0), 0);
    return { ...section, earned, possible, percent: Math.round((earned / possible) * 100) };
  });
}

export function overallScore(sections) {
  const avg = sections.reduce((sum, s) => sum + (s.earned / s.possible) * 100, 0) / sections.length;
  return Math.round(avg);
}

export function band(score) {
  if (score >= 85) return { label: 'Exam-ready', tone: 'success' };
  if (score >= 60) return { label: 'Gaps an examiner would note', tone: 'warning' };
  return { label: 'High exposure', tone: 'danger' };
}

// Every question answered below full credit, lowest points first, ties kept in question order.
export function gaps(answers) {
  return QUESTIONS.map((q, index) => ({ q, index, points: q.options[answers[q.id]]?.points ?? 0 }))
    .filter((g) => g.points < maxPoints(g.q))
    .sort((a, b) => a.points - b.points || a.index - b.index)
    .map((g) => g.q);
}

export function topFindings(answers, limit = 3) {
  return gaps(answers).slice(0, limit);
}

export function examinedRecently(examAnswer) {
  return examAnswer === 'Yes' || examAnswer === 'An exam is underway now';
}

export function buildResults(state) {
  const sections = sectionScores(state.answers);
  const score = overallScore(sections);
  return {
    sections,
    score,
    band: band(score),
    complianceDate: complianceDate(state.details.aum),
    findings: topFindings(state.answers),
    gaps: gaps(state.answers),
  };
}
