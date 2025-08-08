import { renderNodes } from "./render.js";
import { setupNodes, nodes, criteria, groupedCriteria, selected, gammes } from "./setup.js";
import { handleClick, isDisabledWithContext } from "./selection.js";
import { updateGammeSummary } from "./summary.js";
import { setupRulesetSelector } from "./ruleset-ui.js";
import { setupImportHandlers } from "./import-handler.js";

// Initialisation
setupNodes();
updateGammeSummary();
setupRulesetSelector();
setupImportHandlers();