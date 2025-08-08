import * as setup from "./setup.js";
import { applyRules } from "./rules-engine.js";

/**
 * Callback de clic passé au renderer.
 * - Garde/retire l’élément cliqué
 * - Applique les règles avec préférence pour le dernier cliqué
 * - Re-render via la fonction exposée par main.js (window.__be.rerender)
 */
export function handleClick(name){
  const wasSelected = setup.selected.has(name);
  const next = new Set(setup.selected);

  if (wasSelected) next.delete(name);
  else next.add(name);

  const resolved = applyRules(next, setup.store.currentRules, {
    lastClicked: name,
    removal: wasSelected,
  });

  // Écrase la sélection courante avec le résultat
  setup.selected.clear();
  for (const v of resolved) setup.selected.add(v);

  // Re-render centralisé (fourni par main.js)
  window.__be?.rerender?.();
}

/**
 * Optionnel: utiliser cette fonction pour "griser" certains nœuds si tu veux
 * Aujourd’hui, grâce au choix "garder le dernier cliqué", on évite de bloquer l’utilisateur.
 * → On renvoie 'false' par défaut (aucun nœud désactivé avant clic).
 */
export function isDisabledWithContext(name /*, selected, currentRules */){
  return false;
}