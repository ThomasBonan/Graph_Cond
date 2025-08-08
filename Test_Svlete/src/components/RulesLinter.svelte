<script>
  import { grouped, rulesets, currentRulesetName, optionLabels } from '../lib/stores.js';
  import { lintAllRulesets, formatIssue, autofixRulesets } from '../lib/rules-linter.js';

  // UI
  let showOnly = 'active';   // 'active' | 'all'
  let showSeverity = 'all';  // 'all' | 'error' | 'warning'

  // Lint recalculé à chaque changement de grouped/rulesets
  $: results = lintAllRulesets($grouped, $rulesets);

  // Ruleset actif
  $: active = $currentRulesetName || Object.keys($rulesets || {})[0] || 'default';

  // Filtrage des issues pour un ruleset
  function filteredIssues(name) {
    const r = results.byRuleset?.[name];
    if (!r) return [];
    return r.issues.filter(i => {
      if (showSeverity !== 'all' && i.severity !== showSeverity) return false;
      if (showOnly === 'active' && name !== active) return false;
      return true;
    });
  }

  // Sections à afficher selon le filtre
  $: sections =
    showOnly === 'active'
      ? [{ name: active, issues: filteredIssues(active) }]
      : Object.keys(results.byRuleset || {}).map(n => ({ name: n, issues: filteredIssues(n) }));

  function runAutofix() {
    if (!confirm('Nettoyer les doublons et supprimer les IDs inconnus dans tous les rulesets ?')) return;
    rulesets.update(R => autofixRulesets(R, $grouped));
  }
</script>

<div class="card">
  <div class="row head">
    <h3>Linter de règles</h3>
    <div class="toggles">
      <label>
        Afficher
        <select bind:value={showOnly}>
          <option value="active">Ruleset actif uniquement</option>
          <option value="all">Tous les rulesets</option>
        </select>
      </label>
      <label>
        Gravité
        <select bind:value={showSeverity}>
          <option value="all">Toutes</option>
          <option value="error">Erreurs</option>
          <option value="warning">Avertissements</option>
        </select>
      </label>
      <button class="btn danger" on:click={runAutofix}>Autofix (sécurisé)</button>
    </div>
  </div>

  <div class="summary">
    <span>Total: {results.totals.total}</span>
    <span class="err">Erreurs: {results.totals.error}</span>
    <span class="warn">Avertissements: {results.totals.warning}</span>
  </div>

  {#each sections as sec (sec.name)}
    <div class="section">
      <h4>Ruleset « {sec.name} » — {sec.issues.length} problème{sec.issues.length>1 ? 's' : ''}</h4>
      {#if sec.issues.length === 0}
        <p class="muted">Aucun problème détecté.</p>
      {:else}
        <ul class="list">
          {#each sec.issues as it}
            <li class={it.severity}>
              <span class="tag">{it.severity === 'error' ? 'Erreur' : 'Avert.'}</span>
              <span class="msg">{formatIssue(it, $optionLabels)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/each}
</div>

<style>
  .card { border:1px solid var(--c-stroke); border-radius:8px; padding:10px; }
  .row.head { display:flex; justify-content:space-between; align-items:center; gap:12px; }
  .toggles { display:flex; gap:10px; align-items:center; }
  .summary { display:flex; gap:14px; margin:6px 0 10px; }
  .summary .err { color:#dc2626; }
  .summary .warn { color:#d97706; }
  .section { margin-top:8px; }
  .muted { color: var(--c-text-muted); }
  .list { list-style:none; padding-left:0; }
  .list li { display:flex; gap:8px; padding:6px 0; border-bottom:1px dashed var(--c-stroke-weak, #3a4658); }
  .list li:last-child { border-bottom:none; }
  .tag { font-size:12px; padding:2px 6px; border-radius:999px; background:#334155; color:#e2e8f0; }
  .list li.error .tag { background:#7f1d1d; color:#fee2e2; }
  .list li.warning .tag { background:#78350f; color:#ffedd5; }
  .msg { flex:1; }
  .btn { border:1px solid var(--c-stroke); background:var(--c-box-bg); color:var(--c-text); border-radius:8px; padding:6px 10px; cursor:pointer; }
  .btn.danger { border-color:#ef4444; color:#ef4444; }
</style>
