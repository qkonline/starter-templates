// Analytics (PRD R3.4): PostHog, Google Analytics 4, both, or neither, each switched on by its
// key at build time. Nothing loads without a key, and nothing loads, is stored or is sent until
// the person agrees (the consent banner). Saying no later stops both at once.
//
// What is sent is kept free of the person: no addresses with codes, tokens or emails in them,
// no text or attributes of the elements clicked (PostHog's autocapture), no page titles (team
// names), and the account id rather than the email.
//
// Kept free of `$app` imports and real globals so the tests hand in fakes; the app's one
// instance is in ./index.ts.

export type Consent = 'granted' | 'denied' | null;

export interface AnalyticsConfig {
  posthogKey: string;
  posthogHost: string;
  gaId: string;
}

/** The part of posthog-js used here. */
export interface PostHogLike {
  init(key: string, options: Record<string, unknown>): unknown;
  capture(event: string, props?: Record<string, unknown>): unknown;
  identify(id: string): unknown;
  reset(): unknown;
  opt_in_capturing(options?: { captureEventName?: string | null | false }): unknown;
  opt_out_capturing(): unknown;
}

/** What PostHog hands `before_send`: one event, about to go. */
export interface PostHogEvent {
  event: string;
  properties: Record<string, unknown>;
  $set?: Record<string, unknown>;
  $set_once?: Record<string, unknown>;
}

export interface AnalyticsDeps {
  /** Import posthog-js (a separate chunk, fetched only when PostHog is on). */
  loadPostHog: () => Promise<PostHogLike>;
  /** Add a <script src> to the page. */
  loadScript: (src: string) => void;
  /** Where gtag's queue and its off switch (`ga-disable-<id>`) live (`window`). */
  global: { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; [key: string]: unknown };
  /** The page's address and referrer now, for Google Analytics' first page. */
  here: () => { url: string; referrer: string };
  readConsent: () => Consent;
  writeConsent: (consent: Consent) => void;
}

export const CONSENT_KEY = 'starter:consent';

/** Query parameters that must never leave the browser: one-time codes, invite tokens, emails. */
export const SENSITIVE = ['code', 'token', 'email', 'next', 'session', 'state'];

/** `url` without the sensitive query parameters (and without the hash). */
export function scrubUrl(url: string): string {
  let parsed: URL;
  let relative = false;
  try {
    parsed = new URL(url);
  } catch {
    try {
      parsed = new URL(url, 'http://relative.invalid');
      relative = true;
    } catch {
      return url.split(/[?#]/)[0] ?? '';
    }
  }
  for (const key of SENSITIVE) parsed.searchParams.delete(key);
  parsed.hash = '';
  return relative ? parsed.pathname + parsed.search : parsed.href;
}

/** A value that starts like an address: absolute, root-relative, or a bare `?a=b`. */
const URLISH = /^(?:[a-z][a-z0-9+.-]*:\/\/|\/|\?)/i;

/** Anything in a quoted attribute of `$elements_chain` (`href="/x?token=…"`) that looks like one. */
const CHAIN_VALUE = /="((?:[^"\\]|\\.)*)"/g;

function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return value && URLISH.test(value) ? scrubUrl(value) : value;
  if (depth > 3 || !value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = scrubValue(v, depth + 1);
  return out;
}

function scrubRecord(record: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  return record && (scrubValue(record) as Record<string, unknown>);
}

/**
 * PostHog's `before_send`: every address-looking value in an event's properties, `$set` and
 * `$set_once` loses its sensitive parameters, and so does every quoted value in
 * `$elements_chain` (autocapture's record of what was clicked, links included).
 */
export function scrubEvent<T extends PostHogEvent>(event: T | null): T | null {
  if (!event) return event;
  // The chain is many values in one string; scrubbed value by value below, not as one address.
  const { $elements_chain: chain, ...rest } = event.properties ?? {};
  const properties = scrubRecord(rest) ?? {};
  if (typeof chain === 'string')
    properties.$elements_chain = chain.replace(CHAIN_VALUE, (whole, value: string) =>
      URLISH.test(value) ? `="${scrubUrl(value)}"` : whole,
    );
  else if (chain !== undefined) properties.$elements_chain = chain;
  return {
    ...event,
    properties,
    ...(event.$set ? { $set: scrubRecord(event.$set) } : {}),
    ...(event.$set_once ? { $set_once: scrubRecord(event.$set_once) } : {}),
  };
}

/**
 * A page's name for Google Analytics, from its route id: `/(app)/team` is `/team`. Never the
 * page's title, which can hold a team's name.
 */
export function routeName(routeId: string | null | undefined): string {
  return (routeId ?? '').replace(/\/\([^)]*\)/g, '') || '/';
}

/** posthog-js's options: no cookies of its own choosing, nothing typed, no recordings. */
export function posthogOptions(host: string): Record<string, unknown> {
  return {
    api_host: host,
    // Only ever started after the person agreed, so it may keep its cookie.
    persistence: 'localStorage+cookie',
    capture_pageview: false,
    capture_pageleave: false,
    autocapture: true,
    person_profiles: 'identified_only',
    disable_session_recording: true,
    disable_surveys: true,
    // Autocapture records which element was clicked, not what it says or its attributes.
    mask_all_text: true,
    mask_all_element_attributes: true,
    // PostHog's own masking of addresses (campaign ids and these), before before_send.
    mask_personal_data_properties: true,
    custom_personal_data_properties: [...SENSITIVE],
    before_send: scrubEvent,
  };
}

export const gaScript = (id: string) =>
  `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;

export function createAnalytics(config: AnalyticsConfig, deps: AnalyticsDeps) {
  const posthogOn = !!config.posthogKey;
  const gaOn = !!config.gaId;
  const gaOff = `ga-disable-${config.gaId}`;
  let started = false;
  let consent: Consent = null;
  let userId: string | null = null;
  /** The account id PostHog and Google Analytics were last told, so it's said once. */
  let identified: string | null = null;
  let posthog: Promise<PostHogLike | null> | null = null;
  let gaLoaded = false;

  /** Whether anything may be sent now. */
  const allowed = () => started && consent === 'granted';

  function gtag(...args: unknown[]) {
    deps.global.gtag?.(...args);
  }

  /**
   * The address Google Analytics sends with every event, scrubbed, and a name for the page in
   * place of its title: the route's name, or else the path.
   */
  function gaPage(url: string, name?: string) {
    const clean = scrubUrl(url);
    let path = clean;
    try {
      path = new URL(clean, 'http://relative.invalid').pathname;
    } catch {
      /* keep the scrubbed address */
    }
    return { page_location: clean, page_title: name || path };
  }

  function startGa() {
    if (!gaOn) return;
    deps.global[gaOff] = false;
    if (gaLoaded) {
      gtag('consent', 'update', { analytics_storage: 'granted' });
      return;
    }
    gaLoaded = true;
    const g = deps.global;
    g.dataLayer = g.dataLayer ?? [];
    // gtag's own snippet, as a function rather than an inline script (the CSP allows no inline
    // scripts but the hashed ones). It must push `arguments` itself, not an array.
    g.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params -- gtag reads an `arguments` object, not an array
      g.dataLayer!.push(arguments);
    };
    const here = deps.here();
    gtag('js', new Date());
    // Google Analytics reads the address, referrer and title itself unless told; tell it the
    // scrubbed ones, here and on every navigation (`page`).
    gtag('config', config.gaId, {
      send_page_view: false,
      ...gaPage(here.url),
      page_referrer: here.referrer ? scrubUrl(here.referrer) : '',
    });
    deps.loadScript(gaScript(config.gaId));
  }

  function startPostHog() {
    if (!posthogOn) return;
    if (posthog) {
      withPostHog((ph) => ph.opt_in_capturing({ captureEventName: false }));
      return;
    }
    posthog = deps
      .loadPostHog()
      .then((ph) => {
        ph.init(config.posthogKey, posthogOptions(config.posthogHost));
        // A "no" on an earlier visit is kept by PostHog itself; this visit's "yes" replaces it.
        ph.opt_in_capturing({ captureEventName: false });
        return ph;
      })
      .catch(() => null);
  }

  /** Swallow every failure: analytics never breaks the app. */
  const withPostHog = (fn: (ph: PostHogLike) => void) => {
    if (!posthog) return;
    posthog = posthog.then((ph) => {
      if (ph) {
        try {
          fn(ph);
        } catch {
          /* ignore */
        }
      }
      return ph;
    });
  };

  /** Tell both who is signed in, once consent allows it. */
  function sendIdentity() {
    if (!allowed() || !userId || identified === userId) return;
    identified = userId;
    const id = userId;
    withPostHog((ph) => ph.identify(id));
    if (gaLoaded) gtag('set', { user_id: id });
  }

  function begin() {
    startPostHog();
    startGa();
    sendIdentity();
  }

  return {
    /** Whether any analytics is configured at all. */
    get enabled() {
      return posthogOn || gaOn;
    },
    /** Whether to ask: something is configured and the person hasn't chosen yet. */
    get needsConsent() {
      return (posthogOn || gaOn) && consent === null;
    },
    get consent() {
      return consent;
    },

    /** Read the person's choice; load what's configured only if they agreed. Call once, in the browser. */
    start() {
      if (started) return;
      started = true;
      consent = deps.readConsent();
      if (consent === 'granted') begin();
    },

    /** The person chose in the banner (or changed their mind on the account page). */
    setConsent(choice: Exclude<Consent, null>) {
      consent = choice;
      deps.writeConsent(choice);
      if (!started) return;
      if (choice === 'granted') {
        begin();
        return;
      }
      // Withdrawn: PostHog stops and keeps nothing more; Google Analytics' own off switch stops
      // it sending, and it drops its cookies on the next load (it isn't loaded then).
      withPostHog((ph) => ph.opt_out_capturing());
      identified = null;
      if (gaLoaded) {
        gtag('consent', 'update', { analytics_storage: 'denied' });
        deps.global[gaOff] = true;
      }
    },

    /**
     * A page view, for every client-side navigation. `name` is the route's name (`routeName`),
     * never the page's title.
     */
    page(url: string, name?: string) {
      if (!allowed()) return;
      const clean = scrubUrl(url);
      withPostHog((ph) => ph.capture('$pageview', { $current_url: clean }));
      if (gaLoaded) {
        // Set for the page, so Google Analytics' own events (scrolls, clicks) carry these too.
        gtag('set', gaPage(url, name));
        gtag('event', 'page_view', gaPage(url, name));
      }
    },

    /** Something the person did. Keep `props` free of anything personal. */
    track(event: string, props?: Record<string, unknown>) {
      if (!allowed()) return;
      withPostHog((ph) => ph.capture(event, props));
      if (gaLoaded) gtag('event', event, props ?? {});
    },

    /** Signed in: the account id, never the email. Sent only once the person has agreed. */
    identify(id: string) {
      userId = id;
      sendIdentity();
    },

    /** Signed out: forget who it was. */
    reset() {
      userId = null;
      identified = null;
      if (!allowed()) return;
      withPostHog((ph) => ph.reset());
      if (gaLoaded) gtag('set', { user_id: null });
    },

    /** For tests: wait until queued PostHog calls have run. */
    flush: () => (posthog ?? Promise.resolve(null)).then(() => undefined),
  };
}

export type Analytics = ReturnType<typeof createAnalytics>;
