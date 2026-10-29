/** Where the backend under test answers: the server URL, ending in /api. */
export const API = (process.env.API_URL ?? 'http://localhost:8787/api').replace(/\/$/, '');
