/**
 * One libSQL client for the process.
 *
 * The same client library talks to a local file and to hosted SQLite, so
 * running locally and running on Vercel differ by one environment variable
 * rather than by a second adapter. The repositories below never learn which
 * one they are pointed at.
 */

import { createClient, type Client } from "@libsql/client";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS learners (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
  id             TEXT PRIMARY KEY,
  learner_id     TEXT NOT NULL,
  problem_id     TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  status         TEXT NOT NULL,
  draft          TEXT NOT NULL,
  started_at     TEXT NOT NULL,
  completed_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_attempts_learner ON attempts (learner_id, started_at DESC);

CREATE TABLE IF NOT EXISTS submissions (
  id                   TEXT PRIMARY KEY,
  attempt_id           TEXT NOT NULL REFERENCES attempts (id),
  kind                 TEXT NOT NULL,
  document             TEXT NOT NULL,
  change_test_response TEXT,
  idempotency_key      TEXT NOT NULL,
  submitted_at         TEXT NOT NULL,
  -- The idempotency guarantee, scoped to the attempt it belongs to. A retried
  -- submit collides here and the application returns the original evaluation
  -- instead of starting a second one. Scoped rather than global because a key
  -- is only meaningful against the resource it was sent to: two attempts using
  -- the same key are two different requests, and an unscoped constraint would
  -- silently hand the second one the first one's report.
  UNIQUE (attempt_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_submissions_attempt ON submissions (attempt_id);

CREATE TABLE IF NOT EXISTS evaluations (
  id            TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE REFERENCES submissions (id),
  status        TEXT NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  stages        TEXT NOT NULL DEFAULT '[]',
  report        TEXT,
  error         TEXT,
  created_at    TEXT NOT NULL,
  started_at    TEXT,
  finished_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_evaluations_status ON evaluations (status, created_at);
`;

declare global {
  // eslint-disable-next-line no-var
  var __crucibleDb: { client: Client; migrated: Promise<void> } | undefined;
}

function connect(): { client: Client; migrated: Promise<void> } {
  // Trimmed because these are usually pasted into a hosting dashboard, and a
  // trailing newline turns a correct token into an authentication failure.
  const url = process.env.DATABASE_URL?.trim() || "file:crucible.db";
  const authToken = process.env.DATABASE_AUTH_TOKEN?.trim() || undefined;

  // A remote database with no token reaches the server and comes back 401,
  // which reads as "the token is wrong" when the actual state is "there is no
  // token". Saying so here costs one branch and saves the guessing.
  //
  // Listed by scheme rather than as "not a file", because the tests connect to
  // :memory:, which is local and needs no token despite having no file scheme.
  if (/^(libsql|https?|wss?):/.test(url) && !authToken) {
    throw new Error(
      `DATABASE_URL points at ${url} but DATABASE_AUTH_TOKEN is empty. ` +
        "A hosted database needs both. Create the token with " +
        "`turso db tokens create <database-name>`; the account token from " +
        "`turso auth token` is a different thing and is rejected with a 401.",
    );
  }

  const client = createClient(authToken ? { url, authToken } : { url });

  // Six tables and no destructive changes, so CREATE TABLE IF NOT EXISTS is the
  // whole migration story. A real product would need versioned migrations; this
  // one would gain nothing from them yet.
  const migrated = client.executeMultiple(SCHEMA);

  return { client, migrated };
}

/** Cached on globalThis so Next.js hot reload does not open a client per edit. */
export function db(): Client {
  globalThis.__crucibleDb ??= connect();
  return globalThis.__crucibleDb.client;
}

export async function ready(): Promise<Client> {
  globalThis.__crucibleDb ??= connect();
  await globalThis.__crucibleDb.migrated;
  return globalThis.__crucibleDb.client;
}
