<script>
  import { derived } from 'svelte/store';
  import {
    grouped, optionLabels,
    rulesets, currentRulesetName
  } from '../lib/stores.js';

  /* ========= Index options: id, label, paths ========= */
  const optionsIndex = derived([grouped, optionLabels], ([$grouped, $labels]) => {
    const pathsById = {};
    for (const [group, obj] of Object.entries($grouped || {})) {
      (obj?.root || []).forEach((id) => { (pathsById[id] ??= []).push({ group, subgroup: null }); });
      for (const [sg, ids] of Object.entries(obj?.subgroups || {})) {
        (ids || []).forEach((id) => { (pathsById[id] ??= []).push({ group, subgroup: sg }); });
      }
    }
    const arr = Object.keys(pathsById).map((id) => ({
      id,
      label: $labels?.[id] || id,
      paths: pathsById[id]
    }));
    arr.sort((a, b) => (a.label || '').localeCompare(b.label || '', 'fr') || a.id.localeCompare(b.id, 'fr'));
    return arr;
  });
  $: indexById = Object.fromEntries(($optionsIndex || []).map(o => [o.id, o]));

  /* ========= Règles actives ========= */
  $: activeName = $currentRulesetName;
  $: rules = ($rulesets?.[activeName]?.rules) || {};

  /* ========= Option source ========= */
  let from = '';
  $: current = normalizeCurrent(rules[from]);

  function normalizeCurrent(spec) {
    const empty = { requires: [], incompatible_with: [], mandatory: [], requires_groups: [] };
    if (!spec) return empty;
    const out = {
      requires: Array.isArray(spec.requires) ? spec.requires.slice() : [],
      incompatible_with: Array.isArray(spec.incompatible_with) ? spec.incompatible_with.slice() : [],
      mandatory: Array.isArray(spec.mandatory) ? spec.mandatory.slice() : [],
      requires_groups: Array.isArray(spec.requires_groups) ? spec.requires_groups.map(g => ({
        min: Math.max(0, Math.min(Number.isFinite(+g.min) ? +g.min : (Array.isArray(g.of) ? g.of.length : 0), (Array.isArray(g.of) ? g.of.length : 0))),
        of: Array.isArray(g.of) ? g.of.slice() : []
      })) : []
    };
    // Rétro-compat: si 'requires' existe et pas de groups -> créer 1 groupe ALL
    if (out.requires.length && out.requires_groups.length === 0) {
      out.requires_groups.push({ min: out.requires.length, of: out.requires.slice() });
    }
    return out;
  }

  /* ========= Combobox (typeahead) pour "from" ========= */
  let qFrom = '';
  let open = false;
  let activeIdx = 0;
  let inputEl;

  $: filtered = (() => {
    const q = (qFrom || '').trim().toLowerCase();
    const base = $optionsIndex || [];
    if (!q) return base;
    return base.filter(o =>
      (o.label || '').toLowerCase().includes(q) ||
      (o.paths || []).some(p => `${p.group} ${p.subgroup || ''}`.toLowerCase().includes(q))
    );
  })();

  function formatPath(p) { return `${p.group} › ${p.subgroup || 'Racine'}`; }
  function formatPathsShort(paths, max = 2) {
    const arr = (paths || []).map(formatPath);
    return arr.length <= max ? arr : [...arr.slice(0, max), `+${arr.length - max} autres…`];
  }

  function choose(o) { from = o.id; qFrom = ''; open = false; activeIdx = 0; }
  function onKeyDown(e) {
    if (!open && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete')) open = true;
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = (activeIdx + 1) % filtered.length; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = (activeIdx - 1 + filtered.length) % filtered.length; }
    else if (e.key === 'Enter') { e.preventDefault(); const o = filtered[activeIdx]; if (o) choose(o); }
    else if (e.key === 'Escape') { open = false; }
  }

  /* ========= Updates ========= */
  function write(specPatch) {
    const next = structuredClone($rulesets || {});
    next[activeName] = next[activeName] || { rules: {} };
    next[activeName].rules[from] = next[activeName].rules[from] || { requires: [], incompatible_with: [], mandatory: [], requires_groups: [] };

    const cur = normalizeCurrent(next[activeName].rules[from]);
    const merged = { ...cur, ...specPatch };

    // Contrainte 'requires_groups' propre (bornes min/max)
    merged.requires_groups = (merged.requires_groups || []).map(g => {
      const of = Array.from(new Set(g.of || []));
      const max = of.length;
      let min = Number.isFinite(+g.min) ? Math.max(0, Math.min(+g.min, max)) : max;
      return { min, of };
    });

    // On garde 'requires' pour compat (ALL) mais on peut le recalculer si tous les groupes sont ALL et disjoints
    // Simple: on le vide pour éviter ambiguïtés (graph.js gère la compat legacy au runtime)
    merged.requires = [];

    next[activeName].rules[from] = merged;
    rulesets.set(next);
  }

  function addGroup() {
    const g = { min: 1, of: [] };
    write({ requires_groups: [...current.requires_groups, g] });
  }
  function removeGroup(idx) {
    const groups = current.requires_groups.slice();
    groups.splice(idx, 1);
    write({ requires_groups: groups });
  }
  function setMin(idx, min) {
    const groups = current.requires_groups.slice();
    const max = groups[idx].of.length;
    groups[idx] = { ...groups[idx], min: Math.max(0, Math.min(min, max)) };
    write({ requires_groups: groups });
  }
  function toggleInGroup(idx, id) {
    const groups = current.requires_groups.slice();
    const of = new Set(groups[idx].of || []);
    if (of.has(id)) of.delete(id); else of.add(id);
    const arr = Array.from(of);
    const min = Math.max(0, Math.min(groups[idx].min, arr.length));
    groups[idx] = { ...groups[idx], of: arr, min: Math.max(1, min) }; // min>=1 si le groupe contient au moins 1 élément
    write({ requires_groups: groups });
  }

  function pathTitle(id) {
    const opt = indexById[id];
    if (!opt) return '';
    return (opt.paths || []).map(formatPath).join(' • ');
  }

  // helpers affichage
  function labelOf(id) { return indexById[id]?.label || id; }
  function groupSummary(g) {
    if (!g || !Array.isArray(g.of) || g.of.length === 0) return '— (vide)';
    const min = (typeof g.min === 'number') ? g.min : g.of.length;
    const lhs = (min === g.of.length) ? 'Tous' : (min === 1 ? '≥1' : `≥${min}`);
    return `${lhs} parmi (${g.of.map(labelOf).join(', ')})`;
  }
</script>

<div class="panel">
  <h3>Éditeur de règles</h3>

  <!-- Combobox / typeahead -->
  <div class="field">
    <label for="from-input">Option source</label>

    <div
      class="combo"
      role="combobox"
      aria-haspopup="listbox"
      aria-owns="from-listbox"
      aria-expanded={open}
      style="--rule-combo-maxw: 420px"
    >
      <input
        id="from-input"
        class="combo-input"
        placeholder="Rechercher par nom ou chemin…"
        bind:this={inputEl}
        bind:value={qFrom}
        on:focus={() => (open = true)}
        on:input={() => { open = true; activeIdx = 0; }}
        on:keydown={onKeyDown}
        autocomplete="off"
        aria-autocomplete="list"
        aria-controls="from-listbox"
        aria-activedescendant={open && filtered[activeIdx] ? `opt-${filtered[activeIdx].id}` : null}
      />

      {#if from}
        <button
          class="clear"
          title="Effacer la sélection"
          aria-label="Effacer la sélection"
          on:click={() => { from = ''; qFrom = ''; open = true; inputEl?.focus(); }}
        >×</button>
      {/if}

      {#if open}
        <ul id="from-listbox" class="combo-list" role="listbox">
          {#if filtered.length === 0}
            <li class="empty">Aucun résultat</li>
          {:else}
            {#each filtered as o, i}
              <li
                id={"opt-" + o.id}
                role="option"
                aria-selected={i === activeIdx}
                class:active={i === activeIdx}
                class="combo-item"
                on:mousedown|preventDefault={() => choose(o)}
                title={(o.paths?.length ? o.paths.map(formatPath).join(' • ') + ' — ' : '') + o.id}
              >
                <div class="label">{o.label}</div>
                <div class="sub">
                  {#each formatPathsShort(o.paths, 2) as p, j}
                    <span class="path">{p}</span>{#if j < formatPathsShort(o.paths, 2).length - 1}<span class="sep">•</span>{/if}
                  {/each}
                </div>
                <div class="id">{o.id}</div>
              </li>
            {/each}
          {/if}
        </ul>
      {/if}
    </div>

    {#if from}
      <div class="chosen">
        <div class="chosen-label">Sélectionné :</div>
        <div class="chosen-main">
          <strong>{labelOf(from)}</strong>
          <div class="chosen-paths">
            {#if indexById[from]?.paths?.length}
              {#each indexById[from].paths as p, i}
                <span class="path">{formatPath(p)}</span>{#if i < indexById[from].paths.length - 1}<span class="sep">•</span>{/if}
              {/each}
            {:else}
              <span class="muted">Chemin introuvable</span>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>

  {#if from}
  <!-- =================== OBLIGATOIRE =================== -->
  <div class="section">
    <div class="badge mand">Obligatoire</div>
    <small>Si <strong>{labelOf(from)}</strong> est choisie, les options ci-dessous sont <em>auto-sélectionnées</em>.</small>
    <div class="chips">
      {#each $optionsIndex as o}
        {#if o.id !== from}
          <button
            class:chip={true}
            class:active={current.mandatory?.includes(o.id)}
            on:click={() => {
              const set = new Set(current.mandatory || []);
              set.has(o.id) ? set.delete(o.id) : set.add(o.id);
              write({ mandatory: Array.from(set) });
            }}
            type="button"
            aria-pressed={current.mandatory?.includes(o.id) ? 'true' : 'false'}
            title={"Obligatoire vers " + o.label + (o.paths?.length ? " — " + pathTitle(o.id) : "")}
          >
            {o.label}
          </button>
        {/if}
      {/each}
    </div>
  </div>

  <!-- =================== GROUPES k/n =================== -->
  <div class="section">
    <div class="badge req">Groupes de dépendances (k-sur-n)</div>
    <small>Chaque groupe définit un minimum <strong>k</strong> d’options à respecter. <em>Tous</em> les groupes doivent être satisfaits.</small>

    <div class="groups">
      {#if current.requires_groups.length === 0}
        <div class="empty muted">Aucun groupe. Ajoutez-en un ci-dessous.</div>
      {/if}

      {#each current.requires_groups as g, i}
        <div class="group">
          <div class="group-head">
            <div class="group-title">Groupe {i+1}</div>
            <div class="group-actions">
              <label class="min-label">Min.</label>
              <input
                type="number" min="0" max={g.of.length}
                class="min-input"
                value={Math.max(0, Math.min(g.min ?? g.of.length, g.of.length))}
                on:change={(e)=> setMin(i, parseInt(e.currentTarget.value || '0', 10))}
              />
              <button class="btn" on:click={() => setMin(i, Math.max(1, g.of.length))} title="Tous (min = n)">Tous</button>
              <button class="btn danger" on:click={() => removeGroup(i)} aria-label="Supprimer le groupe" title="Supprimer le groupe">×</button>
            </div>
          </div>

          <div class="chips">
            {#each $optionsIndex as o}
              {#if o.id !== from}
                <button
                  class:chip={true}
                  class:active={(g.of || []).includes(o.id)}
                  on:click={() => toggleInGroup(i, o.id)}
                  type="button"
                  aria-pressed={(g.of || []).includes(o.id) ? 'true' : 'false'}
                  title={"Inclure " + o.label + (o.paths?.length ? " — " + pathTitle(o.id) : "")}
                >
                  {o.label}
                </button>
              {/if}
            {/each}
          </div>

          <div class="summary muted">→ {groupSummary(g)}</div>
        </div>
      {/each}
    </div>

    <div class="add-group">
      <button class="btn primary" on:click={addGroup}>+ Ajouter un groupe</button>
      <div class="hints muted">
        Astuces : <em>Tous</em> = min = n • <em>Au moins 1</em> = min = 1 • <em>k/n</em> = min = k
      </div>
    </div>
  </div>

  <!-- =================== INCOMPATIBLE =================== -->
  <div class="section">
    <div class="badge inc">Incompatible</div>
    <div class="chips">
      {#each $optionsIndex as o}
        {#if o.id !== from}
          <button
            class:chip={true}
            class:active={current.incompatible_with?.includes(o.id)}
            on:click={() => {
              const set = new Set(current.incompatible_with || []);
              set.has(o.id) ? set.delete(o.id) : set.add(o.id);
              write({ incompatible_with: Array.from(set) });
            }}
            type="button"
            aria-pressed={current.incompatible_with?.includes(o.id) ? 'true' : 'false'}
            title={"Incompatible avec " + o.label + (o.paths?.length ? " — " + pathTitle(o.id) : "")}
          >
            {o.label}
          </button>
        {/if}
      {/each}
    </div>
  </div>
  {/if}
</div>

<style>
  .panel { padding: 12px 16px; border: 1px solid var(--c-stroke); border-radius: 8px; background: var(--c-box-bg); }
  .field { margin-top: 6px; display:flex; flex-direction:column; gap:6px; }
  label { font-weight: 600; }

  /* Combobox */
  .combo { position: relative; display: inline-flex; align-items:center; width:100%; max-width: var(--rule-combo-maxw, 420px); }
  .combo-input {
    width: 100%; min-width: 240px;
    padding: 8px 32px 8px 10px; border: 1px solid var(--c-stroke); border-radius: 8px;
    background: var(--c-bg); color: var(--c-text); font-size: 14px;
  }
  .clear { position:absolute; right:6px; top:50%; transform:translateY(-50%); appearance:none; border:none; background:transparent; cursor:pointer; color: var(--c-text-muted); font-size:16px; line-height:1; padding:2px 6px; border-radius:6px; }
  .clear:hover { color:#dc2626; background: color-mix(in oklab, #dc2626 10%, transparent); }
  .combo-list { position: absolute; z-index: 20; left: 0; right: auto; width: 100%; max-height: 260px; overflow: auto; margin-top: 4px; padding: 6px; background: var(--c-box-bg); border: 1px solid var(--c-stroke); border-radius: 8px; box-shadow: 0 10px 24px rgba(0,0,0,.12); }
  .combo-item { padding: 6px 8px; border-radius: 6px; cursor: pointer; display:grid; grid-template-columns: 1fr auto; gap:2px 8px; }
  .combo-item .label { font-weight: 600; }
  .combo-item .sub { grid-column: 1 / span 1; color: var(--c-text-muted); font-size: 12px; display:flex; flex-wrap:wrap; gap:4px; }
  .combo-item .id  { grid-column: 2; color: var(--c-text-muted); font-size: 12px; align-self:center; }
  .combo-item.active, .combo-item:hover { background: color-mix(in oklab, var(--c-stroke), transparent 80%); }
  .chosen { display:flex; gap:10px; align-items:flex-start; margin-top: 6px; }
  .chosen-label { color: var(--c-text-muted); font-size: 12px; padding-top: 2px; }
  .chosen-main { display:flex; flex-direction:column; gap:2px; }
  .chosen-paths { color: var(--c-text-muted); font-size: 12px; display:flex; flex-wrap:wrap; gap:4px; }
  .path { white-space: nowrap; } .sep { margin: 0 4px; color: var(--c-text-muted); } .muted { color: var(--c-text-muted); }

  .section { margin-top: 14px; }
  .badge { display:inline-block; padding:2px 6px; border-radius: 6px; font-size: 12px; border: 1px solid var(--c-stroke); margin-bottom: 6px; }
  .badge.mand { border-color: var(--c-rule-mand-border); color: var(--c-rule-mand-border); }
  .badge.req  { border-color: var(--c-rule-req-border);  color: var(--c-rule-req-border); }
  .badge.inc  { border-color: var(--c-rule-inc-border);  color: var(--c-rule-inc-border); }

  .chips { display:flex; flex-wrap:wrap; gap:6px; }
  .chip  { padding:6px 8px; border:1px solid var(--c-stroke); border-radius:6px; background:var(--c-bg); color:var(--c-text); cursor:pointer; }
  .chip.active { border-color: var(--c-selected-border); box-shadow: 0 0 0 2px color-mix(in oklab, var(--c-selected-border), transparent 75%); }

  .groups { display:flex; flex-direction:column; gap:10px; }
  .group { border:1px dashed var(--c-stroke); border-radius:8px; padding:10px; background: color-mix(in oklab, var(--c-box-bg), transparent 0%); }
  .group-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
  .group-title { font-weight: 600; }
  .group-actions { display:flex; align-items:center; gap:6px; }
  .min-label { font-size:12px; color: var(--c-text-muted); }
  .min-input { width: 56px; padding:4px 6px; border:1px solid var(--c-stroke); border-radius:6px; background:var(--c-bg); color:var(--c-text); }
  .btn { padding:4px 8px; border:1px solid var(--c-stroke); background:var(--c-bg); color:var(--c-text); border-radius:6px; cursor:pointer; }
  .btn.primary { border-color: var(--c-selected-border); }
  .btn.danger { border-color:#dc2626; color:#dc2626; }
  .add-group { margin-top: 8px; display:flex; align-items:center; gap:10px; }
  .summary { margin-top: 6px; font-size:12px; }
  .empty { padding:6px 0; }
</style>
