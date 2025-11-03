// ============================================================================
// stores.js
// ----------------------------------------------------------------------------
// Centralise tous les stores Svelte utilises par le configurateur/editeur :
// - etat UI (mode, recherche, filtres, toasts)
// - donnees metier (schemas, regles, groupes)
// - persistance cote API et brouillons locaux
// Toute modification de ces stores pilotera automatiquement l'interface.
// ============================================================================
// src/lib/stores.js
import { writable, get } from 'svelte/store';

export const graphEl = writable(null);

/* =========================================
 * Theme (light/dark) + persistance
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
export const mode = writable('editor');     // 'editor' | 'configurateur'
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
  // Nouveau schema: { rules: { fromId: { requires:[], incompatible_with:[], mandatory:[] } } }
  default: { rules: {} }
});
export const currentRulesetName = writable('default');
export const selected = writable(new Set());
export const savedSchemas = writable([]);
export const activeSchema = writable(null);
export const authUser = writable(null);
export const authStatus = writable('unknown'); // 'unknown' | 'authenticated' | 'anonymous'
export const editorDirty = writable(false);
export const draftAvailable = writable(false);
export const undoAvailable = writable(false);
export const redoAvailable = writable(false);
export const searchFilters = writable({ group: 'all', gammes: [] });
export const archivedSchemas = writable([]);
export const auditPanelOpen = writable(false);
export const auditSelectedSchemaId = writable(null);

/* ------------ Helpers internes ----------- */
function normalizeArr(a) {
  return Array.isArray(a) ? a.filter(x => typeof x === 'string') : [];
}

/* =========================================
 * Normalisation Rulesets
 *  - ajoute 'mandatory' (aussi 'obligatoire' accepte)
 *  - retro-compat ancien format { target: "requires"|"incompatible"|... }
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

const DRAFT_PREFIX = 'schema-draft:';
const HISTORY_LIMIT = 50;
let suppressTracking = 0;
let baselinePayloadJSON = null;
let autoSaveTimer = null;
let lastDraftJSON = null;
const undoStack = [];
const redoStack = [];
let isRestoringHistory = false;
let lastSchemaIdForDraft = null;
const trackedStores = [];
let trackingReady = false;
let lastRulesSnapshot = {};

function hydrateFromPayload(obj = {}, { captureBaseline = true, schemaId = null } = {}) {
  let chosenRuleset = 'default';
  runWithoutTracking(() => {
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
      hier = { 'Options importees': { root: all, subgroups: {} } };
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
    chosenRuleset = chosen;
  });

  lastRulesSnapshot = getCurrentRulesSnapshot();

  if (captureBaseline) {
    setBaseline({ schemaId, resetHistory: true });
  } else {
    clearUndoRedo();
    trackingReady = true;
    markStateChanged();
  }

  return { ruleset: chosenRuleset };
}

function runWithoutTracking(fn) {
  suppressTracking++;
  try {
    return fn();
  } finally {
    suppressTracking = Math.max(0, suppressTracking - 1);
  }
}

function draftKeyFor(schema) {
  if (typeof localStorage === 'undefined') return null;
  if (schema && schema.id) return `${DRAFT_PREFIX}id:${schema.id}`;
  const name = get(currentRulesetName);
  return `${DRAFT_PREFIX}name:${name || 'default'}`;
}

function currentDraftKey() {
  const schema = get(activeSchema);
  if (schema?.id) return draftKeyFor(schema);
  if (lastSchemaIdForDraft) return draftKeyFor({ id: lastSchemaIdForDraft });
  return draftKeyFor(schema);
}

function ensureDraftRemoved(key) {
  if (typeof localStorage === 'undefined' || !key) return;
  try { localStorage.removeItem(key); } catch {}
}

function clearDraftForCurrent() {
  ensureDraftRemoved(currentDraftKey());
  draftAvailable.set(false);
  lastDraftJSON = baselinePayloadJSON;
}

function getCurrentRulesSnapshot() {
  const rsAll = get(rulesets) || {};
  const name = get(currentRulesetName) || 'default';
  const payload = rsAll[name] || {};
  return cloneRulesSnapshot(payload.rules || {});
}

function syncDraftStatusFromStorage({ schemaId = null } = {}) {
  if (typeof localStorage === 'undefined') {
    draftAvailable.set(false);
    lastDraftJSON = baselinePayloadJSON;
    return;
  }
  let key = null;
  if (schemaId !== null && schemaId !== undefined) {
    key = draftKeyFor({ id: schemaId });
  } else {
    key = currentDraftKey();
  }
  if (!key) {
    draftAvailable.set(false);
    lastDraftJSON = baselinePayloadJSON;
    return;
  }
  let stored = null;
  try {
    stored = localStorage.getItem(key);
  } catch (err) {
    console.warn("Impossible de lire le brouillon local", err);
  }
  if (stored && baselinePayloadJSON && stored === baselinePayloadJSON) {
    ensureDraftRemoved(key);
    stored = null;
  }
  draftAvailable.set(Boolean(stored));
  lastDraftJSON = stored || baselinePayloadJSON;
}

function setBaseline({ schemaId = null, resetHistory = false } = {}) {
  baselinePayloadJSON = buildPayloadJSON();
  if (resetHistory) {
    clearUndoRedo();
  }
  editorDirty.set(false);
  trackingReady = true;
  lastRulesSnapshot = getCurrentRulesSnapshot();
  lastSchemaIdForDraft = schemaId ?? get(activeSchema)?.id ?? null;
  syncDraftStatusFromStorage({ schemaId: lastSchemaIdForDraft });
}

function ensureTrackingSetup() {
  if (trackedStores.length) return;
  trackedStores.push(
    data.subscribe(handleGeneralChange),
    grouped.subscribe(handleGeneralChange),
    gammes.subscribe(handleGeneralChange),
    optionLabels.subscribe(handleGeneralChange),
    currentRulesetName.subscribe(handleRulesetNameChange),
    rulesets.subscribe(handleRulesChange),
    activeSchema.subscribe(handleActiveSchemaChange)
  );
}

function handleGeneralChange() {
  if (!trackingReady || suppressTracking > 0) return;
  markStateChanged();
}

function handleRulesChange(rsAll) {
  const name = get(currentRulesetName) || 'default';
  const currentSnapshot = cloneRulesSnapshot(rsAll?.[name]?.rules || {});
  if (!trackingReady || suppressTracking > 0) {
    lastRulesSnapshot = currentSnapshot;
    return;
  }
  if (isRestoringHistory) {
    lastRulesSnapshot = currentSnapshot;
    return;
  }
  const previousJSON = JSON.stringify(lastRulesSnapshot || {});
  const currentJSON = JSON.stringify(currentSnapshot || {});
  if (currentJSON === previousJSON) {
    return;
  }
  pushHistorySnapshot(cloneRulesSnapshot(lastRulesSnapshot || {}));
  lastRulesSnapshot = currentSnapshot;
  markStateChanged();
}

function handleRulesetNameChange() {
  const snapshot = getCurrentRulesSnapshot();
  lastRulesSnapshot = snapshot;
  if (!trackingReady || suppressTracking > 0) return;
  markStateChanged();
}

function handleActiveSchemaChange(schema) {
  lastSchemaIdForDraft = schema?.id ?? null;
  if (!trackingReady) return;
  syncDraftStatusFromStorage({ schemaId: lastSchemaIdForDraft });
}

function scheduleDraftSave(payloadJson) {
  if (typeof localStorage === 'undefined') return;
  if (!trackingReady) return;
  if (payloadJson === lastDraftJSON) return;
  lastDraftJSON = payloadJson;
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    const key = currentDraftKey();
    if (!key) return;
    const jsonToPersist = lastDraftJSON;
    if (baselinePayloadJSON && jsonToPersist === baselinePayloadJSON) {
      ensureDraftRemoved(key);
      draftAvailable.set(false);
      return;
    }
    try {
      const existing = localStorage.getItem(key);
      if (existing === jsonToPersist) {
        draftAvailable.set(true);
        return;
      }
      localStorage.setItem(key, jsonToPersist);
      draftAvailable.set(true);
    } catch (err) {
      console.warn("Impossible d'enregistrer le brouillon local", err);
    }
  }, 400);
}

if (typeof window !== 'undefined') {
  ensureTrackingSetup();
  if (!trackingReady) {
    setBaseline({ resetHistory: true });
  }
}

function clearUndoRedo() {
  undoStack.length = 0;
  redoStack.length = 0;
  undoAvailable.set(false);
  redoAvailable.set(false);
}

function cloneRulesSnapshot(rules) {
  return JSON.parse(JSON.stringify(rules || {}));
}

function pushHistorySnapshot(snapshot) {
  if (!snapshot) return;
  undoStack.push(snapshot);
  while (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  undoAvailable.set(undoStack.length > 0);
  redoStack.length = 0;
  redoAvailable.set(false);
}

function applyRulesSnapshot(snapshot) {
  if (!snapshot) return;
  runWithoutTracking(() => {
    isRestoringHistory = true;
    rulesets.update((rs0) => {
      const name = get(currentRulesetName) || 'default';
      const payload = rs0[name] || { rules: {} };
      return { ...rs0, [name]: { ...payload, rules: cloneRulesSnapshot(snapshot) } };
    });
    isRestoringHistory = false;
  });
  markStateChanged();
}

export function undoRules() {
  if (!undoStack.length) return false;
  const currentName = get(currentRulesetName) || 'default';
  const rsAll = get(rulesets) || {};
  const payload = rsAll[currentName] || { rules: {} };
  const current = cloneRulesSnapshot(payload.rules);
  const snapshot = undoStack.pop();
  redoStack.push(current);
  while (redoStack.length > HISTORY_LIMIT) redoStack.shift();
  redoAvailable.set(redoStack.length > 0);
  undoAvailable.set(undoStack.length > 0);
  applyRulesSnapshot(snapshot);
  return true;
}

export function redoRules() {
  if (!redoStack.length) return false;
  const currentName = get(currentRulesetName) || 'default';
  const rsAll = get(rulesets) || {};
  const payload = rsAll[currentName] || { rules: {} };
  const current = cloneRulesSnapshot(payload.rules);
  const snapshot = redoStack.pop();
  undoStack.push(current);
  while (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  undoAvailable.set(undoStack.length > 0);
  redoAvailable.set(redoStack.length > 0);
  applyRulesSnapshot(snapshot);
  return true;
}


function buildPayloadJSON() {
  try {
    return JSON.stringify(buildPayload());
  } catch (err) {
    console.warn('Impossible de generer le payload courant', err);
    return null;
  }
}

function markStateChanged() {
  if (!trackingReady || suppressTracking > 0) return;
  const json = buildPayloadJSON();
  if (!json) return;
  const dirty = baselinePayloadJSON === null || json !== baselinePayloadJSON;
  editorDirty.set(dirty);
  if (!dirty) {
    const key = currentDraftKey();
    if (key) ensureDraftRemoved(key);
    draftAvailable.set(false);
    lastDraftJSON = baselinePayloadJSON;
    return;
  }
  if (get(mode) === 'editor') {
    scheduleDraftSave(json);
  }
}

export function restoreDraft() {
  if (typeof localStorage === 'undefined') return false;
  const key = currentDraftKey();
  if (!key) return false;
  const stored = localStorage.getItem(key);
  if (!stored) return false;
  try {
    const payload = JSON.parse(stored);
    hydrateFromPayload(payload, { captureBaseline: false });
    return true;
  } catch (err) {
    console.warn('Impossible de restaurer le brouillon', err);
    return false;
  }
}

export async function duplicateCurrentSchema(newName) {
  const trimmed = String(newName || '').trim();
  if (!trimmed) throw new Error('Nom de duplication obligatoire');
  const payload = buildPayload();
  return saveSchemaToDatabase(trimmed, { payloadOverride: payload, skipSetActive: false });
}

/* =========================================
 * Import JSON (identique, mais rulesets normalises
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

  hydrateFromPayload(obj, { captureBaseline: false });
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

export function downloadJSON(filename = 'configurateur.json') {
  const payload = buildPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
export function exportJSON(filename = 'configurateur.json') {
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
    response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include'
    });
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
    if (response.status === 401) {
      authUser.set(null);
      authStatus.set('anonymous');
    }
    throw error;
  }

  return body;
}

function sortByUpdatedDate(list) {
  return list.sort((a, b) => {
    const aDate = a?.updated_at ? new Date(a.updated_at).getTime() : 0;
    const bDate = b?.updated_at ? new Date(b.updated_at).getTime() : 0;
    return bDate - aDate;
  });
}

function toSchemaEntry(record) {
  return {
    id: record.id,
    name: record.name,
    archived: Boolean(record.archived),
    updated_at: record.updated_at,
    created_at: record.created_at
  };
}

function updateSchemaStores(entry) {
  savedSchemas.update((items) => {
    const remaining = Array.isArray(items) ? items.filter((it) => it.id !== entry.id) : [];
    if (entry.archived) {
      return sortByUpdatedDate(remaining);
    }
    return sortByUpdatedDate([entry, ...remaining]);
  });
  archivedSchemas.update((items) => {
    const remaining = Array.isArray(items) ? items.filter((it) => it.id !== entry.id) : [];
    if (entry.archived) {
      return sortByUpdatedDate([entry, ...remaining]);
    }
    return sortByUpdatedDate(remaining);
  });
}

export async function checkAuth() {
  try {
    const data = await apiFetch('/api/auth/me');
    if (data?.user) {
      authUser.set(data.user);
      authStatus.set('authenticated');
      return data.user;
    }
    authUser.set(null);
    authStatus.set('anonymous');
    return null;
  } catch (err) {
    if (err?.status === 401) {
      authUser.set(null);
      authStatus.set('anonymous');
      return null;
    }
    throw err;
  }
}

export async function loginUser(username, password) {
  const creds = {
    username: (username || '').trim(),
    password: password || ''
  };
  if (!creds.username || !creds.password) {
    throw new Error('Identifiants requis.');
  }
  try {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(creds)
    });
    if (!data?.user) {
      throw new Error('Reponse de connexion invalide.');
    }
    authUser.set(data.user);
    authStatus.set('authenticated');
    return data.user;
  } catch (err) {
    if (err?.status === 401) {
      authUser.set(null);
      authStatus.set('anonymous');
    }
    throw err;
  }
}

export async function logoutUser() {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } finally {
    authUser.set(null);
    authStatus.set('anonymous');
  }
}

export async function createUserAccount(username, password) {
  const current = get(authUser);
  if (!current?.isBootstrap) {
    throw new Error('Seul le compte bootstrap peut creer un utilisateur.');
  }
  const payload = {
    username: String(username || '').trim(),
    password: String(password || '')
  };
  if (!payload.username || !payload.password) {
    throw new Error('Nom utilisateur et mot de passe requis.');
  }
  try {
    const data = await apiFetch('/api/auth/users', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return data?.user || null;
  } catch (err) {
    if (err?.status === 403) {
      throw new Error('Seul le compte bootstrap peut creer un utilisateur.');
    }
    throw err;
  }
}

export async function refreshSavedSchemas({ includeArchived = true } = {}) {
  try {
    const query = includeArchived ? '?includeArchived=1' : '?archived=0';
    const data = await apiFetch(`/api/schemas${query}`);
    const items = Array.isArray(data?.items) ? data.items : [];
    const activeItems = items.filter((item) => !item.archived);
    const archivedItems = includeArchived ? items.filter((item) => item.archived) : [];
    savedSchemas.set(activeItems);
    archivedSchemas.set(includeArchived ? archivedItems : []);
    return { active: activeItems, archived: archivedItems };
  } catch (err) {
    savedSchemas.set([]);
    archivedSchemas.set([]);
    throw err;
  }
}

export async function loadSchemaFromDatabase(id) {
  if (!id) throw new Error('Schema id manquant');
  const record = await apiFetch(`/api/schemas/${id}`);
  if (!record?.payload) throw new Error('Reponse inattendue depuis le serveur');
  hydrateFromPayload(record.payload, { schemaId: record.id });
  activeSchema.set({
    id: record.id,
    name: record.name,
    archived: Boolean(record.archived),
    updated_at: record.updated_at
  });
  return record;
}

export async function saveSchemaToDatabase(
  name,
  { id = null, payloadOverride = null, skipSetActive = false, archived: archivedOverride = undefined } = {}
) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Nom de schema obligatoire');

  const payload = payloadOverride || buildPayload();
  const current = get(activeSchema);
  const archivedFlag =
    archivedOverride !== undefined
      ? Boolean(archivedOverride)
      : current && current.id === id
        ? Boolean(current.archived)
        : false;
  const body = { name: trimmed, payload, archived: archivedFlag };
  if (id) body.id = id;

  let record;
  try {
    record = await apiFetch('/api/schemas', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  } catch (err) {
    if (err?.status === 401) {
      throw new Error('Connexion requise pour enregistrer un schema.');
    }
    throw err;
  }

  const entry = toSchemaEntry(record);
  updateSchemaStores(entry);

  if (!skipSetActive) {
    activeSchema.set({
      id: record.id,
      name: record.name,
      archived: entry.archived,
      updated_at: record.updated_at
    });
  }
  setBaseline({ schemaId: record.id, resetHistory: false });
  return record;
}

export async function deleteSchemaFromDatabase(id) {
  if (!id) return;
  try {
    await apiFetch(`/api/schemas/${id}`, { method: 'DELETE' });
  } catch (err) {
    if (err?.status === 401) {
      throw new Error('Connexion requise pour supprimer un schema.');
    }
    throw err;
  }
  savedSchemas.update((items) => items.filter((item) => item.id !== id));
  archivedSchemas.update((items) => items.filter((item) => item.id !== id));
  if (get(activeSchema)?.id === id) {
    activeSchema.set(null);
  }
}

export async function archiveSchemaInDatabase(id, archived = true) {
  if (!id) throw new Error('Schema id manquant');
  const body = { archived: Boolean(archived) };
  const record = await apiFetch(`/api/schemas/${id}/archive`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
  const entry = toSchemaEntry(record);
  updateSchemaStores(entry);
  if (get(activeSchema)?.id === id) {
    activeSchema.update((current) =>
      current
        ? { ...current, archived: entry.archived, updated_at: record.updated_at }
        : current
    );
  }
  return record;
}

export async function fetchSchemaAudit(id) {
  if (!id) throw new Error('Schema id manquant');
  try {
    const data = await apiFetch(`/api/schemas/${id}/audit`, { method: 'GET' });
    const events = Array.isArray(data?.events) ? data.events : [];
    return events;
  } catch (err) {
    if (err?.status === 401) {
      throw new Error('Connexion requise pour consulter l audit.');
    }
    throw err;
  }
}

export function openAuditPanel(schemaId = null) {
  const user = get(authUser);
  if (!user?.isBootstrap) {
    throw new Error('Acces reserve au compte bootstrap.');
  }
  auditSelectedSchemaId.set(schemaId);
  auditPanelOpen.set(true);
}

export function closeAuditPanel() {
  auditPanelOpen.set(false);
  auditSelectedSchemaId.set(null);
}

/* =========================================
 * Selection + auto-ajout obligatoire
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
  out.delete(startId); // ne renvoie que les prerequis
  return out;
}

export function toggleSelect(id) {
  const rules = getActiveRules();
  const cur = new Set(get(selected));

  if (cur.has(id)) {
    // Deselection simple (on ne “desauto-selectionne” pas les obligations)
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
 * Reinitialisation complete
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





