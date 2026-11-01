import { describe, expect, it, vi } from 'vitest';
import { fakeCtx } from '../test/fake-d1';
import { deleteAccount, finishCleanups } from './deletion';

/** R2 and the sync spaces, as far as deleting uses them; `failing` makes them throw. */
function outside(failing = { photos: false, spaces: false }) {
  const deleted: string[] = [];
  const wiped: string[] = [];
  const photos = {
    async list({ prefix }: { prefix: string }) {
      if (failing.photos) throw new Error('R2 timed out');
      return { objects: [{ key: `${prefix}a.webp` }], truncated: false };
    },
    async delete(keys: string[]) {
      deleted.push(...keys);
    },
  };
  const spaces = {
    idFromName: (name: string) => name,
    get: (name: string) => ({
      wipe: async () => {
        if (failing.spaces) throw new Error('object overloaded');
        wiped.push(name);
      },
    }),
  };
  return { photos, spaces, deleted, wiped };
}

describe('deleting an account', () => {
  it('goes from D1 at once, and what is outside D1 is finished later if it fails the first time', async () => {
    const failing = { photos: true, spaces: false };
    const o = outside(failing);
    const { ctx, env, db } = fakeCtx({ TEAMS: 'true', SYNC: 'true' });
    Object.assign(env, { PHOTOS: o.photos, SPACES: o.spaces });
    const now = 1_800_000_000_000;
    await ctx.db.createUser({ id: 'ann', email: 'ann@b.test', verified: true, password: null, now });
    await ctx.db.createTeam({ id: 'solo', name: 'Solo', userId: 'ann', now });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});

    await deleteAccount(ctx, 'ann');
    expect(await ctx.db.userById('ann')).toBeNull();
    // Its own space and the team it was alone in are wiped; the photos failed and wait.
    expect(o.wiped.sort()).toEqual(['team:solo', 'user:ann']);
    const left = db.prepare('SELECT kind, target, tries FROM core_cleanups').all();
    expect(left.map((r) => ({ ...r }))).toEqual([{ kind: 'photos', target: 'ann', tries: 1 }]);

    // The daily sweep, once R2 answers again.
    failing.photos = false;
    await finishCleanups(env);
    expect(o.deleted).toEqual(['photos/ann/a.webp']);
    expect(db.prepare('SELECT COUNT(*) AS n FROM core_cleanups').get()).toEqual({ n: 0 });
    quiet.mockRestore();
  });

  it('someone in more teams than D1 takes values in one statement can still leave them all', async () => {
    const { ctx } = fakeCtx({ TEAMS: 'true' });
    const now = 1_800_000_000_000;
    await ctx.db.createUser({ id: 'ann', email: 'ann@b.test', verified: true, password: null, now });
    for (let i = 0; i < 130; i++) await ctx.db.createTeam({ id: `t${i}`, name: `T${i}`, userId: 'ann', now });
    await ctx.db.deleteUser('ann');
    expect(await ctx.db.teamsOf('ann')).toEqual([]);
  });
});
