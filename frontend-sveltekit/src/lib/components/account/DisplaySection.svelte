<!--
  Display preferences (PRD R3.2): theme, mode and text size, kept on this device and applied at
  once. The inline script in src/app.html applies them before the first paint on every later
  load. Also the analytics choice, when the app has analytics: "Don’t allow" stops it at once.
-->
<script lang="ts">
  import { analytics } from '#lib/analytics/index.ts';
  import { modes, readPreferences, setPreferences, textSizes, type Preferences } from '#lib/preferences.ts';
  import { themes } from '#lib/themes/index.ts';
  import Segmented from '#lib/components/ui/Segmented.svelte';

  let prefs = $state<Preferences>(readPreferences());
  let consent = $state(analytics.consent);

  function change(next: Partial<Preferences>) {
    prefs = { ...prefs, ...next };
    setPreferences(prefs);
  }

  const consentChoices = [
    { value: 'granted', label: 'Allow' },
    { value: 'denied', label: 'Don’t allow' },
  ] as const;
</script>

<div class="stack">
  {#if themes.length > 1}
    <fieldset>
      <legend class="label">Theme</legend>
      <div class="themes">
        {#each themes as t (t.id)}
          <!-- Each preview carries its own theme, so it shows that theme's colours and fonts. -->
          <label class="theme" data-theme={t.id}>
            <input
              type="radio"
              name="theme"
              value={t.id}
              checked={prefs.theme === t.id}
              onchange={() => change({ theme: t.id })}
            />
            <span class="sample" aria-hidden="true">
              <span class="heading">Aa</span>
              <span class="chips"
                ><span class="ground"></span><span class="secondary"></span><span class="primary"
                ></span></span
              >
            </span>
            <span class="name">{t.label}</span>
          </label>
        {/each}
      </div>
    </fieldset>
  {/if}
  <Segmented legend="Mode" options={modes} value={prefs.mode} onchange={(mode) => change({ mode })} />
  <Segmented
    legend="Text size"
    options={textSizes}
    value={prefs.text}
    onchange={(text) => change({ text })}
  />
  {#if analytics.enabled}
    <Segmented
      legend="Analytics cookies"
      options={consentChoices}
      value={consent ?? undefined}
      onchange={(choice) => {
        analytics.setConsent(choice);
        consent = choice;
      }}
    />
  {/if}
  <p class="hint">These apply to this device only.</p>
</div>

<style>
  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }

  legend {
    margin-bottom: var(--space-2);
    padding: 0;
  }

  .themes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
    gap: var(--space-3);
  }

  .theme {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2);
    color: var(--color-text);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    cursor: pointer;
  }

  .theme:has(input:checked) {
    border-color: var(--color-focus);
    box-shadow: 0 0 0 1px var(--color-focus);
  }

  .theme:has(input:focus-visible) {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }

  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  /* Fixed sizes, not the theme's scale, so every card has the same frame and baseline; inside,
     the theme's own font, ground, secondary button and primary button. */
  .sample {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 3.5rem;
    padding: 0 0.75rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  .heading {
    color: var(--color-heading);
    font-family: var(--font-display);
    font-weight: var(--weight-display);
    font-size: 1.375rem;
    line-height: 1;
    letter-spacing: var(--tracking-tight);
  }

  .chips {
    display: flex;
    gap: var(--space-1);
    margin-left: var(--space-4);
  }

  .chips span {
    width: 1rem;
    height: 1rem;
    border-radius: var(--radius-full);
    border: 1px solid var(--color-border-strong);
  }

  .ground {
    background: var(--color-bg);
  }

  .secondary {
    background: var(--button-plain-bg);
  }

  .primary {
    background: var(--color-primary);
    border-color: var(--color-primary);
  }

  .name {
    color: var(--color-heading);
    font-family: var(--font-sans);
    font-size: 0.875rem;
    line-height: 1.25rem;
    font-weight: var(--weight-medium);
  }
</style>
