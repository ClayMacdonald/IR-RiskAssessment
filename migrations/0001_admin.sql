-- Admin storage: clients and their access codes, completed assessments, and the admin audit log.
-- Apply with wrangler d1 migrations apply (see README, "Deploy"). Times are ISO 8601 UTC strings.

-- One row per client firm. code_hash is the SHA-256 hex of the normalized access code; the code
-- itself is never stored. A code is valid through the end of its expires date (UTC) unless revoked.
-- code_version goes up each time a new code is issued; sessions carry it, so older sessions end.
CREATE TABLE clients (
  client_id   TEXT PRIMARY KEY,
  firm_name   TEXT NOT NULL,
  code_hash   TEXT NOT NULL UNIQUE,
  code_version INTEGER NOT NULL DEFAULT 1,
  expires     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  created_by  TEXT NOT NULL,
  revoked_at  TEXT
);

-- One row per completed assessment. Scores and the bank snapshot are computed on the server.
-- Kept for the retention period in src/content/config.json (retentionYears), then purged.
CREATE TABLE submissions (
  id               TEXT PRIMARY KEY,
  client_id        TEXT NOT NULL REFERENCES clients (client_id) ON DELETE CASCADE,
  completed_at     TEXT NOT NULL,
  name             TEXT NOT NULL,
  email            TEXT NOT NULL,
  role             TEXT NOT NULL,
  irp_version      TEXT NOT NULL,
  readiness_score  INTEGER,
  knowledge_score  INTEGER NOT NULL,
  sections_json    TEXT NOT NULL,
  missed_json      TEXT NOT NULL,
  answers_json     TEXT NOT NULL,
  bank_json        TEXT NOT NULL
);
CREATE INDEX submissions_client ON submissions (client_id, completed_at);
CREATE INDEX submissions_completed ON submissions (completed_at);

-- Every admin view, download, create, change and delete. Rows are never updated.
CREATE TABLE audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  at           TEXT NOT NULL,
  actor_email  TEXT NOT NULL,
  action       TEXT NOT NULL,
  client_id    TEXT,
  detail       TEXT
);
CREATE INDEX audit_log_at ON audit_log (at);
