import { data, ruleSets, groupedCriteria } from './editor-data.js';

let zoomContainerGlobal = null;
let zoomBehavior = null;

const itemGapY = 100;

/* CSS helpers */
function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

/* ========= Rendu ========= */
export function renderPreview(opts = {}) {
  const search = (opts.search || "").toLowerCase();
  const svg = d3.select("#preview");
  svg.selectAll("*").remove();

  // Palette
  const cText        = cssVar("--c-text") || "#e8eef5";
  const cTextMuted   = cssVar("--c-text-muted") || "#666";
  const cStroke      = cssVar("--c-stroke") || "#4b5563";
  const cStrokeWeak  = cssVar("--c-stroke-weak") || "#3a4658";
  const cStrokeGroup = cssVar("--c-stroke-group") || "#2c3645";
  const cBoxBg       = cssVar("--c-box-bg") || "#0b0f14";

  const cReqBg       = cssVar("--c-rule-req-bg") || "#dbeafe";
  const cReqBorder   = cssVar("--c-rule-req-border") || "#2563eb";
  const cIncBg       = cssVar("--c-rule-inc-bg") || "#fee2e2";
  const cIncBorder   = cssVar("--c-rule-inc-border") || "#dc2626";

  const defs = svg.append("defs");
  const pattern = defs.append("pattern").attr("id","hatch").attr("patternUnits","userSpaceOnUse").attr("width",6).attr("height",6);
  pattern.append("path").attr("d","M0,0 l6,6").attr("stroke",cTextMuted).attr("stroke-width",1);

  drawLegend(svg, { cText, cStroke, cReqBg, cReqBorder, cIncBg, cIncBorder });

  zoomContainerGlobal = svg.append("g").attr("id","zoom-container");
  zoomBehavior = d3.zoom().scaleExtent([0.5,2]).on("zoom",(e)=>zoomContainerGlobal.attr("transform", e.transform));
  svg.call(zoomBehavior);

  // Layout params
  const subgroupWidth = 220;
  const padX = 30, padY = 30;           // padding interne du groupe
  const gapX = 16, gapY = 16;           // espacement entre sous-groupes
  const maxCols = 3;                    // jusqu'à trois colonnes
  const optionWidth = 120;
  const groupSpacing = 80;              // espace entre groupes sur l'axe X

  let gx = 50;

  Object.entries(groupedCriteria).forEach(([groupName, groupObj]) => {
    const subgroups = groupObj?.subgroups || {};
    const entries = Object.entries(subgroups).map(([sg, ids]) => ({ sg, ids }));

    // Filtrage (on cache les sous-groupes vides quand une recherche est active)
    const measured = entries
      .map(({ sg, ids }) => {
        const list = Array.isArray(ids) ? ids : [];
        const filtered = search ? list.filter(id => getName(groupName, id).toLowerCase().includes(search)) : list;
        const count = filtered.length;
        if (search && count === 0) return null; // masqué en recherche
        const height = Math.max(count * itemGapY + 40, 50);
        return { sg, list: filtered, height };
      })
      .filter(Boolean);

    if (measured.length === 0) {
      // groupe vide (en recherche) -> on saute mais garde le décalage minimal
      gx += 250;
      return;
    }

    // ======== Placement masonry (colonne la plus courte) ========
    const cols = Math.min(maxCols, Math.max(1, Math.ceil(Math.sqrt(measured.length))));
    const colHeights = new Array(cols).fill(0);
    const positions = []; // {sg, list, height, x, y}

    measured.forEach(entry => {
      // colonne la plus courte
      let col = 0;
      for (let i = 1; i < cols; i++) if (colHeights[i] < colHeights[col]) col = i;
      const x = gx + padX + col * (subgroupWidth + gapX);
      const y = padY + colHeights[col];
      positions.push({ ...entry, x, y });
      colHeights[col] += entry.height + gapY;
    });

    const innerWidth  = cols * subgroupWidth + (cols - 1) * gapX;
    const innerHeight = Math.max(...colHeights) - gapY;
    const groupWidth  = innerWidth + 2 * padX;
    const groupHeight = innerHeight + 2 * padY;
    const groupY = 60;

    // Cadre & titre du groupe
    zoomContainerGlobal.append("rect")
      .attr("x", gx).attr("y", groupY)
      .attr("width", groupWidth).attr("height", groupHeight)
      .attr("fill","none").attr("stroke",cStrokeGroup).attr("stroke-dasharray","4,2").attr("rx",6).attr("ry",6);

    zoomContainerGlobal.append("text")
      .attr("x", gx + groupWidth/2).attr("y", groupY - 10)
      .text(groupName).attr("font-size",16).attr("font-weight","bold").attr("text-anchor","middle").attr("fill",cText);

    // Sous-groupes positionnés
    positions.forEach(({ sg, list, height, x, y }) => {
      const sx = x;
      const sy = groupY + y;

      // cadre sous-groupe
      zoomContainerGlobal.append("rect")
        .attr("x", sx).attr("y", sy)
        .attr("width", subgroupWidth).attr("height", height)
        .attr("fill","none").attr("stroke",cStrokeWeak).attr("stroke-dasharray","4,2").attr("rx",6).attr("ry",6);

      zoomContainerGlobal.append("text")
        .attr("x", sx + subgroupWidth/2).attr("y", sy + 15)
        .text(sg).attr("font-size",13).attr("font-weight","bold").attr("text-anchor","middle").attr("fill",cText);

      // options
      list.forEach((id, i) => {
        const item = (data[groupName] || []).find(o => o.id === id);
        if (!item) return;

        const yOpt = sy + 30 + i * itemGapY;
        const xOpt = sx + (subgroupWidth - optionWidth) / 2;

        const isRequired = isOptionRequired(id);
        const isIncompatible = isOptionIncompatible(id);

        let boxFill=cBoxBg, boxStroke=cStroke, accent=null;
        if (isRequired){ boxFill=cReqBg; boxStroke=cReqBorder; accent=cReqBorder; }
        else if (isIncompatible){ boxFill=cIncBg; boxStroke=cIncBorder; accent=cIncBorder; }

        zoomContainerGlobal.append("rect")
          .attr("x", xOpt).attr("y", yOpt).attr("width", optionWidth).attr("height", 40)
          .attr("fill", boxFill).attr("stroke", boxStroke).attr("rx", 4).attr("ry", 4);

        if (accent){
          zoomContainerGlobal.append("rect")
            .attr("x", xOpt - 4).attr("y", yOpt).attr("width", 4).attr("height", 40).attr("fill", accent);
        }

        zoomContainerGlobal.append("text")
          .attr("x", xOpt + optionWidth/2).attr("y", yOpt + 25)
          .attr("text-anchor","middle").attr("font-size","14px").attr("fill", cText)
          .style("font-weight", search && item.name.toLowerCase().includes(search) ? "700" : "500")
          .text(item.name);

        ["Smart","Mod","Evo"].forEach((gamme, idx2) => {
          const type = item.gammes[gamme];
          const caseWidth = optionWidth / 3;
          const yPos = yOpt + 45;

          const baseColor = getColorForGamme(gamme);
          const fill = type === "included" ? baseColor : cBoxBg;

          zoomContainerGlobal.append("rect")
            .attr("x", xOpt + idx2 * caseWidth).attr("y", yPos)
            .attr("width", caseWidth).attr("height", 15)
            .attr("fill", fill).attr("stroke", cStroke);

          if (type === "optional") {
            zoomContainerGlobal.append("rect")
              .attr("x", xOpt + idx2 * caseWidth).attr("y", yPos)
              .attr("width", caseWidth).attr("height", 15)
              .attr("fill", "url(#hatch)").attr("pointer-events","none");
          }
        });
      });
    });

    gx += groupWidth + groupSpacing;
  });
}

/* ======= Legend & helpers ======= */
function drawLegend(svg, { cText, cStroke, cReqBg, cReqBorder, cIncBg, cIncBorder }){
  const legend = svg.append("g").attr("transform","translate(16,16)");
  const items = [
    { label: "Requis",        fill: cReqBg, border: cReqBorder, stripe: cReqBorder },
    { label: "Incompatible",  fill: cIncBg, border: cIncBorder, stripe: cIncBorder },
    { label: "Optionnelle",   fill: "url(#hatch)", border: cStroke, stripe: cStroke }
  ];
  items.forEach((it, i) => {
    const y = i * 22;
    legend.append("rect").attr("x", 0).attr("y", y).attr("width", 4).attr("height", 14).attr("fill", it.stripe);
    legend.append("rect").attr("x", 4).attr("y", y).attr("width", 18).attr("height", 14)
      .attr("fill", it.fill).attr("stroke", it.border).attr("rx", 2).attr("ry", 2);
    legend.append("text").attr("x", 26).attr("y", y + 11)
      .attr("fill", cText).attr("font-size", 12).text(it.label);
  });
}

function getColorForGamme(gamme){
  switch (gamme) {
    case "Smart": return cssVar("--c-green") || "#646363";
    case "Mod":   return cssVar("--c-blue")  || "#da261b";
    case "Evo":   return cssVar("--c-purple")|| "#304e9c";
    default: return "#64748b";
  }
}
function getName(group, id){
  return (data[group] || []).find(o => o.id === id)?.name || id;
}
function isOptionRequired(id){
  return Object.values(ruleSets).some(set =>
    Object.entries(set.rules || {}).some(([fromId, targets]) =>
      Object.entries(targets || {}).some(([toId, type]) => toId === id && type === "requires")
    )
  );
}
function isOptionIncompatible(id){
  return Object.values(ruleSets).some(set =>
    Object.entries(set.rules || {}).some(([fromId, targets]) =>
      Object.entries(targets || {}).some(([toId, type]) => toId === id && type === "incompatible")
    )
  );
}

export function setupRecenterButton(){
  document.getElementById("recenter-btn")?.addEventListener("click", () => recenterPreview());
}
export function recenterPreview(){
  const svg = d3.select("#preview");
  if (!zoomContainerGlobal || !zoomBehavior) return;
  const bbox = zoomContainerGlobal.node().getBBox();
  const w = +svg.attr("width"), h = +svg.attr("height");
  const scale = Math.min(w/(bbox.width+100), h/(bbox.height+100), 1);
  const x = (w - bbox.width*scale)/2 - bbox.x*scale;
  const y = (h - bbox.height*scale)/2 - bbox.y*scale;
  svg.transition().duration(500).call(zoomBehavior.transform, d3.zoomIdentity.translate(x,y).scale(scale));
}