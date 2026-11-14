<script lang="ts">
  import { Image } from '@lucide/svelte';
  let { src, class: className = '' }: { src?: string | null; class?: string } = $props();
  let failed = $state(false);
  $effect(() => { src; failed = false; });
</script>
<span class={`artwork ${className}`} aria-hidden="true">
  {#if !src || failed}<Image size={24} />{:else}<img {src} alt="" loading="lazy" onerror={() => failed = true} />{/if}
</span>
<style>
  .artwork { position: relative; display: inline-flex; align-items: center; justify-content: center; overflow: hidden; background: var(--secondary); color: var(--muted-foreground); flex-shrink: 0; }
  img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
</style>
