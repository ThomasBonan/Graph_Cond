<script>
  import { onMount } from 'svelte';
  import {
    mode,
    theme,
    toggleTheme,
    importJSON,
    exportJSON,
    resetAll,
    savedSchemas,
    activeSchema,
    refreshSavedSchemas,
    saveSchemaToDatabase,
    loadSchemaFromDatabase,
    search
  } from '../lib/stores.js';

  let fileEl;
  let schemaName = '';
  let schemaDirty = false;
  let saving = false;
  let saveMessage = '';
  let saveError = '';
  let listLoading = false;
  let listError = '';
  let loadingSchema = false;
  let loadError = '';
  let selectedSchemaId = '';
  let searchValue = '';

  function chooseFile() {
    fileEl?.click();
  }

  async function handleImport(event) {
    const f = event.currentTarget.files?.[0];
    if (!f) return;
    await importJSON(f);
    schemaDirty = false;
    saveMessage = '';
    saveError = '';
    loadError = '';
    event.currentTarget.value = '';
  }

  function handleSchemaInput(event) {
    schemaName = event.currentTarget.value;
    schemaDirty = true;
    saveMessage = '';
    saveError = '';
  }

  async function handleSaveSchema() {
    if (saving) return;
    saving = true;
    saveError = '';
    saveMessage = '';
    try {
      const record = await saveSchemaToDatabase(schemaName, { id: $activeSchema?.id });
      saveMessage = record?.status === 'created' ? 'Schema enregistre.' : 'Schema mis a jour.';
      schemaDirty = false;
      schemaName = record?.name || schemaName;
      await refreshList();
    } catch (err) {
      saveError = err?.message || "Echec de l'enregistrement du schema.";
    } finally {
      saving = false;
    }
  }

  async function refreshList() {
    listLoading = true;
    listError = '';
    try {
      await refreshSavedSchemas();
    } catch (err) {
      listError = err?.message || 'Echec du chargement des schemas.';
    } finally {
      listLoading = false;
    }
  }

  async function handleSelectSchema(event) {
    const value = event.currentTarget.value;
    if (!value) {
      loadError = '';
      return;
    }
    loadingSchema = true;
    loadError = '';
    try {
      await loadSchemaFromDatabase(Number(value));
      schemaDirty = false;
      schemaName = $activeSchema?.name || schemaName;
    } catch (err) {
      loadError = err?.message || 'Echec du chargement du schema.';
    } finally {
      loadingSchema = false;
    }
  }

  onMount(() => {
    refreshList();
  });

  function handleSearchInput(event) {
    const value = event.currentTarget.value;
    searchValue = value;
    search.set(value);
  }

  $: if ($mode !== 'editor') {
    schemaDirty = false;
  }

  let lastActiveId = null;
  $: {
    const currentId = $activeSchema?.id ?? null;
    if (currentId !== lastActiveId) {
      if (currentId) {
        selectedSchemaId = String(currentId);
        if (!schemaDirty && $mode === 'editor') {
          schemaName = $activeSchema?.name || '';
        }
      } else {
        selectedSchemaId = '';
        if (!schemaDirty && $mode === 'editor') {
          schemaName = '';
        }
      }
      lastActiveId = currentId;
    }
  }

  $: searchValue = $search;
</script>

<div class="topbar">
  <div class="topbar-left">
    <button class="btn btn-sm" type="button" on:click={() => mode.set($mode === 'editor' ? 'commercial' : 'editor')}>
      {$mode === 'editor' ? 'Commerciale' : 'Editeur'}
    </button>
  </div>

  <div class="topbar-center">
    {#if $mode === 'editor'}
      <div class="schema-controls">
        <label class="visually-hidden" for="schema-name">Nom du schema</label>
        <input
          id="schema-name"
          class="schema-name"
          placeholder="Nom du schema..."
          value={schemaName}
          on:input={handleSchemaInput}
        />
        <button
          class="btn btn-sm primary"
          type="button"
          on:click={handleSaveSchema}
          disabled={saving}
        >
          {saving ? 'Enregistrement...' : $activeSchema?.id ? 'Mettre a jour' : 'Enregistrer'}
        </button>
      </div>
    {:else}
      <div class="schema-controls">
        <label class="visually-hidden" for="schema-select">Selection du schema</label>
        <select
          id="schema-select"
          class="schema-select"
          bind:value={selectedSchemaId}
          on:change={handleSelectSchema}
          disabled={loadingSchema || listLoading || !$savedSchemas.length}
        >
          <option value="">Selectionner un schema...</option>
          {#each $savedSchemas as schema}
            <option value={schema.id}>{schema.name}</option>
          {/each}
        </select>
        <button
          class="btn btn-sm"
          type="button"
          on:click={refreshList}
          disabled={listLoading}
          title="Actualiser la liste"
          aria-label="Actualiser la liste des schemas"
        >
          {listLoading ? '...' : 'Actualiser'}
        </button>
      </div>
    {/if}

    <div class="search-wrap">
      <label class="visually-hidden" for="search-input">Rechercher</label>
      <input
        id="search-input"
        class="search"
        type="search"
        placeholder="Rechercher un noeud, un groupe ou un sous-groupe..."
        value={searchValue}
        on:input={handleSearchInput}
      />
    </div>
  </div>

  <div class="topbar-right">
    <input bind:this={fileEl} type="file" hidden accept=".json,.js" on:change={handleImport} />
    {#if $mode === 'editor'}
      <button class="btn btn-sm" type="button" on:click={chooseFile}>Importer</button>
      <button class="btn btn-sm" type="button" on:click={exportJSON}>Exporter JSON</button>
    {/if}
    <button class="btn btn-sm" type="button" on:click={resetAll}>Reinitialiser</button>
    <button class="btn btn-sm" type="button" on:click={toggleTheme} aria-label="Theme">
      Theme: {$theme === 'dark' ? 'clair' : 'sombre'}
    </button>
  </div>
</div>
{#if saveError || loadError || listError || saveMessage}
  <div class="status-line">
    {#if saveError}<span class="status error">{saveError}</span>{/if}
    {#if loadError}<span class="status error">{loadError}</span>{/if}
    {#if listError}<span class="status error">{listError}</span>{/if}
    {#if !saveError && saveMessage}<span class="status success">{saveMessage}</span>{/if}
  </div>
{/if}

<style>
  .topbar {
    display:grid;
    grid-template-columns: auto 1fr auto;
    align-items:center;
    padding:12px 14px;
    gap:12px;
    background: var(--panel-bg, #f7f8fa);
    border-bottom:1px solid var(--border-color, #dfe3ea);
  }
  .topbar-left,
  .topbar-right {
    display:flex;
    align-items:center;
    gap:8px;
    flex-wrap:wrap;
  }
  .topbar-center {
    display:flex;
    flex-wrap:wrap;
    align-items:center;
    justify-content:center;
    gap:10px;
  }
  .search-wrap {
    flex:1 1 260px;
    min-width:200px;
  }
  .search {
    width:100%;
    height: 32px;
    padding: 6px 10px;
    border:1px solid var(--border-color, #dfe3ea);
    border-radius:6px;
    background: var(--bg, #fff);
    color: var(--text-color, #0f172a);
  }
  .btn {
    border:1px solid var(--border-color, #dfe3ea); border-radius:6px;
    background: var(--bg, #fff); color: var(--text-color, #0f172a);
    cursor:pointer;
  }
  .btn-sm { min-height:32px; padding:0 12px; font-size:12px; }
  .btn.primary { background:#2563eb; color:#fff; border-color:#1d4ed8; }
  .btn[disabled] { cursor:not-allowed; opacity:.6; }
  .schema-controls { display:flex; align-items:center; gap:6px; }
  .schema-name, .schema-select {
    min-width:220px; height:32px; padding:6px 10px;
    border:1px solid var(--border-color, #dfe3ea); border-radius:6px;
    background: var(--bg, #fff); color: var(--text-color, #0f172a);
  }
  .visually-hidden {
    position:absolute;
    width:1px;
    height:1px;
    padding:0;
    margin:-1px;
    overflow:hidden;
    clip:rect(0,0,0,0);
    white-space:nowrap;
    border:0;
  }
  .status-line {
    display:flex; align-items:center; gap:12px;
    flex-wrap:wrap;
    padding:4px 12px 8px; font-size:12px;
    color: var(--text-color, #0f172a);
  }
  .status-line .status.error { color:#dc2626; }
  .status-line .status.success { color:#16a34a; }

  @media (max-width: 1100px) {
    .topbar {
      grid-template-columns: 1fr;
      justify-items: stretch;
    }
    .topbar-left,
    .topbar-right {
      justify-content: space-between;
    }
    .topbar-center {
      order: 3;
      justify-content: stretch;
    }
  }

  @media (max-width: 640px) {
    .schema-controls {
      flex-direction: column;
      align-items: stretch;
    }
    .schema-name, .schema-select {
      width: 100%;
    }
    .topbar-left,
    .topbar-right {
      justify-content: center;
    }
  }
</style>
