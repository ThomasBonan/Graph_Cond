import * as setup from "./setup.js";
import { renderNodes } from "./render.js";
import { updateGammeSummary } from "./summary.js";
import { handleClick, isDisabledWithContext } from "./selection.js";
import { setupRulesetSelector } from "./ruleset-ui.js";

export function setupImportHandlers() {
  document.getElementById("import-gammes").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const blob = new Blob([text], { type: "application/javascript" });
      const blobURL = URL.createObjectURL(blob);
      const module = await import(blobURL);
      URL.revokeObjectURL(blobURL);

      const imported = {
        gammes: module.gammes,
        groupedCriteria: module.groupedCriteria || {
          "Options importées": Object.keys(module.gammes?.PureBasic || {})
        },
        criteria: module.criteria || Object.keys(module.gammes?.PureBasic || {}),
        ruleSets: module.ruleSets || {}
      };

      // Injecter les règles importées dans le store
      for (const [name, rules] of Object.entries(imported.ruleSets)) {
        setup.store.ruleSets[name] = rules;
      }

      // Sélectionner le premier ruleset importé
      setup.store.currentRuleSetName = Object.keys(imported.ruleSets)[0] || "Standard";
      setup.store.currentRules = setup.store.ruleSets[setup.store.currentRuleSetName]?.rules || {};

      // Réinitialisation des données
      setup.selected.clear();
      setup.criteria.length = 0;
      setup.nodes.length = 0;

      Object.keys(setup.gammes).forEach(k => delete setup.gammes[k]);
      Object.assign(setup.gammes, imported.gammes);

      Object.keys(setup.groupedCriteria).forEach(k => delete setup.groupedCriteria[k]);
      Object.assign(setup.groupedCriteria, imported.groupedCriteria);

      imported.criteria.forEach(opt => setup.criteria.push(opt));

      // Recalcul + rendu
      setup.setupNodes();
      d3.select("#graph").selectAll("*").remove();
      renderNodes(setup.nodes, setup.selected, handleClick, isDisabledWithContext, setup.store.currentRules);
      updateGammeSummary();
      setupRulesetSelector();

      // Sélection du ruleset
      if (Object.keys(imported.ruleSets).length > 0) {
        document.getElementById("ruleset-select").value = setup.store.currentRuleSetName;
      }

      console.log("✅ Importation automatique effectuée.");
    } catch (err) {
      console.error("❌ Échec d'import automatique :", err);
      alert("Le fichier est invalide ou non compatible.");
    }
  });
}
