/**
 * Règles au format:
 * {
 *   [from]: { requires: string[], incompatible_with: string[] }
 * }
 */

/**
 * Applique les règles à un ensemble de sélection.
 * - Si on ajoute lastClicked => ajoute récursivement toutes ses dépendances (requires)
 * - En cas d'incompatibilité, on garde lastClicked et on retire l'autre
 * - Si on retire lastClicked => on retire aussi toutes les options qui en dépendent (cascade)
 */
export function applyRules(selectedSet, rules, { lastClicked, removal = false } = {}){
  const selected = new Set(selectedSet || []);
  const R = normalizeRules(rules);

  if (!lastClicked) {
    // Pas d'intention claire → sécurité de base: résoudre incompatibilités arbitrairement
    resolveIncompatibilities(selected, R, null);
    ensureRequires(selected, R);
    return selected;
  }

  if (!removal) {
    // Ajout: on garde lastClicked et on ajuste le reste
    selected.add(lastClicked);
    // Ajoute toutes les dépendances nécessaires
    addRequiresClosure(selected, R, lastClicked);

    // Résout les incompatibilités en gardant lastClicked
    resolveIncompatibilities(selected, R, lastClicked);
    // Une fois nettoyé, s'assurer que toutes les requires des restants sont satisfaites
    ensureRequires(selected, R);
  } else {
    // Retrait: on enlève lastClicked et tout ce qui en dépend (cascade)
    selected.delete(lastClicked);
    removeDependentsClosure(selected, R, lastClicked);
    // Après retraits, résoudre les conflits restants (sans préférence)
    resolveIncompatibilities(selected, R, null);
  }

  return selected;
}

/* --------------------------- Helpers --------------------------- */

function normalizeRules(rules){
  const out = {};
  if (!rules || typeof rules !== "object") return out;
  for (const [from, spec] of Object.entries(rules)) {
    const requires = Array.isArray(spec?.requires) ? spec.requires.slice() : [];
    const incompatible = Array.isArray(spec?.incompatible_with) ? spec.incompatible_with.slice() : [];
    out[from] = { requires, incompatible_with: incompatible };
  }
  return out;
}

function addRequiresClosure(selected, R, root){
  const queue = [root];
  const seen = new Set();
  while (queue.length){
    const cur = queue.shift();
    if (seen.has(cur)) continue;
    seen.add(cur);

    const reqs = R[cur]?.requires || [];
    for (const r of reqs){
      if (!selected.has(r)) selected.add(r);
      queue.push(r);
    }
  }
}

function ensureRequires(selected, R){
  // Pour chaque item sélectionné, s'assurer que ses dépendances sont sélectionnées aussi
  // (on préfère auto-ajouter les dépendances plutôt que retirer l'item)
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of Array.from(selected)) {
      const reqs = R[s]?.requires || [];
      for (const r of reqs) {
        if (!selected.has(r)) {
          selected.add(r);
          changed = true;
        }
      }
    }
  }
}

function removeDependentsClosure(selected, R, removed){
  // Retire tous les items qui (directement ou non) REQUIRE 'removed'
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of Array.from(selected)) {
      const reqs = R[s]?.requires || [];
      if (reqs.includes(removed) || reqs.some(r => !selected.has(r))) {
        selected.delete(s);
        changed = true;
      }
    }
  }
}

function resolveIncompatibilities(selected, R, prefer){
  // Si A incompatible avec B (dans un sens OU l'autre) et A & B sélectionnés:
  // - si prefer === A -> on retire B
  // - si prefer === B -> on retire A
  // - sinon: on retire B par défaut (déterministe)
  const hasConflict = (a,b) =>
    (R[a]?.incompatible_with || []).includes(b) ||
    (R[b]?.incompatible_with || []).includes(a);

  let changed = true;
  while (changed) {
    changed = false;
    const arr = Array.from(selected);
    for (let i=0;i<arr.length;i++){
      for (let j=i+1;j<arr.length;j++){
        const a = arr[i], b = arr[j];
        if (!selected.has(a) || !selected.has(b)) continue;
        if (!hasConflict(a,b)) continue;

        if (prefer === a) { selected.delete(b); changed = true; }
        else if (prefer === b) { selected.delete(a); changed = true; }
        else { selected.delete(b); changed = true; }
      }
    }
  }
}