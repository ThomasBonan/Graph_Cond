<!--
  SystemHealthPanel.svelte
  ----------------------------------------------------------------------------
  Overlay réservé au compte bootstrap pour visualiser l'état de santé du
  serveur (base SQLite, stockage, charge CPU, mémoire). Interroge l'API
  /api/admin/system-health et affiche les métriques sous forme lisible.
-->
<script>
  import { onMount } from 'svelte';
  import {
    systemHealthPanelOpen,
    systemHealth,
    systemHealthLoading,
    systemHealthError,
    systemHealthLatencyMs,
    systemHealthLastUpdated,
    refreshSystemHealth,
    closeSystemHealthPanel,
    authUser
  } from '../lib/stores.js';
  import { toastError } from '../lib/toasts.js';

  let initialFetchDone = false;

  $: open = $systemHealthPanelOpen;
  $: loading = $systemHealthLoading;
  $: error = $systemHealthError;
  $: health = $systemHealth;
  $: latencyMs = $systemHealthLatencyMs;
  $: lastUpdated = $systemHealthLastUpdated;
  $: isBootstrap = Boolean($authUser?.isBootstrap);

  $: db = health?.database || null;
  $: storage = health?.storage || null;
  $: proc = health?.process || null;
  $: cpu = health?.cpu || null;
  $: serverProcessingMs = health?.serverProcessingMs ?? null;

  function formatBytes(value) {
    if (value == null) return '—';
    const units = ['o', 'Ko', 'Mo', 'Go', 'To', 'Po'];
    let size = Number(value);
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    const digits = size >= 10 || unit === 0 ? 0 : 1;
    return `${size.toFixed(digits)} ${units[unit]}`;
  }

  function formatNumber(value, options = {}) {
    if (value == null || Number.isNaN(Number(value))) return '—';
    return Number(value).toLocaleString('fr-FR', options);
  }

  function formatDuration(seconds) {
    if (!seconds && seconds !== 0) return '—';
    const total = Math.max(0, Math.floor(seconds));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const parts = [];
    if (days) parts.push(`${days} j`);
    if (hours || parts.length) parts.push(`${hours} h`);
    if (minutes || parts.length) parts.push(`${minutes} min`);
    parts.push(`${secs} s`);
    return parts.join(' ');
  }

  function percent(part, total) {
    if (part == null || total == null || total === 0) return null;
    return (part / total) * 100;
  }

  function formatLatency(ms) {
    if (ms == null) return '—';
    const value = Number(ms);
    const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return `${value.toFixed(digits)} ms`;
  }

  function formatLoad(loadArray) {
    if (!Array.isArray(loadArray) || !loadArray.length) return '—';
    return loadArray
      .slice(0, 3)
      .map((val) => Number(val || 0).toFixed(2))
      .join(' / ');
  }

  function handleClose() {
    closeSystemHealthPanel();
    initialFetchDone = false;
  }

  async function handleRefresh() {
    try {
      await refreshSystemHealth();
    } catch (err) {
      toastError(err?.message || 'Impossible de recuperer la sante du systeme.');
    }
  }

  $: if (!open) {
    initialFetchDone = false;
  }

  $: if (open && isBootstrap && !initialFetchDone && !loading) {
    initialFetchDone = true;
    handleRefresh();
  }

  onMount(() => {
    const handler = (event) => {
      if (event.key === 'Escape' && $systemHealthPanelOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
</script>

{#if open}
  <div
    class="health-backdrop"
    role="presentation"
    on:click={(event) => event.target === event.currentTarget && handleClose()}
  >
    <section class="health-panel" role="dialog" aria-modal="true" aria-label="Sante systeme">
      <header class="health-header">
        <div>
          <h2>Sante du systeme</h2>
          <p>Controle rapide de l etat du serveur qui heberge la base de schemas.</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-sm" type="button" on:click={handleRefresh} disabled={loading}>
            {loading ? 'Actualisation...' : 'Rafraichir'}
          </button>
          <button class="btn btn-sm" type="button" on:click={handleClose}>Fermer</button>
        </div>
      </header>

      <section class="health-summary">
        <div class="metric">
          <span class="metric-label">Latence requete</span>
          <span class="metric-value">{formatLatency(latencyMs)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Traitement serveur</span>
          <span class="metric-value">{serverProcessingMs != null ? formatLatency(serverProcessingMs) : '—'}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Temps de fonctionnement</span>
          <span class="metric-value">{formatDuration(health?.uptimeSeconds)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Derniere mise a jour</span>
          <span class="metric-value">
            {lastUpdated ? new Date(lastUpdated).toLocaleString('fr-FR') : '—'}
          </span>
        </div>
      </section>

      {#if error}
        <div class="health-error">{error}</div>
      {:else if loading && !health}
        <div class="health-loading">
          <div class="spinner" /> Chargement des mesures...
        </div>
      {:else if health}
        <div class="health-grid">
          <section>
            <h3>Base de donnees</h3>
            <ul>
              <li><span>Chemin</span><span class="mono">{db?.path || '—'}</span></li>
              <li><span>Taille fichier</span><span>{formatBytes(db?.sizeBytes)}</span></li>
              <li><span>Taille estimee (pages)</span><span>{formatBytes(db?.approxSizeBytes)}</span></li>
              <li>
                <span>Pages SQLite</span>
                <span>{formatNumber(db?.pageCount)} x {formatBytes(db?.pageSize)}</span>
              </li>
              <li>
                <span>Modifie le</span>
                <span>{db?.modifiedAt ? new Date(db.modifiedAt).toLocaleString('fr-FR') : '—'}</span>
              </li>
            </ul>
          </section>

          <section>
            <h3>Stockage data/</h3>
            <ul>
              <li><span>Dossier</span><span class="mono">{storage?.dataDir || '—'}</span></li>
              <li><span>Volume utilise</span><span>{formatBytes(storage?.contentBytes)}</span></li>
              <li><span>Fichiers</span><span>{formatNumber(storage?.files)}</span></li>
              <li><span>Dossiers</span><span>{formatNumber(storage?.directories)}</span></li>
              <li>
                <span>Usage disque</span>
                <span>
                  {#if storage?.usedBytes != null && storage?.totalBytes != null}
                    {formatBytes(storage.usedBytes)} / {formatBytes(storage.totalBytes)}
                    ({formatNumber(percent(storage.usedBytes, storage.totalBytes), { maximumFractionDigits: 1 })} %)
                  {:else}
                    —
                  {/if}
                </span>
              </li>
              <li>
                <span>Espace libre</span>
                <span>{formatBytes(storage?.freeBytes)} (disponible: {formatBytes(storage?.availableBytes)})</span>
              </li>
            </ul>
          </section>

          <section>
            <h3>Processus Node</h3>
            <ul>
              <li><span>PID</span><span>{proc?.pid ?? '—'}</span></li>
              <li><span>Node</span><span>{proc?.nodeVersion ?? '—'}</span></li>
              <li><span>Plateforme</span><span>{proc?.platform ?? '—'} ({proc?.arch ?? '—'})</span></li>
              <li>
                <span>Memoire (heap)</span>
                <span>
                  {#if proc?.memory?.heapUsed != null && proc?.memory?.heapTotal != null}
                    {formatBytes(proc.memory.heapUsed)} / {formatBytes(proc.memory.heapTotal)}
                    ({formatNumber(percent(proc.memory.heapUsed, proc.memory.heapTotal), { maximumFractionDigits: 1 })} %)
                  {:else}
                    —
                  {/if}
                </span>
              </li>
              <li>
                <span>RSS</span>
                <span>{formatBytes(proc?.memory?.rss)}</span>
              </li>
            </ul>
          </section>

          <section>
            <h3>Charge CPU</h3>
            <ul>
              <li><span>Cores detectes</span><span>{formatNumber(cpu?.cores)}</span></li>
              <li><span>Load 1/5/15 min</span><span>{formatLoad(cpu?.loadAverage)}</span></li>
            </ul>
          </section>
        </div>
      {/if}
    </section>
  </div>
{/if}

<style>
  .health-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(2px);
    z-index: 90;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .health-panel {
    width: min(900px, 96vw);
    max-height: 92vh;
    overflow: auto;
    background: var(--panel-bg, #fff);
    color: var(--text-color, #0f172a);
    border-radius: 16px;
    box-shadow: 0 18px 60px rgba(15, 23, 42, 0.35);
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 24px;
  }

  .health-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }
  .health-header h2 {
    margin: 0;
    font-size: 20px;
  }
  .health-header p {
    margin: 4px 0 0;
    color: var(--c-text-muted, #64748b);
    font-size: 14px;
  }
  .header-actions {
    display: flex;
    gap: 8px;
  }

  .health-summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
    padding: 16px;
    background: rgba(148, 163, 184, 0.12);
    border-radius: 12px;
  }
  .metric {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .metric-label {
    font-size: 12px;
    color: var(--c-text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .metric-value {
    font-size: 16px;
    font-weight: 600;
  }

  .health-error {
    padding: 12px 16px;
    border-radius: 8px;
    background: rgba(248, 113, 113, 0.12);
    color: #b91c1c;
    font-weight: 600;
  }

  .health-loading {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 36px 0;
    justify-content: center;
    color: var(--c-text-muted, #64748b);
  }
  .spinner {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 3px solid rgba(99, 102, 241, 0.2);
    border-top-color: rgba(99, 102, 241, 0.8);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .health-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 20px;
  }

  .health-grid section {
    background: rgba(226, 232, 240, 0.18);
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .health-grid h3 {
    margin: 0;
    font-size: 16px;
  }
  .health-grid ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
    font-size: 14px;
  }
  .health-grid li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .health-grid li span:first-child {
    color: var(--c-text-muted, #64748b);
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Consolas, Menlo, monospace;
    word-break: break-all;
  }

  @media (max-width: 640px) {
    .health-panel {
      padding: 16px;
      gap: 16px;
    }
    .health-header {
      flex-direction: column;
      align-items: stretch;
    }
    .header-actions {
      justify-content: flex-end;
    }
  }
</style>
