// The completion payload. Pure, so tests and the smoke test share it.
// Every field here must be named in the disclosure on the report screen (src/screens/report.js).
// Scores are not sent: the server computes them from the answers (functions/api/completion.js).
export function completionPayload(details, bank, answers) {
  return {
    name: details.name,
    email: details.email,
    role: details.role,
    answers: Object.fromEntries(bank.questions.map((q) => [q.id, answers[q.id]])),
  };
}
