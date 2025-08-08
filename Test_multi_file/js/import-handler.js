import * as setup from "./setup.js";
import { renderNodes } from "./render.js";
import { updateGammeSummary } from "./summary.js";
import { handleClick, isDisabledWithContext } from "./selection.js";
import { setupRulesetSelector } from "./ruleset-ui.js";

/* ================= Helpers parsing sécurisés ================= */

async function safeParseFile(file) {
  const text = await file.text();

  // JSON natif ?
  if (/\.(json)$/i.test(file.name) || looksLikeJSON(text)) {
    const obj = JSON.parse(text);
    return pick(obj);
  }

  // Ancien .js exporté (ESM) : extraire les const exportées
  const extracted = {};
  const KEYS = ["gammes", "groupedCriteria", "groupedSubgroups", "optionLabels", "criteria", "ruleSets"];
  for (const key of KEYS) {
    const re = new RegExp(`export\\s+const\\s+${key}\\s*=\\s*([\\s\\S]*?);\\s*(?:\\n|$)`);
    const m = text.match(re);
    if (m && m[1]) {
      try { extracted[key] = JSON.parse(m[1]); } catch { /* ignore */ }
    }
  }
  return pick(extracted);
}

function looksLikeJSON(s) {
  const t = s.trim();
  return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
}

function pick(src) {
  return {
    gammes:           src.gammes || null,
    groupedCriteria:  src.groupedCriteria || null,
    groupedSubgroups: src.groupedSubgroups || null,
    optionLabels:     src.optionLabels || null,
    criteria:         src.criteria || null,
    ruleSets:         src.ruleSets || null,
  };
}

/* ================= Normalisations ================= */

function normalizeGammes(raw) {
  return raw && typeof raw === "object" ? raw : { Smart: {}, Mod: {}, Evo: {} };
}

function normalizeGrouping(groupedCriteria, groupedSubgroups, gammes) {
  // Hiérarchie fournie -> on garde et on dérive un plat
  if (groupedSubgroups && Object.keys(groupedSubgroups).length) {
    const flat = {};
    for (const [g, obj] of Object.entries(groupedSubgroups)) {
      const set = new Set();
      Object.values(obj?.subgroups || {}).forEach(ids => (ids || []).forEach(id => set.add(id)));
      flat[g] = Array.from(set);
    }
    return { flat, hier: groupedSubgroups };
  }
  // Format plat -> fabrique une hiérarchie triviale "Tout"
  if (groupedCriteria && Object.keys(groupedCriteria).length) {
    const hier = {};
    for (const [g, ids] of Object.entries(groupedCriteria)) {
      hier[g] = { subgroups: { "Tout": (ids || []).slice() } };
    }
    return { flat: groupedCriteria, hier };
  }
  // Fallback depuis les clés présentes dans les gammes
  const ids = Array.from(
    new Set([
      ...Object.keys(gammes.Smart || {}),
      ...Object.keys(gammes.Mod || {}),
      ...Object.keys(gammes.Evo || {}),
    ])
  );
  return {
    flat: { "Options importées": ids },
    hier: { "Options importées": { subgroups: { "Tout": ids } } },
  };
}

function normalizeOptionLabels(raw, gammes) {
  if (raw && Object.keys(raw).length) return raw;
  // Si pas fourni, label = id (compat)
  const map = {};
  const keys = new Set();
  Object.values(gammes).forEach(obj => Object.keys(obj || {}).forEach(k => keys.add(k)));
  keys.forEach(k => (map[k] = k));
  return map;
}

function normalizeRulesets(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [setName, def] of Object.entries(raw)) {
    const rules = def?.rules || def;
    const bucket = {};
    for (const [from, targets] of Object.entries(rules || {})) {
      // targets déjà sous forme {to: "requires"|"incompatible"} -> on copie tel quel
      bucket[from] = { ...(targets || {}) };
    }
    out[setName] = { rules: bucket };
  }
  return out;
}

/* ================= Handler principal ================= */

export function setupImportHandlers() {
  const input = document.getElementById("import-gammes");
  if (!input) return;

  input.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    try {
      const parsed = await safeParseFile(file);

      const gammesNorm = normalizeGammes(parsed.gammes);
      const { flat, hier } = normalizeGrouping(parsed.groupedCriteria, parsed.groupedSubgroups, gammesNorm);
      const labels = normalizeOptionLabels(parsed.optionLabels, gammesNorm);
      const rulesNorm = normalizeRulesets(parsed.ruleSets);

      // ---------- Injection dans le store (sans réassigner les objets exportés par setup) ----------
      setup.selected.clear();
      setup.criteria.length = 0;
      setup.nodes.length = 0;

      // gammes
      for (const k of Object.keys(setup.gammes)) delete setup.gammes[k];
      Object.assign(setup.gammes, gammesNorm);

      // groupedCriteria (plat)
      for (const k of Object.keys(setup.groupedCriteria)) delete setup.groupedCriteria[k];
      Object.assign(setup.groupedCriteria, flat);

      // groupedSubgroups (hiérarchie)
      for (const k of Object.keys(setup.groupedSubgroups)) delete setup.groupedSubgroups[k];
      Object.assign(setup.groupedSubgroups, hier);

      // optionLabels
      for (const k of Object.keys(setup.optionLabels)) delete setup.optionLabels[k];
      Object.assign(setup.optionLabels, labels);

      // criteria (IDs)
      Object.values(flat).forEach(ids => (ids || []).forEach(id => setup.criteria.push(id)));

      // rulesets
      setup.store.ruleSets = { ...setup.store.ruleSets, ...rulesNorm };
      const first = Object.keys(rulesNorm)[0];
      if (first) setup.store.currentRuleSetName = first;
      setup.store.currentRules = setup.store.ruleSets[setup.store.currentRuleSetName]?.rules || {};

      // ---------- Rendu ----------
      setup.setupNodes();
      d3.select("#graph").selectAll("*").remove();
      renderNodes(
        setup.nodes,
        setup.selected,
        handleClick,
        isDisabledWithContext,
        setup.store.currentRules
      );
      updateGammeSummary();
      setupRulesetSelector();

      const select = document.getElementById("ruleset-select");
      if (select) select.value = setup.store.currentRuleSetName;

      requestAnimationFrame(() => {
        document.getElementById("recenter-graph")?.click();
        e.target.value = ""; // reset input
      });
    } catch (err) {
      console.error("❌ Import invalide :", err);
      alert("Le fichier est invalide ou non compatible (attendu: .json ou ancien gammes.js exporté).");
    }
  });
}
