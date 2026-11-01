-- The core's tables take a `core_` prefix, so an app's own tables can have the plain names it
-- would naturally pick (`messages`, `members`, `reports`, `notifications`...). SQLite renames the
-- references in other tables' foreign keys and keeps the indexes.
--
-- Migration numbers: the core uses 0001 to 0999; an app's own migrations start at 1000, so a
-- later release's core migrations never collide with an app's.
ALTER TABLE users RENAME TO core_users;
ALTER TABLE sessions RENAME TO core_sessions;
ALTER TABLE codes RENAME TO core_codes;
ALTER TABLE limits RENAME TO core_limits;
ALTER TABLE passkeys RENAME TO core_passkeys;
ALTER TABLE challenges RENAME TO core_challenges;
ALTER TABLE oauth_codes RENAME TO core_oauth_codes;
ALTER TABLE support_codes RENAME TO core_support_codes;
ALTER TABLE notifications RENAME TO core_notifications;
ALTER TABLE push_subs RENAME TO core_push_subs;
ALTER TABLE teams RENAME TO core_teams;
ALTER TABLE members RENAME TO core_members;
ALTER TABLE invites RENAME TO core_invites;
ALTER TABLE messages RENAME TO core_messages;
ALTER TABLE reports RENAME TO core_reports;
ALTER TABLE report_hours RENAME TO core_report_hours;
ALTER TABLE audit RENAME TO core_audit;
