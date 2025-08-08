import { setupNodes, nodes, selected, store } from "./setup.js";
import { renderNodes } from "./render.js";
import { updateGammeSummary } from "./summary.js";
import { handleClick, isDisabledWithContext } from "./selection.js";

export function setupRulesetSelector() {
  const controls = document.getElementById("controls");
  let select = document.getElementById("ruleset-select");

  // Si le select existe déjà → le réinitialiser
  if (select) {
    select.remove(); // supprime l'ancien
  }

  // En créer un nouveau
  select = document.createElement("select");
  select.id = "ruleset-select";

  for (const name in store.ruleSets) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }

  select.addEventListener("change", () => {
    selected.clear();
    setupNodes();
    renderNodes(nodes, selected, handleClick, isDisabledWithContext);
    updateGammeSummary();
  });

  controls.appendChild(select);
}