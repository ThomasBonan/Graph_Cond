<!--
  TopBar.svelte
  ------------------------------
  Regroupe la navigation globale, la gestion de session et les actions liées
  aux schémas. Ce composant orchestre les interactions majeures (import/export,
  sauvegarde, duplication, filtrage) et se charge d’afficher l’état de l’appli
  via le menu burger et les toasts.
-->
<script>
  import { onMount, tick } from 'svelte';
import {
    mode,
    theme,
    toggleTheme,
    importJSON,
    exportJSON,
    resetAll,
    savedSchemas,
    archivedSchemas,
    activeSchema,
    refreshSavedSchemas,
    saveSchemaToDatabase,
    loadSchemaFromDatabase,
    deleteSchemaFromDatabase,
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
    checkAuth,
    createUserAccount,
    archiveSchemaInDatabase,
    openAuditPanel
  } from '../lib/stores.js';
  import { toastSuccess, toastError, toastInfo } from '../lib/toasts.js';
  import { readmeLinks } from '../lib/readme-content.js';

  let fileEl;
  let schemaName = '';
  let schemaDirty = false;
  let saving = false;
  let listLoading = false;
  let loadingSchema = false;
  let selectedSchemaId = '';
  let searchValue = '';
  let searchInputEl;
  let showLogin = false;
  let loginUsername = '';
  let loginPassword = '';
  let canEdit = false;
  let loggingIn = false;
  let authLoading = true;
  let menuOpen = false;
  let deleting = false;
  let showCreateUser = false;
  let newUserName = '';
  let newUserPassword = '';
  let creatingUser = false;
  let archivingActive = false;
  let restoringId = null;

  function chooseFile() {
    if (!fileEl) return;
    fileEl.click();
  }

  function openReadme() {
    if (typeof window === 'undefined') return;
    const target = readmeLinks?.readmeUrl || '/docs/app-readme.html';
    window.open(target, '_blank', 'noopener');
  }

  function resetCreateUserForm() {
    showCreateUser = false;
    newUserName = '';
    newUserPassword = '';
  }

  function cancelCreateUser() {
    creatingUser = false;
    resetCreateUserForm();
  }

  async function handleCreateUserSubmit(event) {
    event?.preventDefault?.();
    if (creatingUser) return;
    const username = (newUserName || '').trim();
    const password = newUserPassword || '';
    if (!username || !password) {
      toastError('Nom utilisateur et mot de passe requis.');
      return;
    }
    if (password.length < 6) {
      toastError('Le mot de passe doit contenir au moins 6 caracteres.');
      return;
    }
    creatingUser = true;
    try {
      await createUserAccount(username, password);
      toastSuccess(`Utilisateur "${username}" cree.`);
      resetCreateUserForm();
  } catch (err) {
    toastError(err?.message || 'Creation utilisateur impossible.');
  } finally {
    creatingUser = false;
  }
}

  async function handleOpenAuditPanel() {
    try {
      await refreshList();
      openAuditPanel($activeSchema?.id || null);
    } catch (err) {
      toastError(err?.message || 'Impossible d ouvrir les logs.');
    }
  }

  async function handleImport(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!canEdit) {
      toastError('Connexion requise pour importer.');
      return;
    }
    try {
      await importJSON(file);
      toastSuccess('Import effectué.');
    } catch (err) {
      toastError(err?.message || 'Échec import.');
    }
  }

  function handleSchemaInput(event) {
    schemaName = event.currentTarget.value;
    schemaDirty = true;
  }

  async function handleSaveSchema() {
    if (!canEdit) {
      toastError('Connexion requise pour enregistrer.');
      return;
    }
    if (saving) return;
    saving = true;
    try {
      const record = await saveSchemaToDatabase(schemaName, {
        id: $activeSchema?.id,
        archived: $activeSchema?.archived
      });
      toastSuccess(
        record?.status === 'created' ? 'Schéma enregistré.' : 'Schéma mis à jour.'
      );
      schemaDirty = false;
      schemaName = record?.name || schemaName;
      await refreshList();
    } catch (err) {
      toastError(err?.message || "Échec de l'enregistrement du schéma.");
    } finally {
      saving = false;
    }
  }

  async function refreshList() {
    listLoading = true;
    try {
      await refreshSavedSchemas({ includeArchived: true });
    } catch (err) {
      toastError(err?.message || 'Échec du chargement des schémas.');
    } finally {
      listLoading = false;
    }
  }

  async function handleSelectSchema(event) {
    const value = event.currentTarget.value;
    if (!value) return;
    loadingSchema = true;
    try {
      await loadSchemaFromDatabase(Number(value));
      schemaDirty = false;
      schemaName = $activeSchema?.name || schemaName;
    } catch (err) {
      toastError(err?.message || 'Échec du chargement du schéma.');
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
    try {
      const record = await duplicateCurrentSchema(trimmed);
      toastSuccess('Schéma dupliqué.');
      schemaDirty = false;
      schemaName = record?.name || trimmed;
      await refreshList();
    } catch (err) {
      toastError(err?.message || 'Échec de la duplication.');
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
      toastSuccess('Brouillon restauré.');
    } else {
      toastError('Impossible de restaurer le brouillon local.');
    }
  }

  async function handleDeleteSchema() {
    if (!canEdit || !$activeSchema?.id || deleting) return;
    if (typeof window !== 'undefined') {
      const confirmDelete = window.confirm(
        `Supprimer definitivement le schema "${$activeSchema?.name || schemaName}" ?`
      );
      if (!confirmDelete) return;
    }
    deleting = true;
    try {
      await deleteSchemaFromDatabase($activeSchema.id);
      toastSuccess('Schéma supprimé.');
      schemaName = '';
      schemaDirty = false;
      selectedSchemaId = '';
      await refreshList();
    } catch (err) {
      toastError(err?.message || 'Échec de la suppression.');
    } finally {
      deleting = false;
    }
  }

  async function handleArchiveActive() {
    if (!canEdit || !$activeSchema?.id || archivingActive) return;
    const targetId = $activeSchema.id;
    const nextState = !$activeSchema.archived;
    archivingActive = true;
    try {
      await archiveSchemaInDatabase(targetId, nextState);
      toastSuccess(nextState ? 'SchǸma archivǸ.' : 'SchǸma restaure.');
      if (nextState) {
        selectedSchemaId = '';
      }
      await refreshList();
    } catch (err) {
      toastError(
        err?.message || (nextState ? 'Archivage impossible.' : 'Restauration impossible.')
      );
    } finally {
      archivingActive = false;
    }
  }

  async function handleRestoreSchema(schema) {
    if (!canEdit || !schema?.id || restoringId === schema.id) return;
    restoringId = schema.id;
    try {
      await archiveSchemaInDatabase(schema.id, false);
      toastSuccess(`SchǸma "${schema.name}" restaure.`);
      await refreshList();
    } catch (err) {
      toastError(err?.message || 'Restauration impossible.');
    } finally {
      restoringId = null;
    }
  }

  async function handleLoadArchived(schema) {
    if (!schema?.id) return;
    loadingSchema = true;
    try {
      await loadSchemaFromDatabase(Number(schema.id));
      schemaDirty = false;
      schemaName = $activeSchema?.name || schemaName;
      toastInfo(`Schema "${schema.name}" charge (archive).`);
    } catch (err) {
      toastError(err?.message || 'Chargement du schema archive impossible.');
    } finally {
      loadingSchema = false;
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

  function toggleMenu() {
    menuOpen = !menuOpen;
    if (!menuOpen) {
      cancelCreateUser();
    }
  }
  function closeMenu() {
    menuOpen = false;
    cancelCreateUser();
  }

  async function handleLogin(event) {
    event?.preventDefault?.();
    if (loggingIn) return;
    loggingIn = true;
    try {
      const user = await loginUser(loginUsername, loginPassword);
      toastSuccess(`Connecté en tant que ${user.username}.`);
      showLogin = false;
      loginUsername = '';
      loginPassword = '';
      await refreshList();
    } catch (err) {
      toastError(err?.message || 'Connexion impossible.');
    } finally {
      loggingIn = false;
    }
  }

  async function handleLogout() {
    try {
      await logoutUser();
      toastInfo('Déconnecté.');
      await refreshList();
    } catch (err) {
      toastError(err?.message || 'Erreur lors de la déconnexion.');
    } finally {
      showLogin = false;
      resetCreateUserForm();
      creatingUser = false;
    }
  }

  onMount(() => {
    const handleKeyDown = async (event) => {
      const key = event.key ? event.key.toLowerCase() : '';
      const isCtrl = event.ctrlKey || event.metaKey;

      if (isCtrl && key === 's') {
        event.preventDefault();
        if ($mode === 'editor') {
          await handleSaveSchema();
        }
        return;
      }

      if (isCtrl && key === 'f') {
        event.preventDefault();
        menuOpen = true;
        await tick();
        searchInputEl?.focus();
        return;
      }

      if (event.key === 'Escape') {
        if (showLogin) {
          showLogin = false;
          loginUsername = '';
          loginPassword = '';
        } else if (menuOpen) {
          closeMenu();
        }
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
    }

    (async () => {
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
    })();

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', handleKeyDown);
      }
    };
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
  $: canManageUsers = Boolean($authUser?.isBootstrap) && $mode === 'editor';
  $: if (!canManageUsers && (showCreateUser || newUserName || newUserPassword || creatingUser)) {
    cancelCreateUser();
  }

  const gammeOptions = ['Smart', 'Mod', 'Evo'];
  $: groupOptions = Object.keys($grouped || {}).sort((a, b) =>
    a.localeCompare(b, 'fr', { sensitivity: 'base' })
  );
  $: filtersActive =
    $searchFilters.group !== 'all' || ($searchFilters.gammes || []).length > 0;
  $: statusVariant = $activeSchema?.archived
    ? { label: 'Archive', tone: 'archived' }
    : $editorDirty
      ? { label: 'Brouillon en cours', tone: 'dirty' }
      : $draftAvailable
        ? { label: 'Brouillon local', tone: 'draft' }
        : { label: 'Synchronise', tone: 'clean' };

  let lastActiveId = null;
  $: {
    const currentId = $activeSchema?.id ?? null;
    if (currentId !== lastActiveId) {
      if (currentId) {
        selectedSchemaId = $activeSchema?.archived ? '' : String(currentId);
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
  <button
    class="menu-trigger"
    type="button"
    aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
    aria-expanded={menuOpen}
    aria-controls="topbar-menu"
    on:click={toggleMenu}
  >
    <span></span>
    <span></span>
    <span></span>
  </button>
  <div class="topbar-title">
    <span>{$activeSchema?.name || schemaName || 'Menu'}</span>
  </div>
</div>

  <div class="menu-container">
  <button
    type="button"
    class="menu-backdrop"
    class:show={menuOpen}
    aria-label="Fermer le menu"
    on:click={closeMenu}
  />
  <aside
    class="menu-panel"
    class:open={menuOpen}
    id="topbar-menu"
    aria-hidden={!menuOpen}
  >
    <div class="menu-header">
      <h2 class="menu-heading">Menu</h2>
      <button class="btn btn-sm" type="button" on:click={closeMenu}>Fermer</button>
    </div>
    <div class="menu-body">
      <h3 class="section-title">Mode et schemas</h3>
      <div class="row row-top">
        <div class="mode-wrap">
          <button class="btn btn-sm" type="button" on:click={() => mode.set($mode === 'editor' ? 'configurateur' : 'editor')}>
            {$mode === 'editor' ? 'Configurateur' : 'Editeur'}
          </button>
        </div>
        <div class="schema-wrap">
          {#if $mode === 'editor'}
            <label class="visually-hidden" for="schema-name">Nom du schema</label>
            <input
              id="schema-name"
              class="schema-name"
              placeholder="Nom du schema..."
              value={schemaName}
              on:input={handleSchemaInput}
              disabled={!canEdit}
            />
          <div class="schema-actions primary-actions">
              <button class="btn btn-sm primary" type="button" on:click={handleSaveSchema} disabled={saving || !canEdit}>
                {saving ? 'Enregistrement...' : $activeSchema?.id ? 'Mettre a jour' : 'Enregistrer'}
              </button>
              <button class="btn btn-sm" type="button" on:click={handleDuplicate} disabled={!canEdit || saving}>
                Dupliquer
              </button>
              <button
                class="btn btn-sm"
                type="button"
                on:click={handleArchiveActive}
                disabled={!canEdit || !$activeSchema?.id || archivingActive}
              >
                {archivingActive
                  ? $activeSchema?.archived
                    ? 'Restauration...'
                    : 'Archivage...'
                  : $activeSchema?.archived
                    ? 'Restaurer'
                    : 'Archiver'}
              </button>
              <button
                class="btn btn-sm danger"
                type="button"
                on:click={handleDeleteSchema}
                disabled={!canEdit || !$activeSchema?.id || deleting}
              >
                {deleting ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          {/if}
          <div class="schema-picker">
            <label class="visually-hidden" for="schema-select">Selection du schema</label>
            <select
              id="schema-select"
              class="schema-dropdown"
              bind:value={selectedSchemaId}
              on:change={handleSelectSchema}
              disabled={loadingSchema || listLoading || !$savedSchemas.length}
            >
              <option value="">Selectionner un schema...</option>
              {#each $savedSchemas as schema}
                <option value={schema.id}>{schema.name}</option>
              {/each}
            </select>
            <div class="schema-actions">
              <button class="btn btn-sm" type="button" on:click={refreshList} disabled={listLoading}>
                {listLoading ? '...' : 'Actualiser'}
              </button>
            </div>
          </div>
          {#if $mode === 'editor' && $archivedSchemas.length}
            <div class="archived-section">
              <p class="archived-title">Schemas archives ({$archivedSchemas.length})</p>
              <ul class="archived-list">
                {#each $archivedSchemas as archived}
                  <li class="archived-item">
                    <span class="archived-name">{archived.name}</span>
                    <div class="archived-actions">
                      <button
                        class="btn btn-sm"
                        type="button"
                        on:click={() => handleLoadArchived(archived)}
                        disabled={loadingSchema}
                      >
                        Ouvrir
                      </button>
                      <button
                        class="btn btn-sm primary"
                        type="button"
                        on:click={() => handleRestoreSchema(archived)}
                        disabled={!canEdit || restoringId === archived.id}
                      >
                        {restoringId === archived.id ? 'Restauration...' : 'Restaurer'}
                      </button>
                    </div>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      </div>

      <h3 class="section-title">Statut & historique</h3>
      <div class="row row-bottom">
        <div class="status-wrap">
          <span class="status-badge {statusVariant.tone}">{statusVariant.label}</span>
          {#if $draftAvailable}
            <button class="btn btn-xs btn-ghost" type="button" on:click={handleRestoreDraftClick}>
              Restaurer
            </button>
          {/if}
          {#if $mode === 'editor'}
            <div class="history-actions">
              <button class="btn btn-sm" type="button" on:click={handleUndo} disabled={!$undoAvailable}>Annuler</button>
              <button class="btn btn-sm" type="button" on:click={handleRedo} disabled={!$redoAvailable}>Retablir</button>
            </div>
          {/if}
          {#if !canEdit && !authLoading}
            <span class="auth-warning">Connectez-vous pour creer ou modifier des schemas.</span>
          {/if}
        </div>

        <div class="auth-wrap">
          <h3 class="section-title">Authentification</h3>
          {#if authLoading}
            <span class="auth-loading">Authentification...</span>
          {:else if $authUser}
            <span class="user-badge" title="Utilisateur connecte">{$authUser.username}</span>
            <button class="btn btn-sm" type="button" on:click={handleLogout}>Se deconnecter</button>
            {#if canManageUsers}
              <div class="user-admin">
                <button class="btn btn-sm" type="button" on:click={handleOpenAuditPanel}>
                  Voir les logs
                </button>
                {#if showCreateUser}
                  <form class="user-create" on:submit|preventDefault={handleCreateUserSubmit}>
                    <label class="visually-hidden" for="new-user-name">Nom utilisateur</label>
                    <input
                      id="new-user-name"
                      class="login-input"
                      placeholder="Nouvel utilisateur"
                      autocomplete="off"
                      bind:value={newUserName}
                      disabled={creatingUser}
                    />
                    <label class="visually-hidden" for="new-user-password">Mot de passe</label>
                    <input
                      id="new-user-password"
                      class="login-input"
                      type="password"
                      placeholder="Mot de passe (min 6)"
                      autocomplete="new-password"
                      bind:value={newUserPassword}
                      disabled={creatingUser}
                    />
                    <div class="user-create-actions">
                      <button class="btn btn-sm primary" type="submit" disabled={creatingUser}>
                        {creatingUser ? 'Creation...' : 'Creer'}
                      </button>
                      <button
                        class="btn btn-sm"
                        type="button"
                        on:click={cancelCreateUser}
                        disabled={creatingUser}
                      >
                        Annuler
                      </button>
                    </div>
                  </form>
                {:else}
                  <button class="btn btn-sm" type="button" on:click={() => (showCreateUser = true)}>
                    Creer un utilisateur
                  </button>
                {/if}
              </div>
            {/if}
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
                }}
              >
                Se connecter
              </button>
            {/if}
          {/if}
        </div>

        <div class="filters-wrap">
          <h3 class="section-title">Rechercher & filtrer</h3>
          <div class="search-wrap">
            <label class="visually-hidden" for="search-input">Rechercher</label>
            <input
              id="search-input"
              class="search" bind:this={searchInputEl}
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
              Reinitialiser
            </button>
          </div>
        </div>

        <div class="actions-wrap">
          <h3 class="section-title">Autres actions</h3>
          <div class="actions-grid">
              <button class="btn btn-sm" type="button" on:click={chooseFile} disabled={!canEdit || $mode !== 'editor'}>
                Importer
              </button>
              <button class="btn btn-sm" type="button" on:click={exportJSON} disabled={!canEdit || $mode !== 'editor'}>
                Exporter JSON
              </button>
              <button class="btn btn-sm" type="button" on:click={openReadme}>
                README
              </button>
              <button class="btn btn-sm" type="button" on:click={resetAll}>
                Reinitialiser
              </button>
              <button class="btn btn-sm" type="button" on:click={toggleTheme} aria-label="Theme">
                Theme: {$theme === 'dark' ? 'clair' : 'sombre'}
            </button>
          </div>
        </div>
      </div>
      <input bind:this={fileEl} type="file" hidden accept=".json,.js" on:change={handleImport} />
    </div>
  </aside>
</div>
<style>
  .topbar {
    padding:10px 14px;
    background: var(--panel-bg, #f7f8fa);
    border-bottom:1px solid var(--border-color, #dfe3ea);
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
  }
  .menu-trigger {
    width:42px;
    height:42px;
    border:1px solid var(--border-color, #dfe3ea);
    border-radius:10px;
    background: var(--bg, #fff);
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:6px;
    cursor:pointer;
    transition:background 0.2s ease;
  }
  .menu-trigger:hover {
    background:rgba(37,99,235,0.08);
  }
  .menu-trigger span {
    display:block;
    width:20px;
    height:2px;
    background: var(--text-color, #0f172a);
    border-radius:999px;
    transition:transform 0.2s ease;
  }
  .topbar-title {
    flex:1;
    display:flex;
    justify-content:flex-end;
    font-size:14px;
    font-weight:600;
    color: var(--text-color, #0f172a);
  }
  .menu-container {
    position:relative;
    z-index:40;
  }
  .menu-backdrop {
    position:fixed;
    inset:0;
    background:rgba(15,23,42,0.35);
    opacity:0;
    pointer-events:none;
    transition:opacity 0.2s ease;
    border:none;
  }
  .menu-backdrop.show {
    opacity:1;
    pointer-events:auto;
    cursor:pointer;
  }
  .menu-panel {
    position:fixed;
    top:0;
    left:-440px;
    width:min(420px, 92vw);
    height:100vh;
    background: var(--panel-bg, #f7f8fa);
    border-right:1px solid var(--border-color, #dfe3ea);
    box-shadow:0 8px 32px rgba(15,23,42,0.25);
    padding:18px 18px 24px;
    overflow-y:auto;
    transition:left 0.26s ease;
    display:flex;
    flex-direction:column;
    gap:18px;
  }
  .menu-panel.open {
    left:0;
  }
  .menu-header {
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
  }
  .menu-heading {
    font-size:16px;
    font-weight:700;
    color: var(--text-color, #0f172a);
  }
  .menu-body {
    display:flex;
    flex-direction:column;
    gap:18px;
  }
  .section-title {
    margin:0;
    font-size:13px;
    font-weight:700;
    color: var(--c-text-muted, #64748b);
    text-transform:uppercase;
    letter-spacing:0.04em;
  }
  .row-top {
    display:flex;
    flex-direction:column;
    align-items:stretch;
    gap:12px;
  }
  .mode-wrap {
    flex:0 0 auto;
    display:flex;
    justify-content:flex-start;
  }
  .schema-wrap {
    display:flex;
    flex-direction:column;
    align-items:stretch;
    gap:10px;
  }
  .schema-name {
    width:100%;
    height:32px;
    padding:6px 10px;
    border:1px solid var(--border-color, #dfe3ea);
    border-radius:6px;
    background: var(--bg, #fff);
    color: var(--text-color, #0f172a);
  }
  .schema-actions {
    display:flex;
    gap:8px;
    flex-wrap:wrap;
    justify-content:flex-start;
  }
  .schema-actions.primary-actions {
    flex-wrap:wrap;
  }
  .schema-actions .danger {
    border-color:#fca5a5;
    color:#b91c1c;
    background:#fee2e2;
  }
  .schema-actions .danger:hover {
    background:#fecaca;
  }
  .schema-picker {
    display:flex;
    flex-direction:column;
    gap:10px;
  }
  .archived-section {
    margin-top:6px;
    padding:8px;
    border:1px dashed var(--border-color, #dfe3ea);
    border-radius:8px;
    background: var(--panel-bg, #f7f8fa);
  }
  .archived-title {
    margin:0 0 6px;
    font-size:12px;
    font-weight:600;
    color: var(--c-text-muted, #64748b);
    text-transform:uppercase;
    letter-spacing:0.05em;
  }
  .archived-list {
    list-style:none;
    margin:0;
    padding:0;
    display:flex;
    flex-direction:column;
    gap:6px;
  }
  .archived-item {
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:8px;
  }
  .archived-name {
    flex:1;
    font-size:13px;
    color: var(--c-text-muted, #64748b);
  }
  .archived-actions {
    display:flex;
    gap:6px;
  }
  .schema-dropdown {
    width:100%;
    height:32px;
    padding:6px 10px;
    border:1px solid var(--border-color, #dfe3ea);
    border-radius:6px;
    background: var(--bg, #fff);
    color: var(--text-color, #0f172a);
  }

  .row-bottom {
    display:flex;
    flex-direction:column;
    gap:16px;
  }
  .status-wrap {
    display:flex;
    flex-direction:column;
    gap:8px;
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
    width:fit-content;
  }
  .status-badge.clean { background:#dcfce7; color:#166534; }
  .status-badge.draft { background:#fef3c7; color:#92400e; }
  .status-badge.dirty { background:#fee2e2; color:#b91c1c; }
  .status-badge.archived { background:#e2e8f0; color:#334155; }
  .history-actions {
    display:flex;
    gap:6px;
    flex-wrap:wrap;
  }
  .btn-xs {
    min-height:24px;
    padding:0 10px;
    font-size:11px;
  }
  .btn-ghost {
    background:transparent;
    border:1px solid transparent;
    color:#2563eb;
  }
  .btn-ghost:hover { background:rgba(37,99,235,0.08); }

  .auth-wrap {
    display:flex;
    flex-wrap:wrap;
    gap:8px;
    align-items:center;
  }
  .auth-loading { font-size:12px; color: var(--c-text-muted, #8b93a7); }
  .login-form {
    display:flex;
    flex-wrap:wrap;
    gap:6px;
    align-items:center;
  }
  .login-input {
    height:32px;
    padding:6px 10px;
    border:1px solid var(--border-color, #dfe3ea);
    border-radius:6px;
    background: var(--bg, #fff);
    color: var(--text-color, #0f172a);
  }
  .login-actions { display:flex; gap:6px; }
  .user-admin { display:flex; flex-direction:column; gap:6px; margin-top:8px; }
  .user-create {
    display:flex;
    flex-wrap:wrap;
    gap:6px;
    align-items:flex-end;
  }
  .user-create-actions { display:flex; gap:6px; }
  .user-badge {
    background:#e0e7ff;
    color:#1d4ed8;
    padding:4px 10px;
    border-radius:999px;
    font-weight:600;
    font-size:12px;
  }
  .auth-warning { color:#dc2626; font-size:12px; }

  .filters-wrap {
    display:flex;
    flex-direction:column;
    gap:8px;
    min-width:0;
  }
  .search {
    width:100%;
    height:32px;
    padding:6px 10px;
    border:1px solid var(--border-color, #dfe3ea);
    border-radius:6px;
    background: var(--bg, #fff);
    color: var(--text-color, #0f172a);
  }
  .filter-line {
    display:flex;
    flex-wrap:wrap;
    gap:10px;
    align-items:center;
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
    gap:8px;
    align-items:center;
    flex-wrap:wrap;
  }
  .filter-check {
    display:flex;
    align-items:center;
    gap:4px;
    font-size:12px;
    color: var(--c-text-muted, #64748b);
  }

  .actions-wrap {
    display:flex;
    justify-content:flex-start;
  }
  .actions-grid {
    display:grid;
    grid-template-columns: repeat(2, minmax(120px, 1fr));
    gap:8px;
    width:100%;
    max-width:260px;
  }

  .btn {
    border:1px solid var(--border-color, #dfe3ea);
    border-radius:6px;
    background: var(--bg, #fff);
    color: var(--text-color, #0f172a);
    cursor:pointer;
  }
  .btn-sm { min-height:32px; padding:0 12px; font-size:12px; }
  .btn.primary { background:#2563eb; color:#fff; border-color:#1d4ed8; }
  .btn[disabled] { cursor:not-allowed; opacity:.6; }
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
  @media (max-width: 820px) {
    .actions-grid {
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      max-width:none;
    }
  }

  @media (max-width: 540px) {
    .menu-panel {
      width:100vw;
    }
  }
</style>
