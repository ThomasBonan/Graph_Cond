// src/lib/stores.js
import { writable, get } from 'svelte/store';

export const graphEl = writable(null);

/* =========================================
 * Thème (light/dark) + persistance
 * ======================================= */
const initialTheme =
  (typeof localStorage !== 'undefined' && localStorage.getItem('theme')) || 'light';

export const theme = writable(initialTheme);

function applyTheme(t) {
  if (typeof document !== 'undefined') {
    // Utilise un data-attribute; adapte si tu préfères une classe CSS
    document.documentElement.setAttribute('data-theme', t);
  }
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem('theme', t); } catch {}
  }
}
// appliquer au démarrage + à chaque changement
applyTheme(initialTheme);
theme.subscribe(applyTheme);

export function toggleTheme() {
  theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
}
export function setTheme(t) {
  theme.set(t === 'dark' ? 'dark' : 'light');
}

/* =========================================
 * UI state
 * ======================================= */
export const mode = writable('editor');     // 'editor' | 'commercial'
export const search = writable('');
export const collapsed = writable({});      // { [group]: { __group?:bool, [sg|__root]?:bool } }

/* =========================================
 * Domain state
 * ======================================= */
export const data = writable({});           // { group: [{ id, name, gammes:{Smart|Mod|Evo:'included'|'optional'|'absent'} }] }
export const grouped = writable({});        // { group: { root: string[], subgroups: { [sg]: string[] } } }
export const gammes = writable({            // { Smart|Mod|Evo: { [id]: { included:boolean, optional:boolean } } }
  Smart: {},
  Mod:   {},
  Evo:   {}
});
export const optionLabels = writable({});   // { id: label }
export const rulesets = writable({          // { rulesetName: { rules: { fromId: { requires:[], incompatible_with:[] } } } }
  default: { rules: {} }
});
export const currentRulesetName = writable('default');
export const selected = writable(new Set());

function normalizeRuleSets(raw) {
  const out = {};
  const source = raw || { default: { rules: {} } };

  for (const [name, payload] of Object.entries(source)) {
    const rules = payload?.rules || {};
    const norm = {};

    for (const [fromId, spec] of Object.entries(rules)) {
      // Nouveau format déjà normalisé ?
      if (spec && (Array.isArray(spec.requires) || Array.isArray(spec.incompatible_with))) {
        norm[fromId] = {
          requires: Array.isArray(spec.requires) ? spec.requires.slice() : [],
          incompatible_with: Array.isArray(spec.incompatible_with) ? spec.incompatible_with.slice() : []
        };
        continue;
      }

      // Ancien format : { targetId: "requires" | "incompatible" }
      if (spec && typeof spec === 'object') {
        const req = [];
        const inc = [];
        for (const [targetId, type] of Object.entries(spec)) {
          const t = String(type || '').toLowerCase();
          if (t.startsWith('req')) req.push(targetId);
          else inc.push(targetId);
        }
        norm[fromId] = { requires: req, incompatible_with: inc };
      }
    }

    out[name] = { rules: norm };
  }

  return out;
}

/* =========================================
 * Import (JSON recommandé / ancien .js)
 *  - support groupedSubgroups {subgroups, __root}
 *  - rétro-compat groupedCriteria (plat)
 * ======================================= */
export async function importJSON(file) {
  const text = await file.text();
  const raw = (text || '').trim();

  // -------- Parse (JSON ou ancien .js exporté) --------
  let obj = null;
  if (raw.startsWith('{') || raw.startsWith('[')) {
    obj = JSON.parse(raw);
  } else {
    const out = {};
    for (const key of ['gammes','groupedCriteria','groupedSubgroups','optionLabels','criteria','ruleSets','activeRuleset','currentRulesetName']) {
      const m = raw.match(new RegExp(`export\\s+const\\s+${key}\\s*=\\s*([\\s\\S]*?);\\s*(?:\\n|$)`));
      if (m && m[1]) {
        try { out[key] = JSON.parse(m[1]); } catch {}
      }
    }
    obj = out;
  }

  const g = obj?.gammes || { Smart:{}, Mod:{}, Evo:{} };

  // -------- Hiérarchie (support __root + rétro-compat plat) --------
  let hier = {};
  if (obj?.groupedSubgroups && Object.keys(obj.groupedSubgroups).length) {
    for (const [grp, val] of Object.entries(obj.groupedSubgroups)) {
      const root = Array.isArray(val.__root) ? val.__root : [];
      const sub  = val.subgroups || {};
      hier[grp] = { root, subgroups: sub };
    }
  } else if (obj?.groupedCriteria && Object.keys(obj.groupedCriteria).length) {
    for (const [grp, ids] of Object.entries(obj.groupedCriteria)) {
      hier[grp] = { root: Array.from(new Set(ids || [])), subgroups: {} };
    }
  } else {
    const all = Array.from(new Set([
      ...Object.keys(g.Smart || {}),
      ...Object.keys(g.Mod   || {}),
      ...Object.keys(g.Evo   || {})
    ]));
    hier = { 'Options importées': { root: all, subgroups: {} } };
  }

  // -------- Labels --------
  const labels = (obj?.optionLabels && Object.keys(obj.optionLabels).length)
    ? obj.optionLabels
    : (() => {
        const set = new Set();
        Object.values(hier).forEach(o => {
          (o.root || []).forEach(id => set.add(id));
          Object.values(o.subgroups || {}).forEach(ids => (ids || []).forEach(id => set.add(id)));
        });
        return Object.fromEntries(Array.from(set).map(id => [id, id]));
      })();

  // -------- data (flat) à partir de la hiérarchie + gammes --------
  data.set(Object.fromEntries(Object.entries(hier).map(([group, objG]) => {
    const set = new Set([...(objG.root || [])]);
    Object.values(objG.subgroups || {}).forEach(ids => (ids || []).forEach(id => set.add(id)));
    const ids = Array.from(set);
    return [group, ids.map(id => ({
      id,
      name: labels[id] || id,
      gammes: {
        Smart: g.Smart?.[id]?.included ? 'included' : (g.Smart?.[id]?.optional ? 'optional' : 'absent'),
        Mod:   g.Mod?.[id]?.included   ? 'included' : (g.Mod?.[id]?.optional   ? 'optional' : 'absent'),
        Evo:   g.Evo?.[id]?.included   ? 'included' : (g.Evo?.[id]?.optional   ? 'optional' : 'absent')
      }
    }))];
  })));

  grouped.set(hier);
  optionLabels.set(labels);
  gammes.set(g);

  // -------- Rulesets: normalisation + choix du ruleset actif --------
  const normalized = normalizeRuleSets(obj?.ruleSets);

  // Heuristique de sélection si pas d’"actif" fourni :
  //  - on prend celui avec le plus de paires (from->(requires+incompatible))
  const countRules = (rs) => Object.values(rs?.rules || {})
    .reduce((n, r) => n + (r?.requires?.length || 0) + (r?.incompatible_with?.length || 0), 0);

  const keys = Object.keys(normalized);
  const bestByCount = keys.reduce((best, k) => {
    const c = countRules(normalized[k]);
    return (c > best.c) ? { k, c } : best;
  }, { k: keys[0] || 'default', c: -1 }).k;

  const wanted =
    obj?.activeRuleset ||
    obj?.currentRulesetName ||
    obj?.rulesetName ||
    null;

  const chosen = (wanted && normalized[wanted]) ? wanted : (bestByCount || keys[0] || 'default');

  rulesets.set(normalized);
  currentRulesetName.set(chosen);

  // -------- Reset sélection --------
  selected.set(new Set());
}

/* =========================================
 * Export (payload)
 *  - groupedSubgroups {subgroups, __root}
 *  - groupedCriteria (plat, rétro-compat)
 * ======================================= */
export function buildPayload() {
  const G = get(gammes);
  const D = get(data);
  const H = get(grouped);
  const R = get(rulesets);
  const active = get(currentRulesetName); 

  // Labels ID -> nom
  const labels = {};
  for (const [group, arr] of Object.entries(D)) {
    (arr || []).forEach((o) => (labels[o.id] = o.name));
  }

  // groupedSubgroups avec __root
  const groupedSubgroups = {};
  for (const [group, obj] of Object.entries(H || {})) {
    const out = { subgroups: {} };
    if (Array.isArray(obj?.root) && obj.root.length) out.__root = Array.from(new Set(obj.root));
    for (const [sg, ids] of Object.entries(obj?.subgroups || {})) {
      out.subgroups[sg] = Array.from(new Set(ids || []));
    }
    groupedSubgroups[group] = out;
  }

  // groupedCriteria plat (union root + SG) — rétro-compat
  const groupedCriteria = Object.fromEntries(
    Object.entries(groupedSubgroups).map(([gname, o]) => {
      const set = new Set(o.__root || []);
      Object.values(o.subgroups || {}).forEach((ids) => (ids || []).forEach((id) => set.add(id)));
      return [gname, Array.from(set)];
    })
  );

  return {
    gammes: G,
    groupedCriteria,
    groupedSubgroups,
    optionLabels: labels,
    criteria: Array.from(new Set(Object.values(groupedCriteria).flat())),
    ruleSets: R,
    activeRuleset: active
  };
}

/* =========================================
 * Export helpers
 * ======================================= */
export function downloadJSON(filename = 'commercial.json') {
  const payload = buildPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Alias pour rétro-compat (anciens imports)
export function exportJSON(filename = 'commercial.json') {
  return downloadJSON(filename);
}

/* =========================================
 * Réinitialisation complète (bouton "Réinitialiser")
 * ======================================= */
export function resetAll() {
  // UI
  mode.set('editor');
  search.set('');
  collapsed.set({});
  setTheme('light'); // ou 'dark' si tu veux par défaut

  // Domaine
  data.set({});
  grouped.set({});
  gammes.set({ Smart: {}, Mod: {}, Evo: {} });
  optionLabels.set({});
  rulesets.set({ default: { rules: {} } });
  currentRulesetName.set('default');
  selected.set(new Set());
}
