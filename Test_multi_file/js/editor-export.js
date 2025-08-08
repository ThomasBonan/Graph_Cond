// Construit le payload attendu par la commerciale (IDs + labels)
export function exportCommercialJSON(data, groupedCriteria, ruleSets) {
  const payload = buildCommercialPayload(data, groupedCriteria, ruleSets);
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "commercial.json"; a.click();
  URL.revokeObjectURL(url);
}

export function exportLegacyJS(data, groupedCriteria, ruleSets) {
  const payload = buildCommercialPayload(data, groupedCriteria, ruleSets);
  const { gammes, groupedCriteria: grouped, groupedSubgroups, optionLabels, criteria, ruleSets: rules } = payload;
  const content =
    `export const gammes = ${JSON.stringify(gammes, null, 2)};\n\n` +
    `export const groupedCriteria = ${JSON.stringify(grouped, null, 2)};\n\n` +
    `export const groupedSubgroups = ${JSON.stringify(groupedSubgroups, null, 2)};\n\n` +
    `export const optionLabels = ${JSON.stringify(optionLabels, null, 2)};\n\n` +
    `export const criteria = ${JSON.stringify(criteria, null, 2)};\n\n` +
    `export const ruleSets = ${JSON.stringify(rules, null, 2)};\n`;
  const blob = new Blob([content], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "gammes.js"; a.click();
  URL.revokeObjectURL(url);
}

function buildCommercialPayload(data, groupedCriteria, ruleSets) {
  // Labels
  const optionLabels = {}; // id -> name

  // Gammes (par ID)
  const gammes = { Smart:{}, Mod:{}, Evo:{} };
  for (const [groupName, arr] of Object.entries(data || {})) {
    (arr || []).forEach(opt => {
      optionLabels[opt.id] = opt.name;
      ["Smart","Mod","Evo"].forEach(k => {
        const st = opt.gammes?.[k] || "absent";
        gammes[k][opt.id] = { included: st === "included", optional: st === "optional" };
      });
    });
  }

  // Hiérarchie (IDs)
  const groupedSubgroups = {};
  for (const [groupName, obj] of Object.entries(groupedCriteria || {})) {
    groupedSubgroups[groupName] = { subgroups: {} };
    for (const [sg, ids] of Object.entries(obj?.subgroups || {})) {
      groupedSubgroups[groupName].subgroups[sg] = Array.from(new Set(ids || []));
    }
  }

  // Plat (IDs)
  const groupedFlat = {};
  for (const [groupName, o] of Object.entries(groupedSubgroups)) {
    const set = new Set();
    Object.values(o.subgroups || {}).forEach(ids => (ids || []).forEach(id => set.add(id)));
    groupedFlat[groupName] = Array.from(set);
  }

  // Criteria (IDs)
  const criteriaSet = new Set();
  Object.values(groupedFlat).forEach(ids => (ids || []).forEach(id => criteriaSet.add(id)));
  const criteria = Array.from(criteriaSet);

  // Rulesets (IDs)
  const outRuleSets = {};
  for (const [setName, def] of Object.entries(ruleSets || {})) {
    const bucket = {};
    for (const [fromId, targets] of Object.entries(def?.rules || {})) {
      for (const [toId, type] of Object.entries(targets || {})) {
        const entry = bucket[fromId] || (bucket[fromId] = {});
        entry[toId] = type;
      }
    }
    outRuleSets[setName] = { rules: bucket };
  }

  return { gammes, groupedCriteria: groupedFlat, groupedSubgroups, optionLabels, criteria, ruleSets: outRuleSets };
}