// src/lib/rules-linter.js
// Linter pour rulesets: détecte ids inconnus, contradictions, cycles, auto-refs, doublons.
// Exporte: lintAllRulesets(...), autofixRulesets(...), helpers de formatage.

function collectIdsFromGrouped(grouped) {
  const ids = new Set();
  for (const [g, obj] of Object.entries(grouped || {})) {
    (obj.root || []).forEach(id => ids.add(id));
    for (const arr of Object.values(obj.subgroups || {})) (arr || []).forEach(id => ids.add(id));
  }
  return ids;
}

function normalizeArr(a) {
  return Array.isArray(a) ? a.filter(x => typeof x === 'string') : [];
}

function dedupe(arr) {
  return Array.from(new Set(arr));
}

function detectCycles(requiresMap) {
  // requiresMap: { fromId: [toId,...] }
  const color = {}; // 0=unseen, 1=visiting, 2=done
  const parent = {};
  const cycles = [];

  const getColor = (n) => color[n] || 0;
  const setColor = (n, c) => (color[n] = c);

  function traceCycle(start, end) {
    // remonte parent[] pour reconstruire le cycle end -> ... -> start -> end
    const path = [end];
    let cur = start;
    while (cur !== end && cur != null) {
      path.push(cur);
      cur = parent[cur];
    }
    path.push(end);
    path.reverse();
    return path;
  }

  function dfs(u) {
    setColor(u, 1);
    for (const v of normalizeArr(requiresMap[u])) {
      if (getColor(v) === 0) {
        parent[v] = u;
        dfs(v);
      } else if (getColor(v) === 1) {
        // back-edge: cycle
        const path = traceCycle(u, v);
        cycles.push(path);
      }
    }
    setColor(u, 2);
  }

  Object.keys(requiresMap || {}).forEach(n => { if (getColor(n) === 0) dfs(n); });
  return cycles;
}

function lintRuleset(rulesetName, rules, knownIds) {
  // rules: { fromId: { requires:[], incompatible_with:[] } }
  const issues = [];
  const push = (type, severity, data) => issues.push({ type, severity, ruleset: rulesetName, ...data });

  // 1) IDs inconnus (source & cibles)
  for (const [from, spec] of Object.entries(rules || {})) {
    const req = normalizeArr(spec?.requires);
    const inc = normalizeArr(spec?.incompatible_with);

    if (!knownIds.has(from)) {
      push('unknown_from', 'error', { from, message: `Règle sur une option inconnue: ${from}` });
    }

    req.forEach(to => {
      if (!knownIds.has(to)) push('unknown_target', 'error', { from, to, edge: 'requires', message: `Dépendance vers un ID inconnu: ${from} → ${to}` });
    });
    inc.forEach(to => {
      if (!knownIds.has(to)) push('unknown_target', 'error', { from, to, edge: 'incompatible_with', message: `Incompatibilité avec un ID inconnu: ${from} ⟂ ${to}` });
    });
  }

  // 2) Doublons + auto-refs + contradictions directes
  const reqMap = {};
  for (const [from, spec] of Object.entries(rules || {})) {
    const req = dedupe(normalizeArr(spec?.requires));
    const inc = dedupe(normalizeArr(spec?.incompatible_with));

    // doublons (si en entrée il y en avait)
    if (spec?.requires && req.length !== spec.requires.length) {
      push('duplicate', 'warning', { from, edge: 'requires', message: `Doublons retirés suggérés dans "requires" de ${from}` });
    }
    if (spec?.incompatible_with && inc.length !== spec.incompatible_with.length) {
      push('duplicate', 'warning', { from, edge: 'incompatible_with', message: `Doublons retirés suggérés dans "incompatible_with" de ${from}` });
    }

    // auto-refs
    if (req.includes(from)) push('self_dependency', 'error', { from, message: `Auto-dépendance: ${from} requiert ${from}` });
    if (inc.includes(from)) push('self_incompatibility', 'error', { from, message: `Auto-incompatibilité: ${from} incompatible avec ${from}` });

    // contradictions directes A requiert B et A incompatible B
    for (const to of req) {
      if (inc.includes(to)) {
        push('contradiction_direct', 'error', { from, to, message: `Contradiction: ${from} requiert ${to} et est incompatible avec ${to}` });
      }
    }

    reqMap[from] = req;
  }

  // 3) contradictions croisées (A requiert B, mais B incompatible A)
  for (const [from, spec] of Object.entries(rules || {})) {
    const req = normalizeArr(spec?.requires);
    for (const to of req) {
      const incTo = normalizeArr(rules?.[to]?.incompatible_with);
      if (incTo.includes(from)) {
        push('contradiction_cross', 'error', { from, to, message: `Contradiction: ${from} requiert ${to}, mais ${to} est incompatible avec ${from}` });
      }
    }
  }

  // 4) cycles de dépendances
  const cycles = detectCycles(reqMap);
  for (const path of cycles) {
    push('cycle_requires', 'error', { path, message: `Cycle de dépendances: ${path.join(' → ')}` });
  }

  // Résumé
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
  // totaux globaux
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
    case 'duplicate': return `Doublons détectés dans ${issue.edge} de ${L(issue.from)} (nettoyage possible)`;
    case 'contradiction_direct': return `Contradiction: ${L(issue.from)} requiert ${L(issue.to)} et incompatible avec ${L(issue.to)}`;
    case 'contradiction_cross': return `Contradiction croisée: ${L(issue.from)} requiert ${L(issue.to)}, mais ${L(issue.to)} incompatible avec ${L(issue.from)}`;
    case 'cycle_requires': return `Cycle de dépendances: ${issue.path.map(L).join(' → ')}`;
    default: return issue.message || issue.type;
  }
}

// ---- Auto-fix optionnel (safe): retire doublons + IDs inconnus; ne touche pas aux cycles/contradictions.
export function autofixRulesets(rulesets, grouped) {
  const known = collectIdsFromGrouped(grouped);
  const out = {};
  for (const [name, payload] of Object.entries(rulesets || {})) {
    const rules = payload?.rules || {};
    const fixed = {};
    for (const [from, spec] of Object.entries(rules)) {
      if (!known.has(from)) continue; // on ignore entièrement les règles d'une source inconnue
      const req = dedupe(normalizeArr(spec?.requires)).filter(id => known.has(id) && id !== from);
      const inc = dedupe(normalizeArr(spec?.incompatible_with)).filter(id => known.has(id) && id !== from);
      fixed[from] = { requires: req, incompatible_with: inc };
    }
    out[name] = { rules: fixed };
  }
  return out;
}
