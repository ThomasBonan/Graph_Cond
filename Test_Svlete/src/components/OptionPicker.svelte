<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';

  export let items = [];      // [{ id, label, path? }]
  export let value = null;    // id sélectionné (bind:value)
  export let placeholder = 'Rechercher…';
  export let disabled = false;
  export let showPath = false;

  const dispatch = createEventDispatcher();

  let root, inputEl, menuEl;
  let open = false;
  let q = '';
  let active = -1;

  // filtrage (label + path)
  $: normQ = q.trim().toLowerCase();
  $: filtered = (items || [])
    .map(x => ({ ...x, _score: score(x, normQ) }))
    .filter(x => x._score > (normQ ? 0 : -Infinity))
    .sort((a,b)=> b._score - a._score || a.label.localeCompare(b.label) || (a.path||'').localeCompare(b.path||''))
    .slice(0, 300);

  function score(it, q) {
    if (!q) return -1;
    const hay = (it.label + ' ' + (it.path || '')).toLowerCase();
    const idx = hay.indexOf(q);
    return idx < 0 ? 0 : 1000 - idx;
  }

  function openMenu() { if (!disabled) { open = true; active = 0; } }
  function closeMenu() { open = false; active = -1; }

  function select(id) {
    value = id;                          // met à jour le bind:value côté parent
    dispatch('change', { value: id });   // au cas où le parent écoute l'event
    // reset du champ et fermeture du menu
    q = '';
    closeMenu();
    // retire le focus pour éviter la réouverture immédiate
    setTimeout(() => inputEl?.blur(), 0);
  }

  function onKey(e) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { openMenu(); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { active = Math.min(active + 1, filtered.length - 1); ensureVisible(); }
    else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); ensureVisible(); }
    else if (e.key === 'Enter') { const it = filtered[active]; if (it) select(it.id); }
    else if (e.key === 'Escape') { closeMenu(); }
  }

  function ensureVisible() {
    const item = menuEl?.querySelector(`[data-i="${active}"]`);
    if (item && menuEl) {
      const r = item.getBoundingClientRect();
      const R = menuEl.getBoundingClientRect();
      if (r.top < R.top) menuEl.scrollTop -= (R.top - r.top);
      if (r.bottom > R.bottom) menuEl.scrollTop += (r.bottom - R.bottom);
    }
  }

  function onOutside(e) {
    if (!root) return;
    if (!root.contains(e.target)) closeMenu();
  }

  onMount(() => {
    document.addEventListener('pointerdown', onOutside, true);
  });
  onDestroy(() => {
    document.removeEventListener('pointerdown', onOutside, true);
  });
</script>

<div class="op" bind:this={root} data-disabled={disabled ? '1' : '0'}>
  <div class="control" on:click={() => inputEl?.focus()}>
    <input
      bind:this={inputEl}
      type="text"
      class="input"
      placeholder={placeholder}
      bind:value={q}
      disabled={disabled}
      on:focus={openMenu}
      on:keydown={onKey}
      autocomplete="off"
      spellcheck="false"
    />
    {#if value}
      <button class="clear" title="Effacer" on:click={() => { value = null; dispatch('change', { value: null }); q=''; closeMenu(); inputEl?.focus(); }}>×</button>
    {/if}
    <span class="caret" aria-hidden>▾</span>
  </div>

  {#if open}
    <div class="menu" bind:this={menuEl} role="listbox">
      {#if filtered.length === 0}
        <div class="empty">Aucun résultat</div>
      {:else}
        {#each filtered as it, i (it.id)}
          <div
            class="item"
            data-i={i}
            role="option"
            aria-selected={i === active}
            class:active={i === active}
            on:mouseenter={() => active = i}
            on:mousedown|preventDefault={() => select(it.id)}
          >
            <div class="label">{it.label}</div>
            {#if showPath && it.path}
              <div class="path">{it.path}</div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .op { position: relative; display: block; }
  .control {
    position: relative; display: flex; align-items: center;
    border: 1px solid var(--c-stroke); border-radius: 8px; background: var(--c-box-bg);
    padding: 6px 28px 6px 10px;
  }
  .input {
    width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--c-text);
    font: inherit;
  }
  .clear {
    position: absolute; right: 22px; top: 50%; transform: translateY(-50%);
    border: 0; background: transparent; color: var(--c-text-muted); cursor: pointer; font-size: 16px; line-height: 1;
  }
  .caret {
    position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
    color: var(--c-text-muted); font-size: 12px;
  }
  .menu {
    position: absolute; left: 0; right: 0; top: calc(100% + 4px);
    border: 1px solid var(--c-stroke); border-radius: 8px; background: var(--c-box-bg);
    max-height: 280px; overflow: auto; z-index: 40; box-shadow: 0 10px 24px rgba(0,0,0,.12);
  }
  .item { padding: 8px 10px; cursor: pointer; }
  .item.active, .item:hover { background: rgba(0,0,0,.06); }
  [data-theme="dark"] .item.active, [data-theme="dark"] .item:hover { background: rgba(255,255,255,.08); }
  .label { font-weight: 600; color: var(--c-text); }
  .path { font-size: 12px; color: var(--c-text-muted); }
  .empty { padding: 10px; color: var(--c-text-muted); }
  .op[data-disabled="1"] .control { opacity: .6; pointer-events: none; }
</style>
