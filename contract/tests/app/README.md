# The app's own contract tests

Tests for the paths in `../../app.yaml` go here, one file per area (`notes.test.ts`). They use
the same helpers as the core's tests (`../lib`: `call`, `expectReply`, `expectError`, `signUp`),
which check each reply against `app.yaml` (or `openapi.yaml` for a core path). A later release of
the template never changes this folder.
