// Lists the backend sends a page at a time: `{ <items>, next }`, with `next` passed back as
// `cursor` for the next page and null on the last (contract `NextCursor`).

export interface Page<T> {
  items: T[];
  next: string | null;
}

/** Add a page below what's shown, leaving out anything already there (a row can move between pages). */
export function appendPage<T>(shown: readonly T[], page: readonly T[], key: (item: T) => string): T[] {
  const have = new Set(shown.map(key));
  return [...shown, ...page.filter((item) => !have.has(key(item)))];
}
