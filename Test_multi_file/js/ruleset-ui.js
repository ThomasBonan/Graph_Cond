import * as setup from "./setup.js";
import { renderNodes } from "./render.js";
import { updateGammeSummary } from "./summary.js";
import { handleClick, isDisabledWithContext } from "./selection.js";

/**
 * Construit ou met à jour le sélecteur de ruleset.
 * - Toujours synchroniser setup.store.currentRuleSetName + .currentRules
 * - Toujours re-render le graphe après changement (A7)
 */
export function setupRulesetSelector(){
  const host = document.getElementById("controls");
  if (!host) return;

  // Si aucun ruleset connu, on crée un "default" vide
  const names = Object.keys(setup.store.ruleSets);
  if (names.length === 0) {
    setup.store.ruleSets = { default: { rules: {} } };
  }
  if (!setup.store.currentRuleSetName || !setup.store.ruleSets[setup.store.currentRuleSetName]) {
    setup.store.currentRuleSetName = Object.keys(setup.store.ruleSets)[0];
  }
  setup.store.currentRules = setup.store.ruleSets[setup.store.currentRuleSetName]?.rules || {};

  // (Re)build UI
  host.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "controls-inner";

  const label = document.createElement("label");
  label.setAttribute("for", "ruleset-select");
  label.textContent = "Jeu de règles";
  wrapper.appendChild(label);

  const select = document.createElement("select");
  select.id = "ruleset-select";
  for (const name of Object.keys(setup.store.ruleSets)) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (name === setup.store.currentRuleSetName) opt.selected = true;
    select.appendChild(opt);
  }
  wrapper.appendChild(select);

  host.appendChild(wrapper);

  // Changement de ruleset => maj store + re-render
  select.addEventListener("change", () => {
    const next = select.value;
    setup.store.currentRuleSetName = next;
    setup.store.currentRules = setup.store.ruleSets[next]?.rules || {};

    // Re-rendu (toujours fournir les règles)
    const svg = d3.select("#graph");
    svg.selectAll("*").remove();
    renderNodes(
      setup.nodes,
      setup.selected,
      handleClick,
      isDisabledWithContext,
      setup.store.currentRules
    );
    updateGammeSummary();
  });
}