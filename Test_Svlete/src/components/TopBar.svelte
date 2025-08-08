<script>
  import { mode, theme, toggleTheme, importJSON, exportJSON, resetAll } from '../lib/stores.js';

  let fileEl;

  function chooseFile() { fileEl?.click(); }
  async function handleImport(e) {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    await importJSON(f);
    e.currentTarget.value = '';
  }
</script>

<div class="topbar">
  <div class="left">
    {#if $mode === 'editor'}
      <button class="btn btn-sm" on:click={() => mode.set('commercial')}>Commerciale</button>
    {:else}
      <button class="btn btn-sm" on:click={() => mode.set('editor')}>Éditeur</button>
    {/if}
    <input class="search" placeholder="Recherche…" />
  </div>

  <div class="right">
    <input bind:this={fileEl} type="file" hidden accept=".json,.js" on:change={handleImport} />
    <button class="btn btn-sm" on:click={chooseFile}>Importer</button>
    <button class="btn btn-sm" on:click={exportJSON}>Exporter JSON</button>
    <button class="btn btn-sm" on:click={resetAll}>Réinitialiser</button>
    <button class="btn btn-sm" on:click={toggleTheme} aria-label="Thème">{ $theme === 'dark' ? '🌙' : '☀️' }</button>
  </div>
</div>

<style>
  .topbar {
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 12px; gap:8px;
    background: var(--panel-bg, #f7f8fa);
    border-bottom:1px solid var(--border-color, #dfe3ea);
  }
  .left, .right { display:flex; align-items:center; gap:8px; }
  .search {
    min-width: 240px; height: 28px; padding: 4px 8px;
    border:1px solid var(--border-color, #dfe3ea); border-radius:6px;
    background: var(--bg, #fff); color: var(--text-color, #0f172a);
  }
  .btn {
    border:1px solid var(--border-color, #dfe3ea); border-radius:6px;
    background: var(--bg, #fff); color: var(--text-color, #0f172a);
    cursor:pointer;
  }
  .btn-sm { height:28px; padding:0 10px; font-size:12px; }
</style>
