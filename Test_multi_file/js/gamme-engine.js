/**
 * Retourne la liste des gammes compatibles avec la sélection.
 * Règle: toutes les options choisies doivent être "included" OU "optional"
 * dans la gamme considérée.
 */
export function determineGammes(selectedSet, gammes, order = ["Smart", "Mod", "Evo"]) {
  const selected = Array.from(selectedSet || []);
  if (!selected.length) {
    // Si rien n'est sélectionné, toutes les gammes sont possibles
    return order.filter(g => gammes && gammes[g]);
  }

  const possibles = [];
  for (const [gammeName, map] of Object.entries(gammes || {})) {
    const ok = selected.every(opt => {
      const info = map?.[opt];
      return !!info && (info.included || info.optional);
    });
    if (ok) possibles.push(gammeName);
  }

  // tri par ordre métier demandé
  return possibles.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/**
 * Donne le détail par gamme :
 * - valid: bool
 * - missing: options seulement "optional" (non incluses)
 * - invalid: options absentes dans la gamme (ni included, ni optional)
 */
export function explainGammes(selectedSet, gammes) {
  const selected = Array.from(selectedSet || []);
  const out = {};

  for (const [gammeName, map] of Object.entries(gammes || {})) {
    const missing = [];
    const invalid = [];

    for (const opt of selected) {
      const info = map?.[opt];
      if (!info) {
        invalid.push(opt);
      } else if (!info.included && !info.optional) {
        invalid.push(opt);
      } else if (!info.included) {
        // ici: optional mais pas included
        missing.push(opt);
      }
    }

    out[gammeName] = {
      valid: invalid.length === 0,
      missing,
      invalid
    };
  }

  return out;
}