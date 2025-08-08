export const gammes = { Smart:{}, Mod:{}, Evo:{} };
export const groupedCriteria = {};               // plat (IDs)
export const groupedSubgroups = {};              // hiérarchique (IDs)
export const optionLabels = {};                  // ✅ id -> name

export const criteria = [];
export const selected = new Set();
export const nodes = [];

export const store = {
  ruleSets: { default: { rules: {} } },
  currentRuleSetName: "default",
  currentRules: {}
};

export function setupNodes(){
  nodes.length = 0;
  Object.entries(groupedCriteria).forEach(([groupName, ids]) => {
    (ids || []).forEach(id => nodes.push({ name: id, group: groupName })); // name = id (clé logique)
  });
}