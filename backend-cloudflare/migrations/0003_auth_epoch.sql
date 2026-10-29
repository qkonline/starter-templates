-- Closing two gaps found in review: a sign-in racing a password change or a take-back, and tables
-- the daily sweep and account deletion read without an index.

-- Goes up whenever who may sign in changes (the address taken back, a reset, a new password). A
-- session made after a password check is made only while it's still the value read with the
-- account, so a sign-in that checked the old password can't land after the change.
ALTER TABLE users ADD COLUMN auth_epoch INTEGER NOT NULL DEFAULT 0;

-- The daily sweep ends sessions unused for a year.
CREATE INDEX sessions_used ON sessions (used);

-- The admin area lists people newest first.
CREATE INDEX users_created ON users (created DESC, id DESC);

-- An account's own messages and sent invites: its export, and deleting it.
CREATE INDEX messages_user ON messages (user_id);
CREATE INDEX invites_by ON invites (by_email);
