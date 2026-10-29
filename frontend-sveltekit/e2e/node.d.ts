// Just enough of Node for the e2e helpers and playwright.config.ts to read environment
// variables, without adding @types/node to a browser app.
declare const process: { env: Record<string, string | undefined> };
