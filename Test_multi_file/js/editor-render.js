import { data } from './editor-data.js';
import { ruleSets, groupedCriteria } from './editor-data.js';

let zoomContainerGlobal = null;
let zoomBehavior = null;
const groupGap = 300;
const itemGap = 100;

export function renderPreview() {
  const svg = d3.select("#preview");
  svg.selectAll("*").remove();

  const defs = svg.append("defs");
  defs.append("pattern")
    .attr("id", "hatch")
    .attr("patternUnits", "userSpaceOnUse")
    .attr("width", 6)
    .attr("height", 6)
    .append("path")
    .attr("d", "M0,0 l6,6")
    .attr("stroke", "#666")
    .attr("stroke-width", 1);

  zoomContainerGlobal = svg.append("g").attr("id", "zoom-container");

  zoomBehavior = d3.zoom()
    .scaleExtent([0.5, 2])
    .on("zoom", (event) => {
      zoomContainerGlobal.attr("transform", event.transform);
    });

  svg.call(zoomBehavior);


  let gx = 50;

  // On utilise groupedCriteria pour parcourir groupes + sous-groupes
Object.entries(groupedCriteria).forEach(([groupName, groupObj]) => {
  if (!groupObj || !groupObj.subgroups) return;

  // CALCUL dynamique des tailles de sous-groupes
  const subgroups = groupObj.subgroups;
  const groupPadding = 30;
  const groupPaddingVertical = 30;
  const subgroupWidths = [];
  const subgroupHeights = [];

  // 1. Récupère largeur/hauteur de chaque sous-groupe pour s'adapter (optionnel ici)
  Object.entries(subgroups).forEach(([subName, optionNames]) => {
    const subgroupWidth = 140;
    const subgroupHeight = optionNames.length * itemGap + 40;
    subgroupWidths.push(subgroupWidth);
    subgroupHeights.push(subgroupHeight);
  });

  // 2. Calcule la largeur max et la hauteur totale
  const maxSubgroupWidth = Math.max(...subgroupWidths, 140); // fallback 140px si vide
  const groupWidth = maxSubgroupWidth + 2 * groupPadding;
  const totalSubgroupsHeight = subgroupHeights.reduce((a, b) => a + b, 0);
  const groupGapVertical = 10;
  const groupHeight = totalSubgroupsHeight + (subgroupHeights.length - 1) * groupGapVertical + 2 * groupPaddingVertical;

  const groupY = 60;
  let currentY = groupY + groupPaddingVertical;

  // Cadre du groupe
  zoomContainerGlobal.append("rect")
    .attr("x", gx)
    .attr("y", groupY)
    .attr("width", groupWidth)
    .attr("height", groupHeight)
    .attr("fill", "none")
    .attr("stroke", "#ccc")
    .attr("stroke-dasharray", "4,2")
    .attr("rx", 6).attr("ry", 6);

  // Titre centré du groupe
  zoomContainerGlobal.append("text")
    .attr("x", gx + groupWidth / 2)
    .attr("y", groupY - 10)
    .text(groupName)
    .attr("font-size", 16)
    .attr("font-weight", "bold")
    .attr("text-anchor", "middle");

  // DESSINE chaque sous-groupe bien centré
  Object.entries(subgroups).forEach(([subName, optionNames], index) => {
    if (optionNames.length === 0) return;

    const subgroupWidth = 140;
    const subgroupHeight = optionNames.length * itemGap + 40;
    const subgroupX = gx + (groupWidth - subgroupWidth) / 2;
    const subgroupY = currentY;
    const optionWidth = 90;

    // Cadre du sous-groupe
    zoomContainerGlobal.append("rect")
      .attr("x", subgroupX)
      .attr("y", subgroupY)
      .attr("width", subgroupWidth)
      .attr("height", subgroupHeight)
      .attr("fill", "none")
      .attr("stroke", "#bbb")
      .attr("stroke-dasharray", "4,2")
      .attr("rx", 6).attr("ry", 6);

    // Titre sous-groupe
    zoomContainerGlobal.append("text")
      .attr("x", subgroupX + subgroupWidth / 2)
      .attr("y", subgroupY + 15)
      .text(subName)
      .attr("font-size", 13)
      .attr("font-weight", "bold")
      .attr("text-anchor", "middle");

  optionNames.forEach((name, i) => {
    const item = data[groupName]?.find(o => o.name === name);
    if (!item) return;

    const y = subgroupY + 30 + i * itemGap;
    const x = subgroupX + (subgroupWidth - optionWidth) / 2;

    const isRequired = isOptionRequired(item.name);
    const isIncompatible = isOptionIncompatible(item.name);
    const bgColor = isRequired ? "#c7d2fe" : isIncompatible ? "#fecaca" : "#fff";

    zoomContainerGlobal.append("rect")
      .attr("x", x)
      .attr("y", y)
      .attr("width", optionWidth)
      .attr("height", 40)
      .attr("fill", bgColor)
      .attr("stroke", "#333");

    zoomContainerGlobal.append("text")
      .attr("x", x + optionWidth / 2)
      .attr("y", y + 25)
      .attr("text-anchor", "middle")
      .attr("font-size", "14px")
      .text(item.name);

    ["Smart", "Mod", "Evo"].forEach((gamme, idx) => {
      const type = item.gammes[gamme];
      const caseWidth = optionWidth / 3;
      const yPos = y + 45;

      const baseColor = getColorForGamme(gamme);
      const fill = type === "included" ? baseColor : "#fff";

      zoomContainerGlobal.append("rect")
        .attr("x", x + idx * caseWidth)
        .attr("y", yPos)
        .attr("width", caseWidth)
        .attr("height", 15)
        .attr("fill", fill)
        .attr("stroke", "#333");

      if (type === "optional") {
        zoomContainerGlobal.append("rect")
          .attr("x", x + idx * caseWidth)
          .attr("y", yPos)
          .attr("width", caseWidth)
          .attr("height", 15)
          .attr("fill", "url(#hatch)")
          .attr("pointer-events", "none");
      }
    });
  });

  currentY += subgroupHeight + 10; // empilement vertical
});

    gx += groupGap;
  });
}

function computeGroupHeight(groupObj) {
  const subgroups = groupObj.subgroups || {};
  const totalHeight = Object.values(subgroups).reduce((sum, optionNames) => {
    return sum + (optionNames.length * itemGap + 40) + 10;
  }, 0);
  return totalHeight;
}


function getColorForGamme(gamme) {
  switch (gamme) {
    case "Smart": return "#6d28d9"; // violet
    case "Mod": return "#2dd4bf";   // turquoise
    case "Evo": return "#4ade80";   // vert
    default: return "#ccc";
  }
}

export function setupRecenterButton() {
  const svg = d3.select("#preview");

  document.getElementById("recenter-btn").addEventListener("click", () => {
    if (!zoomContainerGlobal || !zoomBehavior) return;

    const bbox = zoomContainerGlobal.node().getBBox();
    const svgWidth = parseInt(svg.attr("width"));
    const svgHeight = parseInt(svg.attr("height"));

    const scale = Math.min(
      svgWidth / (bbox.width + 100),
      svgHeight / (bbox.height + 100),
      1
    );

    const x = (svgWidth - bbox.width * scale) / 2 - bbox.x * scale;
    const y = (svgHeight - bbox.height * scale) / 2 - bbox.y * scale;

    svg.transition()
      .duration(500)
      .call(zoomBehavior.transform, d3.zoomIdentity.translate(x, y).scale(scale));
  });
}

function isOptionRequired(name) {
  return Object.values(ruleSets).some(set =>
    Object.values(set.rules).some(r =>
      Object.entries(r).some(([target, type]) =>
        target === name && type === "requires"
      )
    )
  );
}

function isOptionIncompatible(name) {
  return Object.values(ruleSets).some(set =>
    Object.values(set.rules).some(r =>
      Object.entries(r).some(([target, type]) =>
        target === name && type === "incompatible"
      )
    )
  );
}