-- The optional parts (PRD sections 4 to 7): notifications and push, teams and invites, the
-- admin area (suspending, support sessions, the audit log), contact messages, and error reports.
-- The tables are made whether or not an app switches the parts on, so switching one on later
-- needs no migration.

-- Suspended by an admin: every session ended, every sign-in refused.
ALTER TABLE users ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0;

-- A support session an admin opened: the person's own account, held back from its account and
-- security paths, and ended at `expires` (an hour). Ordinary sessions have no `expires`.
ALTER TABLE sessions ADD COLUMN support INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN expires INTEGER;

-- An admin's one-time code for a support session: good once, for 60 seconds.
CREATE TABLE support_codes (
  hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  admin_id TEXT NOT NULL,
  expires INTEGER NOT NULL
);

-- The bell. Kept 90 days (the daily sweep).
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT,
  created INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX notifications_user ON notifications (user_id, created DESC, id DESC);

-- The browsers that want push, one row per browser (its endpoint), with the keys that encrypt
-- what's sent to it.
CREATE TABLE push_subs (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX push_subs_user ON push_subs (user_id);

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created INTEGER NOT NULL
);

CREATE TABLE members (
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  joined INTEGER NOT NULL,
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX members_user ON members (user_id);

-- An invite by email: the link's token is stored hashed; `sent` is the last email, for the
-- 60 seconds between sends. Who invited is kept as they were, in case they leave. One per team
-- and address, so two sent at once can't both be made.
CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  by_name TEXT,
  by_email TEXT NOT NULL,
  created INTEGER NOT NULL,
  sent INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE UNIQUE INDEX invites_team_email ON invites (team_id, email);
CREATE INDEX invites_email ON invites (email);

-- Contact messages and feedback, for the admin area.
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT,
  email TEXT NOT NULL,
  user_id TEXT,
  message TEXT NOT NULL,
  page TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created INTEGER NOT NULL
);
CREATE INDEX messages_status ON messages (status, created DESC, id DESC);

-- Error and CSP reports, one row per signature (a hash of what makes two the same), counted.
-- At most 500 rows; the least recently seen go first. user_id: the latest account to report it.
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  signature TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  detail TEXT,
  url TEXT,
  release TEXT,
  user_id TEXT,
  count INTEGER NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX reports_seen ON reports (last_seen DESC, id DESC);

-- Reports per hour, repeats included, for "errors in the last 24 hours".
CREATE TABLE report_hours (
  hour INTEGER PRIMARY KEY,
  count INTEGER NOT NULL
);

-- What admins did: support sessions, suspensions, unsuspensions, deletions. Both people are kept
-- as they were then. Kept a year.
CREATE TABLE audit (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  admin_id TEXT NOT NULL,
  admin_name TEXT,
  admin_email TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_name TEXT,
  target_email TEXT NOT NULL,
  detail TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX audit_at ON audit (at DESC, id DESC);
