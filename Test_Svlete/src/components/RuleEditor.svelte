<script>
  import { get } from 'svelte/store';
  import {
    grouped, optionLabels, rulesets, currentRulesetName
  } from '../lib/stores.js';

  // Sélections
  let fromId = '';
  let toId = '';
  let type = 'requires'; // 'requires' | 'incompatible_with'

  // Options affichées dans les <select>, désambiguïsées avec le chemin "Groupe / Sous-groupe"
  $: options = buildOptions($grouped, $optionLabels);

  $: if (!fromId && options.length) fromId = options[0].id;
  $: if (!toId && options.length) toId = options[0].id;

  function buildOptions(grouped, labels) {
    const out = [];
    for (const [g, obj] of Object.entries(grouped || {})) {
      for (const [sg, ids] of Object.entries(obj?.subgroups || {})) {
        (ids || []).forEach(id => out.push({ id, label: labels?.[id] || id, path: `${g} / ${sg}` }));
      }
      // options au niveau du groupe (root)
      (obj?.root || []).forEach(id => out.push({ id, label: labels?.[id] || id, path: `${g} / (sans sous-groupe)` }));
    }
    // dédoublonnage + tri alpha
    const seen = new Set(), unique = [];
    for (const o of out) { if (!seen.has(o.id)) { seen.add(o.id); unique.push(o); } }
    unique.sort((a,b) => a.label.localeCompare(b.label, 'fr'));
    return unique;
  }

  function addRule() {
    if (!fromId || !toId || fromId === toId) return;

    const rsName = get(currentRulesetName) || 'default';

    rulesets.update(R => {
      const next = structuredClone(R || {});
      const set  = next[rsName] || { rules: {} };
      const rules = set.rules || {};

      rules[fromId] ||= {};
      const key = type; // 'requires' | 'incompatible_with'
      const arr = new Set(rules[fromId][key] || []);
      arr.add(toId); // pas de doublon
      rules[fromId][key] = Array.from(arr);

      next[rsName] = { rules };
      return next;
    });

    // on garde fromId & type pour enchaîner les ajouts ; on réinitialise seulement la cible
    toId = '';
  }

  function removeRule(rsName, from, key, target) {
    rulesets.update(R => {
      const next = structuredClone(R || {});
      const set = next[rsName]; if (!set) return R;
      const rules = set.rules || {};
      const arr = new Set(rules[from]?.[key] || []);
      arr.delete(target);
      if (arr.size === 0) {
        if (rules[from]) delete rules[from][key];
        if (rules[from] && Object.keys(rules[from]).length === 0) delete rules[from];
      } else {
        rules[from][key] = Array.from(arr);
      }
      next[rsName] = { rules };
      return next;
    });
  }

  // Aplatit le ruleset courant pour affichage
  $: currentName = $currentRulesetName || 'default';
  $: current = $rulesets?.[currentName]?.rules || {};
  $: flatRules = flattenRules(current, $optionLabels, $grouped);

  function flattenRules(rules, labels, grouped) {
    const label = (id) => labels?.[id] || id;
    const pathOf = (id) => {
      for (const [g, obj] of Object.entries(grouped || {})) {
        for (const [sg, ids] of Object.entries(obj?.subgroups || {})) {
          if ((ids || []).includes(id)) return `${g} / ${sg}`;
        }
        if ((obj?.root || []).includes(id)) return `${g} / (sans sous-groupe)`;
      }
      return '';
    };
    const out = [];
    for (const [from, obj] of Object.entries(rules || {})) {
      if (Array.isArray(obj?.requires)) {
        for (const to of obj.requires) {
          out.push({ from, to, key: 'requires', text: `${label(from)} (${pathOf(from)}) dépend de ${label(to)} (${pathOf(to)})` });
        }
      }
      if (Array.isArray(obj?.incompatible_with)) {
        for (const to of obj.incompatible_with) {
          out.push({ from, to, key: 'incompatible_with', text: `${label(from)} (${pathOf(from)}) incompatible avec ${label(to)} (${pathOf(to)})` });
        }
      }
    }
    out.sort((a,b) => a.text.localeCompare(b.text, 'fr'));
    return out;
  }

  // Accès clavier: Entrée valide le formulaire si possible
  function onKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addRule();
    }
  }
</script>

<div class="card" on:keydown={onKeydown}>
  <h3>Règles</h3>
  <p class="muted">Ajoute autant de règles que nécessaire dans le ruleset « {currentName} ».</p>

  <div class="grid">
    <div>
      <label>De</label>
      <select bind:value={fromId}>
        {#each options as o}
          <option value={o.id}>{o.label}</option>
        {/each}
      </select>
    </div>

    <div>
      <label>Type</label>
      <select bind:value={type}>
        <option value="requires">Dépend de</option>
        <option value="incompatible_with">Incompatible avec</option>
      </select>
    </div>

    <div>
      <label>À</label>
      <select bind:value={toId}>
        {#each options as o}
          <option value={o.id}>{o.label}</option>
        {/each}
      </select>
    </div>
  </div>

  <div style="margin-top:8px">
    <button class="btn primary" on:click={addRule} disabled={!fromId || !toId || fromId === toId}>
      Ajouter la règle
    </button>
    {#if fromId === toId}
      <span class="hint">Une option ne peut pas cibler elle-même.</span>
    {/if}
  </div>

  <h4 style="margin-top:14px">Règles du set « {currentName} »</h4>
  {#if flatRules.length === 0}
    <p class="muted">Aucune règle.</p>
  {:else}
    <ul class="rules">
      {#each flatRules as r}
        <li>
          <span>{r.text}</span>
          <button class="btn-icon danger" on:click={() => removeRule(currentName, r.from, r.key, r.to)}>✕</button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .card { border:1px solid var(--c-stroke); border-radius:8px; padding:10px; }
  .grid { display:grid; grid-template-columns: 1fr 1fr 1fr; gap:8px; }
  label { color: var(--c-text-muted); display:block; margin:6px 0 4px; }
  .rules { list-style: disc; padding-left: 18px; }
  .rules li { display:flex; align-items:center; gap:8px; margin:4px 0; }
  .btn-icon.danger { border:1px solid #ef4444; color:#ef4444; background:var(--c-box-bg); border-radius:6px; padding:2px 6px; cursor:pointer; }
  .hint { margin-left:8px; color: var(--c-text-muted); }
  .muted { color: var(--c-text-muted); margin: 6px 0; }
</style>
