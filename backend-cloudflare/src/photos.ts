// Profile photos in R2 (PRD R2.3): each person's under photos/<user id>/, one object per photo,
// a new id with each so its address changes and can be cached for good. Only the current one is
// kept; the rest of the folder is cleared whenever a photo is set, and all of it when the
// account goes.

/** Where a photo is kept in R2. */
export const photoKey = (userId: string, photo: string) => `${photoPrefix(userId)}${photo}`;

/** The folder of a person's photos. */
export const photoPrefix = (userId: string) => `photos/${userId}/`;

/** Deletes every photo of this person but `keep` (all of them when it's null). */
export async function clearPhotos(bucket: R2Bucket, userId: string, keep: string | null = null): Promise<void> {
  const keepKey = keep ? photoKey(userId, keep) : null;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: photoPrefix(userId), cursor });
    const gone = page.objects.map((o) => o.key).filter((k) => k !== keepKey);
    if (gone.length) await bucket.delete(gone);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}
