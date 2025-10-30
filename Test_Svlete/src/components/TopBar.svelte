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
    search,
    editorDirty,
    draftAvailable,
    undoAvailable,
    redoAvailable,
    undoRules,
    redoRules,
    duplicateCurrentSchema,
    restoreDraft,
    searchFilters,
    grouped,
    authUser,
    authStatus,
    loginUser,
    logoutUser,
    checkAuth
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
  let showLogin = false;
  let loginUsername = '';
  let loginPassword = '';
  let canEdit = false;
  let loggingIn = false;
  let loginError = '';
  let loginMessage = '';
  let authLoading = true;

  function chooseFile() {
    if (!fileEl) return;
    fileEl.click();
  }

  async function handleImport(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!canEdit) {
      saveError = 'Connexion requise pour importer.';
      saveMessage = '';
      return;
    }
    try {
      await importJSON(file);
      saveMessage = 'Import effectue.';
      saveError = '';
    } catch (err) {
      saveError = err?.message || 'Echec import.';
      saveMessage = '';
    }
  }

  function handleSchemaInput(event) {
    schemaName = event.currentTarget.value;
    schemaDirty = true;
    saveMessage = '';
    saveError = '';
  }

  async function handleSaveSchema() {
    if (saving || !canEdit) return;
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

  function handleUndo() {
    if (!$undoAvailable) return;
    undoRules();
  }

  function handleRedo() {
    if (!$redoAvailable) return;
    redoRules();
  }

  async function handleDuplicate() {
    if (!canEdit) return;
    const base = schemaName || $activeSchema?.name || '';
    const suggested = base ? `${base} (copie)` : 'Nouveau schema';
    if (typeof window === 'undefined') return;
    const input = window.prompt('Nom du duplicata', suggested);
    const trimmed = (input || '').trim();
    if (!trimmed) return;
    saveError = '';
    saveMessage = '';
    try {
      const record = await duplicateCurrentSchema(trimmed);
      saveMessage = 'Schema duplique.';
      schemaDirty = false;
      schemaName = record?.name || trimmed;
      await refreshList();
    } catch (err) {
      saveError = err?.message || 'Echec de la duplication.';
    }
  }

  function handleRestoreDraftClick() {
    if (!$draftAvailable) return;
    if (typeof window !== 'undefined' && $editorDirty) {
      const confirmed = window.confirm(
        'Restaurer le brouillon ecrasera les modifications en cours. Continuer ?'
      );
      if (!confirmed) return;
    }
    const ok = restoreDraft();
    if (ok) {
      saveMessage = 'Brouillon restaure.';
      saveError = '';
    } else {
      saveError = 'Impossible de restaurer le brouillon local.';
    }
  }

  function handleGroupFilter(event) {
    const value = event.currentTarget.value || 'all';
    searchFilters.update((current) => ({ ...current, group: value }));
  }

  function toggleGammeFilter(gamme) {
    searchFilters.update((current) => {
      const list = Array.isArray(current.gammes) ? [...current.gammes] : [];
      const idx = list.indexOf(gamme);
      if (idx >= 0) {
        list.splice(idx, 1);
      } else {
        list.push(gamme);
      }
      return { ...current, gammes: list };
    });
  }

  function clearFilters() {
    searchFilters.set({ group: 'all', gammes: [] });
  }

  async function handleLogin(event) {
    event?.preventDefault?.();
    if (loggingIn) return;
    loggingIn = true;
    loginError = '';
    loginMessage = '';
    try {
      const user = await loginUser(loginUsername, loginPassword);
      loginMessage = `Connecte en tant que ${user.username}.`;
      showLogin = false;
      loginUsername = '';
      loginPassword = '';
      await refreshList();
    } catch (err) {
      loginError = err?.message || 'Connexion impossible.';
    } finally {
      loggingIn = false;
    }
  }

  async function handleLogout() {
    loginError = '';
    loginMessage = '';
    try {
      await logoutUser();
      loginMessage = 'Deconnecte.';
      await refreshList();
    } catch (err) {
      loginError = err?.message || 'Erreur lors de la deconnexion.';
    } finally {
      showLogin = false;
    }
  }

  onMount(async () => {
    try {
      await checkAuth();
    } catch (err) {
      console.warn('checkAuth', err);
      authUser.set(null);
      authStatus.set('anonymous');
    } finally {
      authLoading = false;
      await refreshList();
      searchValue = $search;
    }
  });

  function handleSearchInput(event) {
    const value = event.currentTarget.value;
    searchValue = value;
    search.set(value);
  }

  $: if ($mode !== 'editor') {
    schemaDirty = false;
  }

  $: canEdit = Boolean($authUser);
  $: if ($authUser && showLogin) {
    showLogin = false;
  }
  $: searchValue = $search;

  const gammeOptions = ['Smart', 'Mod', 'Evo'];
  $: groupOptions = Object.keys($grouped || {}).sort((a, b) =>
    a.localeCompare(b, 'fr', { sensitivity: 'base' })
  );
  $: filtersActive =
    $searchFilters.group !== 'all' || ($searchFilters.gammes || []).length > 0;
  $: statusVariant = $editorDirty
    ? { label: 'Brouillon en cours', tone: 'dirty' }
    : $draftAvailable
      ? { label: 'Brouillon local', tone: 'draft' }
      : { label: 'Synchronise', tone: 'clean' };

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
</script>

<div class="topbar">
  <div class="topbar-left">
    <button class="btn btn-sm" type="button" on:click={() => mode.set($mode === 'editor' ? 'commercial' : 'editor')}>
      {$mode === 'editor' ? 'Commerciale' : 'Editeur'}
    </button>
    <div class="status-area">
      <span class="status-badge {statusVariant.tone}">{statusVariant.label}</span>
      {#if $draftAvailable}
        <button class="btn btn-xs btn-ghost" type="button" on:click={handleRestoreDraftClick}>
          Restaurer
        </button>
      {/if}
    </div>
    {#if $mode === 'editor'}
      <div class="history-actions">
        <button class="btn btn-sm" type="button" on:click={handleUndo} disabled={!$undoAvailable}>
          Annuler
        </button>
        <button class="btn btn-sm" type="button" on:click={handleRedo} disabled={!$redoAvailable}>
          Retablir
        </button>
      </div>
    {/if}
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
          disabled={!canEdit}
        />
        <button
          class="btn btn-sm primary"
          type="button"
          on:click={handleSaveSchema}
          disabled={saving || !canEdit}
        >
          {saving ? 'Enregistrement...' : $activeSchema?.id ? 'Mettre a jour' : 'Enregistrer'}
        </button>
        <button class="btn btn-sm" type="button" on:click={handleDuplicate} disabled={!canEdit || saving}>
          Dupliquer
        </button>
      </div>
      {#if !canEdit && !authLoading}
        <span class="auth-warning">Connectez-vous pour creer ou modifier des schemas.</span>
      {/if}
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

    <div class="search-area">
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
      <div class="filter-line">
        <label class="filter-label" for="group-filter">Groupe</label>
        <select
          id="group-filter"
          class="filter-select"
          value={$searchFilters.group}
          on:change={handleGroupFilter}
        >
          <option value="all">Tous les groupes</option>
          {#each groupOptions as group}
            <option value={group}>{group}</option>
          {/each}
        </select>
        <div class="filter-gammes">
          <span class="filter-label">Gammes</span>
          {#each gammeOptions as gamme}
            <label class="filter-check">
              <input
                type="checkbox"
                checked={($searchFilters.gammes || []).includes(gamme)}
                on:change={() => toggleGammeFilter(gamme)}
              />
              {gamme}
            </label>
          {/each}
        </div>
        <button class="btn btn-link" type="button" on:click={clearFilters} disabled={!filtersActive}>
          Reinitialiser filtres
        </button>
      </div>
    </div>
  </div>

  <div class="topbar-right">
    <div class="auth-block">
      {#if authLoading}
        <span class="auth-loading">Authentification...</span>
      {:else if $authUser}
        <span class="user-badge" title="Utilisateur connecte">{$authUser.username}</span>
        <button class="btn btn-sm" type="button" on:click={handleLogout}>Se deconnecter</button>
      {:else}
        {#if showLogin}
          <form class="login-form" on:submit|preventDefault={handleLogin}>
            <label class="visually-hidden" for="login-username">Nom utilisateur</label>
            <input
              id="login-username"
              class="login-input"
              placeholder="Utilisateur"
              autocomplete="username"
              value={loginUsername}
              on:input={(e) => (loginUsername = e.currentTarget.value)}
              disabled={loggingIn}
            />
            <label class="visually-hidden" for="login-password">Mot de passe</label>
            <input
              id="login-password"
              class="login-input"
              type="password"
              placeholder="Mot de passe"
              autocomplete="current-password"
              value={loginPassword}
              on:input={(e) => (loginPassword = e.currentTarget.value)}
              disabled={loggingIn}
            />
            <div class="login-actions">
              <button class="btn btn-sm primary" type="submit" disabled={loggingIn}>
                {loggingIn ? 'Connexion...' : 'Valider'}
              </button>
              <button
                class="btn btn-sm"
                type="button"
                on:click={() => {
                  showLogin = false;
                  loginError = '';
                  loginUsername = '';
                  loginPassword = '';
                }}
                disabled={loggingIn}
              >
                Annuler
              </button>
            </div>
          </form>
        {:else}
          <button
            class="btn btn-sm"
            type="button"
            on:click={() => {
              showLogin = true;
              loginError = '';
              loginMessage = '';
            }}
          >
            Se connecter
          </button>
        {/if}
      {/if}
    </div>

    <input bind:this={fileEl} type="file" hidden accept=".json,.js" on:change={handleImport} />
    {#if $mode === 'editor'}
      <button class="btn btn-sm" type="button" on:click={chooseFile} disabled={!canEdit}>Importer</button>
      <button class="btn btn-sm" type="button" on:click={exportJSON} disabled={!canEdit}>Exporter JSON</button>
    {/if}
    <button class="btn btn-sm" type="button" on:click={resetAll}>Reinitialiser</button>
    <button class="btn btn-sm" type="button" on:click={toggleTheme} aria-label="Theme">
      Theme: {$theme === 'dark' ? 'clair' : 'sombre'}
    </button>
  </div>
</div>
{#if saveError || loadError || listError || saveMessage || loginError || loginMessage}
  <div class="status-line">
    {#if saveError}<span class="status error">{saveError}</span>{/if}
    {#if loadError}<span class="status error">{loadError}</span>{/if}
    {#if listError}<span class="status error">{listError}</span>{/if}
    {#if !saveError && saveMessage}<span class="status success">{saveMessage}</span>{/if}
    {#if loginError}<span class="status error">{loginError}</span>{/if}
    {#if loginMessage}<span class="status success">{loginMessage}</span>{/if}
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
  .topbar-right {
    justify-content:flex-end;
  }
  .topbar-center {
    display:flex;
    flex-direction:column;
    align-items:stretch;
    justify-content:center;
    gap:12px;
  }
  .status-area {
    display:flex;
    align-items:center;
    gap:6px;
    flex-wrap:wrap;
  }
  .status-badge {
    display:inline-flex;
    align-items:center;
    justify-content:center;
    padding:4px 10px;
    border-radius:999px;
    font-size:12px;
    font-weight:600;
    letter-spacing:0.01em;
  }
  .status-badge.clean { background:#dcfce7; color:#166534; }
  .status-badge.draft { background:#fef3c7; color:#92400e; }
  .status-badge.dirty { background:#fee2e2; color:#b91c1c; }
  .btn-xs { min-height:24px; padding:0 10px; font-size:11px; }
  .btn-ghost {
    background:transparent;
    border-color:transparent;
    color:#2563eb;
  }
  .btn-ghost:hover { background:rgba(37,99,235,0.08); }
  .history-actions {
    display:flex;
    align-items:center;
    gap:6px;
    flex-wrap:wrap;
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
  .search-area {
    display:flex;
    flex-direction:column;
    gap:8px;
  }
  .filter-line {
    display:flex;
    flex-wrap:wrap;
    align-items:center;
    gap:10px;
  }
  .filter-label {
    font-size:12px;
    color: var(--c-text-muted, #64748b);
  }
  .filter-select {
    height:32px;
    padding:6px 10px;
    border:1px solid var(--border-color, #dfe3ea);
    border-radius:6px;
    background: var(--bg, #fff);
    color: var(--text-color, #0f172a);
  }
  .filter-gammes {
    display:flex;
    align-items:center;
    gap:8px;
    flex-wrap:wrap;
  }
  .filter-check {
    display:flex;
    align-items:center;
    gap:4px;
    font-size:12px;
    color: var(--c-text-muted, #64748b);
  }
  .filter-check input {
    margin:0;
  }
  .btn {
    border:1px solid var(--border-color, #dfe3ea); border-radius:6px;
    background: var(--bg, #fff); color: var(--text-color, #0f172a);
    cursor:pointer;
  }
  .btn-sm { min-height:32px; padding:0 12px; font-size:12px; }
  .btn.primary { background:#2563eb; color:#fff; border-color:#1d4ed8; }
  .btn[disabled] { cursor:not-allowed; opacity:.6; }
  .schema-controls { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
  .schema-name, .schema-select {
    min-width:220px; height:32px; padding:6px 10px;
    border:1px solid var(--border-color, #dfe3ea); border-radius:6px;
    background: var(--bg, #fff); color: var(--text-color, #0f172a);
  }
  .auth-block {
    display:flex; align-items:center; gap:6px; flex-wrap:wrap;
  }
  .auth-loading { font-size:12px; color: var(--c-text-muted, #8b93a7); }
  .login-form { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
  .login-input {
    height:32px; padding:6px 10px; border:1px solid var(--border-color, #dfe3ea);
    border-radius:6px; background: var(--bg, #fff); color: var(--text-color, #0f172a);
  }
  .login-actions { display:flex; gap:6px; }
  .user-badge {
    background:#e0e7ff; color:#1d4ed8; padding:4px 10px; border-radius:999px;
    font-weight:600; font-size:12px;
  }
  .auth-warning { color:#dc2626; font-size:12px; margin-top:4px; }
  .btn-link {
    border:none;
    background:transparent;
    color:#2563eb;
    cursor:pointer;
    font-size:12px;
    padding:0;
  }
  .btn-link[disabled] { color: var(--c-text-muted, #8b93a7); cursor:not-allowed; }
  .visually-hidden {
    position:absolute; width:1px; height:1px; padding:0; margin:-1px;
    overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0;
  }
  .status-line {
    display:flex; align-items:center; gap:12px; flex-wrap:wrap;
    padding:4px 12px 8px; font-size:12px;
    color: var(--text-color, #0f172a);
  }
  .status-line .status.error { color:#dc2626; }
  .status-line .status.success { color:#16a34a; }

  @media (max-width: 1100px) {
    .topbar { grid-template-columns: 1fr; justify-items: stretch; }
    .topbar-left, .topbar-right { justify-content: space-between; }
    .topbar-center { order: 3; justify-content: stretch; }
    .history-actions { width:100%; justify-content:flex-start; }
  }

  @media (max-width: 640px) {
    .schema-controls { flex-direction: column; align-items: stretch; }
    .schema-name, .schema-select { width: 100%; }
    .topbar-left, .topbar-right { justify-content: center; }
    .filter-line { flex-direction: column; align-items:flex-start; }
    .history-actions { justify-content:center; }
    .status-area { justify-content:center; }
  }
</style>
