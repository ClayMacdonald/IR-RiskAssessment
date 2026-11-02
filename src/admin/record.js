// Turns a stored record into the input generateReport() takes. Pure, so tests can check it.
// The firm name is the client's registered name, and the date is when the record was saved.
export function reportInput(submission) {
  return {
    details: { name: submission.name, email: submission.email, role: submission.role, firmName: submission.firmName },
    answers: submission.answers,
    bank: submission.bank,
    completedAt: new Date(submission.completedAt),
  };
}
