<!--
  AuditPanel.svelte
  ----------------------------------------------------------------------------
  Overlay affichant l'historique des actions par schéma. Réservé au compte
  bootstrap, exploite l'endpoint /api/schemas/:id/audit et permet de naviguer
  entre les schémas (actifs + archivés).
-->
<script>
  import { onMount } from 'svelte';
  import {
    auditPanelOpen,
    auditSelectedSchemaId,
    savedSchemas,
    archivedSchemas,
    fetchSchemaAudit,
    closeAuditPanel,
    refreshSavedSchemas
  } from '../lib/stores.js';
  import { toastError } from '../lib/toasts.js';

  let entries = [];
  let loading = false;
let errorMessage = '';
let searchTerm = '';
let lastLoadedId = null;

$: open = $auditPanelOpen;
$: selectedId = $auditSelectedSchemaId;

function actionLabel(action) {
  switch (action) {
    case 'create':
      return 'Creation';
    case 'update':
      return 'Mise a jour';
    case 'archive':
      return 'Archive';
    case 'unarchive':
      return 'Restauration';
    case 'delete':
      return 'Suppression';
    default:
      return action;
  }
}

  $: allSchemas = (() => {
    const map = new Map();
    [...$savedSchemas.map((s) => ({ ...s, archived: false })), ...$archivedSchemas.map((s) => ({ ...s, archived: true }))].forEach((schema) => {
      map.set(schema.id, schema);
    });
    return Array.from(map.values()).sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' })
    );
  })();

  $: filteredSchemas = allSchemas.filter((schema) =>
    !searchTerm
      ? true
      : (schema.name || '').toLowerCase().includes(searchTerm.trim().toLowerCase())
  );

  async function ensureSchemaList() {
    try {
      await refreshSavedSchemas({ includeArchived: true });
    } catch (err) {
      toastError(err?.message || 'Impossible de rafraichir les schemas.');
    }
  }

  async function loadEntries(schemaId) {
    if (!schemaId) {
      entries = [];
      errorMessage = '';
      return;
    }
    loading = true;
    errorMessage = '';
    try {
      const data = await fetchSchemaAudit(schemaId);
      entries = data.map((event) => ({
        ...event,
        date: event.created_at ? new Date(event.created_at) : null
      }));
    } catch (err) {
      console.error('audit load', err);
      errorMessage = err?.message || 'Impossible de charger les logs pour ce schema.';
      entries = [];
    } finally {
      loading = false;
      lastLoadedId = schemaId;
    }
  }

  function selectSchema(schema) {
    auditSelectedSchemaId.set(schema?.id ?? null);
  }

  function handleClose() {
    entries = [];
    errorMessage = '';
    searchTerm = '';
    lastLoadedId = null;
    closeAuditPanel();
  }

  $: if (open && !allSchemas.length) {
    ensureSchemaList();
  }

  $: if (open && allSchemas.length && !selectedId) {
    const first = allSchemas[0];
    if (first) {
      auditSelectedSchemaId.set(first.id);
    }
  }

  $: if (open && selectedId && selectedId !== lastLoadedId) {
    loadEntries(selectedId);
  }

  onMount(() => {
    const handler = (event) => {
      if (event.key === 'Escape' && open) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
</script>

{#if open}
  <div class="audit-backdrop" role="presentation" on:click={(event) => event.target === event.currentTarget && handleClose()}>
    <section class="audit-panel" role="dialog" aria-modal="true" aria-label="Historique des operations">
      <header class="audit-header">
        <div>
          <h2>Historique des operations</h2>
          <p>Suivez les creations, modifications, archivages ou suppressions des schemas.</p>
        </div>
        <button class="btn btn-sm" type="button" on:click={handleClose}>Fermer</button>
      </header>

      <div class="audit-body">
        <aside class="audit-sidebar">
          <div class="sidebar-head">
            <h3>Schemas ({allSchemas.length})</h3>
            <input
              class="search"
              type="search"
              placeholder="Filtrer les schemas..."
              bind:value={searchTerm}
            />
          </div>
          <ul>
            {#each filteredSchemas as schema (schema.id)}
              <li>
                <button
                  type="button"
                  class:selected={schema.id === selectedId}
                  on:click={() => selectSchema(schema)}
                >
                  <span>{schema.name}</span>
                  {#if schema.archived}
                    <span class="tag">Archive</span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        </aside>

        <main class="audit-content">
          {#if !selectedId}
            <div class="empty-state">
              <p>Selectionnez un schema pour afficher son historique.</p>
            </div>
          {:else if loading}
            <div class="empty-state">
              <div class="spinner" aria-hidden="true"></div>
              Chargement des logs...
            </div>
          {:else if errorMessage}
            <div class="empty-state error">
              <p>{errorMessage}</p>
            </div>
          {:else if !entries.length}
            <div class="empty-state">
              <p>Aucun evenement enregistre pour ce schema.</p>
            </div>
          {:else}
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Action</th>
                  <th>Schema</th>
                  <th>Utilisateur</th>
                </tr>
              </thead>
              <tbody>
                {#each entries as event (event.id)}
                  <tr>
                    <td>{event.date ? event.date.toLocaleString('fr-FR') : event.created_at}</td>
                    <td><span class="pill pill-{event.action}">{actionLabel(event.action)}</span></td>
                    <td>{event.name || 'Aucun'}</td>
                    <td>{event.actor || 'Inconnu'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </main>
      </div>
    </section>
  </div>
{/if}


<style>
  .audit-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(4px);
    display:flex;
    align-items:center;
    justify-content:center;
    padding: 32px 16px;
    z-index: 980;
  }
  .audit-panel {
    width: min(1100px, 96vw);
    max-height: min(720px, 90vh);
    background: var(--panel-bg, #f8fafc);
    color: var(--text-color, #0f172a);
    border-radius: 16px;
    display:flex;
    flex-direction:column;
    box-shadow: 0 24px 48px rgba(15, 23, 42, 0.3);
    overflow:hidden;
  }
  .audit-header {
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    gap:16px;
    padding: 20px 24px;
    border-bottom:1px solid var(--border-color, #dfe3ea);
  }
  .audit-header h2 {
    margin:0;
    font-size:20px;
  }
  .audit-header p {
    margin:4px 0 0;
    font-size:13px;
    color: var(--c-text-muted, #64748b);
  }
  .audit-body {
    flex:1;
    display:grid;
    grid-template-columns: 240px 1fr;
    min-height:0;
  }
  .audit-sidebar {
    border-right:1px solid var(--border-color, #dfe3ea);
    background: rgba(248, 250, 252, 0.8);
    display:flex;
    flex-direction:column;
  }
  .sidebar-head {
    padding:16px;
    border-bottom:1px solid var(--border-color, #dfe3ea);
    display:flex;
    flex-direction:column;
    gap:8px;
  }
  .sidebar-head h3 {
    margin:0;
    font-size:14px;
    font-weight:600;
  }
  .search {
    width:100%;
    height:32px;
    padding:6px 10px;
    border:1px solid var(--border-color, #dfe3ea);
    border-radius:6px;
    background:#fff;
  }
  .audit-sidebar ul {
    margin:0;
    padding:0;
    list-style:none;
    flex:1;
    overflow:auto;
  }
  .audit-sidebar li {
    border-bottom:1px solid rgba(15, 23, 42, 0.05);
  }
  .audit-sidebar button {
    width:100%;
    border:none;
    background:transparent;
    text-align:left;
    padding:10px 16px;
    display:flex;
    justify-content:space-between;
    align-items:center;
    gap:8px;
    font-size:13px;
    cursor:pointer;
  }
  .audit-sidebar button.selected {
    background:#e2e8f0;
    font-weight:600;
  }
  .tag {
    font-size:11px;
    font-weight:600;
    color:#1e3a8a;
    background:#e0e7ff;
    padding:2px 8px;
    border-radius:999px;
  }
  .audit-content {
    padding:16px 20px;
    overflow:auto;
    background: var(--bg, #fff);
  }
  table {
    width:100%;
    border-collapse:collapse;
    font-size:13px;
  }
  th, td {
    text-align:left;
    padding:10px 12px;
    border-bottom:1px solid rgba(15, 23, 42, 0.08);
  }
  th {
    font-size:12px;
    text-transform:uppercase;
    letter-spacing:0.04em;
    color: var(--c-text-muted, #64748b);
    background: rgba(148, 163, 184, 0.12);
  }
  .pill {
    display:inline-flex;
    align-items:center;
    justify-content:center;
    padding:2px 8px;
    border-radius:999px;
    font-weight:600;
    font-size:11px;
    text-transform:uppercase;
    letter-spacing:0.03em;
  }
  .pill-create { background:#dcfce7; color:#166534; }
  .pill-update { background:#dbeafe; color:#1d4ed8; }
  .pill-archive { background:#fef3c7; color:#9a3412; }
  .pill-unarchive { background:#ede9fe; color:#6b21a8; }
  .pill-delete { background:#fee2e2; color:#b91c1c; }

  .empty-state {
    display:flex;
    flex-direction:column;
    gap:8px;
    align-items:center;
    justify-content:center;
    min-height:220px;
    color: var(--c-text-muted, #64748b);
  }
  .empty-state.error {
    color:#b91c1c;
  }
  .spinner {
    width:18px;
    height:18px;
    border-radius:50%;
    border:2px solid rgba(37,99,235,0.3);
    border-top-color:#2563eb;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @media (max-width: 820px) {
    .audit-body {
      grid-template-columns: 1fr;
    }
    .audit-sidebar {
      max-height:180px;
      border-right:none;
      border-bottom:1px solid var(--border-color, #dfe3ea);
    }
    .audit-sidebar ul {
      display:flex;
      flex-direction:row;
      overflow-x:auto;
    }
    .audit-sidebar li {
      border-right:1px solid rgba(15, 23, 42, 0.08);
      border-bottom:none;
      min-width:200px;
    }
    .audit-content {
      padding:12px;
    }
    table th, table td {
      padding:8px;
    }
  }
</style>
