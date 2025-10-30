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
    document.documentElement.setAttribute('data-theme', t);
  }
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem('theme', t); } catch {}
  }
}
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
export const data = writable({});
export const grouped = writable({});
export const gammes = writable({
  Smart: {},
  Mod:   {},
  Evo:   {}
});
export const optionLabels = writable({});
export const rulesets = writable({
  // Nouveau schéma: { rules: { fromId: { requires:[], incompatible_with:[], mandatory:[] } } }
  default: { rules: {} }
});
export const currentRulesetName = writable('default');
export const selected = writable(new Set());
export const savedSchemas = writable([]);
export const activeSchema = writable(null);

/* ------------ Helpers internes ----------- */
function normalizeArr(a) {
  return Array.isArray(a) ? a.filter(x => typeof x === 'string') : [];
}

/* =========================================
 * Normalisation Rulesets
 *  - ajoute 'mandatory' (aussi 'obligatoire' accepté)
 *  - rétro-compat ancien format { target: "requires"|"incompatible"|... }
 * ======================================= */
function normalizeRuleSets(raw) {
  const out = {};
  const source = raw || { default: { rules: {} } };

  for (const [name, payload] of Object.entries(source)) {
    const rules = payload?.rules || {};
    const norm = {};

    for (const [fromId, spec] of Object.entries(rules)) {
      // Nouveau format ?
      if (spec && (Array.isArray(spec.requires) || Array.isArray(spec.incompatible_with) || Array.isArray(spec.mandatory) || Array.isArray(spec.obligatoire))) {
        norm[fromId] = {
          requires: normalizeArr(spec.requires),
          incompatible_with: normalizeArr(spec.incompatible_with),
          mandatory: normalizeArr(spec.mandatory || spec.obligatoire)
        };
        continue;
      }

      // Ancien format : { targetId: "requires" | "incompatible" | "mandatory" | "obligatoire" }
      if (spec && typeof spec === 'object') {
        const req = [], inc = [], man = [];
        for (const [targetId, type] of Object.entries(spec)) {
          const t = String(type || '').toLowerCase();
          if (t.startsWith('req')) req.push(targetId);
          else if (t.startsWith('inc')) inc.push(targetId);
          else if (t.startsWith('man') || t.startsWith('obli')) man.push(targetId);
        }
        norm[fromId] = { requires: req, incompatible_with: inc, mandatory: man };
      }
    }

    out[name] = { rules: norm };
  }

  return out;
}

function hydrateFromPayload(obj = {}) {
  const g = obj?.gammes || { Smart: {}, Mod: {}, Evo: {} };

  let hier = {};
  if (obj?.groupedSubgroups && Object.keys(obj.groupedSubgroups).length) {
    for (const [grp, val] of Object.entries(obj.groupedSubgroups)) {
      const root = Array.isArray(val.__root) ? val.__root : [];
      const sub = val.subgroups || {};
      hier[grp] = { root, subgroups: sub };
    }
  } else if (obj?.groupedCriteria && Object.keys(obj.groupedCriteria).length) {
    for (const [grp, ids] of Object.entries(obj.groupedCriteria)) {
      hier[grp] = { root: Array.from(new Set(ids || [])), subgroups: {} };
    }
  } else {
    const all = Array.from(
      new Set([
        ...Object.keys(g.Smart || {}),
        ...Object.keys(g.Mod || {}),
        ...Object.keys(g.Evo || {})
      ])
    );
    hier = { 'Options importées': { root: all, subgroups: {} } };
  }

  const labels =
    obj?.optionLabels && Object.keys(obj.optionLabels).length
      ? obj.optionLabels
      : (() => {
          const set = new Set();
          Object.values(hier).forEach((o) => {
            (o.root || []).forEach((id) => set.add(id));
            Object.values(o.subgroups || {}).forEach((ids) =>
              (ids || []).forEach((id) => set.add(id))
            );
          });
          return Object.fromEntries(Array.from(set).map((id) => [id, id]));
        })();

  data.set(
    Object.fromEntries(
      Object.entries(hier).map(([group, objG]) => {
        const set = new Set([...(objG.root || [])]);
        Object.values(objG.subgroups || {}).forEach((ids) =>
          (ids || []).forEach((id) => set.add(id))
        );
        const ids = Array.from(set);
        return [
          group,
          ids.map((id) => ({
            id,
            name: labels[id] || id,
            gammes: {
              Smart: g.Smart?.[id]?.included
                ? 'included'
                : g.Smart?.[id]?.optional
                  ? 'optional'
                  : 'absent',
              Mod: g.Mod?.[id]?.included
                ? 'included'
                : g.Mod?.[id]?.optional
                  ? 'optional'
                  : 'absent',
              Evo: g.Evo?.[id]?.included
                ? 'included'
                : g.Evo?.[id]?.optional
                  ? 'optional'
                  : 'absent'
            }
          }))
        ];
      })
    )
  );

  grouped.set(hier);
  optionLabels.set(labels);
  gammes.set(g);

  const normalized = normalizeRuleSets(obj?.ruleSets);
  const countRules = (rs) =>
    Object.values(rs?.rules || {}).reduce(
      (n, r) =>
        n +
        (r?.requires?.length || 0) +
        (r?.incompatible_with?.length || 0) +
        (r?.mandatory?.length || 0),
      0
    );

  const keys = Object.keys(normalized);
  const bestByCount = keys.reduce(
    (best, k) => {
      const c = countRules(normalized[k]);
      return c > best.c ? { k, c } : best;
    },
    { k: keys[0] || 'default', c: -1 }
  ).k;

  const wanted =
    obj?.activeRuleset || obj?.currentRulesetName || obj?.rulesetName || null;
  const chosen =
    wanted && normalized[wanted] ? wanted : bestByCount || keys[0] || 'default';

  rulesets.set(normalized);
  currentRulesetName.set(chosen);
  selected.set(new Set());
  return { ruleset: chosen };
}

/* =========================================
 * Import JSON (identique, mais rulesets normalisés
 * pour inclure 'mandatory')
 * ======================================= */
export async function importJSON(file) {
  const text = await file.text();
  const raw = (text || '').trim();

  let obj = null;
  if (raw.startsWith('{') || raw.startsWith('[')) {
    obj = JSON.parse(raw);
  } else {
    const out = {};
    for (const key of [
      'gammes',
      'groupedCriteria',
      'groupedSubgroups',
      'optionLabels',
      'criteria',
      'ruleSets',
      'activeRuleset',
      'currentRulesetName'
    ]) {
      const m = raw.match(
        new RegExp(`export\\s+const\\s+${key}\\s*=\\s*([\\s\\S]*?);\\s*(?:\\n|$)`)
      );
      if (m && m[1]) {
        try { out[key] = JSON.parse(m[1]); } catch {}
      }
    }
    obj = out;
  }

  hydrateFromPayload(obj);
  activeSchema.set(null);
}

/* =========================================
 * Export (payload) — inclut maintenant 'mandatory'
 * ======================================= */
export function buildPayload() {
  const G = get(gammes);
  const D = get(data);
  const H = get(grouped);
  const R = get(rulesets);
  const active = get(currentRulesetName);

  const labels = {};
  for (const [group, arr] of Object.entries(D)) {
    (arr || []).forEach((o) => (labels[o.id] = o.name));
  }

  const groupedSubgroups = {};
  for (const [group, obj] of Object.entries(H || {})) {
    const out = { subgroups: {} };
    if (Array.isArray(obj?.root) && obj.root.length) out.__root = Array.from(new Set(obj.root));
    for (const [sg, ids] of Object.entries(obj?.subgroups || {})) {
      out.subgroups[sg] = Array.from(new Set(ids || []));
    }
    groupedSubgroups[group] = out;
  }

  const groupedCriteria = Object.fromEntries(
    Object.entries(groupedSubgroups).map(([gname, o]) => {
      const set = new Set(o.__root || []);
      Object.values(o.subgroups || {}).forEach((ids) => (ids || []).forEach((id) => set.add(id)));
      return [gname, Array.from(set)];
    })
  );

  // >>> IMPORTANT: rules (avec mandatory)
  const rulesExport = {};
  for (const [rsName, payload] of Object.entries(R || {})) {
    const rs = payload?.rules || {};
    const out = {};
    for (const [from, spec] of Object.entries(rs)) {
      out[from] = {
        requires: Array.isArray(spec?.requires) ? spec.requires.slice() : [],
        incompatible_with: Array.isArray(spec?.incompatible_with) ? spec.incompatible_with.slice() : [],
        mandatory: Array.isArray(spec?.mandatory) ? spec.mandatory.slice() : []
      };
    }
    rulesExport[rsName] = { rules: out };
  }

  return {
    gammes: G,
    groupedCriteria,
    groupedSubgroups,
    optionLabels: labels,
    criteria: Array.from(new Set(Object.values(groupedCriteria).flat())),
    ruleSets: rulesExport,
    activeRuleset: active
  };
}

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
export function exportJSON(filename = 'commercial.json') {
  return downloadJSON(filename);
}

/* =========================================
 * Persistence via API SQLite
 * ======================================= */
const API_BASE = (import.meta.env?.VITE_API_BASE || '').replace(/\/$/, '');

function resolveApiUrl(path = '') {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}

async function apiFetch(path, options = {}) {
  if (typeof fetch !== 'function') {
    throw new Error("fetch n'est pas disponible dans cet environnement");
  }

  const url = resolveApiUrl(path);
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {})
  };

  const hasBody = options.body !== undefined;
  if (hasBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (err) {
    throw new Error("Impossible de joindre l'API de persistance");
  }

  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  const text = response.status === 204 ? '' : await response.text();
  const body = isJson && text ? JSON.parse(text) : text ? { message: text } : null;

  if (!response.ok) {
    const message = body?.error || body?.message || response.statusText || 'Erreur API';
    const error = new Error(message);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

export async function refreshSavedSchemas() {
  try {
    const data = await apiFetch('/api/schemas');
    const items = Array.isArray(data?.items) ? data.items : [];
    savedSchemas.set(items);
    return items;
  } catch (err) {
    savedSchemas.set([]);
    throw err;
  }
}

export async function loadSchemaFromDatabase(id) {
  if (!id) throw new Error('Schema id manquant');
  const record = await apiFetch(`/api/schemas/${id}`);
  if (!record?.payload) throw new Error('Reponse inattendue depuis le serveur');
  hydrateFromPayload(record.payload);
  activeSchema.set({ id: record.id, name: record.name, updated_at: record.updated_at });
  return record;
}

export async function saveSchemaToDatabase(name, { id = null } = {}) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Nom de schema obligatoire');

  const payload = buildPayload();
  const body = { name: trimmed, payload };
  if (id) body.id = id;

  const record = await apiFetch('/api/schemas', {
    method: 'POST',
    body: JSON.stringify(body)
  });

  savedSchemas.update((items) => {
    const remaining = Array.isArray(items) ? items.filter((it) => it.id !== record.id) : [];
    const entry = {
      id: record.id,
      name: record.name,
      updated_at: record.updated_at,
      created_at: record.created_at
    };
    return [entry, ...remaining].sort((a, b) => {
      const aDate = a?.updated_at ? new Date(a.updated_at).getTime() : 0;
      const bDate = b?.updated_at ? new Date(b.updated_at).getTime() : 0;
      return bDate - aDate;
    });
  });
  activeSchema.set({ id: record.id, name: record.name, updated_at: record.updated_at });
  return record;
}

export async function deleteSchemaFromDatabase(id) {
  if (!id) return;
  await apiFetch(`/api/schemas/${id}`, { method: 'DELETE' });
  savedSchemas.update((items) => items.filter((item) => item.id !== id));
  if (get(activeSchema)?.id === id) {
    activeSchema.set(null);
  }
}

/* =========================================
 * Sélection + auto-ajout obligatoire
 * ======================================= */
function getActiveRules() {
  const rsAll = get(rulesets);
  const name = get(currentRulesetName);
  return rsAll?.[name]?.rules || {};
}

function mandatoryClosure(startId, rules) {
  // BFS sur edges "mandatory": from -> [mandatory...]
  const out = new Set();
  const q = [startId];
  while (q.length) {
    const cur = q.shift();
    const mand = rules?.[cur]?.mandatory || [];
    for (const a of mand) {
      if (!out.has(a)) {
        out.add(a);
        q.push(a);
      }
    }
  }
  out.delete(startId); // ne renvoie que les prérequis
  return out;
}

export function toggleSelect(id) {
  const rules = getActiveRules();
  const cur = new Set(get(selected));

  if (cur.has(id)) {
    // Désélection simple (on ne “désauto-sélectionne” pas les obligations)
    cur.delete(id);
    selected.set(cur);
    return;
  }

  // Ajout avec auto-obligatoires
  const auto = mandatoryClosure(id, rules); // ex: pour B, renvoie {A, ...}
  const newlyAdded = [];
  cur.add(id);
  for (const a of auto) {
    if (!cur.has(a)) {
      cur.add(a);
      newlyAdded.push(a);
    }
  }
  selected.set(cur);

  // Animation blink via l'event 'flash' sur <svg>
  try {
    const svg = get(graphEl);
    if (svg && newlyAdded.length) {
      svg.dispatchEvent(new CustomEvent('flash', { detail: newlyAdded }));
    }
  } catch {}
}

/* =========================================
 * Réinitialisation complète
 * ======================================= */
export function resetAll() {
  mode.set('editor');
  search.set('');
  collapsed.set({});
  setTheme('light');

  data.set({});
  grouped.set({});
  gammes.set({ Smart: {}, Mod: {}, Evo: {} });
  optionLabels.set({});
  rulesets.set({ default: { rules: {} } });
  currentRulesetName.set('default');
  selected.set(new Set());
  activeSchema.set(null);
}




