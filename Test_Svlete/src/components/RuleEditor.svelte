<script>
  import OptionPicker from './OptionPicker.svelte';
  import {
    grouped,
    optionLabels,
    data,
    rulesets,
    currentRulesetName
  } from '../lib/stores.js';

  let fromId = null;
  let toReq  = null;
  let toInc  = null;

  // Mises à jour immuables du ruleset actif
  function updateRules(mut) {
    const all = $rulesets || {};
    const active = $currentRulesetName || 'default';
    const cur = all[active]?.rules || {};
    const rules = { ...cur };
    mut(rules);
    rulesets.set({ ...all, [active]: { rules } });
  }

  function ensureRule(from) {
    updateRules((rules) => {
      if (!rules[from]) rules[from] = { requires: [], incompatible_with: [] };
    });
  }

  function addRequire() {
    if (!fromId || !toReq || fromId === toReq) return;
    updateRules((rules) => {
      const r = rules[fromId] || (rules[fromId] = { requires: [], incompatible_with: [] });
      if (!r.requires.includes(toReq)) r.requires = [...r.requires, toReq];
    });
    toReq = null;
  }

  function addIncompatible() {
    if (!fromId || !toInc || fromId === toInc) return;
    updateRules((rules) => {
      const r = rules[fromId] || (rules[fromId] = { requires: [], incompatible_with: [] });
      if (!r.incompatible_with.includes(toInc)) r.incompatible_with = [...r.incompatible_with, toInc];
    });
    toInc = null;
  }

  // Suppressions
  function removeRequire(from, depId) {
    updateRules((rules) => {
      const r = rules[from];
      if (r) r.requires = r.requires.filter((x) => x !== depId);
    });
  }
  function removeIncompatible(from, incId) {
    updateRules((rules) => {
      const r = rules[from];
      if (r) r.incompatible_with = r.incompatible_with.filter((x) => x !== incId);
    });
  }
</script>

<style>
  .panel {
    padding: 12px 16px;
    border: 1px solid var(--c-stroke);
    border-radius: 8px;
    background: var(--c-box-bg);
  }
  .row { display:flex; gap:12px; margin-top:12px; }
  .col { flex:1; }
  h3 { margin: 0 0 12px; }
  h4 { margin: 16px 0 8px; }
  .btn {
    background: var(--c-btn);
    color: var(--c-btn-text);
    border: 1px solid var(--c-stroke);
    border-radius: 6px;
    padding: 6px 10px;
    cursor: pointer;
  }
  .btn-del {
    background: transparent;
    color: var(--c-text);
    border: 1px solid var(--c-stroke);
    border-radius: 6px;
    padding: 2px 6px;
    margin-left: 8px;
    cursor: pointer;
  }
  ul { margin: 6px 0 12px; padding-left: 18px; }
  li { margin: 4px 0; }
</style>

<div class="panel">
  <h3>Créer / modifier une règle</h3>

  <label>Option source</label>
  <OptionPicker
    bind:value={fromId}
    grouped={$grouped}
    data={$data}
    optionLabels={$optionLabels}
    placeholder="Choisir l’option source…"
  />

  <div class="row">
    <div class="col">
      <label>Requiert</label>
      <OptionPicker
        bind:value={toReq}
        grouped={$grouped}
        data={$data}
        optionLabels={$optionLabels}
        placeholder="Ajouter une dépendance…"
      />
      <button class="btn" on:click={addRequire} style="margin-top:6px;">Ajouter</button>
    </div>

    <div class="col">
      <label>Incompatible avec</label>
      <OptionPicker
        bind:value={toInc}
        grouped={$grouped}
        data={$data}
        optionLabels={$optionLabels}
        placeholder="Ajouter une incompatibilité…"
      />
      <button class="btn" on:click={addIncompatible} style="margin-top:6px;">Ajouter</button>
    </div>
  </div>

  {#if fromId}
    <div style="margin-top:16px;">
      <h4>Règles existantes pour {$optionLabels[fromId] || fromId}</h4>

      {#if $rulesets[$currentRulesetName]?.rules?.[fromId]}
        <div>
          <strong>Requiert :</strong>
          <ul>
            {#each $rulesets[$currentRulesetName].rules[fromId].requires as depId}
              <li>
                {$optionLabels[depId] || depId}
                <button class="btn-del" title="Supprimer" on:click={() => removeRequire(fromId, depId)}>❌</button>
              </li>
            {/each}
            {#if ($rulesets[$currentRulesetName].rules[fromId].requires || []).length === 0}
              <li><em>Aucune dépendance</em></li>
            {/if}
          </ul>
        </div>

        <div>
          <strong>Incompatible avec :</strong>
          <ul>
            {#each $rulesets[$currentRulesetName].rules[fromId].incompatible_with as incId}
              <li>
                {$optionLabels[incId] || incId}
                <button class="btn-del" title="Supprimer" on:click={() => removeIncompatible(fromId, incId)}>❌</button>
              </li>
            {/each}
            {#if ($rulesets[$currentRulesetName].rules[fromId].incompatible_with || []).length === 0}
              <li><em>Aucune incompatibilité</em></li>
            {/if}
          </ul>
        </div>
      {:else}
        <em>Aucune règle définie pour cette option.</em>
      {/if}
    </div>
  {/if}
</div>
