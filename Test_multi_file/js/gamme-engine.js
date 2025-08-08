/**
 * Renvoie un tableau des gammes compatibles avec les options sélectionnées
 */
export function determineGammes(selectedSet, gammes) {
  const selected = Array.from(selectedSet);
  const valides = [];

  for (const gammeName in gammes) {
    const rules = gammes[gammeName];
    const isValid = selected.every(option => {
      const info = rules[option];
      return info && (info.included || info.optional);
    });

    if (isValid) {
      valides.push(gammeName);
    }
  }

  return valides;
}

/**
 * Renvoie un objet avec explication des choix de gamme
 */
export function explainGammes(selectedSet, gammes) {
  const selected = Array.from(selectedSet);
  const explanations = {};

  for (const gammeName in gammes) {
    const rules = gammes[gammeName];
    const missing = [];
    const invalid = [];

    for (const option of selected) {
      const info = rules[option];

      if (!info) {
        invalid.push(option); // pas défini du tout
      } else if (!info.included && !info.optional) {
        invalid.push(option); // indisponible
      } else if (!info.included) {
        missing.push(option); // dispo mais pas inclus
      }
    }

    explanations[gammeName] = {
      valid: invalid.length === 0,
      missing,
      invalid
    };
  }

  return explanations;
}
