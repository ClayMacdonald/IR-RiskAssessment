// Roles on the details screen and the question path each one takes.
// Shared with functions/api/completion.js, which accepts only these labels.
export const ROLES = [
  { label: 'Chief Compliance Officer', audience: 'csirt' },
  { label: 'Owner or Principal', audience: 'csirt' },
  { label: 'CSIRT Lead', audience: 'csirt' },
  { label: 'Secondary Lead', audience: 'csirt' },
  { label: 'Operations', audience: 'csirt' },
  { label: 'Staff (Supervised Person)', audience: 'staff' },
];

export const ROLE_LABELS = ROLES.map((r) => r.label);

export function audienceFor(role) {
  return ROLES.find((r) => r.label === role)?.audience ?? null;
}
