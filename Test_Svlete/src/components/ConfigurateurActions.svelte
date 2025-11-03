<script>
  import { onMount, onDestroy } from 'svelte';
  import {
    selected,
    storedSelections,
    storeCurrentSelectionSnapshot,
    exportStoredSelectionsTxt,
    clearStoredSelections
  } from '../lib/stores.js';
  import { toastSuccess, toastError, toastInfo } from '../lib/toasts.js';

  const clearAll = () => selected.set(new Set());
  $: count = ($selected && $selected.size) || 0;
  $: storedCount = Array.isArray($storedSelections) ? $storedSelections.length : 0;

  function handleStoreSelection() {
    try {
      storeCurrentSelectionSnapshot();
      toastSuccess('Selection stockee.');
    } catch (err) {
      toastError(err?.message || 'Impossible de stocker la selection.');
    }
  }

  function handleExport() {
    try {
      exportStoredSelectionsTxt();
      toastSuccess('Export texte genere.');
    } catch (err) {
      toastError(err?.message || "Impossible d'exporter le stockage.");
    }
  }

  function handleClearStorage() {
    clearStoredSelections();
    toastInfo('Stockage temporaire vide.');
  }

  function handleKey(e) {
    if (e.key === 'Escape') clearAll();
  }
  onMount(() => window.addEventListener('keydown', handleKey));
  onDestroy(() => window.removeEventListener('keydown', handleKey));
</script>

<div class="actions">
  <div class="primary-tools">
    <button
      class="btn"
      on:click={clearAll}
      disabled={count === 0}
      title="Échap pour tout désélectionner"
      aria-label="Tout désélectionner"
    >
      ✖ Tout désélectionner {count ? `(${count})` : ''}
    </button>
    <button class="btn" on:click={handleStoreSelection} disabled={count === 0}>
      📌 Stocker la selection
    </button>
  </div>

  <div class="secondary-tools" aria-live="polite">
    <span class="badge">{storedCount} selection{storedCount > 1 ? 's' : ''} en memoire</span>
    <button class="btn" on:click={handleExport} disabled={!storedCount}>
      ⬇ Exporter stockage
    </button>
    <button class="btn" on:click={handleClearStorage} disabled={!storedCount}>
      🗑 Vider stockage
    </button>
  </div>
</div>

<style>
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .primary-tools,
  .secondary-tools {
    display: flex;
    gap: 8px;
    align-items: center;
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
  .badge {
    font-size: 13px;
    color: var(--c-text-muted);
  }
  @media (max-width: 720px) {
    .actions { flex-direction: column; align-items: stretch; }
    .primary-tools, .secondary-tools { justify-content: space-between; width: 100%; }
    .secondary-tools { flex-wrap: wrap; gap: 6px 8px; }
    .badge { flex: 1; }
  }
</style>
