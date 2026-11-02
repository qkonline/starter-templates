// The component gallery: only under `npm run dev`. A built app answers 404 here, and the
// gallery itself isn't in the build (+page.svelte only imports it in development).
import { error } from '@sveltejs/kit';

export const prerender = false;

export function load() {
  if (!import.meta.env.DEV) error(404, 'Not found');
}
