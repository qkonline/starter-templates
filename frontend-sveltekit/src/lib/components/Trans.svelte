<!--
  A translated sentence with markup in it: the text (English, the key) marks the parts that are
  markup with tags, `<link>privacy notice</link>`, and each tag's snippet draws its part, so a
  translator can move the link within the sentence. `{name}` placeholders are filled from `vars`
  as plain text, never as markup.

    <Trans text={msg('Read our <link>privacy notice</link>, {name}.')} vars={{ name }}>
      {#snippet link(s: string)}<a href="/privacy">{s}</a>{/snippet}
    </Trans>

  With a {placeholder}, the text goes in msg() inside braces: in a quoted attribute Svelte would
  read `{name}` as code. Without one, `text="…"` is fine. Snippet parameters need their type.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '#lib/i18n/index.svelte.ts';

  let {
    text,
    vars,
    ...tags
  }: { text: string; vars?: Record<string, string | number> } & Record<string, Snippet<[string]> | unknown> =
    $props();

  type Part = { text: string; tag?: string };

  const parts = $derived.by(() => {
    const out: Part[] = [];
    const translated = t(text, vars);
    const re = /<(\w+)>(.*?)<\/\1>/g;
    let at = 0;
    for (const m of translated.matchAll(re)) {
      if (m.index > at) out.push({ text: translated.slice(at, m.index) });
      out.push({ text: m[2]!, tag: m[1]! });
      at = m.index + m[0].length;
    }
    if (at < translated.length) out.push({ text: translated.slice(at) });
    return out;
  });

  const snippetOf = (tag: string) => tags[tag] as Snippet<[string]> | undefined;
</script>

{#each parts as part, i (i)}{#if part.tag && snippetOf(part.tag)}{@render snippetOf(part.tag)!(
      part.text,
    )}{:else}{part.text}{/if}{/each}
