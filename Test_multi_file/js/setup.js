import { gammes as baseGammes } from "../data/gammes.js";
import { ruleSets as baseRuleSets } from "../data/rules.js";


export let criteria = [ /* ... */ ];
export let groupedCriteria = { /* ... */ };
export let selected = new Set();
export let nodes = [];
export let gammes = structuredClone(baseGammes);
export const store = {
  ruleSets: { ...baseRuleSets },
  currentRules: {},
  currentRuleSetName: "Standard"
};

export function setupNodes() {
  nodes.length = 0;

  const groupSpacing = 300;
  const itemSpacing = 120;
  const nodeWidth = 100;

  let groupIndex = 0;
  for (const [groupName, items] of Object.entries(groupedCriteria)) {
    const groupX = 100 + groupIndex * groupSpacing;
    const nodeWidth = 100;

    const totalHeight = (items.length - 1) * itemSpacing;
    const baseY = 100 - totalHeight / 2;

    const x = groupX + nodeWidth / 2; // 💡 Centrage horizontal

    items.forEach((id, i) => {
        const y = baseY + i * itemSpacing;

        const gammeInfo = {};
        for (const gammeName in gammes) {
        const presence = gammes[gammeName][id] || { included: false, optional: false };
        gammeInfo[gammeName] = { ...presence };
        }

        nodes.push({ id, x, y, gammeInfo, group: groupName });
    });

    groupIndex++;
    }

}
