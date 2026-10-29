<!--
  Display preferences (PRD R3.2): theme and text size, kept on this device and applied at once.
  The inline script in src/app.html applies them before the first paint on every later load.
  Also the analytics choice, when the app has analytics: "Don’t allow" stops it at once.
-->
<script lang="ts">
  import { analytics } from '#lib/analytics/index.ts';
  import { readPreferences, setPreferences, textSizes, themes, type Preferences } from '#lib/preferences.ts';

  let prefs = $state<Preferences>(readPreferences());
  let consent = $state(analytics.consent);

  function change(next: Partial<Preferences>) {
    prefs = { ...prefs, ...next };
    setPreferences(prefs);
  }

  function setConsent(choice: 'granted' | 'denied') {
    analytics.setConsent(choice);
    consent = choice;
  }
</script>

<div class="stack">
  <fieldset class="stack tight">
    <legend class="label">Theme</legend>
    <div class="segmented">
      {#each themes as t (t.value)}
        <label>
          <input
            type="radio"
            name="theme"
            value={t.value}
            checked={prefs.theme === t.value}
            onchange={() => change({ theme: t.value })}
          />{t.label}
        </label>
      {/each}
    </div>
  </fieldset>
  <fieldset class="stack tight">
    <legend class="label">Text size</legend>
    <div class="segmented">
      {#each textSizes as s (s.value)}
        <label>
          <input
            type="radio"
            name="text-size"
            value={s.value}
            checked={prefs.text === s.value}
            onchange={() => change({ text: s.value })}
          />{s.label}
        </label>
      {/each}
    </div>
  </fieldset>
  {#if analytics.enabled}
    <fieldset class="stack tight">
      <legend class="label">Analytics cookies</legend>
      <div class="segmented">
        <button type="button" aria-pressed={consent === 'granted'} onclick={() => setConsent('granted')}
          >Allow</button
        >
        <button type="button" aria-pressed={consent === 'denied'} onclick={() => setConsent('denied')}
          >Don’t allow</button
        >
      </div>
    </fieldset>
  {/if}
  <p class="hint">These apply to this device only.</p>
</div>

<style>
  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
  }

  .tight {
    gap: var(--space-2);
  }

  legend {
    margin-bottom: var(--space-2);
  }
</style>
