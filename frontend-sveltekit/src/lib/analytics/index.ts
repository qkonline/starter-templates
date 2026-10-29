// The app's analytics: one `analytics` instance built from the build-time keys. Use `track()`
// for events; page views, sign-in and sign-out are already wired (root layout, session).
//
// Nothing is loaded when no key is set: the PostHog import below is dropped from the build when
// PUBLIC_POSTHOG_KEY is empty. With a key, neither PostHog nor Google Analytics loads until the
// person agrees.

import { PUBLIC_GA_ID, PUBLIC_POSTHOG_HOST, PUBLIC_POSTHOG_KEY } from '$app/env/public';
import { CONSENT_KEY, createAnalytics, type AnalyticsDeps, type Consent, type PostHogLike } from './core';

export { routeName, scrubUrl, type Consent } from './core';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function readConsent(): Consent {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

function writeConsent(consent: Consent): void {
  try {
    if (consent) localStorage.setItem(CONSENT_KEY, consent);
    else localStorage.removeItem(CONSENT_KEY);
  } catch {
    /* The banner asks again next time. */
  }
}

export const analytics = createAnalytics(
  { posthogKey: PUBLIC_POSTHOG_KEY, posthogHost: PUBLIC_POSTHOG_HOST, gaId: PUBLIC_GA_ID },
  {
    loadPostHog: async () => {
      if (!__POSTHOG__) throw new Error('PostHog is off.');
      return (await import('posthog-js')).default as unknown as PostHogLike;
    },
    loadScript: (src) => {
      const script = document.createElement('script');
      script.async = true;
      script.src = src;
      document.head.append(script);
    },
    global: typeof window === 'undefined' ? {} : (window as unknown as AnalyticsDeps['global']),
    here: () => ({ url: location.href, referrer: document.referrer }),
    readConsent,
    writeConsent,
  },
);

/** Record something the person did, in whichever analytics are on. Never anything personal. */
export const track = (event: string, props?: Record<string, unknown>): void => analytics.track(event, props);
