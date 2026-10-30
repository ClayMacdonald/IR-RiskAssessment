// Builds the question bank for one client: the default bank with that client's override merged in,
// and every {{placeholder}} filled from the merged facts. Pure, so it runs in the browser and in tests.
//
// Override format (src/content/clients/<clientId>.json, served by /api/client, see README):
// {
//   "irpVersion": "Acme Wealth IRP, version 2.1 (March 2027)",
//   "facts":   { "level1Response": "30 minutes" },
//   "hide":    ["roles_tabletop"],
//   "replace": { "crit_level1_response": { "options": [ ... ] } },
//   "add":     [ { full question object } ]
// }

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

function fillDeep(value, facts) {
  if (typeof value === 'string') return value.replace(PLACEHOLDER, (m, k) => (k in facts ? facts[k] : m));
  if (Array.isArray(value)) return value.map((v) => fillDeep(v, facts));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillDeep(v, facts)]));
  }
  return value;
}

export function buildBank(base, override, defaultIrpVersion) {
  const o = override && typeof override === 'object' ? override : {};
  const facts = { ...base.facts, ...(o.facts || {}) };
  const hide = new Set(Array.isArray(o.hide) ? o.hide : []);
  const replace = o.replace && typeof o.replace === 'object' ? o.replace : {};

  const merged = base.questions
    .filter((q) => !hide.has(q.id))
    .map((q) => (Object.hasOwn(replace, q.id) ? { ...q, ...replace[q.id], id: q.id } : q))
    .concat(Array.isArray(o.add) ? o.add : []);

  // Stable sort keeps added questions after the defaults within their section.
  const questions = merged
    .map((q, i) => ({ q, i }))
    .sort((a, b) => a.q.section - b.q.section || a.i - b.i)
    .map(({ q }) => fillDeep(q, facts));

  return {
    facts,
    irpVersion: typeof o.irpVersion === 'string' && o.irpVersion ? o.irpVersion : defaultIrpVersion,
    sections: base.sections,
    questions,
  };
}
