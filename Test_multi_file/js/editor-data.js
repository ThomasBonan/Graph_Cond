// ====== State ÉDITEUR (avec IDs d'options) ======

export const data = {}; // { group: [ {id, name, gammes:{Smart|Mod|Evo: 'absent'|'included'|'optional'}} ] }
export const groupedCriteria = {}; // { group: { subgroups: { subName: [optionId,...] } } }
export const ruleSets = {}; // { setName: { rules: { fromId: { toId: 'requires' | 'incompatible', ... } } } }

const LS_KEY_V2 = "be-editor-state-v2";
const LS_KEY_V1 = "be-editor-state"; // compat

export function initData(){
  loadState();
  // défaut si vide
  if (Object.keys(groupedCriteria).length === 0) {
    groupedCriteria["Groupe 1"] = { subgroups: { "Sous-groupe A": [] } };
  }
  if (Object.keys(ruleSets).length === 0) {
    ruleSets["default"] = { rules: {} };
  }
}

export function saveState(){
  const payload = { data, groupedCriteria, ruleSets };
  try { localStorage.setItem(LS_KEY_V2, JSON.stringify(payload)); } catch {}
}

export function loadState(){
  // v2 ?
  try {
    const raw = localStorage.getItem(LS_KEY_V2);
    if (raw) {
      const parsed = JSON.parse(raw);
      restoreInto(parsed);
      return;
    }
  } catch {}
  // v1 → migrer (noms → IDs)
  try {
    const raw1 = localStorage.getItem(LS_KEY_V1);
    if (!raw1) return;
    const old = JSON.parse(raw1);
    migrateV1toV2(old);
  } catch {}
}

function restoreInto({ data: d, groupedCriteria: g, ruleSets: r }){
  clearObj(data); clearObj(groupedCriteria);
  Object.assign(data, d || {});
  Object.assign(groupedCriteria, g || {});
  clearObj(ruleSets); Object.assign(ruleSets, r || {});
}

function migrateV1toV2(old){
  clearObj(data); clearObj(groupedCriteria); clearObj(ruleSets);
  const idByName = new Map();

  // data: { group: [ {name, gammes} ] } → avec id
  for (const [group, arr] of Object.entries(old?.data || {})) {
    data[group] = [];
    (arr || []).forEach(opt => {
      const id = genId();
      idByName.set(`${group}::${opt.name}`, id);
      data[group].push({ id, name: opt.name, gammes: opt.gammes });
    });
  }
  // groupedCriteria: { group: { subgroups: { name: [optionName] } } } → IDs
  for (const [group, obj] of Object.entries(old?.groupedCriteria || {})) {
    groupedCriteria[group] = { subgroups: {} };
    for (const [sg, list] of Object.entries(obj?.subgroups || {})) {
      groupedCriteria[group].subgroups[sg] = (list || []).map(n => {
        const id = idByName.get(`${group}::${n}`) || findIdByNameInGroup(group, n);
        return id || genId(); // fallback
      });
    }
  }
  // rulesets: { set: { rules: { fromName: { toName: 'type' } } } } → IDs (best effort)
  for (const [setName, def] of Object.entries(old?.ruleSets || {})) {
    const out = ruleSets[setName] = { rules: {} };
    const rules = def?.rules || {};
    for (const [fromName, targets] of Object.entries(rules)) {
      const fromId = findIdByName(fromName);
      if (!fromId) continue;
      for (const [toName, type] of Object.entries(targets || {})) {
        const toId = findIdByName(toName);
        if (!toId) continue;
        if (!out.rules[fromId]) out.rules[fromId] = {};
        out.rules[fromId][toId] = type;
      }
    }
  }
  saveState();
}

function findIdByNameInGroup(group, name){
  return (data[group] || []).find(o => o.name === name)?.id || null;
}
function findIdByName(name){
  for (const arr of Object.values(data)) {
    const f = (arr || []).find(o => o.name === name);
    if (f) return f.id;
  }
  return null;
}
function clearObj(o){ for (const k of Object.keys(o)) delete o[k]; }
function genId(){ return (self.crypto?.randomUUID?.() ?? ("o_" + Math.random().toString(36).slice(2) + Date.now())); }

// Helpers utilisés par l’éditeur
export function getOptionById(id){
  for (const [g, arr] of Object.entries(data)) {
    const idx = (arr || []).findIndex(o => o.id === id);
    if (idx !== -1) return { group:g, option: arr[idx] };
  }
  return null;
}
export function getAllOptions(){
  const out = [];
  for (const [group, arr] of Object.entries(data)) {
    (arr || []).forEach(opt => {
      // retrouver les sous-groupes qui pointent vers cet id
      const sgs = Object.keys(groupedCriteria[group]?.subgroups || {}).filter(
        sg => (groupedCriteria[group].subgroups[sg] || []).includes(opt.id)
      );
      out.push({ id:opt.id, name:opt.name, group, subgroups: sgs });
    });
  }
  return out;
}