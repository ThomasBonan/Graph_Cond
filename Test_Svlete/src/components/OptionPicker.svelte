<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { get } from 'svelte/store';
  import { graphEl } from '../lib/stores.js';

  // Props: passer des VALEURS (pas les stores)
  export let grouped = {};      // { group: { root:[], subgroups:{ [sg]: string[] } } }
  export let data = {};         // fallback: { group: [{id, name, ...}] }
  export let optionLabels = {}; // { id: label }
  export let value = null;      // bind:value (id)
  export let placeholder = 'Rechercher une option…';
  export let clearable = true;

  const dispatch = createEventDispatcher();

  // état interne
  let q = '';
  let open = false;
  let focused = -1;
  let rootEl;

  // --- construction de la liste (robuste) ---
  function buildFromGrouped(g) {
    const items = [];
    for (const [gName, obj] of Object.entries(g || {})) {
      const push = (id, sg) => items.push({
        id,
        label: optionLabels[id] || id,
        group: gName,
        subgroup: sg || null,
        path: sg ? `${gName} › ${sg}` : `${gName} › __root`
      });
      (obj?.root || []).forEach((id) => push(id, null));
      for (const [sg, ids] of Object.entries(obj?.subgroups || {})) (ids || []).forEach((id) => push(id, sg));
    }
    return items;
  }
  function buildFromData(d) {
    const items = [];
    for (const [gName, arr] of Object.entries(d || {})) {
      (arr || []).forEach((o) => items.push({
        id: o.id,
        label: optionLabels[o.id] || o.name || o.id,
        group: gName,
        subgroup: null,
        path: `${gName}`
      }));
    }
    return items;
  }

  $: allItems = (() => { const A = buildFromGrouped(grouped); return A.length ? A : buildFromData(data); })();

  $: byLabelCount = allItems.reduce((m, it) => ((m[it.label] = (m[it.label] || 0) + 1), m), {});

  $: filtered =
    (q ? q.trim().toLowerCase() : '')
      ? allItems
          .map((it) => {
            const hay = `${it.label} ${it.group} ${it.subgroup || ''}`.toLowerCase();
            return { ...it, score: hay.includes(q.trim().toLowerCase()) ? 1 : 0 };
          })
          .filter((it) => it.score > 0)
          .sort((a, b) => (a.label === b.label ? a.path.localeCompare(b.path) : a.label.localeCompare(b.label)))
      : allItems.slice().sort((a, b) => a.label.localeCompare(b.label) || a.path.localeCompare(b.path));

  // --- sélection / clear ---
  function choose(it) {
    value = it?.id ?? null;  // remonte l'ID
    q     = it ? it.label : '';
    open  = false;
    focused = -1;
    dispatch('change', { id: value, item: it || null });
  }
  function clear() {
    if (!clearable) return;
    value = null;
    q = '';
    dispatch('change', { id: null, item: null });
  }

  // sync affichage si le parent change value
  $: if (!open) {
    if (value == null) { if (q !== '') q = ''; }
    else { const it = allItems.find(x => x.id === value); if (it && q !== it.label) q = it.label; }
  }

  // --- flash dans le graphe ---
  function flash(id) {
    const svg = get(graphEl);
    if (svg && typeof svg.dispatchEvent === 'function') {
      svg.dispatchEvent(new CustomEvent('flash', { detail: [id] }));
    }
  }

  // --- fermeture : click-outside + esc + blur ---
  function onDocClick(e) {
    if (!open) return;
    if (!rootEl?.contains(e.target)) { open = false; focused = -1; }
  }
  onMount(() => document.addEventListener('mousedown', onDocClick, true));
  onDestroy(() => document.removeEventListener('mousedown', onDocClick, true));

  function onKey(e) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { open = true; e.preventDefault(); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { focused = Math.min(filtered.length - 1, focused + 1); e.preventDefault(); return; }
    if (e.key === 'ArrowUp')   { focused = Math.max(0, focused - 1); e.preventDefault(); return; }
    if (e.key === 'Enter')     { const it = filtered[focused]; if (it) choose(it); e.preventDefault(); return; }
    if (e.key === 'Escape')    { open = false; focused = -1; e.preventDefault(); return; }
  }
  function onBlur() {
    setTimeout(() => {
      if (!rootEl?.contains(document.activeElement)) { open = false; focused = -1; }
    }, 100);
  }
</script>

<style>
  .picker { position: relative; }
  .ctrl { display:flex; gap:6px; align-items:center; }
  .ctrl input { flex:1; width:100%; padding:6px 8px; border:1px solid var(--c-stroke); border-radius:6px; background: var(--c-box-bg); color: var(--c-text); }
  .btn { cursor:pointer; border:1px solid var(--c-stroke); background: var(--c-box-bg); color: var(--c-text); border-radius:6px; padding:4px 8px; }
  .panel { position:absolute; left:0; right:0; z-index:20; margin-top:4px; background: var(--c-box-bg); border:1px solid var(--c-stroke); border-radius:8px; max-height: 280px; overflow:auto; box-shadow: 0 12px 24px rgba(0,0,0,.25); }
  .item { padding:10px 12px; border-bottom:1px solid var(--c-stroke-weak); cursor:pointer; }
  .item:last-child { border-bottom:none; }
  .item:hover, .item.focused { background: rgba(37,99,235,.12); }
  .label { font-weight:600; display:flex; align-items:center; gap:8px; }
  .path { font-size:12px; color: var(--c-text-muted); margin-top:2px; }
  .badge { font-size:11px; border:1px solid var(--c-stroke); border-radius:6px; padding:1px 6px; }
</style>

<div class="picker" bind:this={rootEl} on:keydown={onKey}>
  <div class="ctrl">
    <input
      placeholder={placeholder}
      bind:value={q}
      on:focus={() => (open = true)}
      on:click={() => (open = true)}
      on:blur={onBlur}
    />
    {#if clearable}
      <button class="btn" on:click={clear} title="Effacer">✕</button>
    {/if}
  </div>

  {#if open}
    <div class="panel" role="listbox">
      {#each filtered as it, i}
        <div
          class="item {i === focused ? 'focused' : ''}"
          role="option"
          aria-selected={value === it.id}
          on:mouseenter={() => { focused = i; flash(it.id); }}
          on:mousedown|preventDefault={() => choose(it)}
        >
          <div class="label">
            <span>{it.label}</span>
            {#if byLabelCount[it.label] > 1}
              <span class="badge" title="Nom en doublon">doublon</span>
            {/if}
          </div>
          <div class="path">{it.path}</div>
        </div>
      {/each}
      {#if filtered.length === 0}
        <div class="item"><em>Aucun résultat</em></div>
      {/if}
    </div>
  {/if}
</div>
