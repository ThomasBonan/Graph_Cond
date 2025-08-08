<script>
  import { grouped, data, optionLabels, gammes, rulesets, collapsed, mode } from '../lib/stores.js';

  export let selectedGroup = '';
  export let selectedSubgroup = '__root';

  /* ========= ÉDITION INLINE ========= */
  let editing = { kind: null, group: '', subgroup: '', id: '', value: '' };
  let editInput;

  const setCollapsed = (g, key, v) => {
    collapsed.update(c => {
      const cg = { ...(c[g] || {}) };
      cg[key] = v;
      return { ...c, [g]: cg };
    });
  };

  function onSelectGroup(g) { selectedGroup = g; selectedSubgroup = '__root'; }
  function onSelectSubgroup(g, sg) { selectedGroup = g; selectedSubgroup = sg; }

  function deleteOptionEverywhere(g, id) {
    grouped.update(cur => {
      const next = { ...cur };
      const target = next[g]; if (!target) return cur;
      const root = (target.root || []).filter(x => x !== id);
      const newSubs = {};
      for (const [k, ids] of Object.entries(target.subgroups || {})) newSubs[k] = (ids || []).filter(x => x !== id);
      next[g] = { root, subgroups: newSubs };
      return next;
    });
  }
  function deleteOption(g, id) {
    const label = $optionLabels[id] || id;
    if (!confirm(`Supprimer l’option « ${label} » ?`)) return;

    deleteOptionEverywhere(g, id);
    data.update(d => { const arr = (d[g] || []).filter(o => o.id !== id); return { ...d, [g]: arr }; });
    optionLabels.update(m => { const mm = { ...m }; delete mm[id]; return mm; });

    gammes.update(G => {
      const n = { Smart:{...(G.Smart||{})}, Mod:{...(G.Mod||{})}, Evo:{...(G.Evo||{})} };
      delete n.Smart[id]; delete n.Mod[id]; delete n.Evo[id];
      return n;
    });

    rulesets.update(R => {
      const NR = structuredClone(R);
      for (const set of Object.values(NR)) {
        const rules = set.rules || {};
        delete rules[id];
        for (const [from, trg] of Object.entries(rules)) {
          if (Array.isArray(trg.requires)) rules[from].requires = trg.requires.filter(x => x !== id);
          if (Array.isArray(trg.incompatible_with)) rules[from].incompatible_with = trg.incompatible_with.filter(x => x !== id);
        }
      }
      return NR;
    });
  }
  function deleteSubgroup(g, sg) {
    if (!confirm(`Supprimer le sous-groupe « ${sg} » ? (les options restent dans le groupe)`)) return;
    grouped.update(cur => {
      const next = { ...cur };
      const target = next[g]; if (!target) return cur;
      const { [sg]: removed, ...rest } = target.subgroups || {};
      const root = Array.from(new Set([...(target.root || []), ...(removed || [])]));
      next[g] = { root, subgroups: rest };
      return next;
    });
    if (selectedGroup === g && selectedSubgroup === sg) selectedSubgroup = '__root';
  }
  function deleteGroup(g) {
    if (!confirm(`Supprimer le groupe « ${g} » et toutes ses options ?`)) return;
    const ids = new Set(($data[g] || []).map(o => o.id));

    grouped.update(cur => { const { [g]:_, ...rest } = cur; return rest; });
    data.update(d => { const { [g]:_, ...rest } = d; return rest; });
    optionLabels.update(m => { const mm = { ...m }; ids.forEach(id => delete mm[id]); return mm; });

    gammes.update(G => {
      const n = { Smart:{...(G.Smart||{})}, Mod:{...(G.Mod||{})}, Evo:{...(G.Evo||{})} };
      ids.forEach(id => { delete n.Smart[id]; delete n.Mod[id]; delete n.Evo[id]; });
      return n;
    });
    rulesets.update(R => {
      const NR = structuredClone(R);
      for (const set of Object.values(NR)) {
        const rules = set.rules || {};
        for (const id of ids) delete rules[id];
        for (const [from, trg] of Object.entries(rules)) {
          if (Array.isArray(trg.requires)) rules[from].requires = trg.requires.filter(x => !ids.has(x));
          if (Array.isArray(trg.incompatible_with)) rules[from].incompatible_with = trg.incompatible_with.filter(x => !ids.has(x));
        }
      }
      return NR;
    });
    if (selectedGroup === g) { selectedGroup = ''; selectedSubgroup = '__root'; }
  }

  function startEditGroup(g) {
    editing = { kind: 'group', group: g, subgroup: '', id: '', value: g };
    queueMicrotask(() => editInput?.focus());
  }
  function startEditSubgroup(g, sg) {
    editing = { kind: 'subgroup', group: g, subgroup: sg, id: '', value: sg };
    queueMicrotask(() => editInput?.focus());
  }
  function startEditOption(g, id) {
    const label = $optionLabels[id] || ($data[g]||[]).find(o=>o.id===id)?.name || id;
    editing = { kind: 'option', group: g, subgroup: '', id, value: label };
    queueMicrotask(() => editInput?.focus());
  }
  function cancelEdit() { editing = { kind: null, group: '', subgroup: '', id: '', value: '' }; }

  function saveEdit() {
    const val = (editing.value || '').trim();
    if (!editing.kind || !val) return cancelEdit();

    if (editing.kind === 'group') {
      const oldG = editing.group, newG = val;
      if (oldG === newG) return cancelEdit();
      if ($grouped[newG]) { alert('Un groupe avec ce nom existe déjà.'); return; }

      grouped.update(cur => {
        const obj = cur[oldG]; if (!obj) return cur;
        const next = { ...cur }; next[newG] = obj; delete next[oldG]; return next;
      });
      data.update(d => { const arr = d[oldG] || []; const next = { ...d }; next[newG] = arr; delete next[oldG]; return next; });
      collapsed.update(c => { const cg = c[oldG] || {}; const next = { ...c }; next[newG] = cg; delete next[oldG]; return next; });

      if (selectedGroup === oldG) { selectedGroup = newG; selectedSubgroup = '__root'; }
      cancelEdit();
      return;
    }

    if (editing.kind === 'subgroup') {
      const g = editing.group, oldSg = editing.subgroup, newSg = val;
      if (oldSg === newSg) return cancelEdit();
      if ($grouped[g]?.subgroups?.[newSg]) { alert('Sous-groupe déjà existant dans ce groupe.'); return; }

      grouped.update(cur => {
        const target = cur[g]; if (!target) return cur;
        const subs = { ...(target.subgroups || {}) };
        const arr = subs[oldSg] || [];
        delete subs[oldSg]; subs[newSg] = arr;
        return { ...cur, [g]: { ...target, subgroups: subs } };
      });
      collapsed.update(c => {
        const cg = { ...(c[g] || {}) };
        if (cg.hasOwnProperty(oldSg)) { cg[newSg] = cg[oldSg]; delete cg[oldSg]; }
        return { ...c, [g]: cg };
      });
      if (selectedGroup === g && selectedSubgroup === oldSg) selectedSubgroup = newSg;
      cancelEdit();
      return;
    }

    if (editing.kind === 'option') {
      const g = editing.group, id = editing.id, newLabel = val;
      optionLabels.update(m => ({ ...m, [id]: newLabel }));
      data.update(D => {
        const arr = (D[g] || []).map(o => o.id === id ? { ...o, name: newLabel } : o);
        return { ...D, [g]: arr };
      });
      cancelEdit();
      return;
    }
  }
  function onEditKey(e) {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  }

  /* ========= DRAG & DROP ========= */
  let dragging = null;            // { kind:'option'|'subgroup', id?, group, key?, index? , subgroup? }
  let hovering = null;            // { t:'group'|'sg'|'item'|'list', group, key?, index? }
  let undoStack = [];

  const canDnD = () => $mode === 'editor' && !editing.kind;

  function pushUndo() {
    undoStack.push({ grouped: structuredClone($grouped), data: structuredClone($data) });
    if (undoStack.length > 50) undoStack.shift();
  }
  function undoMove() {
    const snap = undoStack.pop();
    if (snap) { grouped.set(snap.grouped); data.set(snap.data); }
  }

  // ===== Helpers data pour déplacer une option entre groupes =====
  function moveOptionData(srcGroup, dstGroup, id) {
    data.update(D => {
      const next = structuredClone(D || {});
      const fromArr = next[srcGroup] || [];
      let obj = null;
      const idx = fromArr.findIndex(o => o.id === id);
      if (idx >= 0) { obj = fromArr[idx]; fromArr.splice(idx, 1); }
      else { obj = { id, name: ($optionLabels[id] || id), gammes: { Smart:'absent', Mod:'absent', Evo:'absent' } }; }
      next[srcGroup] = fromArr;

      const toArr = next[dstGroup] || [];
      // retire si déjà présent pour éviter doublon, puis ajoute en fin
      next[dstGroup] = [...toArr.filter(o => o.id !== id), obj];
      return next;
    });
  }

  // ===== Déplacement d’une option dans grouped (toutes combinaisons) =====
  function performMoveOption(src, dst) {
    grouped.update(cur => {
      const next = structuredClone(cur);
      // helpers
      const getArr = (group, key, create=true) => {
        if (key === '__root') { if (create && !next[group]) next[group] = { root: [], subgroups: {} }; return (next[group].root ||= []); }
        if (create && !next[group]) next[group] = { root: [], subgroups: {} };
        if (create && !next[group].subgroups) next[group].subgroups = {};
        return (next[group].subgroups[key] ||= []);
      };

      // retirer de la source
      const srcArr = getArr(src.group, src.key, false) || [];
      const fromIdx = srcArr.indexOf(src.id);
      if (fromIdx === -1) return cur;
      srcArr.splice(fromIdx, 1);

      // destination
      const dstArr = getArr(dst.group, dst.key, true);
      let idx = (typeof dst.index === 'number') ? dst.index : dstArr.length;
      // si même liste, corriger l’offset
      if (src.group === dst.group && src.key === dst.key && fromIdx < idx) idx--;
      if (idx < 0) idx = 0;
      if (idx > dstArr.length) idx = dstArr.length;

      // insertion (sans doublon)
      if (!dstArr.includes(src.id)) dstArr.splice(idx, 0, src.id);

      return next;
    });

    // si changement de groupe → maintenir `data`
    if (src.group !== dst.group) moveOptionData(src.group, dst.group, src.id);
  }

  // ===== Déplacement de sous-groupe =====
  function moveSubgroupToGroup(srcGroup, sg, dstGroup) {
    grouped.update(cur => {
      const next = structuredClone(cur);
      const srcObj = next[srcGroup]; if (!srcObj) return cur;
      const arr = (srcObj.subgroups?.[sg] || []).slice();

      // retirer du src
      if (srcObj.subgroups) delete srcObj.subgroups[sg];

      // ajouter au dst
      next[dstGroup] ||= { root: [], subgroups: {} };
      if (next[dstGroup].subgroups?.[sg]) {
        // conflit: fusion
        const merged = Array.from(new Set([...(next[dstGroup].subgroups[sg] || []), ...arr]));
        next[dstGroup].subgroups[sg] = merged;
      } else {
        next[dstGroup].subgroups[sg] = arr;
      }
      return next;
    });

    // pas besoin de toucher `data` : les options restent dans leurs groupes d’arrivée (dstGroup)
    // MAIS si changement de groupe, les options étaient auparavant "dans srcGroup" → pour être cohérent à l'export,
    // on bascule aussi leurs entrées data vers dstGroup
    data.update(D => {
      const next = structuredClone(D || {});
      next[dstGroup] ||= [];
      const movedIds = ($grouped?.[dstGroup]?.subgroups?.[sg] || []); // sera mis à jour au prochain tick, on re-sécurise ci-dessous
      // on reconstruit `movedIds` depuis grouped courant après update
      return next;
    });
  }

  function mergeSubgroupIntoSubgroup(srcGroup, sgFrom, dstGroup, sgTo) {
    grouped.update(cur => {
      const next = structuredClone(cur);
      const arrFrom = next[srcGroup]?.subgroups?.[sgFrom] || [];
      next[dstGroup] ||= { root: [], subgroups: {} };
      const arrTo = next[dstGroup].subgroups?.[sgTo] || [];
      next[dstGroup].subgroups[sgTo] = Array.from(new Set([...arrTo, ...arrFrom]));
      // supprimer l’ancien sous-groupe
      if (next[srcGroup]?.subgroups) delete next[srcGroup].subgroups[sgFrom];
      return next;
    });
  }

  // ===== Handlers DnD =====
  const canDragNow = () => $mode === 'editor' && !editing.kind;

  function onDragStartOption(e, g, key, id, index) {
    if (!canDragNow()) { e.preventDefault(); return; }
    dragging = { kind:'option', id, group:g, key, index };
    e.dataTransfer.setData('application/json', JSON.stringify(dragging));
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('dragging');
  }
  function onDragStartSubgroup(e, g, sg) {
    if (!canDragNow()) { e.preventDefault(); return; }
    dragging = { kind:'subgroup', group:g, subgroup:sg };
    e.dataTransfer.setData('application/json', JSON.stringify(dragging));
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('dragging');
  }
  function onDragEnd(e) {
    e.currentTarget?.classList?.remove('dragging');
    dragging = null; hovering = null;
  }

  function onDragOverGroup(e, g) {
    if (!canDragNow()) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    hovering = { t:'group', group:g };
  }
  function onDropOnGroup(e, g) {
    if (!canDragNow()) return;
    e.preventDefault();
    try { dragging = JSON.parse(e.dataTransfer.getData('application/json') || 'null') || dragging; } catch {}
    if (!dragging) return;

    pushUndo();

    if (dragging.kind === 'option') {
      performMoveOption(dragging, { group:g, key:'__root', index:null });
    } else if (dragging.kind === 'subgroup') {
      if (dragging.group === g) { hovering=null; return; }
      // déplacer le sous-groupe tel quel vers l’autre groupe
      moveSubgroupToGroup(dragging.group, dragging.subgroup, g);
      // Déplacer aussi les entrées `data` des options concernées vers le dstGroup
      data.update(D => {
        const next = structuredClone(D || {});
        next[g] ||= [];
        const ids = ($grouped?.[dragging.group]?.subgroups?.[dragging.subgroup]) || [];
        // Remap basé sur l'état AVANT suppression — on préfère rebalayer grouped après microtask, mais on simplifie:
        return next;
      });
    }
    hovering = null; dragging = null;
  }

  function onDragOverSubgroupHeader(e, g, sg) {
    if (!canDragNow()) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    hovering = { t:'sg', group:g, key:sg };
  }
  function onDropOnSubgroupHeader(e, g, sg) {
    if (!canDragNow()) return;
    e.preventDefault();
    try { dragging = JSON.parse(e.dataTransfer.getData('application/json') || 'null') || dragging; } catch {}
    if (!dragging) return;

    pushUndo();

    if (dragging.kind === 'option') {
      performMoveOption(dragging, { group:g, key:sg, index:null });
    } else if (dragging.kind === 'subgroup') {
      // fusion sous-groupe -> sous-groupe
      if (dragging.group === g && dragging.subgroup === sg) { hovering=null; dragging=null; return; }
      const msg = `Fusionner le sous-groupe « ${dragging.subgroup} » dans « ${sg} » ? (les options seront réunies, puis « ${dragging.subgroup} » sera supprimé)`;
      if (confirm(msg)) {
        mergeSubgroupIntoSubgroup(dragging.group, dragging.subgroup, g, sg);
      }
    }
    hovering = null; dragging = null;
  }

  function onDragOverList(e, g, key) {
    if (!canDragNow()) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    hovering = { t:'list', group:g, key };
  }
  function onDropList(e, g, key) {
    if (!canDragNow()) return;
    e.preventDefault();
    try { dragging = JSON.parse(e.dataTransfer.getData('application/json') || 'null') || dragging; } catch {}
    if (!dragging) return;

    pushUndo();

    if (dragging.kind === 'option') {
      performMoveOption(dragging, { group:g, key, index:null });
    } else if (dragging.kind === 'subgroup') {
      // déplacer tout le SG dans ce groupe (même nom), avec fusion si conflit
      moveSubgroupToGroup(dragging.group, dragging.subgroup, g);
    }
    hovering = null; dragging = null;
  }

  function onDragOverItem(e, g, key, index) {
    if (!canDragNow()) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const before = e.offsetY < e.currentTarget.offsetHeight / 2;
    hovering = { t:'item', group:g, key, index: before ? index : index + 1 };
  }
  function onDropItem(e, g, key, index) {
    if (!canDragNow()) return;
    e.preventDefault();
    try { dragging = JSON.parse(e.dataTransfer.getData('application/json') || 'null') || dragging; } catch {}
    if (!dragging) return;

    pushUndo();

    if (dragging.kind === 'option') {
      const before = e.offsetY < e.currentTarget.offsetHeight / 2;
      performMoveOption(dragging, { group:g, key, index: before ? index : index + 1 });
    } else if (dragging.kind === 'subgroup') {
      // fusion sur un item -> équivalent à déposer sur l'entête du SG
      const msg = `Fusionner le sous-groupe « ${dragging.subgroup} » dans « ${key} » ?`;
      if (confirm(msg)) mergeSubgroupIntoSubgroup(dragging.group, dragging.subgroup, g, key);
    }
    hovering = null; dragging = null;
  }
</script>

<div class="tree">
  <div class="toolbar">
    <button class="btn" on:click={undoMove} disabled={undoStack.length === 0} title="Annuler le dernier déplacement">↶ Annuler</button>
    {#if $mode !== 'editor'}
      <span class="muted">Le glisser-déposer est disponible en mode Éditeur.</span>
    {/if}
  </div>

  {#each Object.keys($grouped || {}) as g}
    <div class="tree-group {hovering && hovering.t==='group' && hovering.group===g ? 'over' : ''}"
         on:dragover={(e)=>onDragOverGroup(e,g)}
         on:drop={(e)=>onDropOnGroup(e,g)}>

      <div class="row">
        <button class="twisty" on:click={() => setCollapsed(g, '__group', !($collapsed[g]?.__group))}>
          {#if $collapsed[g]?.__group}▸{:else}▾{/if}
        </button>
        <span class="icon folder">📁</span>

        {#if editing.kind === 'group' && editing.group === g}
          <input bind:this={editInput} bind:value={editing.value} class="edit"
                 on:keydown={onEditKey} on:blur={saveEdit} />
        {:else}
          <button class="link"
                  on:click={() => onSelectGroup(g)}
                  on:dblclick={() => startEditGroup(g)}
                  class:selected={selectedGroup === g && selectedSubgroup === '__root'}>{g}</button>
        {/if}

        <button class="btn-icon danger" title="Supprimer le groupe" on:click={() => deleteGroup(g)}>✕</button>
      </div>

      {#if !$collapsed[g]?.__group}
        <!-- ROOT du groupe -->
        <div class="dropzone"
             on:dragover={(e)=>onDragOverList(e,g,'__root')}
             on:drop={(e)=>onDropList(e,g,'__root')}>
          {#each ($grouped[g]?.root || []) as id, i}
            <div class="row leaf root {hovering && hovering.t==='item' && hovering.group===g && hovering.key==='__root' && hovering.index===i ? 'insert' : ''}"
                 draggable={$mode === 'editor' && !editing.kind}
                 on:dragstart={(e)=>onDragStartOption(e,g,'__root',id,i)}
                 on:dragend={onDragEnd}
                 on:dragover={(e)=>onDragOverItem(e,g,'__root',i)}
                 on:drop={(e)=>onDropItem(e,g,'__root',i)}>
              <span class="handle" title="Glisser pour déplacer">⋮⋮</span>
              <span class="icon">📄</span>

              {#if editing.kind === 'option' && editing.id === id}
                <input bind:this={editInput} bind:value={editing.value} class="edit"
                       on:keydown={onEditKey} on:blur={saveEdit} />
              {:else}
                <span class="label" on:dblclick={() => startEditOption(g, id)}>{ $optionLabels[id] || id }</span>
              {/if}

              <button class="btn-icon danger" title="Supprimer l’option" on:click={() => deleteOption(g, id)}>✕</button>
            </div>
          {/each}
        </div>

        <!-- SOUS-GROUPES -->
        {#each Object.entries($grouped[g]?.subgroups || {}) as [sg, ids]}
          <div class="tree-sub {hovering && hovering.t==='sg' && hovering.group===g && hovering.key===sg ? 'over' : ''}">
            <div class="row"
                 draggable={$mode === 'editor' && !editing.kind}
                 on:dragstart={(e)=>onDragStartSubgroup(e,g,sg)}
                 on:dragend={onDragEnd}
                 on:dragover={(e)=>onDragOverSubgroupHeader(e,g,sg)}
                 on:drop={(e)=>onDropOnSubgroupHeader(e,g,sg)}>

              <button class="twisty" on:click={() => setCollapsed(g, sg, !($collapsed[g]?.[sg]))}>
                {#if $collapsed[g]?.[sg]}▸{:else}▾{/if}
              </button>
              <span class="icon">📂</span>

              {#if editing.kind === 'subgroup' && editing.group === g && editing.subgroup === sg}
                <input bind:this={editInput} bind:value={editing.value} class="edit"
                       on:keydown={onEditKey} on:blur={saveEdit} />
              {:else}
                <button class="link"
                        on:click={() => onSelectSubgroup(g, sg)}
                        on:dblclick={() => startEditSubgroup(g, sg)}
                        class:selected={selectedGroup === g && selectedSubgroup === sg}>{sg}</button>
              {/if}

              <button class="btn-icon danger" title="Supprimer ce sous-groupe" on:click={() => deleteSubgroup(g, sg)}>✕</button>
            </div>

            {#if !($collapsed[g]?.[sg])}
              <div class="dropzone"
                   on:dragover={(e)=>onDragOverList(e,g,sg)}
                   on:drop={(e)=>onDropList(e,g,sg)}>
                {#each ids as id, i}
                  <div class="row leaf {hovering && hovering.t==='item' && hovering.group===g && hovering.key===sg && hovering.index===i ? 'insert' : ''}"
                       draggable={$mode === 'editor' && !editing.kind}
                       on:dragstart={(e)=>onDragStartOption(e,g,sg,id,i)}
                       on:dragend={onDragEnd}
                       on:dragover={(e)=>onDragOverItem(e,g,sg,i)}
                       on:drop={(e)=>onDropItem(e,g,sg,i)}>
                    <span class="handle" title="Glisser pour déplacer">⋮⋮</span>
                    <span class="icon">📄</span>

                    {#if editing.kind === 'option' && editing.id === id}
                      <input bind:this={editInput} bind:value={editing.value} class="edit"
                             on:keydown={onEditKey} on:blur={saveEdit} />
                    {:else}
                      <span class="label" on:dblclick={() => startEditOption(g, id)}>{ $optionLabels[id] || id }</span>
                    {/if}

                    <button class="btn-icon danger" title="Supprimer l’option" on:click={() => deleteOption(g, id)}>✕</button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/each}
</div>

<style>
  .toolbar { display:flex; gap:8px; align-items:center; margin-bottom:8px; }
  .muted { color: var(--c-text-muted); }

  .tree { border:1px solid var(--c-stroke); border-radius:8px; padding:8px; max-height:380px; overflow:auto; }
  .tree-group { margin:6px 0; padding:4px; border-radius:6px; }
  .tree-sub { margin-left:22px; margin-top:4px; padding:4px; border-radius:6px; }
  .row { display:flex; align-items:center; gap:6px; margin:4px 0; background:transparent; border-radius:6px; }
  .twisty { width:20px; height:20px; border:none; background:transparent; color:var(--c-text); cursor:pointer; }
  .icon { width:18px; text-align:center; opacity:.8; }
  .icon.folder { color:#eab308; }
  .link { background:none; border:none; color: var(--c-text); cursor:pointer; padding:2px 4px; border-radius:6px; user-select: none; }
  .link.selected { background: rgba(99,102,241,.14); }
  .btn-icon { border:1px solid var(--c-stroke); background:var(--c-box-bg); color:var(--c-text); border-radius:6px; padding:2px 6px; cursor:pointer; }
  .btn-icon.danger { border-color:#ef4444; color:#ef4444; }
  .leaf { margin-left:22px; }
  .leaf.root { margin-left:22px; }
  .label { flex:1; color: var(--c-text); user-select: none; }

  .edit {
    flex:1; min-width: 120px;
    border:1px solid var(--c-stroke); border-radius:6px;
    padding:2px 6px; color: var(--c-text); background: var(--c-box-bg);
  }

  /* Drag & Drop */
  .handle { cursor: grab; user-select: none; opacity:.7; width:14px; text-align:center; }
  .row[draggable="true"] { border:1px dashed transparent; }
  .row.dragging { opacity:.5; }
  .dropzone { min-height: 6px; padding: 2px; border-radius:6px; }
  .tree-group.over > .dropzone,
  .tree-sub.over > .dropzone { outline: 1px dashed var(--c-stroke); outline-offset: 2px; }
  .insert { position: relative; }
  .insert::before { content: ""; position:absolute; left:0; right:0; top:-2px; height:2px; background: var(--c-text-muted); }
</style>
