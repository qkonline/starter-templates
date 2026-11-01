-- Background jobs (src/jobs.ts): work done later, or again until it succeeds, by the cron that
-- runs every minute. `key` makes enqueueing the same job twice one job.
CREATE TABLE core_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  key TEXT UNIQUE,
  run_at INTEGER NOT NULL,
  locked_until INTEGER,
  tries INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  dead INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);
CREATE INDEX jobs_due ON core_jobs (dead, run_at);
