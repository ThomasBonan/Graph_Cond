/**
 * Applique les règles au set sélectionné : supprime les éléments invalides
 */
export function applyRules(selectedSet, rules) {
  const selected = new Set(selectedSet); // clone
  let changed = true;

  while (changed) {
    changed = false;

    // Étape 1 : enlever ceux dont les requirements ne sont pas remplis
    for (const item of Array.from(selected)) {
      const rule = rules[item];
      if (!rule) continue;

      const required = rule.requires || [];
      const ok = required.every(dep => selected.has(dep));
      if (!ok) {
        selected.delete(item);
        changed = true;
      }
    }

    // Étape 2 : enlever ceux qui sont en conflit
    for (const item of Array.from(selected)) {
      const rule = rules[item];
      if (!rule) continue;

      const conflicts = rule.incompatible_with || [];
      for (const conflict of conflicts) {
        if (selected.has(conflict)) {
          selected.delete(conflict);
          changed = true;
        }
      }
    }
  }

  return selected;
}

/**
 * Retourne true si une option est désactivée à cause des règles
 */
export function isDisabled(optionId, selectedSet, rules) {
  if (selectedSet.has(optionId)) return false;

  // Incompatibilité avec un élément sélectionné
  for (const sel of selectedSet) {
    const rule = rules[sel];
    if (rule?.incompatible_with?.includes(optionId)) {
      return true;
    }
  }

  // L’élément requiert un autre non sélectionné
  const rule = rules[optionId];
  if (rule?.requires?.length) {
    return !rule.requires.every(req => selectedSet.has(req));
  }

  return false;
}

/**
 * Obtenir la raison d’un blocage (option indisponible)
 */
export function getDisableReason(optionId, selectedSet, rules) {
  const blocking = [];
  const missing = [];

  for (const sel of selectedSet) {
    const rule = rules[sel];
    if (rule?.incompatible_with?.includes(optionId)) {
      blocking.push(sel);
    }
  }

  const rule = rules[optionId];
  if (rule?.requires?.length) {
    rule.requires.forEach(req => {
      if (!selectedSet.has(req)) missing.push(req);
    });
  }

  return { blocking, missing };
}
