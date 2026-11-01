-- What deleting an account or a team still has to do outside D1 (photos in R2, synced data in
-- its Durable Object, the app's own files): written in the same batch as the deletion, done
-- straight after, and finished by the daily sweep if anything failed on the way, so nothing of
-- a deleted account is left behind by a timeout.
CREATE TABLE core_cleanups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  target TEXT NOT NULL,
  created INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0
);

-- A browser's push subscription belongs to the session that turned it on, so it ends with it: a
-- device signed out (or ended from another device) stops getting the person's notifications.
ALTER TABLE core_push_subs ADD COLUMN session_id TEXT;
CREATE INDEX push_subs_session ON core_push_subs (session_id);
