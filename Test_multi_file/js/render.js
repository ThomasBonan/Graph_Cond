import * as setup from "./setup.js";

/* Helpers */
function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function cssNum(name, fallback=0){ const v = cssVar(name); const n = parseFloat(v); return Number.isFinite(n) ? n : fallback; }
const labelOf = (id) => setup.optionLabels?.[id] || id;

const itemGapY  = 100;

let zoomBehavior = null;
let zoomContainer = null;

export function renderNodes(nodes, selected, handleClick, isDisabledWithContext, currentRules, opts = {}) {
  const search = (opts.search || "").toLowerCase();

  const svg = d3.select("#graph");
  svg.selectAll("*").remove();

  // Palette
  const cText        = cssVar("--c-text") || "#0f172a";
  const cTextMuted   = cssVar("--c-text-muted") || "#666";
  const cTextHalo    = cssVar("--c-text-halo") || "transparent";
  const cTextHaloW   = cssNum("--c-text-halo-w", 0);
  const cStroke      = cssVar("--c-stroke") || "#cbd5e1";
  const cStrokeWeak  = cssVar("--c-stroke-weak") || "#d1d5db";
  const cStrokeGroup = cssVar("--c-stroke-group") || "#d1d5db";
  const cBoxBg       = cssVar("--c-box-bg") || "#fff";

  const cReqBg       = cssVar("--c-rule-req-bg") || "#dbeafe";
  const cReqBorder   = cssVar("--c-rule-req-border") || "#2563eb";
  const cIncBg       = cssVar("--c-rule-inc-bg") || "#fee2e2";
  const cIncBorder   = cssVar("--c-rule-inc-border") || "#dc2626";

  const cSmart       = cssVar("--c-green") || "#646363";
  const cMod         = cssVar("--c-blue")  || "#da261b";
  const cEvo         = cssVar("--c-purple")|| "#304e9c";

  // defs
  const defs = svg.append("defs");
  const pattern = defs.append("pattern").attr("id","hatch").attr("patternUnits","userSpaceOnUse").attr("width",6).attr("height",6);
  pattern.append("path").attr("d","M0,0 l6,6").attr("stroke",cTextMuted).attr("stroke-width",1);

  drawLegend(svg, { cText, cStroke, cReqBg, cReqBorder, cIncBg, cIncBorder, cTextHalo, cTextHaloW });

  // Zoom/Pan
  zoomContainer = svg.append("g").attr("id", "zoom-container");
  zoomBehavior = d3.zoom().scaleExtent([0.5, 2]).on("zoom", (e) => zoomContainer.attr("transform", e.transform));
  svg.call(zoomBehavior);

  // Choix du mode (hiérarchie si dispo)
  const hasHier = setup.groupedSubgroups && Object.keys(setup.groupedSubgroups).length > 0;

  // Layout params
  const subgroupWidth = 220;
  const padX = 30, padY = 30;
  const gapX = 16, gapY = 16;
  const maxCols = 3;
  const optionWidth = 200;
  const groupSpacing = 80;

  let gx = 50;

  if (hasHier) {
    // ===== Groupes + Sous-groupes (grille) =====
    Object.entries(setup.groupedSubgroups).forEach(([groupName, value]) => {
      const subgroups = value?.subgroups || {};
      const entries = Object.entries(subgroups).map(([sg, ids]) => ({ sg, ids }));

      const measured = entries
        .map(({ sg, ids }) => {
          const list = Array.isArray(ids) ? ids : [];
          const filtered = search ? list.filter(id => labelOf(id).toLowerCase().includes(search)) : list;
          const count = filtered.length;
          if (search && count === 0) return null;
          const height = Math.max(count * itemGapY + 40, 50);
          return { sg, list: filtered, height };
        })
        .filter(Boolean);

      if (measured.length === 0) { gx += 250; return; }

      const cols = Math.min(maxCols, Math.max(1, Math.ceil(Math.sqrt(measured.length))));
      const colHeights = new Array(cols).fill(0);
      const positions = [];
      measured.forEach(entry => {
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

      // Cadre + titre
      zoomContainer.append("rect")
        .attr("x", gx).attr("y", groupY)
        .attr("width", groupWidth).attr("height", groupHeight)
        .attr("fill","none").attr("stroke",cStrokeGroup).attr("stroke-dasharray","4,2").attr("rx",6).attr("ry",6);

      zoomContainer.append("text")
        .attr("x", gx + groupWidth/2).attr("y", groupY - 10)
        .text(groupName).attr("font-size",16).attr("font-weight","bold").attr("text-anchor","middle")
        .attr("fill", cText).style("paint-order","stroke fill").attr("stroke", cTextHalo).attr("stroke-width", cTextHaloW);

      // Sous-groupes
      positions.forEach(({ sg, list, height, x, y }) => {
        const sx = x;
        const sy = groupY + y;

        zoomContainer.append("rect")
          .attr("x", sx).attr("y", sy)
          .attr("width", subgroupWidth).attr("height", height)
          .attr("fill","none").attr("stroke",cStrokeWeak).attr("stroke-dasharray","4,2").attr("rx",6).attr("ry",6);

        zoomContainer.append("text")
          .attr("x", sx + subgroupWidth/2).attr("y", sy + 15)
          .text(sg).attr("font-size",13).attr("font-weight","bold").attr("text-anchor","middle").attr("fill", cText);

        list.forEach((id, i) => {
          drawOptionBox({
            id, x: sx + (subgroupWidth - optionWidth) / 2, y: sy + 30 + i * itemGapY,
            cText, cTextHalo, cTextHaloW, cBoxBg, cStroke, cReqBg, cReqBorder, cIncBg, cIncBorder,
            cSmart, cMod, cEvo, selected, handleClick, isDisabledWithContext, currentRules,
            label: labelOf(id), search
          });
        });
      });

      gx += groupWidth + groupSpacing;
    });
  } else {
    // ===== Fallback plat (grille triviale à 1 colonne) =====
    Object.entries(setup.groupedCriteria).forEach(([groupName, ids]) => {
      const list = Array.isArray(ids) ? ids : [];
      const filtered = search ? list.filter(id => labelOf(id).toLowerCase().includes(search)) : list;

      const groupHeight = filtered.length * itemGapY + 60;
      const groupWidth  = 220 + 2 * 30;
      const groupY = 60;

      zoomContainer.append("rect")
        .attr("x", gx).attr("y", groupY)
        .attr("width", groupWidth).attr("height", groupHeight)
        .attr("fill","none").attr("stroke",cStrokeGroup).attr("stroke-dasharray","4,2").attr("rx",6).attr("ry",6);

      zoomContainer.append("text")
        .attr("x", gx + groupWidth/2).attr("y", groupY - 10)
        .text(groupName).attr("font-size",16).attr("font-weight","bold").attr("text-anchor","middle")
        .attr("fill", cText).style("paint-order","stroke fill").attr("stroke", cTextHalo).attr("stroke-width", cTextHaloW);

      filtered.forEach((id, i) => {
        drawOptionBox({
          id, x: gx + (groupWidth - 200) / 2, y: groupY + 30 + i * itemGapY,
          cText, cTextHalo, cTextHaloW, cBoxBg, cStroke, cReqBg, cReqBorder, cIncBg, cIncBorder,
          cSmart, cMod, cEvo, selected, handleClick, isDisabledWithContext, currentRules,
          label: labelOf(id), search
        });
      });

      gx += groupWidth + groupSpacing;
    });
  }
}

/* ---- élément graphique d’une option (ID) ---- */
function drawOptionBox(ctx){
  const {
    id, x, y, cText, cTextHalo, cTextHaloW, cBoxBg, cStroke,
    cReqBg, cReqBorder, cIncBg, cIncBorder,
    cSmart, cMod, cEvo, selected, handleClick, isDisabledWithContext, currentRules,
    label, search
  } = ctx;

  const g = d3.select("#zoom-container");

  const disabled = !!isDisabledWithContext?.(id, selected, currentRules);
  const isSelected = selected.has(id);

  const ruleInfo = getRuleInfo(id, currentRules);
  let boxFill = cBoxBg, boxStroke = cStroke, accent = null;
  if (ruleInfo.requires)      { boxFill = cReqBg; boxStroke = cReqBorder; accent = cReqBorder; }
  else if (ruleInfo.incompatible) { boxFill = cIncBg; boxStroke = cIncBorder; accent = cIncBorder; }

  const opacity = search ? (label.toLowerCase().includes(search) ? 1 : 0.25) : 1;
  const strokeWidth = isSelected ? 2.5 : 1.0;
  const dash = disabled ? "4,2" : null;

  const box = g.append("rect")
    .attr("x", x).attr("y", y).attr("width", 200).attr("height", 48)
    .attr("fill", boxFill).attr("stroke", boxStroke).attr("stroke-dasharray", dash)
    .attr("rx", 6).attr("ry", 6).style("opacity", opacity).attr("stroke-width", strokeWidth)
    .style("cursor", disabled ? "not-allowed" : "pointer")
    .on("click", () => { if (!disabled) handleClick?.(id); });

  if (ruleInfo.requires || ruleInfo.incompatible) {
    box.append("title").text(ruleInfo.requires
      ? `Requis par: ${ruleInfo.requires.join(", ")}`
      : `Incompatible avec: ${ruleInfo.incompatible.join(", ")}`);
  }

  if (accent){
    g.append("rect").attr("x", x - 4).attr("y", y).attr("width", 4).attr("height", 48)
      .attr("fill", accent).style("opacity", opacity);
  }

  g.append("text")
    .attr("x", x + 100).attr("y", y + 30)
    .attr("text-anchor", "middle").attr("font-size", "14px")
    .attr("fill", cText)
    .style("font-weight", search && label.toLowerCase().includes(search) ? "700" : "500")
    .style("paint-order","stroke fill").attr("stroke", cTextHalo).attr("stroke-width", cTextHaloW).attr("stroke-linejoin","round")
    .style("opacity", opacity)
    .text(label);

  // Barres Smart / Mod / Evo
  const cases = [
    { key: "Smart", color: cSmart },
    { key: "Mod",   color: cMod },
    { key: "Evo",   color: cEvo },
  ];
  cases.forEach((c, idx) => {
    const st = setup.gammes?.[c.key]?.[id] || { included:false, optional:false };
    const caseWidth = 200 / 3;
    const yPos = y + 52;
    g.append("rect")
      .attr("x", x + idx * caseWidth).attr("y", yPos)
      .attr("width", caseWidth).attr("height", 14)
      .attr("fill", st.included ? c.color : cBoxBg).attr("stroke", cStroke)
      .style("opacity", opacity);
    if (st.optional) {
      g.append("rect")
        .attr("x", x + idx * caseWidth).attr("y", yPos)
        .attr("width", caseWidth).attr("height", 14)
        .attr("fill", "url(#hatch)").attr("pointer-events","none")
        .style("opacity", opacity);
    }
  });
}

/* ---- Legend & helpers ---- */
function drawLegend(svg, { cText, cStroke, cReqBg, cReqBorder, cIncBg, cIncBorder, cTextHalo, cTextHaloW }){
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
      .attr("fill", cText).attr("font-size", 12)
      .style("paint-order","stroke fill").attr("stroke", cTextHalo).attr("stroke-width", cTextHaloW)
      .attr("stroke-linejoin","round")
      .text(it.label);
  });
}

function getRuleInfo(id, currentRules){
  const res = { requires: null, incompatible: null };
  if (!currentRules || typeof currentRules !== "object") return res;
  const reqBy = [], incBy = [];
  for (const [from, rule] of Object.entries(currentRules)) {
    if (Array.isArray(rule.requires) && rule.requires.includes(id)) reqBy.push(labelOf(from));
    if (Array.isArray(rule.incompatible_with) && rule.incompatible_with.includes(id)) incBy.push(labelOf(from));
  }
  if (reqBy.length) res.requires = reqBy;
  if (incBy.length) res.incompatible = incBy;
  return res;
}

export function recenterGraph(){
  const svg = d3.select("#graph");
  const root = d3.select("#zoom-container");
  if (root.empty()) return;
  try {
    const bbox = root.node().getBBox();
    const svgWidth  = parseInt(svg.attr("width"));
    const svgHeight = parseInt(svg.attr("height"));
    if (!bbox || !isFinite(bbox.width) || !isFinite(bbox.height)) return;
    const scale = Math.min(svgWidth/(bbox.width+120), svgHeight/(bbox.height+120), 1);
    const tx = (svgWidth - bbox.width * scale) / 2 - bbox.x * scale;
    const ty = (svgHeight - bbox.height * scale) / 2 - bbox.y * scale;
    svg.transition().duration(500).call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  } catch {}
}