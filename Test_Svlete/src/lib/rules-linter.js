// src/lib/rules-linter.js
// Ajoute la prise en charge des règles "mandatory" (obligatoire) en plus de requires/incompatible.

function collectIdsFromGrouped(grouped) {
  const ids = new Set();
  for (const [g, obj] of Object.entries(grouped || {})) {
    (obj.root || []).forEach(id => ids.add(id));
    for (const arr of Object.values(obj.subgroups || {})) (arr || []).forEach(id => ids.add(id));
  }
  return ids;
}
function normalizeArr(a) { return Array.isArray(a) ? a.filter(x => typeof x === 'string') : []; }
function dedupe(arr) { return Array.from(new Set(arr)); }

function detectCycles(requiresMap) {
  const color = {};
  const parent = {};
  const cycles = [];
  const getColor = (n) => color[n] || 0;
  const setColor = (n, c) => (color[n] = c);
  function traceCycle(start, end) {
    const path = [end];
    let cur = start;
    while (cur !== end && cur != null) { path.push(cur); cur = parent[cur]; }
    path.push(end);
    path.reverse();
    return path;
  }
  function dfs(u) {
    setColor(u, 1);
    for (const v of normalizeArr(requiresMap[u])) {
      if (getColor(v) === 0) { parent[v] = u; dfs(v); }
      else if (getColor(v) === 1) { cycles.push(traceCycle(u, v)); }
    }
    setColor(u, 2);
  }
  Object.keys(requiresMap || {}).forEach(n => { if (getColor(n) === 0) dfs(n); });
  return cycles;
}

function lintRuleset(rulesetName, rules, knownIds) {
  // rules: { fromId: { requires:[], incompatible_with:[], mandatory:[] } }
  const issues = [];
  const push = (type, severity, data) => issues.push({ type, severity, ruleset: rulesetName, ...data });

  // 1) IDs inconnus (source & cibles)
  for (const [from, spec] of Object.entries(rules || {})) {
    const req = normalizeArr(spec?.requires);
    const inc = normalizeArr(spec?.incompatible_with);
    const man = normalizeArr(spec?.mandatory || spec?.obligatoire);

    if (!knownIds.has(from)) {
      push('unknown_from', 'error', { from, message: `Règle sur une option inconnue: ${from}` });
    }

    req.forEach(to => {
      if (!knownIds.has(to)) push('unknown_target', 'error', { from, to, edge: 'requires', message: `Dépendance vers un ID inconnu: ${from} → ${to}` });
    });
    inc.forEach(to => {
      if (!knownIds.has(to)) push('unknown_target', 'error', { from, to, edge: 'incompatible_with', message: `Incompatibilité avec un ID inconnu: ${from} ⟂ ${to}` });
    });
    man.forEach(to => {
      if (!knownIds.has(to)) push('unknown_target', 'error', { from, to, edge: 'mandatory', message: `Obligation vers un ID inconnu: ${from} ⇢ ${to}` });
    });
  }

  // 2) Doublons + auto-refs + contradictions directes
  const reqMap = {}, manMap = {};
  for (const [from, spec] of Object.entries(rules || {})) {
    const req = dedupe(normalizeArr(spec?.requires));
    const inc = dedupe(normalizeArr(spec?.incompatible_with));
    const man = dedupe(normalizeArr(spec?.mandatory));

    if (spec?.requires && req.length !== spec.requires.length) {
      push('duplicate', 'warning', { from, edge: 'requires', message: `Doublons retirés suggérés dans "requires" de ${from}` });
    }
    if (spec?.incompatible_with && inc.length !== spec.incompatible_with.length) {
      push('duplicate', 'warning', { from, edge: 'incompatible_with', message: `Doublons retirés suggérés dans "incompatible_with" de ${from}` });
    }
    if (spec?.mandatory && man.length !== spec.mandatory.length) {
      push('duplicate', 'warning', { from, edge: 'mandatory', message: `Doublons retirés suggérés dans "mandatory" de ${from}` });
    }

    if (req.includes(from)) push('self_dependency', 'error', { from, message: `Auto-dépendance: ${from} requiert ${from}` });
    if (inc.includes(from)) push('self_incompatibility', 'error', { from, message: `Auto-incompatibilité: ${from} incompatible avec ${from}` });
    if (man.includes(from)) push('self_mandatory', 'error', { from, message: `Auto-obligation: ${from} est obligatoire pour lui-même` });

    // contradictions directes
    for (const to of req) {
      if (inc.includes(to)) push('contradiction_direct', 'error', { from, to, message: `Contradiction: ${from} requiert ${to} et est incompatible avec ${to}` });
    }
    for (const to of man) {
      if (inc.includes(to)) push('contradiction_mandatory_direct', 'error', { from, to, message: `Contradiction: ${from} rend ${to} obligatoire mais est incompatible avec ${to}` });
    }

    reqMap[from] = req;
    manMap[from] = man;
  }

  // 3) contradictions croisées (A requiert/oblige B, mais B incompatible A)
  for (const [from, spec] of Object.entries(rules || {})) {
    const req = normalizeArr(spec?.requires);
    const man = normalizeArr(spec?.mandatory);
    for (const to of req) {
      const incTo = normalizeArr(rules?.[to]?.incompatible_with);
      if (incTo.includes(from)) push('contradiction_cross', 'error', { from, to, message: `Contradiction: ${from} requiert ${to}, mais ${to} est incompatible avec ${from}` });
    }
    for (const to of man) {
      const incTo = normalizeArr(rules?.[to]?.incompatible_with);
      if (incTo.includes(from)) push('contradiction_mandatory_cross', 'error', { from, to, message: `Contradiction: ${from} rend ${to} obligatoire, mais ${to} est incompatible avec ${from}` });
    }
  }

  // 4) cycles (requires + mandatory)
  for (const [map, kind] of [[reqMap, 'requires'], [manMap, 'mandatory']]) {
    const cycles = detectCycles(map);
    for (const path of cycles) {
      push(kind === 'requires' ? 'cycle_requires' : 'cycle_mandatory', 'error', { path, message: `Cycle ${kind}: ${path.join(' → ')}` });
    }
  }

  const counts = issues.reduce((acc, it) => {
    acc[it.severity] = (acc[it.severity] || 0) + 1;
    acc[it.type] = (acc[it.type] || 0) + 1;
    return acc;
  }, { total: issues.length });

  return { ruleset: rulesetName, counts, issues };
}

export function lintAllRulesets(grouped, rulesets) {
  const known = collectIdsFromGrouped(grouped);
  const result = {};
  for (const [name, payload] of Object.entries(rulesets || {})) {
    result[name] = lintRuleset(name, payload?.rules || {}, known);
  }
  const totals = { total: 0, error: 0, warning: 0 };
  for (const r of Object.values(result)) {
    totals.total += r.counts.total;
    totals.error += (r.counts.error || 0);
    totals.warning += (r.counts.warning || 0);
  }
  return { byRuleset: result, totals };
}

// ---- Helpers d’affichage
export function labelOf(id, optionLabels) {
  return (optionLabels?.[id]) || id;
}
export function formatIssue(issue, optionLabels) {
  const L = (id) => labelOf(id, optionLabels);
  switch (issue.type) {
    case 'unknown_from': return `Règle sur une option inconnue: ${L(issue.from)}`;
    case 'unknown_target': return `${L(issue.from)} → ${L(issue.to)} (${issue.edge}) pointe vers un ID inconnu`;
    case 'self_dependency': return `Auto-dépendance: ${L(issue.from)} requiert lui-même`;
    case 'self_incompatibility': return `Auto-incompatibilité: ${L(issue.from)} incompatible avec lui-même`;
    case 'self_mandatory': return `Auto-obligation: ${L(issue.from)} est obligatoire pour lui-même`;
    case 'duplicate': return `Doublons détectés dans ${issue.edge} de ${L(issue.from)} (nettoyage possible)`;
    case 'contradiction_direct': return `Contradiction: ${L(issue.from)} requiert ${L(issue.to)} et incompatible avec ${L(issue.to)}`;
    case 'contradiction_cross': return `Contradiction croisée: ${L(issue.from)} requiert ${L(issue.to)}, mais ${L(issue.to)} incompatible avec ${L(issue.from)}`;
    case 'contradiction_mandatory_direct': return `Contradiction: ${L(issue.from)} rend ${L(issue.to)} obligatoire mais incompatible avec ${L(issue.to)}`;
    case 'contradiction_mandatory_cross': return `Contradiction croisée: ${L(issue.from)} rend ${L(issue.to)} obligatoire, mais ${L(issue.to)} incompatible avec ${L(issue.from)}`;
    case 'cycle_requires': return `Cycle de dépendances: ${issue.path.map(L).join(' → ')}`;
    case 'cycle_mandatory': return `Cycle d'obligations: ${issue.path.map(L).join(' → ')}`;
    default: return issue.message || issue.type;
  }
}
