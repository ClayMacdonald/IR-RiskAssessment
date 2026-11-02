// Completed assessments in D1 (submissions table, migrations/0001_admin.sql).
// Every score here comes from the server's own scoring of the stored answers.

function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Builds the row from validated input and the server's results.
export function submissionRecord({ clientId, name, email, role, answers, bank, results, now = new Date() }) {
  return {
    id: randomId(),
    clientId,
    completedAt: now.toISOString(),
    name,
    email,
    role,
    irpVersion: bank.irpVersion,
    readinessScore: results.readiness ? results.readiness.score : null,
    knowledgeScore: results.knowledge ? results.knowledge.score : null,
    sections: results.crosswalk.map((row) => ({
      id: row.id,
      readiness: row.readiness ? row.readiness.percent : null,
      correct: row.knowledge ? row.knowledge.correct : null,
      total: row.knowledge ? row.knowledge.total : null,
    })),
    missed: results.missed.map((q) => q.id),
    answers,
    bank,
  };
}

export function insertSubmissionStatement(db, r) {
  return db
    .prepare(
      `INSERT INTO submissions (id, client_id, completed_at, name, email, role, irp_version, readiness_score,
         knowledge_score, sections_json, missed_json, answers_json, bank_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      r.id,
      r.clientId,
      r.completedAt,
      r.name,
      r.email,
      r.role,
      r.irpVersion,
      r.readinessScore,
      r.knowledgeScore,
      JSON.stringify(r.sections),
      JSON.stringify(r.missed),
      JSON.stringify(r.answers),
      JSON.stringify(r.bank)
    );
}
