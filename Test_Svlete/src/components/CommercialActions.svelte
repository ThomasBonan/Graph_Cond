<script>
  import { onMount, onDestroy } from 'svelte';
  import { selected } from '../lib/stores.js';

  const clearAll = () => selected.set(new Set());
  $: count = ($selected && $selected.size) || 0;

  function handleKey(e) {
    if (e.key === 'Escape') clearAll();
  }
  onMount(() => window.addEventListener('keydown', handleKey));
  onDestroy(() => window.removeEventListener('keydown', handleKey));
</script>

<div class="actions">
  <button
    class="btn"
    on:click={clearAll}
    disabled={count === 0}
    title="Échap pour tout désélectionner"
    aria-label="Tout désélectionner"
  >
    ✖ Tout désélectionner {count ? `(${count})` : ''}
  </button>
</div>

<style>
  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;
  }
  .btn {
    border: 1px solid var(--c-stroke);
    background: var(--c-box-bg);
    color: var(--c-text);
    border-radius: 8px;
    padding: 6px 10px;
    cursor: pointer;
  }
  .btn:disabled {
    opacity: .5;
    cursor: not-allowed;
  }
</style>
