<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import {
    search, collapsed, mode,
    data, grouped, gammes, rulesets, currentRulesetName,
    optionLabels, selected
  } from '../lib/stores.js';
  import { renderGraph } from '../lib/d3/graph.js';
  import { graphEl } from '../lib/stores.js';

  let svg;
  let cleanup = () => {};
  let mounted = false;

  function getRules() {
    const rs = get(rulesets);
    return rs[get(currentRulesetName)]?.rules || {};
  }

  // logiques commerciales (inchangé)
  function buildReverseRequires(rules) {
    const rev = {};
    for (const [from, spec] of Object.entries(rules || {})) {
      for (const to of (spec?.requires || [])) (rev[to] ||= new Set()).add(from);
    }
    return rev;
  }
  function dependentsClosure(seed, rules, withinSet) {
    const rev = buildReverseRequires(rules);
    const out = new Set(); const stack = [seed];
    while (stack.length) {
      const cur = stack.pop();
      for (const d of Array.from(rev[cur] || [])) {
        if (withinSet && !withinSet.has(d)) continue;
        if (!out.has(d)) { out.add(d); stack.push(d); }
      }
    }
    return out;
  }
  function isIncompatible(a, b, rules) {
    return (rules[a]?.incompatible_with || []).includes(b) ||
           (rules[b]?.incompatible_with || []).includes(a);
  }

  function onToggleSelect(id) {
    // Interactions interdites en mode éditeur
    if ($mode !== 'commercial') return;

    const rules = getRules();
    selected.update(S => {
      const next = new Set(S);

      if (next.has(id)) {
        next.delete(id);
        const toDrop = dependentsClosure(id, rules, next);
        toDrop.forEach(x => next.delete(x));
        return next;
      }

      for (const s of next) {
        if (isIncompatible(s, id, rules)) return next;
      }
      const reqs = rules[id]?.requires || [];
      const unmet = reqs.filter(dep => !next.has(dep));
      if (unmet.length > 0) {
        svg?.dispatchEvent(new CustomEvent('flash', { detail: unmet }));
        return next;
      }
      next.add(id);
      return next;
    });
  }

  function doRender() {
    if (!mounted || !svg) return;
    cleanup();
    cleanup = renderGraph(svg, {
      mode: $mode,
      search: $search,
      collapsed: $collapsed,
      data: $data,
      grouped: $grouped,
      gammes: $gammes,
      rules: $rulesets[$currentRulesetName]?.rules || {},
      optionLabels: $optionLabels,
      selected,
      interactive: $mode === 'commercial',  // ⬅️ clé: seulement en commerciale
      onToggleGroup: toggleGroupCollapse,
      onToggleSubgroup: toggleSubgroupCollapse,
      onToggleSelect
    });
  }

  function toggleGroupCollapse(g) {
    collapsed.update(c => {
      const cg = { ...(c[g] || {}) };
      cg.__group = !cg.__group;
      return { ...c, [g]: cg };
    });
  }
  function toggleSubgroupCollapse(g, key) {
    collapsed.update(c => {
      const cg = { ...(c[g] || {}) };
      cg[key] = !cg[key];
      return { ...c, [g]: cg };
    });
  }

  onMount(() => {
    graphEl.set(svg);
    mounted = true;
    doRender();
    const onKey = (e) => { if (e.key === 'r' || e.key === 'R') document.getElementById('recenter')?.click(); };
    document.addEventListener('keydown', onKey);
    const btn = document.getElementById('recenter');
    const click = () => svg?.dispatchEvent(new CustomEvent('recenter'));
    btn?.addEventListener('click', click);
    return () => { graphEl.set(null); document.removeEventListener('keydown', onKey); btn?.removeEventListener('click', click); cleanup(); mounted = false; };
  });

  $: if (mounted) { $mode; $search; $collapsed; $data; $grouped; $gammes; $rulesets; $currentRulesetName; $optionLabels; $selected; doRender(); }
</script>

<div class="graph-host">
  <svg bind:this={svg} role="img" aria-label="Graphe"></svg>
</div>

<style>
  .graph-host { position: relative; flex: 1 1 auto; min-height: 400px; }
  svg { width: 100%; height: 100%; display: block; background: transparent; }
</style>
