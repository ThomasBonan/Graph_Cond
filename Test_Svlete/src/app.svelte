<script>
  import { onMount } from 'svelte';
  import { mode, theme } from './lib/stores.js';

  /* UI communes */
  import TopBar from './components/TopBar.svelte';
  import GraphPane from './components/GraphPane.svelte';

  /* Vue commerciale */
  import CommercialActions from './components/CommercialActions.svelte';
  import Summary from './components/Summary.svelte';
  import ExportBar from './components/ExportBar.svelte'; // ✅ export SVG/PNG/PDF

  /* Vue éditeur (lazy-load) */
  let EditorLayoutComponent = null;
  let editorLoading = false;

  const pageTitle = 'Vue Éditeur';

  // Applique le thème via data-theme sur <html>
  let unsubTheme;
  onMount(() => {
    document.documentElement.setAttribute('data-theme', $theme || 'light');
    unsubTheme = theme.subscribe(t => {
      document.documentElement.setAttribute('data-theme', t || 'light');
    });
    return () => unsubTheme && unsubTheme();
  });

  // Charge dynamique du layout éditeur quand on passe en mode 'editor'
  $: if ($mode === 'editor' && !EditorLayoutComponent && !editorLoading) {
    editorLoading = true;
    import('./components/EditorLayout.svelte')
      .then(m => { EditorLayoutComponent = m.default; })
      .finally(() => { editorLoading = false; });
  }
</script>

<!-- Topbar : Import/Export JSON + switch Commerciale/Éditeur + thème -->
<TopBar />

{#if $mode === 'editor'}
  <div class="toolbar" style="margin: 8px 12px 0;">
    <h2 class="title">{pageTitle}</h2>
  </div>

  {#if EditorLayoutComponent}
    <svelte:component this={EditorLayoutComponent} />
  {:else}
    <div class="loading"><div class="spinner" /> Chargement de l’éditeur…</div>
  {/if}
{:else}
  <!-- === VUE COMMERCIALE === -->
  <div class="layout">
    <CommercialActions />

    <div class="mainpane">
      <!-- Outils de ligne (EXPORT GRAPHE) -->
      <div class="rowtools">
        <ExportBar />
      </div>

      <div class="mainrow">
        <div class="graph-wrap">
          <GraphPane />
        </div>

        <aside class="summary-pane">
          <Summary />
        </aside>
      </div>
    </div>
  </div>
{/if}

<style>
  .title {
    font-size: 16px; margin: 0; font-weight: 600;
    color: var(--c-text, var(--text-color, #0f172a));
  }
  .toolbar { display: flex; align-items: center; gap: 8px; }

  .loading {
    display: grid; place-items: center;
    height: calc(100% - 52px);
    color: var(--c-text-muted, var(--text-muted, #8b93a7));
  }
  .spinner {
    width: 16px; height: 16px; border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--c-text, #0f172a) 25%, transparent);
    border-top-color: var(--c-text, var(--text-color, #0f172a));
    animation: spin .8s linear infinite; margin-right: 8px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ====== Mise en page commerciale avec Résumé à droite ====== */
  .mainpane { display: flex; flex-direction: column; min-height: 0; }
  .rowtools {
    display: flex; align-items: center; gap: 8px;
    justify-content: flex-end;
    padding: 8px 12px 0;
  }
  .rowtools .label { color: var(--c-text-muted, #8b93a7); margin-right: 4px; }

  .mainrow {
    display: grid;
    grid-template-columns: 1fr 340px; /* graphe | résumé */
    gap: 12px;
    padding: 8px 12px 12px;
    flex: 1; min-height: 0;
  }
  .graph-wrap {
    min-width: 0; min-height: 0; display: flex;
    background: var(--c-bg, var(--bg, #fff));
    border: 1px solid var(--c-stroke, var(--border-color, #dfe3ea));
    border-radius: 8px;
  }
  .graph-wrap :global(svg),
  .graph-wrap :global(canvas) { flex: 1; min-height: 0; }

  .summary-pane {
    min-width: 300px;
    background: var(--c-box-bg, var(--panel-bg, #f7f8fa));
    border: 1px solid var(--c-stroke, var(--border-color, #dfe3ea));
    border-radius: 8px;
    overflow: auto;
    padding: 8px;
  }

  @media (max-width: 1200px) {
    .mainrow { grid-template-columns: 1fr; }
    .summary-pane { order: 2; max-height: 320px; }
  }

  @media (max-width: 900px) {
    .rowtools {
      justify-content: center;
      flex-wrap: wrap;
    }
    .mainrow {
      padding: 8px 8px 12px;
    }
    .summary-pane {
      min-width: 0;
      width: 100%;
    }
  }

  @media (max-width: 640px) {
    .graph-wrap {
      min-height: 320px;
    }
    .rowtools {
      padding: 8px 8px 0;
    }
  }
</style>
