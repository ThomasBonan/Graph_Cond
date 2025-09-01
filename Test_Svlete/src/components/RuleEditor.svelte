<script>
  import { derived } from 'svelte/store';
  import { grouped, optionLabels, rulesets, currentRulesetName } from '../lib/stores.js';

  const optionsIndex = derived([grouped, optionLabels], ([$grouped, $labels]) => {
    const pathsById = {};
    for (const [group, obj] of Object.entries($grouped || {})) {
      (obj?.root || []).forEach((id) => { (pathsById[id] ??= []).push({ group, subgroup: null }); });
      for (const [sg, ids] of Object.entries(obj?.subgroups || {})) {
        (ids || []).forEach((id) => { (pathsById[id] ??= []).push({ group, subgroup: sg }); });
      }
    }
    const arr = Object.keys(pathsById).map((id) => ({ id, label: $labels?.[id] || id, paths: pathsById[id] }));
    arr.sort((a, b) => (a.label || '').localeCompare(b.label || '', 'fr') || a.id.localeCompare(b.id, 'fr'));
    return arr;
  });

  $: indexById = Object.fromEntries(($optionsIndex || []).map(o => [o.id, o]));

  $: activeName = $currentRulesetName;
  $: rules = ($rulesets?.[activeName]?.rules) || {};

  let from = '';
  $: current = rules[from] || { requires: [], incompatible_with: [], mandatory: [] };

  /* ---- Combobox ---- */
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

  function updateRule(edge, list) {
    const next = structuredClone($rulesets || {});
    next[activeName] = next[activeName] || { rules: {} };
    next[activeName].rules[from] = next[activeName].rules[from] || { requires: [], incompatible_with: [], mandatory: [] };
    next[activeName].rules[from][edge] = Array.from(new Set(list));
    rulesets.set(next);
  }
  function toggleIn(edge, id) {
    const list = new Set(current[edge] || []);
    list.has(id) ? list.delete(id) : list.add(id);
    updateRule(edge, Array.from(list));
  }
  function pathTitle(id) {
    const opt = indexById[id];
    if (!opt) return '';
    return (opt.paths || []).map(formatPath).join(' • ');
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
          <strong>{indexById[from]?.label || from}</strong>
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
  <div id="rule-sections" class="sections">
    <div class="section">
      <div class="badge mand">Obligatoire</div>
      <small>Si <strong>{indexById[from]?.label || from}</strong> est choisie, les options ci-dessous sont <em>auto-sélectionnées</em>.</small>
      <div class="chips">
        {#each $optionsIndex as o}
          {#if o.id !== from}
            <button
              class:chip={true}
              class:active={current.mandatory?.includes(o.id)}
              on:click={() => toggleIn('mandatory', o.id)}
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

    <div class="section">
      <div class="badge req">Requires</div>
      <small>Bloque la sélection si ces dépendances ne sont pas présentes.</small>
      <div class="chips">
        {#each $optionsIndex as o}
          {#if o.id !== from}
            <button
              class:chip={true}
              class:active={current.requires?.includes(o.id)}
              on:click={() => toggleIn('requires', o.id)}
              type="button"
              aria-pressed={current.requires?.includes(o.id) ? 'true' : 'false'}
              title={"Dépendance vers " + o.label + (o.paths?.length ? " — " + pathTitle(o.id) : "")}
            >
              {o.label}
            </button>
          {/if}
        {/each}
      </div>
    </div>

    <div class="section">
      <div class="badge inc">Incompatible</div>
      <div class="chips">
        {#each $optionsIndex as o}
          {#if o.id !== from}
            <button
              class:chip={true}
              class:active={current.incompatible_with?.includes(o.id)}
              on:click={() => toggleIn('incompatible_with', o.id)}
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
  </div>
  {/if}
</div>

<style>
  .panel { padding: 12px 16px; border: 1px solid var(--c-stroke); border-radius: 8px; background: var(--c-box-bg); }
  .field { margin-top: 6px; display:flex; flex-direction:column; gap:6px; }
  label { font-weight: 600; }

  /* Combobox — largeur maîtrisée (ne remplit plus tout le panneau) */
  .combo {
    position: relative;
    display: inline-flex;           /* ne s’étire plus sur toute la ligne */
    align-items: center;
    width: 100%;
    max-width: var(--rule-combo-maxw, 420px);  /* ⬅️ ajustable */
  }
  .combo-input {
    width: 100%;
    min-width: 240px;               /* largeur mini confortable */
    padding: 8px 32px 8px 10px;
    border: 1px solid var(--c-stroke);
    border-radius: 8px;
    background: var(--c-bg);
    color: var(--c-text);
    font-size: 14px;
  }
  .clear {
    position:absolute; right:6px; top:50%; transform:translateY(-50%);
    appearance:none; border:none; background:transparent; cursor:pointer;
    color: var(--c-text-muted); font-size:16px; line-height:1; padding:2px 6px; border-radius:6px;
  }
  .clear:hover { color:#dc2626; background: color-mix(in oklab, #dc2626 10%, transparent); }

  .combo-list {
    position: absolute; z-index: 20; left: 0; right: auto;  /* ⬅️ ne s’étire plus */
    width: 100%;     /* suit la largeur de .combo / de l’input */
    max-height: 260px; overflow: auto;
    margin-top: 4px; padding: 6px;
    background: var(--c-box-bg);
    border: 1px solid var(--c-stroke);
    border-radius: 8px;
    box-shadow: 0 10px 24px rgba(0,0,0,.12);
  }
  .combo-item {
    padding: 6px 8px; border-radius: 6px; cursor: pointer;
    display:grid; grid-template-columns: 1fr auto; gap:2px 8px;
  }
  .combo-item .label { font-weight: 600; }
  .combo-item .sub { grid-column: 1 / span 1; color: var(--c-text-muted); font-size: 12px; display:flex; flex-wrap:wrap; gap:4px; }
  .combo-item .id  { grid-column: 2; color: var(--c-text-muted); font-size: 12px; align-self:center; }
  .combo-item.active, .combo-item:hover { background: color-mix(in oklab, var(--c-stroke), transparent 80%); }
  .combo-list .empty { padding: 10px; color: var(--c-text-muted); }

  .path { white-space: nowrap; }
  .sep { margin: 0 4px; color: var(--c-text-muted); }

  .chosen { display:flex; gap:10px; align-items:flex-start; margin-top: 6px; }
  .chosen-label { color: var(--c-text-muted); font-size: 12px; padding-top: 2px; }
  .chosen-main { display:flex; flex-direction:column; gap:2px; }
  .chosen-paths { color: var(--c-text-muted); font-size: 12px; display:flex; flex-wrap:wrap; gap:4px; }

  .sections { margin-top: 14px; display: grid; gap: 14px; }
  .badge { display:inline-block; padding:2px 6px; border-radius: 6px; font-size: 12px; border: 1px solid var(--c-stroke); margin-bottom: 6px; }
  .badge.mand { border-color: var(--c-rule-mand-border); color: var(--c-rule-mand-border); }
  .badge.req  { border-color: var(--c-rule-req-border);  color: var(--c-rule-req-border); }
  .badge.inc  { border-color: var(--c-rule-inc-border);  color: var(--c-rule-inc-border); }

  .chips { display:flex; flex-wrap:wrap; gap:6px; }
  .chip { padding:6px 8px; border:1px solid var(--c-stroke); border-radius:6px; background:var(--c-bg); color:var(--c-text); cursor:pointer; }
  .chip.active { border-color: var(--c-selected-border); box-shadow: 0 0 0 2px color-mix(in oklab, var(--c-selected-border), transparent 75%); }
</style>
