import { describe, expect, it, vi } from 'vitest';
import {
  createAnalytics,
  gaScript,
  posthogOptions,
  routeName,
  scrubEvent,
  scrubUrl,
  type AnalyticsConfig,
  type AnalyticsDeps,
  type Consent,
  type PostHogLike,
} from './core';

function setup(config: Partial<AnalyticsConfig>, consent: Consent = null) {
  const calls: [string, ...unknown[]][] = [];
  const posthog: PostHogLike = {
    init: (...a) => calls.push(['init', ...a]),
    capture: (...a) => calls.push(['capture', ...a]),
    identify: (...a) => calls.push(['identify', ...a]),
    reset: () => calls.push(['reset']),
    opt_in_capturing: (...a) => calls.push(['opt_in_capturing', ...a]),
    opt_out_capturing: () => calls.push(['opt_out_capturing']),
  };
  const scripts: string[] = [];
  const global: AnalyticsDeps['global'] = {};
  let stored = consent;
  const loadPostHog = vi.fn(async () => posthog);
  const analytics = createAnalytics(
    { posthogKey: '', posthogHost: 'https://eu.i.posthog.com', gaId: '', ...config },
    {
      loadPostHog,
      loadScript: (src) => scripts.push(src),
      global,
      here: () => ({
        url: 'https://app.test/signin?email=a%40b.c&next=%2Fteam',
        referrer: 'https://app.test/invite?token=secret',
      }),
      readConsent: () => stored,
      writeConsent: (c) => (stored = c),
    },
  );
  const gaEvents = () => (global.dataLayer ?? []).map((args) => [...(args as IArguments)]);
  const sent = () => calls.filter((c) => c[0] === 'capture' || c[0] === 'identify');
  return { analytics, calls, scripts, global, loadPostHog, gaEvents, sent, stored: () => stored };
}

describe('analytics gating', () => {
  it('loads nothing and asks nothing without keys', async () => {
    const { analytics, scripts, loadPostHog } = setup({});
    analytics.start();
    analytics.page('/app');
    analytics.track('clicked');
    analytics.identify('u1');
    await analytics.flush();
    expect(analytics.enabled).toBe(false);
    expect(analytics.needsConsent).toBe(false);
    expect(loadPostHog).not.toHaveBeenCalled();
    expect(scripts).toEqual([]);
  });

  it('loads PostHog only once the person agrees', async () => {
    const { analytics, calls, loadPostHog } = setup({ posthogKey: 'phc_1' });
    analytics.start();
    analytics.page('/app');
    analytics.track('clicked');
    analytics.identify('u1');
    await analytics.flush();
    expect(analytics.needsConsent).toBe(true);
    expect(loadPostHog).not.toHaveBeenCalled();
    expect(calls).toEqual([]);

    analytics.setConsent('granted');
    await analytics.flush();
    expect(calls[0]![0]).toBe('init');
    expect((calls[0]![2] as { persistence: string }).persistence).toBe('localStorage+cookie');
    // Signed in before agreeing: identified once agreed, not before.
    expect(calls.filter((c) => c[0] === 'identify')).toEqual([['identify', 'u1']]);
  });

  it('starts PostHog at once when consent was given before', async () => {
    const { analytics, calls } = setup({ posthogKey: 'phc_1' }, 'granted');
    analytics.start();
    await analytics.flush();
    expect(calls[0]![0]).toBe('init');
    expect(calls[1]).toEqual(['opt_in_capturing', { captureEventName: false }]);
  });

  it('never loads anything after a no', async () => {
    const { analytics, loadPostHog, scripts, global } = setup({ posthogKey: 'phc_1', gaId: 'G-1' }, 'denied');
    analytics.start();
    analytics.page('/app');
    analytics.identify('u1');
    await analytics.flush();
    expect(loadPostHog).not.toHaveBeenCalled();
    expect(scripts).toEqual([]);
    expect(global.gtag).toBeUndefined();
  });

  it('stops both when consent is withdrawn', async () => {
    const { analytics, calls, gaEvents, global } = setup({ posthogKey: 'phc_1', gaId: 'G-1' }, 'granted');
    analytics.start();
    analytics.identify('u1');
    analytics.setConsent('denied');
    const gaBefore = gaEvents().length;
    analytics.page('/app');
    analytics.track('clicked');
    analytics.identify('u2');
    await analytics.flush();
    expect(calls.at(-1)).toEqual(['opt_out_capturing']);
    expect(calls.filter((c) => c[0] === 'capture')).toEqual([]);
    expect(calls.filter((c) => c[0] === 'identify')).toEqual([['identify', 'u1']]);
    expect(gaEvents().at(-1)).toEqual(['consent', 'update', { analytics_storage: 'denied' }]);
    expect(gaEvents()).toHaveLength(gaBefore);
    expect(global['ga-disable-G-1']).toBe(true);

    // And back on: PostHog opts in again and is told who it is.
    analytics.setConsent('granted');
    await analytics.flush();
    expect(global['ga-disable-G-1']).toBe(false);
    expect(calls.at(-2)).toEqual(['opt_in_capturing', { captureEventName: false }]);
    expect(calls.at(-1)).toEqual(['identify', 'u2']);
  });

  it('loads Google Analytics only after consent, and never after a no', () => {
    const yes = setup({ gaId: 'G-1' });
    yes.analytics.start();
    expect(yes.scripts).toEqual([]);
    yes.analytics.setConsent('granted');
    expect(yes.scripts).toEqual([gaScript('G-1')]);
    expect(yes.stored()).toBe('granted');

    const no = setup({ gaId: 'G-1' });
    no.analytics.start();
    no.analytics.setConsent('denied');
    no.analytics.page('/app');
    expect(no.scripts).toEqual([]);
    expect(no.global.gtag).toBeUndefined();
  });

  it('sends page views to both, without codes, tokens or titles', async () => {
    const { analytics, calls, gaEvents } = setup({ posthogKey: 'phc_1', gaId: 'G-1' }, 'granted');
    analytics.start();
    analytics.page('https://app.test/invite?token=secret&tab=2#x', '/invite');
    await analytics.flush();
    expect(calls.find((c) => c[0] === 'capture')).toEqual([
      'capture',
      '$pageview',
      { $current_url: 'https://app.test/invite?tab=2' },
    ]);
    const page = { page_location: 'https://app.test/invite?tab=2', page_title: '/invite' };
    expect(gaEvents().find((e) => e[0] === 'set')).toEqual(['set', page]);
    expect(gaEvents().find((e) => e[0] === 'event')).toEqual(['event', 'page_view', page]);
  });

  it('tells Google Analytics the scrubbed address from the start', () => {
    const { analytics, gaEvents } = setup({ gaId: 'G-1' }, 'granted');
    analytics.start();
    expect(gaEvents().find((e) => e[0] === 'config')).toEqual([
      'config',
      'G-1',
      {
        send_page_view: false,
        page_location: 'https://app.test/signin',
        page_title: '/signin',
        page_referrer: 'https://app.test/invite',
      },
    ]);
  });

  it('identifies by id on sign-in and forgets on sign-out', async () => {
    const { analytics, calls, gaEvents } = setup({ posthogKey: 'phc_1', gaId: 'G-1' }, 'granted');
    analytics.start();
    analytics.identify('u1');
    analytics.identify('u1');
    analytics.reset();
    await analytics.flush();
    expect(calls.filter((c) => c[0] === 'identify')).toEqual([['identify', 'u1']]);
    expect(calls.at(-1)).toEqual(['reset']);
    expect(gaEvents().filter((e) => e[0] === 'set')).toEqual([
      ['set', { user_id: 'u1' }],
      ['set', { user_id: null }],
    ]);
  });

  it('never breaks the app when PostHog fails to load', async () => {
    const { analytics, loadPostHog } = setup({ posthogKey: 'phc_1' }, 'granted');
    loadPostHog.mockRejectedValueOnce(new Error('blocked'));
    analytics.start();
    analytics.page('/app');
    await expect(analytics.flush()).resolves.toBeUndefined();
  });
});

describe('scrubUrl', () => {
  it('drops sensitive parameters from absolute and relative addresses', () => {
    expect(scrubUrl('https://a.test/auth/callback?code=1&x=2')).toBe('https://a.test/auth/callback?x=2');
    expect(scrubUrl('/signin?next=%2Finvite%3Ftoken%3Dabc&email=a@b.c')).toBe('/signin');
    expect(scrubUrl('/team?id=t1')).toBe('/team?id=t1');
  });
});

describe('what PostHog is given', () => {
  it('masks text, attributes and personal parameters, and scrubs before sending', () => {
    const options = posthogOptions('https://eu.i.posthog.com');
    expect(options).toMatchObject({
      mask_all_text: true,
      mask_all_element_attributes: true,
      mask_personal_data_properties: true,
      custom_personal_data_properties: ['code', 'token', 'email', 'next', 'session', 'state'],
      disable_session_recording: true,
      before_send: scrubEvent,
    });
    expect(options).not.toHaveProperty('sanitize_properties');
  });

  it('scrubs every address in properties, $set, $set_once and the clicked element', () => {
    const event = scrubEvent({
      event: '$autocapture',
      properties: {
        $current_url: 'https://a.test/invite?token=t1&tab=2',
        $referrer: 'https://a.test/auth/callback?code=c1',
        $pathname: '/invite',
        custom: { link: '/signin?email=a%40b.c' },
        list: ['?session=s1&x=1'],
        $elements_chain:
          'a.nav:attr__href="/invite?token=t1"href="https://a.test/auth/callback?code=c1&n=2"nth-child="1";div:text="hello"',
        count: 3,
        word: 'plain text',
      },
      $set: { $current_url: 'https://a.test/forgot?email=a%40b.c' },
      $set_once: { $initial_current_url: 'https://a.test/?state=s', $initial_referrer: '$direct' },
    })!;
    expect(event.properties).toEqual({
      $current_url: 'https://a.test/invite?tab=2',
      $referrer: 'https://a.test/auth/callback',
      $pathname: '/invite',
      custom: { link: '/signin' },
      list: ['/?x=1'],
      $elements_chain:
        'a.nav:attr__href="/invite"href="https://a.test/auth/callback?n=2"nth-child="1";div:text="hello"',
      count: 3,
      word: 'plain text',
    });
    expect(event.$set).toEqual({ $current_url: 'https://a.test/forgot' });
    expect(event.$set_once).toEqual({
      $initial_current_url: 'https://a.test/',
      $initial_referrer: '$direct',
    });
    expect(scrubEvent(null)).toBeNull();
  });
});

describe('routeName', () => {
  it('names a page by its route, without the groups', () => {
    expect(routeName('/(app)/team')).toBe('/team');
    expect(routeName('/(app)/admin/people')).toBe('/admin/people');
    expect(routeName('/(site)')).toBe('/');
    expect(routeName(null)).toBe('/');
  });
});
