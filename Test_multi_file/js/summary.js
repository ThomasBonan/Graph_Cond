import * as setup from "./setup.js";

/* Utilitaire : id -> libellé lisible */
const labelOf = (id) => setup.optionLabels?.[id] || id;

/**
 * Met à jour le résumé des gammes sous le graphe.
 * - Affiche la/les gammes compatibles avec la sélection (rule: included || optional)
 * - Compteurs par gamme
 * - Liste des options sélectionnées avec badges S/M/E
 * - Sans innerHTML sur données utilisateur (XSS-safe)
 */
export function updateGammeSummary(){
  const host = document.getElementById("gamme-summary");
  if (!host) return;
  host.innerHTML = "";

  const title = document.createElement("h3");
  title.textContent = "Résumé gammes";
  host.appendChild(title);

  const selected = setup.selected;
  const order = ["Smart", "Mod", "Evo"];

  if (!selected || selected.size === 0){
    const p = document.createElement("p");
    p.textContent = "Aucune option sélectionnée. Toutes les gammes sont potentielles (Smart, Mod, Evo).";
    p.style.color = "var(--c-text-muted)";
    host.appendChild(p);
    return;
  }

  // --- Gammes compatibles ---
  const compatibles = order.filter(gamme => {
    const map = setup.gammes?.[gamme] || {};
    for (const id of selected) {
      const info = map[id];
      if (!(info && (info.included || info.optional))) return false;
    }
    return true;
  });

  const rec = document.createElement("div");
  rec.style.margin = "6px 0 10px";
  if (compatibles.length === 0){
    rec.appendChild(badge("Aucune gamme compatible", "evo"));
  } else if (compatibles.length === 1){
    rec.appendChild(badge(`Gamme recommandée : ${compatibles[0]}`, compatibles[0].toLowerCase()));
  } else {
    rec.appendChild(badge(`Gammes compatibles : ${compatibles.join(" / ")}`, "mod"));
  }
  host.appendChild(rec);

  // --- Compteurs par gamme ---
  const counts = {
    Smart: { included: 0, optional: 0 },
    Mod:   { included: 0, optional: 0 },
    Evo:   { included: 0, optional: 0 },
  };
  selected.forEach(id => {
    order.forEach(g => {
      const st = setup.gammes?.[g]?.[id];
      if (!st) return;
      if (st.included) counts[g].included++;
      if (st.optional) counts[g].optional++;
    });
  });

  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "repeat(3, 1fr)";
  grid.style.gap = "10px";
  grid.style.marginBottom = "10px";
  order.forEach(g => {
    const card = document.createElement("div");
    card.className = "badge " + g.toLowerCase();
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.gap = "4px";
    const h = document.createElement("div");
    h.style.fontWeight = "700";
    h.textContent = g;
    const r1 = document.createElement("div"); r1.textContent = `Présent: ${counts[g].included}`;
    const r2 = document.createElement("div"); r2.textContent = `Optionnel: ${counts[g].optional}`;
    card.appendChild(h); card.appendChild(r1); card.appendChild(r2);
    grid.appendChild(card);
  });
  host.appendChild(grid);

  // --- Liste des options sélectionnées ---
  const listTitle = document.createElement("h4");
  listTitle.textContent = "Options sélectionnées";
  listTitle.style.margin = "8px 0 6px";
  host.appendChild(listTitle);

  const ul = document.createElement("ul");
  ul.style.listStyle = "none";
  ul.style.padding = "0";
  ul.style.margin = "0";

  Array.from(selected)
    .sort((a,b)=>labelOf(a).localeCompare(labelOf(b),"fr"))
    .forEach(id => {
      const li = document.createElement("li");
      li.style.display = "flex";
      li.style.alignItems = "center";
      li.style.gap = "8px";
      li.style.marginBottom = "6px";

      const span = document.createElement("span");
      span.textContent = labelOf(id);
      li.appendChild(span);

      order.forEach(g => {
        const st = setup.gammes?.[g]?.[id] || { included:false, optional:false };
        const b = document.createElement("span");
        b.className = "badge " + g.toLowerCase();
        b.textContent = st.included ? g : (st.optional ? `${g} (opt.)` : `${g} —`);
        li.appendChild(b);
      });

      ul.appendChild(li);
    });

  host.appendChild(ul);
}

function badge(txt, cls){
  const b = document.createElement("span");
  b.className = `badge ${cls}`;
  b.textContent = txt;
  return b;
}