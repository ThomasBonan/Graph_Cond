<script>
  import { onMount } from 'svelte';
  import { renderGraph } from '../lib/d3/graph.js';
  import {
    graphEl, grouped, gammes, optionLabels,
    rulesets, currentRulesetName, selected,
    search, searchFilters, collapsed, toggleSelect, mode, activeSchema
  } from '../lib/stores.js';

  let svgEl;
  let cleanup = () => {};

  // Rendu à la demande — on lit les règles “au moment du rendu”
  function rerender(preserveZoom = true) {
    cleanup();

    const activeRules =
      ($rulesets?.[$currentRulesetName]?.rules) || {};

    cleanup = renderGraph(svgEl, {
      search: $search,
      filters: $searchFilters,
      collapsed: $collapsed,
      grouped: $grouped,
      gammes: $gammes,
      rules: activeRules,
      optionLabels: $optionLabels,
      selected,
      interactive: $mode !== 'editor',
      preserveZoom,
      onToggleGroup: (g) => {
        const clone = structuredClone($collapsed);
        clone[g] = clone[g] || {};
        clone[g].__group = !clone[g].__group;
        collapsed.set(clone);
      },
      onToggleSubgroup: (g, key) => {
        const clone = structuredClone($collapsed);
        clone[g] = clone[g] || {};
        clone[g][key] = !clone[g][key];
        collapsed.set(clone);
      },
      onToggleSelect: (id) => ($mode !== 'editor') && toggleSelect(id)
    });
  }

  onMount(() => {
    graphEl.set(svgEl);
    rerender(false);
    const stop = [
      grouped.subscribe(() => rerender(true)),
      gammes.subscribe(() => rerender(true)),
      optionLabels.subscribe(() => rerender(true)),
      rulesets.subscribe(() => rerender(true)),
      currentRulesetName.subscribe(() => rerender(true)),
      search.subscribe(() => rerender(true)),
      searchFilters.subscribe(() => rerender(true)),
      collapsed.subscribe(() => rerender(true)),
      selected.subscribe(() => rerender(true)),
      mode.subscribe(() => rerender(true)),
      activeSchema.subscribe(() => rerender(false))
    ];
    return () => { stop.forEach(fn => fn && fn()); cleanup(); };
  });

  // ========= Résumé des règles (affiché sous le graphe en mode éditeur) =========
  $: activeRules = ($rulesets?.[$currentRulesetName]?.rules) || {};
  $: flatSummary = (() => {
    const out = [];
    for (const [from, spec] of Object.entries(activeRules)) {
      out.push({
        from,
        mandatory: (spec?.mandatory || []).slice().sort(),
        requires: (spec?.requires || []).slice().sort(),
        incompatible_with: (spec?.incompatible_with || []).slice().sort()
      });
    }
    out.sort((a,b) => {
      const la = $optionLabels[a.from] || a.from;
      const lb = $optionLabels[b.from] || b.from;
      return la.localeCompare(lb, 'fr');
    });
    return out;
  })();

  function L(id) { return $optionLabels?.[id] || id; }

  // Suppression ciblée d'un lien de règle
  function removeEdge(from, edge, toId) {
    const name = $currentRulesetName;
    const next = structuredClone($rulesets || {});
    next[name] = next[name] || { rules: {} };
    next[name].rules[from] = next[name].rules[from] || { requires: [], incompatible_with: [], mandatory: [] };
    const list = Array.from(new Set(next[name].rules[from][edge] || []));
    next[name].rules[from][edge] = list.filter(x => x !== toId);
    rulesets.set(next);
  }
</script>

<div class="graph-wrap">
  <svg bind:this={svgEl} role="img" aria-label="Graphe des options et règles"></svg>

  {#if $mode === 'editor'}
    <section class="rules-summary panel" aria-live="polite">
      <header>
        <strong>Résumé des règles</strong>
        <span class="counts">
          {flatSummary.length} options •
          {flatSummary.reduce((n,r)=>n+(r.mandatory?.length||0),0)} obligatoires •
          {flatSummary.reduce((n,r)=>n+(r.requires?.length||0),0)} requires •
          {flatSummary.reduce((n,r)=>n+(r.incompatible_with?.length||0),0)} incompatibilités
        </span>
      </header>

      {#if flatSummary.length === 0}
        <div class="empty">Aucune règle définie pour l’instant.</div>
      {:else}
        <div class="summary-grid">
          {#each flatSummary as r}
            <div class="rule-row">
              <div class="from">{L(r.from)}</div>

              <div class="col">
                <div class="badge mand">Obligatoire</div>
                {#if r.mandatory.length === 0}
                  <span class="muted">—</span>
                {:else}
                  {#each r.mandatory as id, i}
                    <span class="chip mand" title="obligatoire">
                      {L(id)}
                      <button
                        class="chip-x"
                        aria-label={"Supprimer l’obligation vers " + L(id)}
                        title="Supprimer"
                        on:click={() => removeEdge(r.from, 'mandatory', id)}
                      >×</button>
                    </span>{#if i < r.mandatory.length-1}<span class="sep">, </span>{/if}
                  {/each}
                {/if}
              </div>

              <div class="col">
                <div class="badge req">Requires</div>
                {#if r.requires.length === 0}
                  <span class="muted">—</span>
                {:else}
                  {#each r.requires as id, i}
                    <span class="chip req" title="requires">
                      {L(id)}
                      <button
                        class="chip-x"
                        aria-label={"Supprimer la dépendance vers " + L(id)}
                        title="Supprimer"
                        on:click={() => removeEdge(r.from, 'requires', id)}
                      >×</button>
                    </span>{#if i < r.requires.length-1}<span class="sep">, </span>{/if}
                  {/each}
                {/if}
              </div>

              <div class="col">
                <div class="badge inc">Incompatible</div>
                {#if r.incompatible_with.length === 0}
                  <span class="muted">—</span>
                {:else}
                  {#each r.incompatible_with as id, i}
                    <span class="chip inc" title="incompatible">
                      {L(id)}
                      <button
                        class="chip-x"
                        aria-label={"Supprimer l’incompatibilité avec " + L(id)}
                        title="Supprimer"
                        on:click={() => removeEdge(r.from, 'incompatible_with', id)}
                      >×</button>
                    </span>{#if i < r.incompatible_with.length-1}<span class="sep">, </span>{/if}
                  {/each}
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .graph-wrap { display:flex; flex-direction:column; gap:10px; height:100%; }
  svg { flex: 1 1 auto; width: 100%; height: 100%; display: block; background: transparent; }

  .rules-summary { flex: 0 0 auto; }
  .rules-summary header {
    display:flex; align-items:center; justify-content:space-between;
    margin-bottom: 8px;
  }
  .rules-summary .counts { color: var(--c-text-muted); font-size: 12px; }
  .rules-summary .empty { color: var(--c-text-muted); }

  .summary-grid { display:grid; grid-template-columns: 240px 1fr 1fr 1fr; gap: 8px 12px; }
  .rule-row { display: contents; }
  .from { font-weight: 600; align-self:center; }

  .col { display:flex; align-items:center; flex-wrap:wrap; gap:6px; }
  .badge { padding: 2px 6px; border-radius: 6px; font-size: 12px; border: 1px solid var(--c-stroke); }
  .badge.mand { border-color: var(--c-rule-mand-border); color: var(--c-rule-mand-border); }
  .badge.req  { border-color: var(--c-rule-req-border);  color: var(--c-rule-req-border); }
  .badge.inc  { border-color: var(--c-rule-inc-border);  color: var(--c-rule-inc-border); }

  .chip {
    display:inline-flex; align-items:center; gap:6px;
    padding:2px 6px; border-radius: 6px; font-size: 12px;
    border: 1px solid var(--c-stroke); background: var(--c-box-bg);
  }
  .chip.mand { border-color: var(--c-rule-mand-border); }
  .chip.req  { border-color: var(--c-rule-req-border); }
  .chip.inc  { border-color: var(--c-rule-inc-border); }

  /* Croix équivalente à la "croix du résumé des nœuds" (style minimal, discret) */
  .chip-x {
    appearance:none; border:none; background:transparent;
    color: var(--c-text-muted); cursor:pointer; font-size: 14px; line-height: 1;
    padding: 0 2px; border-radius: 4px;
  }
  .chip-x:hover { color: #dc2626; background: color-mix(in oklab, #dc2626 10%, transparent); }
  .chip-x:focus-visible { outline: 2px solid #dc2626; outline-offset: 2px; }

  .muted { color: var(--c-text-muted); }
  .sep { color: var(--c-text-muted); margin: 0 2px; }

  @media (max-width: 1024px) {
    .summary-grid {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .rule-row {
      display: flex;
      flex-direction: column;
      background: var(--c-box-bg);
      border: 1px solid var(--c-stroke);
      border-radius: 6px;
      padding: 10px;
      gap: 6px;
    }
    .from {
      font-size: 14px;
    }
    .col {
      align-items: flex-start;
    }
  }
</style>
