import { getDisableReason } from "./rules-engine.js";

let svg;
let nodeGroup;
let zoom;
let zoomContainer;

export function renderNodes(nodes, selected, onClick, isDisabled, currentRules) {
    console.log("Rendering", nodes.length, "nodes");
  if (!svg) {
  svg = d3.select("#graph");
  svg.append("g").attr("id", "zoom-container");

  zoomContainer = svg.select("#zoom-container");

  zoom = d3.zoom()
    .scaleExtent([0.5, 2])
    .on("zoom", (event) => {
      zoomContainer.attr("transform", event.transform);
    });

  svg.call(zoom);
}

  // Nettoyage
  zoomContainer.selectAll("*").remove();

  // Affichage des titres de groupe
  const groupTitles = Array.from(new Set(nodes.map(n => n.group)));

    const groupGap = 300;
    const nodeHeight = 40;
    const itemGap = 120;
    const paddingTop = 40;
    const paddingBottom = 40;
    const paddingSides = 40;

    groupTitles.forEach((groupName, groupIndex) => {
    const groupNodes = nodes.filter(n => n.group === groupName);
    if (groupNodes.length === 0) return;

    // Calculs dynamiques
    const centerX = groupNodes.reduce((acc, n) => acc + n.x, 0) / groupNodes.length;
    const boxWidth = 160;

    const minX = centerX - boxWidth / 2;
    const maxX = centerX + boxWidth / 2;
    const minY = Math.min(...groupNodes.map(n => n.y)) - paddingTop;
    const maxY = Math.max(...groupNodes.map(n => n.y)) + nodeHeight + paddingBottom;

    // Encadré du groupe
    zoomContainer.append("rect")
        .attr("class", "group-box")
        .attr("x", minX)
        .attr("y", minY)
        .attr("width", maxX - minX)
        .attr("height", maxY - minY)
        .attr("fill", "none")
        .attr("stroke", "#ccc")
        .attr("stroke-dasharray", "4,2")
        .attr("rx", 6).attr("ry", 6)
        .lower();

    // Titre du groupe – centré au-dessus
    zoomContainer.append("text")
        .attr("class", "group-title")
        .attr("x", (minX + maxX) / 2)
        .attr("y", minY - 10)
        .attr("text-anchor", "middle")
        .attr("font-size", "16px")
        .attr("font-weight", "bold")
        .text(groupName);
    });


  // Nœuds
  nodeGroup = zoomContainer.selectAll(".node")
    .data(nodes)
    .join("g")
    .attr("class", "node")
    .attr("transform", d => `translate(${d.x},${d.y})`);

  // Bloc principal avec interaction
  const mainRects = nodeGroup.append("rect")
    .attr("class", "main")
    .attr("x", -50)
    .attr("y", -20)
    .attr("width", 100)
    .attr("height", 40)
    .attr("fill", d => selected.has(d.id) ? "rgba(76,175,80,0.5)" : "#fff")
    .attr("stroke", "#000")
    .on("click", (event, d) => {
      onClick(d.id);
    });

  // Info-bulle
  mainRects.append("title").text(d => {
    if (!isDisabled(d.id)) return "";

    const reason = getDisableReason(d.id, selected, currentRules);
    const parts = [];

    if (reason.blocking.length > 0) {
      parts.push(`Conflit avec : ${reason.blocking.join(", ")}`);
    }
    if (reason.missing.length > 0) {
      parts.push(`Dépend de : ${reason.missing.join(", ")}`);
    }

    return parts.join(" | ");
  });

  // Couche d'état visuel (status : selected / incompatible / require...)
  nodeGroup.selectAll("rect.status")
    .data(d => [d])
    .join("rect")
    .attr("class", d => {
      if (selected.has(d.id)) return "status selected";

      const reason = isDisabled(d.id);
      if (reason) {
        const rule = currentRules[d.id];
        if (rule?.requires?.length && !rule.requires.every(req => selected.has(req))) {
          return "status blocked-require";
        }

        for (const sel of selected) {
          const ruleSel = currentRules[sel];
          if (ruleSel?.incompatible_with?.includes(d.id)) {
            return "status blocked-incompat";
          }
        }
      }

      return "status normal";
    })
    .attr("x", -50)
    .attr("y", -20)
    .attr("width", 100)
    .attr("height", 40)
    .attr("pointer-events", "none");

  // Texte principal
  nodeGroup.append("text")
    .attr("text-anchor", "middle")
    .attr("dy", 5)
    .text(d => d.id);

  // Indicateurs de gamme
  const gammeNames = ["PureBasic", "PureEnd", "PureSmart"];

  nodeGroup.each(function (d) {
    const gammeData = gammeNames.map((name, i) => ({
      gamme: name,
      type: d.gammeInfo[name]?.included
        ? "included"
        : d.gammeInfo[name]?.optional
        ? "optional"
        : "empty",
      index: i
    }));

    d3.select(this)
      .selectAll(".gamme-indicator")
      .data(gammeData)
      .join("rect")
      .attr("class", dd => `gamme-indicator ${dd.type} ${dd.gamme}`)
      .attr("fill", null)
      .attr("x", dd => -50 + dd.index * (100 / 3))
      .attr("y", 25)
      .attr("width", 100 / 3)
      .attr("height", 15);
  });

  // Adapter dynamiquement la hauteur du SVG
  const allYs = nodes.map(n => n.y);
  const maxY = Math.max(...allYs);
  svg.attr("height", maxY + 150);
  setupRecenterButton();
}


function setupRecenterButton() {
  const button = document.getElementById("recenter-graph");
  if (!button || !zoomContainer || !zoom) return;

  button.onclick = () => {
    const bbox = zoomContainer.node().getBBox();
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
      .call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
  };
}