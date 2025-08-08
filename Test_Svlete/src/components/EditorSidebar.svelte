<script>
  import { data, grouped, optionLabels, gammes } from '../lib/stores.js';
  import GroupTree from './GroupTree.svelte';
  import RuleEditor from './RuleEditor.svelte';

  // Champs
  let groupName = '';
  let subgroupName = '';
  let optName = '';
  let sSmart = 'absent', sMod = 'absent', sEvo = 'absent';

  export let showRules = true; // par défaut: visible (utile si tu réutilises la sidebar ailleurs)

  // Sélection courante
  let selectedGroup = '';
  let selectedSubgroup = '__root'; // "(sans sous-groupe)"

  // Dérivés
  $: groupKeys = Object.keys($grouped || {});
  $: subKeys = Object.keys(($grouped?.[selectedGroup]?.subgroups) || {});

  // Auto-sélection
  $: { if (!selectedGroup && groupKeys.length) selectedGroup = groupKeys[0]; }
  $: {
    if (selectedGroup) {
      const keys = Object.keys($grouped?.[selectedGroup]?.subgroups || {});
      if (!keys.includes(selectedSubgroup) && selectedSubgroup !== '__root') {
        selectedSubgroup = keys[0] || '__root';
      }
    } else {
      selectedSubgroup = '__root';
    }
  }

  function addGroup() {
    const name = (groupName || '').trim();
    if (!name || $grouped[name]) return;

    grouped.update(cur => ({ ...cur, [name]: { subgroups: {}, root: [] } }));
    data.update(cur => ({ ...cur, [name]: [] }));
    groupName = '';
    selectedGroup = name;
    selectedSubgroup = '__root';
  }

  function addSubgroup() {
    const sg = (subgroupName || '').trim();
    if (!sg || !selectedGroup) return;

    grouped.update(cur => {
      const g = cur[selectedGroup] || { subgroups: {}, root: [] };
      if (g.subgroups[sg]) return cur;
      return { ...cur, [selectedGroup]: { ...g, subgroups: { ...g.subgroups, [sg]: [] } } };
    });

    subgroupName = '';
    selectedSubgroup = sg;
  }

  function addOption() {
    const name = (optName || '').trim();
    if (!name || !selectedGroup) return;
    const id = (crypto?.randomUUID?.() ?? ('o_' + Math.random().toString(36).slice(2))) + Date.now();

    // 1) données du groupe
    data.update(cur => {
      const arr = Array.isArray(cur[selectedGroup]) ? cur[selectedGroup].slice() : [];
      arr.push({ id, name, gammes: { Smart: sSmart, Mod: sMod, Evo: sEvo } });
      return { ...cur, [selectedGroup]: arr };
    });

    // 2) labels
    optionLabels.update(map => ({ ...map, [id]: name }));

    // 3) rattachement root / SG
    grouped.update(cur => {
      const g = cur[selectedGroup] || { subgroups: {}, root: [] };
      if (selectedSubgroup === '__root' || !selectedSubgroup) {
        const root = Array.isArray(g.root) ? g.root.slice() : [];
        root.push(id);
        return { ...cur, [selectedGroup]: { ...g, root } };
      } else {
        const list = (g.subgroups?.[selectedSubgroup] || []).slice();
        list.push(id);
        return { ...cur, [selectedGroup]: { ...g, subgroups: { ...g.subgroups, [selectedSubgroup]: list } } };
      }
    });

    // 4) gammes (rendu D3)
    gammes.update(G => ({
      ...G,
      Smart: { ...(G.Smart || {}), [id]: { included: sSmart === 'included', optional: sSmart === 'optional' } },
      Mod:   { ...(G.Mod   || {}), [id]: { included: sMod   === 'included', optional: sMod   === 'optional'   } },
      Evo:   { ...(G.Evo   || {}), [id]: { included: sEvo   === 'included', optional: sEvo   === 'optional'   } },
    }));

    optName = '';
    sSmart = sMod = sEvo = 'absent';
  }
</script>

<div class="section">
  <h3>Groupes</h3>
  <div class="rule">
    <label for="groupName">Nom du groupe</label>
    <input id="groupName" placeholder="Nom du groupe" bind:value={groupName} />
    <button class="btn" on:click={addGroup}>Ajouter</button>
  </div>

  <label for="groupSelect">Groupe sélectionné</label>
  <select id="groupSelect" bind:value={selectedGroup}>
    {#each groupKeys as g}<option value={g}>{g}</option>{/each}
  </select>
</div>

<div class="section">
  <h3>Sous-groupes</h3>
  <div class="rule">
    <label for="subgroupName">Nom du sous-groupe</label>
    <input id="subgroupName" placeholder="Nom du sous-groupe" bind:value={subgroupName} />
    <button class="btn" on:click={addSubgroup} disabled={!selectedGroup}>Ajouter</button>
  </div>

  <label for="subgroupSelect">Sous-groupe sélectionné</label>
  <select id="subgroupSelect" bind:value={selectedSubgroup} disabled={!selectedGroup}>
    <option value="__root">(sans sous-groupe)</option>
    {#each subKeys as sg}<option value={sg}>{sg}</option>{/each}
  </select>
</div>

<div class="section">
  <h3>Options</h3>
  <label for="optName">Nom de l’option</label>
  <input id="optName" bind:value={optName} placeholder="Nom de l’option" />

  <div class="rule">
    <label for="smartSel" style="width:80px">Smart</label>
    <select id="smartSel" bind:value={sSmart}>
      <option value="absent">Absent</option>
      <option value="included">Présent</option>
      <option value="optional">Optionnelle</option>
    </select>
  </div>
  <div class="rule">
    <label for="modSel" style="width:80px">Mod</label>
    <select id="modSel" bind:value={sMod}>
      <option value="absent">Absent</option>
      <option value="included">Présent</option>
      <option value="optional">Optionnelle</option>
    </select>
  </div>
  <div class="rule">
    <label for="evoSel" style="width:80px">Evo</label>
    <select id="evoSel" bind:value={sEvo}>
      <option value="absent">Absent</option>
      <option value="included">Présent</option>
      <option value="optional">Optionnelle</option>
    </select>
  </div>

  <button class="btn primary" on:click={addOption} disabled={!selectedGroup}>
    Ajouter l’option {selectedSubgroup === '__root' ? 'au groupe (sans sous-groupe)' : `au sous-groupe « ${selectedSubgroup} »`}
  </button>
</div>

<div class="section">
  <h3>Groupes et Sous-groupes existants</h3>
  <GroupTree bind:selectedGroup bind:selectedSubgroup />
</div>

<style>
  .section { margin-bottom: 16px; }
  .rule { display:flex; gap:8px; align-items:center; margin:6px 0; flex-wrap:wrap; }
  label { color: var(--c-text-muted); }
</style>
