// The daily limits on invite email: per team, per inviting account (resends count), and for the
// whole app, under the mail provider's free quota. The app's cap is off with dev mail, where
// nothing is sent.
import { describe, expect, it } from 'vitest';
import { fakeCtx } from '../../test/fake-d1';
import { countInviteMail, INVITE_MAILS_PER_DAY } from './teams';

const settled = async (n: number, f: (i: number) => Promise<unknown>) => {
  let ok = 0;
  for (let i = 0; i < n; i++) ok += await f(i).then(() => 1, () => 0);
  return ok;
};

describe('invite email', () => {
  it('50 a day from one account, across its teams', async () => {
    const { ctx } = fakeCtx({ DEV_MAIL: 'true' });
    expect(await settled(60, (i) => countInviteMail(ctx, `team${i % 3}`, 'ann'))).toBe(50);
    await countInviteMail(ctx, 'team0', 'bob');
  });

  it('50 a day from one team, whoever sends them', async () => {
    const { ctx } = fakeCtx({ DEV_MAIL: 'true' });
    expect(await settled(60, (i) => countInviteMail(ctx, 'team', `admin${i % 3}`))).toBe(50);
  });

  it(`${INVITE_MAILS_PER_DAY} a day from the whole app, when mail is really sent`, async () => {
    const live = fakeCtx({ RESEND_API_KEY: 're_x' }).ctx;
    expect(await settled(100, (i) => countInviteMail(live, `team${i}`, `admin${i}`))).toBe(INVITE_MAILS_PER_DAY);
    const dev = fakeCtx({ DEV_MAIL: 'true' }).ctx;
    expect(await settled(100, (i) => countInviteMail(dev, `team${i}`, `admin${i}`))).toBe(100);
  });
});
