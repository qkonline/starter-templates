-- The core every app shares: people, their sessions and passkeys, emailed codes, and the
-- short-lived records of signing in. Session tokens, codes and OAuth exchange codes are only
-- ever stored hashed; passwords never arrive at all, only a key made from one on the device,
-- and that is stored hashed again (src/password.ts).

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  -- algorithm$params$salt$hash, or NULL for an account made with Google or a code.
  password TEXT,
  name TEXT,
  -- The current photo's id, new with each photo; it's kept in R2 at photos/<user id>/<photo id>.
  photo TEXT,
  created INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  device TEXT NOT NULL,
  created INTEGER NOT NULL,
  used INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

-- One code per purpose and address (or account): sign-in, reset, confirm, change.
CREATE TABLE codes (
  key TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL,
  expires INTEGER NOT NULL
);

-- Rate limits: a count per key (an address or a network) in a window that starts at `start`.
CREATE TABLE limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  start INTEGER NOT NULL
);

CREATE TABLE passkeys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  device TEXT NOT NULL,
  created INTEGER NOT NULL,
  used INTEGER
);
CREATE INDEX passkeys_user ON passkeys (user_id);

-- A passkey challenge can be answered once, within 5 minutes. user_id is '' for signing in.
CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires INTEGER NOT NULL
);

-- Back from Google: a one-time code, good for 60 seconds, that the frontend trades for a session.
CREATE TABLE oauth_codes (
  hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  is_new INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
