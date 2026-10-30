// The completion notification payload, built from results. Pure, so tests and the Function share it.
// Every field here must be named in the disclosure on the report screen (src/screens/report.js).
export function completionPayload(details, results) {
  return {
    name: details.name,
    email: details.email,
    role: details.role,
    readinessScore: results.readiness ? results.readiness.score : null,
    knowledgeScore: results.knowledge.score,
    sections: results.crosswalk.map((row) => ({
      id: row.id,
      readiness: row.readiness ? row.readiness.percent : null,
      correct: row.knowledge ? row.knowledge.correct : 0,
      total: row.knowledge ? row.knowledge.total : 0,
    })),
    missed: results.missed.map((q) => q.id),
  };
}
