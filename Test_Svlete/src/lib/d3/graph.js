// src/lib/d3/graph.js
// - Surface identique éditeur/commerciale (le SVG prend la taille visible du conteneur)
// - Recoloration instantanée quand le thème (data-theme) change
// - Dépendances k/n, bords "obligatoire", tooltip, etc.
import * as d3 from 'd3';

const _zoomState = new WeakMap();

const NODE_PAD_X = 10, NODE_PAD_Y = 8, NODE_LINE_H = 14, GAMME_BAR_GAP = 4;
const GT_PAD_X = 6,  GT_PAD_Y = 2,  GT_LINE_H   = 14, GT_GAP        = 6;
const SGT_PAD_X = 8,  SGT_PAD_Y = 4,  SGT_LINE_H  = 13, SGT_EXTRA_GAP = 6;

/* ------------ helpers texte (wrap) ------------ */
function wrapLabel(textSel, label, baseX, baseY, innerW, {
  align = 'middle', padX = NODE_PAD_X, padY = NODE_PAD_Y, lineH = NODE_LINE_H
} = {}) {
  const anchor = align === 'middle' ? 'middle' : (align === 'right' ? 'end' : 'start');
  const xBase  = align === 'middle' ? (baseX + padX + innerW/2)
              : align === 'right'  ? (baseX + padX + innerW)
              : (baseX + padX);
  textSel.text('').attr('text-anchor', anchor);
  let line = [], lineNo = 0;
  const makeTspan = () => textSel.append('tspan')
    .attr('x', xBase)
    .attr('y', lineNo === 0 ? (baseY + padY + lineH * 0.85) : null)
    .attr('dy', lineNo === 0 ? null : lineH);
  let tsp = makeTspan();
  const words = tokenize(label);
  for (const w of words) {
    if (w === '\n') { tsp.text(line.join(' ')); line = []; lineNo++; tsp = makeTspan(); continue; }
    line.push(w);
    tsp.text(line.join(' '));
    if (tsp.node().getComputedTextLength() > innerW) {
      if (line.length === 1) {
        const parts = chunkWord(w, innerW, tsp);
        if (parts.length) { tsp.text(parts.shift()); for (const p of parts) { lineNo++; tsp = makeTspan().text(p); } line = []; continue; }
      }
      line.pop(); tsp.text(line.join(' '));
      line = [w]; lineNo++; tsp = makeTspan().text(w);
      if (tsp.node().getComputedTextLength() > innerW) {
        const parts = chunkWord(w, innerW, tsp);
        tsp.text(parts.shift() || ''); for (const p of parts) { lineNo++; tsp = makeTspan().text(p); } line = [];
      }
    }
  }
  const h = Math.ceil(textSel.node().getBBox().height);
  return h + padY * 2;
}
function tokenize(s) {
  const parts = [];
  s.split(/\n/).forEach((line, i, arr) => {
    line.split(/(\s+|-)/).forEach(tok => { if (tok) parts.push(tok.trim()==='' ? ' ' : tok); });
    if (i < arr.length - 1) parts.push('\n');
  });
  return parts.reduce((acc,t)=>{ if(t==='\n'){acc.push(t);return acc;} const last=acc[acc.length-1]; if(last===' '&&t===' ')return acc; acc.push(t); return acc;},[]);
}
function chunkWord(word, maxW, tsp) {
  const out=[]; let i=0;
  while (i<word.length) {
    let lo=1, hi=word.length-i, best=1;
    while (lo<=hi) {
      const mid=(lo+hi)>>1;
      const slice = word.slice(i,i+mid) + (i+mid<word.length ? '-' : '');
      tsp.text(slice);
      if (tsp.node().getComputedTextLength() <= maxW) { best=mid; lo=mid+1; } else { hi=mid-1; }
    }
    const piece = word.slice(i,i+best); i += best;
    out.push(i<word.length ? piece + '-' : piece);
  }
  return out;
}

/* ------------ dépendances k/n ------------ */
function normalizedGroups(spec) {
  const out = [];
  const groups = Array.isArray(spec?.requires_groups) ? spec.requires_groups : [];
  for (const g of groups) {
    const of = Array.isArray(g?.of) ? Array.from(new Set(g.of)) : [];
    const max = of.length;
    const min = Math.max(0, Math.min(Number.isFinite(+g?.min) ? +g.min : max, max));
    out.push({ min, of });
  }
  // legacy requires => groupe ALL
  const legacy = Array.isArray(spec?.requires) ? spec.requires.slice() : [];
  if (legacy.length && out.length === 0) {
    out.push({ min: legacy.length, of: Array.from(new Set(legacy)) });
  }
  return out;
}
function groupSatisfied(g, selected) {
  const of = g.of || [];
  const min = Math.max(0, Math.min(Number.isFinite(+g.min) ? +g.min : of.length, of.length));
  if (min === 0) return true;
  let count = 0;
  for (const id of of) if (selected.has(id)) count++;
  return count >= min;
}
function requiresSatisfied(spec, selected) {
  const allGroups = normalizedGroups(spec);
  return allGroups.every(g => groupSatisfied(g, selected));
}
function groupsMissing(spec, selected) {
  const allGroups = normalizedGroups(spec);
  return allGroups.map(g => {
    const of = g.of || [];
    const min = Math.max(0, Math.min(Number.isFinite(+g.min) ? +g.min : of.length, of.length));
    let count = 0; const missing = [];
    for (const id of of) {
      if (selected.has(id)) count++; else missing.push(id);
    }
    return { min, of, count, missing, ok: count >= min };
  });
}

/* ===================================================== */
export function renderGraph(svgEl, ctx) {
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  const st = _zoomState.get(svgEl) || { transform: null, userZoomed: false };
  const {
    search = '',
    collapsed = {},
    grouped = {},
    gammes = { Smart:{}, Mod:{}, Evo:{} },
    rules = {},
    optionLabels = {},
    selected,
    interactive = true,     // même traitement pour la surface
    onToggleGroup = () => {},
    onToggleSubgroup = () => {},
    onToggleSelect = () => {},
    preserveZoom = true
  } = ctx;

  svg.style('touch-action', 'none');
  svg.on('dragover.dropzone', (e) => e.preventDefault());
  svg.on('drop.dropzone',     (e) => e.preventDefault());

  // === clé : taille du SVG = taille VISIBLE (bbox du nœud + fallback parent)
  const ensureSize = (el) => {
    let w = 0, h = 0;
    try {
      const r = el.getBoundingClientRect();
      w = Math.floor(r.width);
      h = Math.floor(r.height);
    } catch {}
    if (!w || !h) {
      const p = el.parentElement;
      if (p) { w = Math.max(w, p.clientWidth || 0); h = Math.max(h, p.clientHeight || 0); }
    }
    if (!w) w = parseInt(el.getAttribute('width'))  || 1200;
    if (!h) h = parseInt(el.getAttribute('height')) || 800;
    d3.select(el).attr('width', w).attr('height', h);
    return [w, h];
  };
  let [vw, vh] = ensureSize(svgEl);

  const subgroupWidth = 220, optionWidth = 200;
  const padX=30, padY=30, gapX=16, itemGapY=100, groupSpacing=80;

  // store selected
  let selectedValue = new Set();
  let unsubscribeSelected = null;
  if (selected && typeof selected.subscribe === 'function') {
    unsubscribeSelected = selected.subscribe(v => { selectedValue = v instanceof Set ? v : new Set(v || []); });
  } else if (selected && typeof selected.has === 'function') {
    selectedValue = selected;
  }

  const s = (search || '').toLowerCase();

  const cssVar = (v, d) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || d;
  const readPalette = () => ({
    cText: cssVar('--c-text','#0f172a'),
    cTextMuted: cssVar('--c-text-muted','#8b93a7'),
    cStroke: cssVar('--c-stroke','#d0d7e2'),
    cStrokeWeak: cssVar('--c-stroke-weak','#e2e8f0'),
    cStrokeGroup: cssVar('--c-stroke-group','#cbd5e1'),
    cBoxBg: cssVar('--c-box-bg','#ffffff'),
    cReqBg: cssVar('--c-rule-req-bg','#f1f5f9'),
    cReqBorder: cssVar('--c-rule-req-border','#94a3b8'),
    cIncBg: cssVar('--c-rule-inc-bg','#fee2e2'),
    cIncBorder: cssVar('--c-rule-inc-border','#dc2626'),
    cMandBorder: cssVar('--c-rule-obl-border','#0ea5e9') || cssVar('--c-rule-mand-border','#0ea5e9'),
    cSmart: cssVar('--c-smart','#646363'),
    cMod: cssVar('--c-mod','#da261b'),
    cEvo: cssVar('--c-evo','#304e9c'),
    halo: cssVar('--c-text-halo','transparent'),
    haloW: parseFloat(cssVar('--c-text-halo-w','0'))||0,
    cSelBg: cssVar('--c-selected-bg', '#f0ecff'),
    cSelBorder: cssVar('--c-selected-border', '#5a49c8')
  });
  let pal = readPalette();

  /* ---------- defs ---------- */
  const defs = svg.append('defs');
  const hatch = defs.append('pattern').attr('id','hatch').attr('patternUnits','userSpaceOnUse').attr('width',6).attr('height',6);
  const hatchPath = hatch.append('path').attr('d','M0,0 l6,6').attr('stroke',pal.cTextMuted).attr('stroke-width',1);
  defs.append('style').text(`@keyframes blink {0%{opacity:1}50%{opacity:.25}100%{opacity:1}} .blink{animation:blink .9s ease-in-out 0s 1}`);
  const glow = defs.append('filter').attr('id','selglow');
  const glowDrop = glow.append('feDropShadow').attr('dx',0).attr('dy',0).attr('stdDeviation',2.5).attr('flood-color',pal.cSelBorder).attr('flood-opacity',0.6);

  /* ---------- calques ---------- */
  const rootG   = svg.append('g').attr('id','zoom-container');

  // Rect de capture = TAILLE VIEWPORT
  const capture = rootG.append('rect')
    .attr('class','bg-capture')
    .attr('x', 0).attr('y', 0)
    .attr('width', vw).attr('height', vh)
    .attr('fill', 'transparent')
    .style('pointer-events', 'all');

  const contentG = rootG.append('g').attr('id','content');
  const edgesG   = contentG.append('g').attr('id','edges-mand');

  /* ---------- zoom/pan ---------- */
  const zoom = d3.zoom()
    .scaleExtent([0.5, 2])
    .on('zoom', (e) => {
      rootG.attr('transform', e.transform);
      st.transform = e.transform;
      st.userZoomed = true;
      _zoomState.set(svgEl, st);
    });
  svg.call(zoom).on('dblclick.zoom', null);
  svg.on('recenter', () => recenter());

  /* ---------- légende ---------- */
  const legend = svg.append('g').attr('transform','translate(16,16)');
  const legendItems = [
    {key:'req', label:'Bloqué par dépendance',  boxFill:()=>pal.cReqBg,  boxStroke:()=>pal.cReqBorder, stripe:()=>pal.cReqBorder},
    {key:'inc', label:'Incompatible',           boxFill:()=>pal.cIncBg,  boxStroke:()=>pal.cIncBorder, stripe:()=>pal.cIncBorder},
    {key:'man', label:'Obligatoire',            boxFill:()=>'none',      boxStroke:()=>pal.cMandBorder, stripe:()=>pal.cMandBorder},
    {key:'opt', label:'Optionnelle (gamme)',    boxFill:()=>'url(#hatch)', boxStroke:()=>pal.cStroke,   stripe:()=>pal.cStroke}
  ];
  legendItems.forEach((it,i)=>{
    const y = i*22;
    legend.append('rect').attr('class',`legend-stripe ${it.key}`).attr('x',0).attr('y',y).attr('width',4).attr('height',14).attr('fill',it.stripe());
    legend.append('rect').attr('class',`legend-box ${it.key}`).attr('x',4).attr('y',y).attr('width',18).attr('height',14)
      .attr('fill',it.boxFill()).attr('stroke',it.boxStroke()).attr('rx',2).attr('ry',2);
    legend.append('text').attr('class','legend-label').attr('x',26).attr('y',y+11).attr('fill',pal.cText).attr('font-size',12)
      .style('paint-order','stroke fill').attr('stroke',pal.halo).attr('stroke-width',pal.haloW).text(it.label);
  });

  /* ---------- flash + tooltip ---------- */
  const nodeMap = new Map();
  const nodePos = new Map();
  svg.on('flash', (event) => {
    const ids = event?.detail || [];
    ids.forEach((id) => {
      const ref = nodeMap.get(id);
      if (!ref) return;
      const sel = typeof ref.classed === 'function' ? ref : d3.select(ref);
      if (!sel || !sel.node()) return;
      sel.classed('blink', true);
      setTimeout(() => sel.classed('blink', false), 900);
    });
  });

  let tipEl = document.getElementById('tooltip');
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.id='tooltip'; tipEl.setAttribute('aria-hidden','true'); tipEl.style.position='fixed'; tipEl.style.pointerEvents='none'; document.body.appendChild(tipEl); }
  const showTip = (lines,x,y)=>{ tipEl.replaceChildren(...lines.map(t=>{const p=document.createElement('div');p.textContent=t;return p;})); tipEl.style.left=x+'px'; tipEl.style.top=y+'px'; tipEl.classList.add('visible'); tipEl.setAttribute('aria-hidden','false'); };
  const hideTip = ()=>{ tipEl.classList.remove('visible'); tipEl.setAttribute('aria-hidden','true'); };

  /* ======================= DESSIN ======================= */
  const gxStart = 50;
  let gx=gxStart, drawn=0;

  for (const [groupName, v] of Object.entries(grouped)) {
    const subs = v?.subgroups || {};
    const entries = [
      ...Object.entries(subs).map(([sg, ids]) => ({ sg, ids })),
      ...(Array.isArray(v?.root) && v.root.length ? [{ sg: '__root', ids: v.root }] : [])
    ];

    const groupCollapsed = !!collapsed[groupName]?.__group;

    const filteredEntries = entries.map(({ sg, ids }) => {
      const list = ids || [];
      const filtered = s ? list.filter(id => (optionLabels[id] || id).toLowerCase().includes(s)) : list;
      const count = filtered.length;
      const height = Math.max(count * itemGapY + 40, 50);
      const key = sg === '__root' ? '__root' : sg;
      const collapsedSG = !!collapsed[groupName]?.[key];
      return { sg, key, ids: filtered, count, height, collapsed: collapsedSG };
    }).filter(e => !s || e.count > 0);

    if (groupCollapsed) {
      const groupWidth  = 1 * subgroupWidth + 2 * padX;
      const groupHeight = 2 * padY;
      const groupY = 60;

      contentG.append('rect')
        .attr('class','group-box')
        .attr('x',gx).attr('y',groupY)
        .attr('width',groupWidth).attr('height',groupHeight)
        .attr('fill','none').attr('stroke',pal.cStrokeGroup)
        .attr('stroke-dasharray','4,2').attr('rx',6).attr('ry',6);

      const gTitle = contentG.append('text')
        .attr('class','group-title')
        .attr('font-size',16).attr('font-weight','bold')
        .style('cursor','pointer').style('paint-order','stroke fill')
        .attr('stroke',pal.halo).attr('stroke-width',pal.haloW)
        .attr('fill', pal.cText)
        .on('click',()=> onToggleGroup(groupName));

      const gTitleInnerW = groupWidth - GT_PAD_X * 2;
      const gTitleH = wrapLabel(gTitle, groupName, gx, groupY, gTitleInnerW, {
        align:'middle', padX: GT_PAD_X, padY: GT_PAD_Y, lineH: GT_LINE_H
      });
      gTitle.attr('transform', `translate(0, ${-gTitleH - GT_GAP})`);

      gx += groupWidth + groupSpacing;
      continue;
    }

    if (filteredEntries.length === 0) { gx += 250; continue; }

    const cols = filteredEntries.length;
    const positions = filteredEntries.map((entry, i) => {
      const boxH = (entry.collapsed ? 40 : entry.height);
      const x = gx + padX + i * (subgroupWidth + gapX);
      const y = padY;
      return { ...entry, x, y, boxH };
    });

    const innerWidth  = cols * subgroupWidth + (cols - 1) * gapX;
    const innerHeight = Math.max(...positions.map(p => p.boxH));
    const groupWidth  = innerWidth + 2 * padX;
    const groupHeight = innerHeight + 2 * padY;
    const groupY = 60;

    contentG.append('rect').attr('class','group-box')
      .attr('x',gx).attr('y',groupY).attr('width',groupWidth).attr('height',groupHeight)
      .attr('fill','none').attr('stroke',pal.cStrokeGroup).attr('stroke-dasharray','4,2').attr('rx',6).attr('ry',6);

    const gTitle = contentG.append('text')
      .attr('class','group-title')
      .attr('font-size',16).attr('font-weight','bold')
      .style('cursor','pointer').style('paint-order','stroke fill')
      .attr('stroke',pal.halo).attr('stroke-width',pal.haloW)
      .attr('fill', pal.cText)
      .on('click',()=> onToggleGroup(groupName));
    const gTitleInnerW = groupWidth - GT_PAD_X * 2;
    const gTitleH = wrapLabel(gTitle, groupName, gx, groupY, gTitleInnerW, {
      align:'middle', padX: GT_PAD_X, padY: GT_PAD_Y, lineH: GT_LINE_H
    });
    gTitle.attr('transform', `translate(0, ${-gTitleH - GT_GAP})`);

    positions.forEach(({ sg, key, ids, x, y, boxH, height, collapsed: isCollapsed }) => {
      const sx=x, sy=groupY+y, h=isCollapsed?40:(boxH ?? height);
      contentG.append('rect').attr('class','subgroup-box')
        .attr('x',sx).attr('y',sy).attr('width',subgroupWidth).attr('height',h)
        .attr('fill','none').attr('stroke',pal.cStrokeWeak).attr('stroke-dasharray','4,2').attr('rx',6).attr('ry',6);

      let headerH = 0;
      if (sg !== '__root') {
        const sgTitle = contentG.append('text')
          .attr('class','subgroup-title')
          .attr('font-size',13).attr('font-weight','bold')
          .style('cursor','pointer').style('paint-order','stroke fill')
          .attr('stroke',pal.halo).attr('stroke-width',pal.haloW)
          .attr('fill', pal.cText);

        const sgtInnerW = subgroupWidth - SGT_PAD_X * 2;
        const sgtH = wrapLabel(sgTitle, sg, sx, sy, sgtInnerW, {
          align:'middle', padX: SGT_PAD_X, padY: SGT_PAD_Y, lineH: SGT_LINE_H
        });

        headerH = Math.max(20, sgtH + SGT_EXTRA_GAP);
        sgTitle.on('click',()=> onToggleSubgroup(groupName, key));
      } else {
        headerH = 12;
      }

      if (isCollapsed) return;

      ids.forEach((id,i)=>{
        drawn++;
        const label = optionLabels[id] || id;
        const yOpt = sy + headerH + i*itemGapY;
        const xOpt = sx + (subgroupWidth - optionWidth)/2;

        const spec = rules[id] || {};
        const mans = spec.mandatory || [];

        // blocage via k/n
        const depsOk = requiresSatisfied(spec, selectedValue);
        const missingGroups = groupsMissing(spec, selectedValue).filter(g => !g.ok);
        const blocked = !depsOk;

        // incompatibilités
        const incompatibleWithSel = Array.from(selectedValue).some(s =>
          (spec?.incompatible_with || []).includes(s) ||
          (rules[s]?.incompatible_with || []).includes(id)
        );
        const incompatibleAny = ((spec?.incompatible_with || []).length > 0) ||
                                Object.values(rules).some(r => (r?.incompatible_with || []).includes(id));

        const isSel = selectedValue?.has?.(id);
        const canClick = interactive && !blocked && !incompatibleWithSel;

        let status = 'normal';
        if (blocked) status = 'blocked';
        else if (incompatibleAny && !canClick) status = 'incompatible';
        if (isSel && status === 'normal') status = 'selected';

        let boxFill = pal.cBoxBg, boxStroke = pal.cStroke, filterSel = null;
        if (status === 'blocked') { boxFill=pal.cReqBg; boxStroke=pal.cReqBorder; }
        else if (status === 'incompatible') { boxFill=pal.cIncBg; boxStroke=pal.cIncBorder; }
        else if (status === 'selected') { boxFill=pal.cSelBg; boxStroke=pal.cSelBorder; filterSel='url(#selglow)'; }

        const strokeW = isSel ? 3.0 : 1.0;
        const faded = isSel ? 1 : (s ? (label.toLowerCase().includes(s) ? 1 : 0.25) : 1);

        const g = contentG.append('g').attr('data-id', id).attr('data-status', status);
        nodeMap.set(id, g);

        const cursor = canClick ? 'pointer' : ((blocked || incompatibleWithSel) ? 'not-allowed' : 'default');

        const rect = g.append('rect')
          .attr('class','node-bg')
          .attr('x',xOpt).attr('y',yOpt)
          .attr('width',optionWidth).attr('height', 1)
          .attr('fill',boxFill).attr('stroke',boxStroke)
          .attr('rx',6).attr('ry',6).attr('stroke-width',strokeW)
          .attr('filter', filterSel || null)
          .style('opacity',faded)
          .style('cursor',cursor)
          .on('click', () => { if (canClick) onToggleSelect(id); })
          .on('mousemove', (e)=>{
            const lines = [];
            if (mans.length) lines.push(`Obligatoire: ${mans.map(r=>optionLabels[r]||r).join(', ')}`);

            const ng = normalizedGroups(spec);
            if (ng.length) {
              lines.push('Dépendances :');
              ng.forEach((g, idx) => {
                const ms = missingGroups.find(x => x.of.join('|') === g.of.join('|') && x.min === Math.max(0, Math.min(Number.isFinite(+g.min)?+g.min:g.of.length, g.of.length)));
                const countSel = (g.of || []).filter(x => selectedValue.has(x)).length;
                const lhs = (g.min === (g.of||[]).length) ? 'Tous' : (g.min === 1 ? '≥1' : `≥${g.min}`);
                const base = `• ${lhs} parmi (${(g.of||[]).map(x=>optionLabels[x]||x).join(', ')}) — ${countSel}/${(g.of||[]).length}`;
                if (ms && !ms.ok) lines.push(base + ` — manquants : ${(ms.missing||[]).map(x=>optionLabels[x]||x).join(', ')}`);
                else lines.push(base + ' — ok');
              });
            }

            const incompatibleWith = Array.from(selectedValue).filter(s =>
              (spec?.incompatible_with || []).includes(s) ||
              (rules[s]?.incompatible_with || []).includes(id)
            );
            if (incompatibleWith.length) lines.push(`Incompatible avec: ${incompatibleWith.map(x=>optionLabels[x]||x).join(', ')}`);

            const sLine = (gName, map) => {
              const st = (map?.[id]) || { included:false, optional:false };
              return `${gName}: ${st.included ? 'Présent' : (st.optional ? 'Optionnel' : 'Absent')}`;
            };
            lines.push(sLine('Smart', gammes.Smart));
            lines.push(sLine('Mod',   gammes.Mod));
            lines.push(sLine('Evo',   gammes.Evo));

            const { clientX, clientY } = e;
            showTip(lines, Math.min(clientX, window.innerWidth-10), Math.min(clientY, window.innerHeight-10));
          })
          .on('mouseleave', ()=> hideTip());

        if (canClick && !isSel) {
          rect.on('mouseenter', function(){ d3.select(this).attr('stroke-width', 2).attr('stroke', pal.cSelBorder); })
              .on('mouseleave', function(){ d3.select(this).attr('stroke-width', strokeW).attr('stroke', boxStroke); });
        }

        const txt = g.append('text')
          .attr('class','node-label')
          .attr('font-size','14px').attr('fill',pal.cText)
          .style('paint-order','stroke fill').attr('stroke',pal.halo).attr('stroke-width',pal.haloW)
          .style('font-weight', s && label.toLowerCase().includes(s) ? '700' : '500')
          .style('opacity',faded).style('pointer-events','none');

        const innerW = optionWidth - NODE_PAD_X*2;
        const labelBlockH = wrapLabel(txt, label, xOpt, yOpt, innerW, {
          align:'middle', padX:NODE_PAD_X, padY:NODE_PAD_Y, lineH:NODE_LINE_H
        });

        const rectH = Math.max(32, labelBlockH);
        rect.attr('height', rectH);

        // Barres Smart/Mod/Evo
        const caseW = optionWidth/3;
        const yPos  = yOpt + rectH + GAMME_BAR_GAP;
        [{key:'Smart', color:pal.cSmart}, {key:'Mod', color:pal.cMod}, {key:'Evo', color:pal.cEvo}].forEach((c, idx) => {
          const st = (gammes?.[c.key] || {})[id] || { included:false, optional:false };
          const bar = g.append('rect')
            .attr('class','gbar')
            .attr('data-key', c.key)
            .attr('data-included', st.included ? '1' : '0')
            .attr('x', xOpt + idx*caseW).attr('y', yPos).attr('width', caseW).attr('height', 14)
            .attr('fill', st.included ? c.color : pal.cBoxBg).attr('stroke', pal.cStroke)
            .style('opacity', 1).style('pointer-events','none');
          if (st.optional) {
            g.append('rect')
              .attr('x', xOpt + idx*caseW).attr('y', yPos).attr('width', caseW).attr('height', 14)
              .attr('fill','url(#hatch)').attr('pointer-events','none').style('opacity', 1);
          }
        });

        nodePos.set(id, { cx: xOpt + optionWidth/2, cy: yOpt + rectH/2 });
      });
    });

    gx += groupWidth + groupSpacing;
  }

  /* ---------- arêtes obligatoires ---------- */
  for (const [fromId, spec] of Object.entries(rules || {})) {
    const list = spec?.mandatory || [];
    const from = nodePos.get(fromId);
    if (!from || !Array.isArray(list) || list.length === 0) continue;
    for (const toId of list) {
      const to = nodePos.get(toId);
      if (!to) continue;
      const dx = (to.cx - from.cx) * 0.5;
      const d = `M ${from.cx} ${from.cy} C ${from.cx + dx} ${from.cy}, ${to.cx - dx} ${to.cy}, ${to.cx} ${to.cy}`;
      edgesG.append('path')
        .attr('class','mand-edge')
        .attr('d', d)
        .attr('fill','none')
        .attr('stroke', pal.cMandBorder)
        .attr('stroke-width', 1.6)
        .attr('opacity', 0.9)
        .attr('pointer-events','none');
    }
  }

  /* ---------- recadrage sur le CONTENU (mêmes 2 vues) ---------- */
  function recenter(){
    [vw, vh] = ensureSize(svgEl);
    // adapter le rect de capture au viewport actuel
    capture.attr('width', vw).attr('height', vh);

    const node = contentG.node();
    if (!node || typeof node.getBBox !== 'function') return;
    let bbox; try { bbox = node.getBBox(); } catch { return; }
    if (!bbox || !isFinite(bbox.width) || !isFinite(bbox.height) || bbox.width === 0 || bbox.height === 0) return;

    const margin = 120;
    const scale = Math.min(vh/(bbox.height+margin), vw/(bbox.width+margin), 1);
    const tx = (vw - bbox.width * scale)/2 - bbox.x * scale;
    const ty = (vh - bbox.height * scale)/2 - bbox.y * scale;
    const t = d3.zoomIdentity.translate(tx, ty).scale(scale);

    svg.transition().duration(400).call(zoom.transform, t);
    st.transform = t; st.userZoomed = false; _zoomState.set(svgEl, st);
  }

  /* ---------- repaint quand le thème change ---------- */
  function repaintTheme() {
    pal = readPalette();

    // defs
    hatchPath.attr('stroke', pal.cTextMuted);
    glowDrop.attr('flood-color', pal.cSelBorder);

    // légende
    legend.selectAll('.legend-label')
      .attr('fill', pal.cText)
      .attr('stroke', pal.halo)
      .attr('stroke-width', pal.haloW);
    legend.selectAll('.legend-box.req').attr('fill', pal.cReqBg).attr('stroke', pal.cReqBorder);
    legend.selectAll('.legend-stripe.req').attr('fill', pal.cReqBorder);
    legend.selectAll('.legend-box.inc').attr('fill', pal.cIncBg).attr('stroke', pal.cIncBorder);
    legend.selectAll('.legend-stripe.inc').attr('fill', pal.cIncBorder);
    legend.selectAll('.legend-box.man').attr('fill', 'none').attr('stroke', pal.cMandBorder);
    legend.selectAll('.legend-stripe.man').attr('fill', pal.cMandBorder);
    legend.selectAll('.legend-box.opt').attr('fill', 'url(#hatch)').attr('stroke', pal.cStroke);
    legend.selectAll('.legend-stripe.opt').attr('fill', pal.cStroke);

    // cadres
    svg.selectAll('.group-box').attr('stroke', pal.cStrokeGroup);
    svg.selectAll('.subgroup-box').attr('stroke', pal.cStrokeWeak);

    // nœuds (fond/trait selon status)
    const fillFor = (st) => st==='blocked' ? pal.cReqBg
                        : st==='incompatible' ? pal.cIncBg
                        : st==='selected' ? pal.cSelBg
                        : pal.cBoxBg;
    const strokeFor = (st) => st==='blocked' ? pal.cReqBorder
                          : st==='incompatible' ? pal.cIncBorder
                          : st==='selected' ? pal.cSelBorder
                          : pal.cStroke;

    svg.selectAll('.node-bg').each(function(){
      const stAttr = this.parentNode?.getAttribute?.('data-status') || 'normal';
      d3.select(this).attr('fill', fillFor(stAttr)).attr('stroke', strokeFor(stAttr));
    });

    // labels
    svg.selectAll('.node-label')
      .attr('fill', pal.cText)
      .attr('stroke', pal.halo)
      .attr('stroke-width', pal.haloW);

    // barres gammes (cases non-incluses doivent prendre cBoxBg/cStroke du thème)
    svg.selectAll('.gbar[data-included="0"]')
      .attr('fill', pal.cBoxBg)
      .attr('stroke', pal.cStroke);

    // arêtes obligatoires
    svg.selectAll('.mand-edge').attr('stroke', pal.cMandBorder);
  }

  // Observer les mutations de thème (data-theme sur <html> ou <body>)
  const themeObserver = new MutationObserver(() => repaintTheme());
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });

  // Repaint initial (au cas où le thème courant ≠ clair)
  repaintTheme();

  /* ---------- rendu final / cleanup ---------- */
  if (drawn === 0) {
    svg.append('text').attr('x',32).attr('y',96).attr('fill',pal.cTextMuted).attr('font-size',14)
      .text('Aucune option à afficher. Ajoutez une option dans un groupe ou un sous-groupe.');
  } else {
    if (preserveZoom && st.transform) { svg.call(zoom.transform, st.transform); }
    else { setTimeout(recenter, 0); }
  }

  return () => {
    try { const tip = document.getElementById('tooltip'); tip && tip.classList.remove('visible'); } catch {}
    themeObserver.disconnect();
    svg.selectAll('*').remove();
    if (unsubscribeSelected) unsubscribeSelected();
  };
}
