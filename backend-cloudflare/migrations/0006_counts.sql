-- Totals for the admin area kept as they change, so showing them reads one row instead of every
-- account (D1 bills rows read: a count over a million accounts is a million rows, each time).
CREATE TABLE core_counts (
  name TEXT PRIMARY KEY,
  n INTEGER NOT NULL
);
INSERT INTO core_counts (name, n) SELECT 'users', COUNT(*) FROM core_users;
INSERT INTO core_counts (name, n) SELECT 'teams', COUNT(*) FROM core_teams;

CREATE TRIGGER core_users_added AFTER INSERT ON core_users BEGIN
  UPDATE core_counts SET n = n + 1 WHERE name = 'users';
END;
CREATE TRIGGER core_users_removed AFTER DELETE ON core_users BEGIN
  UPDATE core_counts SET n = n - 1 WHERE name = 'users';
END;
CREATE TRIGGER core_teams_added AFTER INSERT ON core_teams BEGIN
  UPDATE core_counts SET n = n + 1 WHERE name = 'teams';
END;
CREATE TRIGGER core_teams_removed AFTER DELETE ON core_teams BEGIN
  UPDATE core_counts SET n = n - 1 WHERE name = 'teams';
END;

-- Only the suspended accounts are in it, so counting them reads only them.
CREATE INDEX users_suspended ON core_users (id) WHERE suspended = 1;
