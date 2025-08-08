import { applyRules, isDisabled } from "./rules-engine.js";
import { nodes, groupedCriteria, selected, store } from "./setup.js";
import { renderNodes } from "./render.js";
import { updateGammeSummary } from "./summary.js";

export function handleClick(optionId) {
  if (isDisabled(optionId, selected, store.currentRules)) return;

  const groupName = Object.keys(groupedCriteria).find(name =>
    groupedCriteria[name].includes(optionId)
  );

  if (groupName) {
    if (selected.has(optionId)) {
      selected.delete(optionId);
    } else {
      groupedCriteria[groupName].forEach(item => selected.delete(item));
      selected.add(optionId);
    }
  } else {
    selected.has(optionId) ? selected.delete(optionId) : selected.add(optionId);
  }

  const newSelection = applyRules(selected, store.currentRules);
    selected.clear();
    newSelection.forEach(v => selected.add(v));
  renderNodes(nodes, selected, handleClick, isDisabledWithContext);
  updateGammeSummary();
}

export function isDisabledWithContext(optionId) {
  return isDisabled(optionId, selected, store.currentRules);
}