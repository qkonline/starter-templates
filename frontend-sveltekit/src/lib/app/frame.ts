// THE APP'S OWN FILE: an app's own frame around its signed-in pages (a sidebar, a tab bar), drawn
// by the core's (app) layout in place of its own header and footer. Null keeps the core's.
//
// The frame gets the signed-in person and the page as `children`, and must render the page
// inside `<main id="main">` (the skip link and the browser tests look for it). What the core's
// header offers is then the frame's to show: the app's links, Teams and Admin when
// `auth.features` has them, `<SyncStatus />` and `<SyncRefused />` with sync on, `<Bell />`, the
// account link, the unconfirmed-email banner and "Send feedback" (`<FeedbackDialog />`); see
// src/routes/(app)/+layout.svelte for how the core draws each.
//
// Kept apart from shell.ts, which the session code imports: only the layout reads this one.
//
//   import Frame from './Frame.svelte';
//   export const appFrame: AppFrame | null = Frame;

import type { Component, Snippet } from 'svelte';
import type { User } from '#lib/api/index.ts';

export type AppFrame = Component<{ user: User; children: Snippet }>;

export const appFrame: AppFrame | null = null;
