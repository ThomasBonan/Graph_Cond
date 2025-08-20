import * as d3 from 'd3';

// === Constantes layout / wrap ===============================================
const NODE_PAD_X = 10, NODE_PAD_Y = 8, NODE_LINE_H = 14, GAMME_BAR_GAP = 4;

// Titres de groupe (au-dessus du cadre)
const GT_PAD_X = 6, GT_PAD_Y = 2, GT_LINE_H = 14, GT_GAP = 6; // gap vertical entre titre et cadre

// Titres de sous-groupe (dans le cadre)
const SGT_PAD_X = 8, SGT_PAD_Y = 4, SGT_LINE_H = 13, SGT_EXTRA_GAP = 6; // gap sous le titre

/**
 * Wrap générique pour <text> SVG (utilise <tspan>). Retourne la hauteur du bloc (label + pads).
 * textSel: d3.select(<text>), label: string, baseX/Y: position "bloc", innerW: largeur utile (sans padding)
 * opts.align: 'left' | 'middle' | 'right'
 */
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
    if (w === '\n') { // retour dur
      tsp.text(line.join(' ')); line = []; lineNo++; tsp = makeTspan(); continue;
    }
    line.push(w);
    tsp.text(line.join(' '));
    if (tsp.node().getComputedTextLength() > innerW) {
      if (line.length === 1) {
        const parts = chunkWord(w, innerW, tsp);
        if (parts.length) {
          tsp.text(parts.shift());
          for (const p of parts) { lineNo++; tsp = makeTspan().text(p); }
          line = [];
          continue;
        }
      }
      line.pop();
      tsp.text(line.join(' '));
      line = [w];
      lineNo++; tsp = makeTspan().text(w);
      if (tsp.node().getComputedTextLength() > innerW) {
        const parts = chunkWord(w, innerW, tsp);
        tsp.text(parts.shift() || '');
        for (const p of parts) { lineNo++; tsp = makeTspan().text(p); }
        line = [];
      }
    }
  }

  const h = Math.ceil(textSel.node().getBBox().height);
  return h + padY * 2;
}

// Helpers de wrap
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

export function renderGraph(svgEl, ctx) {
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  const ensureSize = (el) => {
    if (!el) return [1200, 800];
    const w = el.clientWidth  || parseInt(el.getAttribute('width'))  || 1200;
    const h = el.clientHeight || parseInt(el.getAttribute('height')) || 800;
    d3.select(el).attr('width', w).attr('height', h);
    return [w, h];
  };
  let [vw, vh] = ensureSize(svgEl);

  const {
    search = '',
    collapsed = {},
    grouped = {},
    gammes = { Smart:{}, Mod:{}, Evo:{} },
    rules = {},
    optionLabels = {},
    selected,
    interactive = true,
    onToggleGroup = () => {},
    onToggleSubgroup = () => {},
    onToggleSelect = () => {},
  } = ctx;

  // === Const layout global ==================================================
  const subgroupWidth = 220, optionWidth = 200;
  const padX=30, padY=30, gapX=16, gapY=16, itemGapY=100, groupSpacing=80;

  // selected -> Set
  let selectedValue = new Set();
  let unsubscribeSelected = null;
  if (selected && typeof selected.subscribe === 'function') {
    unsubscribeSelected = selected.subscribe(v => { selectedValue = v instanceof Set ? v : new Set(v || []); });
  } else if (selected && typeof selected.has === 'function') {
    selectedValue = selected;
  }

  const s = (search || '').toLowerCase();
  const css = (v, d) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || d;

  // palette courante
  let cText = css('--c-text','#0f172a'), cTextMuted = css('--c-text-muted','#8b93a7');
  let cStroke=css('--c-stroke','#d0d7e2'), cStrokeWeak=css('--c-stroke-weak','#e2e8f0'), cStrokeGroup=css('--c-stroke-group','#cbd5e1');
  let cBoxBg=css('--c-box-bg','#ffffff');
  let cReqBg=css('--c-rule-req-bg','#dbeafe'), cReqBorder=css('--c-rule-req-border','#2563eb');
  let cIncBg=css('--c-rule-inc-bg','#fee2e2'), cIncBorder=css('--c-rule-inc-border','#dc2626');
  let cSmart=css('--c-smart','#646363'), cMod=css('--c-mod','#da261b'), cEvo=css('--c-evo','#304e9c');
  let halo = css('--c-text-halo','transparent'); let haloW = parseFloat(css('--c-text-halo-w','0'))||0;
  let cSelBg = css('--c-selected-bg', '#dcfce7');
  let cSelBorder = css('--c-selected-border', '#16a34a');
  let cSelStripe = css('--c-selected-stripe', '#22c55e');

  function readPalette() {
    cText = css('--c-text','#0f172a'); cTextMuted = css('--c-text-muted','#8b93a7');
    cStroke=css('--c-stroke','#d0d7e2'); cStrokeWeak=css('--c-stroke-weak','#e2e8f0'); cStrokeGroup=css('--c-stroke-group','#cbd5e1');
    cBoxBg=css('--c-box-bg','#ffffff');
    cReqBg=css('--c-rule-req-bg','#dbeafe'); cReqBorder=css('--c-rule-req-border','#2563eb');
    cIncBg=css('--c-rule-inc-bg','#fee2e2'); cIncBorder=css('--c-rule-inc-border','#dc2626');
    cSmart=css('--c-smart','#646363'); cMod=css('--c-mod','#da261b'); cEvo=css('--c-evo','#304e9c');
    halo = css('--c-text-halo','transparent'); haloW = parseFloat(css('--c-text-halo-w','0'))||0;
    cSelBg = css('--c-selected-bg', '#dcfce7'); cSelBorder = css('--c-selected-border', '#16a34a'); cSelStripe = css('--c-selected-stripe', '#22c55e');
  }

  // ---------- defs + blink
  const defs = svg.append('defs');
  defs.append('pattern').attr('id','hatch').attr('patternUnits','userSpaceOnUse').attr('width',6).attr('height',6)
    .append('path').attr('d','M0,0 l6,6').attr('stroke',cTextMuted).attr('stroke-width',1);
  defs.append('style').text(`@keyframes blink {0%{opacity:1}50%{opacity:.25}100%{opacity:1}} .blink{animation:blink .9s ease-in-out 0s 1}`);
  const glow = defs.append('filter').attr('id','selglow');
  glow.append('feDropShadow')
    .attr('dx', 0).attr('dy', 0)
    .attr('stdDeviation', 2.5)
    .attr('flood-color', cSelBorder)
    .attr('flood-opacity', 0.6);

  // ---------- légende
  const legend = svg.append('g').attr('transform','translate(16,16)');
  [
    {key:'req',label:'Bloqué par dépendance',fill:cReqBg,border:cReqBorder,stripe:cReqBorder},
    {key:'inc',label:'Incompatible',fill:cIncBg,border:cIncBorder,stripe:cIncBorder},
    {key:'opt',label:'Optionnelle (gamme)',fill:'url(#hatch)',border:cStroke,stripe:cStroke}
  ].forEach((it,i)=>{
    const y = i*22;
    legend.append('rect').attr('class',`legend-stripe ${it.key}`).attr('x',0).attr('y',y).attr('width',4).attr('height',14).attr('fill',it.stripe);
    legend.append('rect').attr('class',`legend-box ${it.key}`).attr('x',4).attr('y',y).attr('width',18).attr('height',14).attr('fill',it.fill).attr('stroke',it.border).attr('rx',2).attr('ry',2);
    legend.append('text').attr('class','legend-label').attr('x',26).attr('y',y+11).attr('fill',cText).attr('font-size',12)
      .style('paint-order','stroke fill').attr('stroke',halo).attr('stroke-width',haloW).text(it.label);
  });

  // ---------- zoom + conteneur
  const rootG = svg.append('g').attr('id','zoom-container');
  const zoom = d3.zoom().scaleExtent([0.5,2]).extent([[0,0],[vw, vh]]).on('zoom', (e) => rootG.attr('transform', e.transform));
  svg.call(zoom);
  svg.on('recenter', () => recenter());

  // ---------- flash infra
  const nodeMap = new Map();
  svg.on('flash', (event) => {
    const ids = (event?.detail || []);
    ids.forEach(id => {
      const g = nodeMap.get(id);
      if (g) { g.classed('blink', true); setTimeout(() => g.classed('blink', false), 900); }
    });
  });

  // ---------- tooltip
  let tipEl = document.getElementById('tooltip');
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.id='tooltip'; tipEl.setAttribute('aria-hidden','true'); document.body.appendChild(tipEl); }
  const showTip = (lines,x,y)=>{ tipEl.replaceChildren(...lines.map(t=>{const p=document.createElement('div');p.textContent=t;return p;})); tipEl.style.left=x+'px'; tipEl.style.top=y+'px'; tipEl.classList.add('visible'); tipEl.setAttribute('aria-hidden','false'); };
  const hideTip = ()=>{ tipEl.classList.remove('visible'); tipEl.setAttribute('aria-hidden','true'); };

  // ---------- layout groupes / sous-groupes
  const gxStart = 50;
  let gx=gxStart, drawn=0;

  for (const [groupName, v] of Object.entries(grouped)) {
  const subs = v?.subgroups || {};
  const entries = [
    ...Object.entries(subs).map(([sg, ids]) => ({ sg, ids })),
    ...(Array.isArray(v?.root) && v.root.length ? [{ sg: '__root', ids: v.root }] : [])
  ];

  const groupCollapsed = !!collapsed[groupName]?.__group;

  // Prépare les entrées filtrées (utile si non plié)
  const filteredEntries = entries.map(({ sg, ids }) => {
    const list = ids || [];
    const filtered = s ? list.filter(id => (optionLabels[id] || id).toLowerCase().includes(s)) : list;
    const count = filtered.length;
    const height = Math.max(count * itemGapY + 40, 50);
    const key = sg === '__root' ? '__root' : sg;
    const collapsedSG = !!collapsed[groupName]?.[key];
    return { sg, key, ids: filtered, count, height, collapsed: collapsedSG };
  }).filter(e => !s || e.count > 0);

  // === MODE GROUPE PLIÉ : on ne dessine QUE la boîte du groupe + son titre ===
  if (groupCollapsed) {
    // largeur compacte : 1 colonne de sous-groupe fictive
    const groupWidth  = 1 * subgroupWidth + 2 * padX;
    const groupHeight = 2 * padY;     // hauteur minimale (le cadre)
    const groupY = 60;

    // cadre
    rootG.append('rect')
      .attr('class','group-box')
      .attr('x',gx).attr('y',groupY)
      .attr('width',groupWidth).attr('height',groupHeight)
      .attr('fill','none').attr('stroke',cStrokeGroup)
      .attr('stroke-dasharray','4,2').attr('rx',6).attr('ry',6);

    // titre WRAP au-dessus du cadre
    const gTitle = rootG.append('text')
      .attr('class','group-title')
      .attr('font-size',16).attr('font-weight','bold')
      .style('cursor','pointer').style('paint-order','stroke fill')
      .attr('stroke',halo).attr('stroke-width',haloW)
      .attr('fill', cText)
      .on('click',()=> onToggleGroup(groupName));

    const gTitleInnerW = groupWidth - GT_PAD_X * 2;
    const gTitleH = wrapLabel(gTitle, groupName, gx, groupY, gTitleInnerW, {
      align:'middle', padX: GT_PAD_X, padY: GT_PAD_Y, lineH: GT_LINE_H
    });
    gTitle.attr('transform', `translate(0, ${-gTitleH - GT_GAP})`);

    // passe au groupe suivant (on NE dessine PAS les sous-groupes)
    gx += groupWidth + groupSpacing;
    continue;
  }

  // === MODE GROUPE OUVERT (logique existante) ===============================
  if (filteredEntries.length === 0) { gx += 250; continue; }

  const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(filteredEntries.length))));
  const colHeights = new Array(cols).fill(0), positions = [];
  filteredEntries.forEach(entry=>{
    let col=0; for (let i=1;i<cols;i++) if (colHeights[i]<colHeights[col]) col=i;
    const x=gx+padX+col*(subgroupWidth+gapX), y=padY+colHeights[col];
    positions.push({ ...entry, x, y });
    colHeights[col] += (entry.collapsed ? 40 : entry.height) + gapY;
  });

  const innerWidth  = cols*subgroupWidth + (cols-1)*gapX;
  const innerHeight = Math.max(...colHeights) - gapY;
  const groupWidth  = innerWidth + 2*padX;
  const groupHeight = innerHeight + 2*padY;
  const groupY = 60;

  // cadre de groupe
  rootG.append('rect').attr('class','group-box')
    .attr('x',gx).attr('y',groupY).attr('width',groupWidth).attr('height',groupHeight)
    .attr('fill','none').attr('stroke',cStrokeGroup).attr('stroke-dasharray','4,2').attr('rx',6).attr('ry',6);

  // titre WRAP au-dessus
  const gTitle = rootG.append('text')
    .attr('class','group-title')
    .attr('font-size',16).attr('font-weight','bold')
    .style('cursor','pointer').style('paint-order','stroke fill')
    .attr('stroke',halo).attr('stroke-width',haloW)
    .attr('fill', cText)
    .on('click',()=> onToggleGroup(groupName));
  const gTitleInnerW = groupWidth - GT_PAD_X * 2;
  const gTitleH = wrapLabel(gTitle, groupName, gx, groupY, gTitleInnerW, {
    align:'middle', padX: GT_PAD_X, padY: GT_PAD_Y, lineH: GT_LINE_H
  });
  gTitle.attr('transform', `translate(0, ${-gTitleH - GT_GAP})`);

  // sous-groupes (inchangé)
  positions.forEach(({ sg, key, ids, x, y, height, collapsed: isCollapsed }) => {
    const sx=x, sy=groupY+y, h=isCollapsed?40:height;
    const subRect = rootG.append('rect').attr('class','subgroup-box')
      .attr('x',sx).attr('y',sy).attr('width',subgroupWidth).attr('height',h)
      .attr('fill','none').attr('stroke',cStrokeWeak).attr('stroke-dasharray','4,2').attr('rx',6).attr('ry',6);

    // ... (la suite de ton rendu sous-groupe / options reste identique)
    //     (titre sous-groupe wrap, items, etc.)
    //     (ne touche rien d’autre ici)
    // >>> conserve exactement ton code existant à partir d’ici <<<
  });

  gx += groupWidth + groupSpacing;
}


    // --- Sous-groupes ---
    positions.forEach(({ sg, key, ids, x, y, height, collapsed: isCollapsed }) => {
      const sx=x, sy=groupY+y, h=isCollapsed?40:height;
      const subRect = rootG.append('rect').attr('class','subgroup-box').attr('x',sx).attr('y',sy).attr('width',subgroupWidth).attr('height',h)
        .attr('fill','none').attr('stroke',cStrokeWeak).attr('stroke-dasharray','4,2').attr('rx',6).attr('ry',6);

      // === Titre de sous-groupe WRAP (dans la boîte) ===
      let headerH = 0;
      if (sg !== '__root') {
        const sgTitle = rootG.append('text')
          .attr('class','subgroup-title')
          .attr('font-size',13).attr('font-weight','bold')
          .style('cursor','pointer').style('paint-order','stroke fill')
          .attr('stroke',halo).attr('stroke-width',haloW)
          .attr('fill', cText);

        const sgtInnerW = subgroupWidth - SGT_PAD_X * 2;
        const sgtH = wrapLabel(sgTitle, sg, sx, sy, sgtInnerW, {
          align:'middle', padX: SGT_PAD_X, padY: SGT_PAD_Y, lineH: SGT_LINE_H
        });

        headerH = Math.max(20, sgtH + SGT_EXTRA_GAP);
        sgTitle.on('click',()=> onToggleSubgroup(groupName, key));
      } else {
        headerH = 12; // un petit offset pour le root
      }

      if (isCollapsed) return;

      ids.forEach((id,i)=>{
        drawn++;
        const label = optionLabels[id] || id;
        const yOpt = sy + headerH + i*itemGapY; // <<<< OFFSET dynamique sous le titre wrap
        const xOpt = sx + (subgroupWidth - optionWidth)/2;

        const reqs = (rules[id]?.requires) || [];
        const unmet = reqs.filter(dep => !selectedValue.has(dep));
        const blocked = unmet.length > 0;
        const incompatibleWithSel = Array.from(selectedValue).some(s =>
          (rules[id]?.incompatible_with || []).includes(s) ||
          (rules[s]?.incompatible_with || []).includes(id)
        );

        const isSel = selectedValue?.has?.(id);
        const canClick = interactive && !blocked && !incompatibleWithSel;

        let status = 'normal';
        if (blocked) status = 'blocked';
        else if (incompatibleWithSel) status = 'incompatible';
        if (isSel && status === 'normal') status = 'selected';

        // style
        let boxFill = cBoxBg, boxStroke = cStroke, accent = null, filterSel = null;
        if (status === 'blocked') { boxFill=cReqBg; boxStroke=cReqBorder; accent=cReqBorder; }
        else if (status === 'incompatible') { boxFill=cIncBg; boxStroke=cIncBorder; accent=cIncBorder; }
        else if (status === 'selected') { boxFill=cSelBg; boxStroke=cSelBorder; accent=cSelStripe; filterSel='url(#selglow)'; }

        const strokeW = isSel ? 3.0 : 1.0;
        const faded = isSel ? 1 : (s ? (label.toLowerCase().includes(s) ? 1 : 0.25) : 1);

        const g = rootG.append('g').attr('data-id', id).attr('data-status', status);

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
            const sLine = (gName, map) => {
              const st = (map?.[id]) || { included:false, optional:false };
              return `${gName}: ${st.included ? 'Présent' : (st.optional ? 'Optionnel' : 'Absent')}`;
            };
            if (blocked && unmet.length) lines.push(`Manque: ${unmet.map(r=>optionLabels[r]||r).join(', ')}`);
            const incompatibleWith = Array.from(selectedValue).filter(s =>
              (rules[id]?.incompatible_with || []).includes(s) ||
              (rules[s]?.incompatible_with || []).includes(id)
            );
            if (incompatibleWith.length) lines.push(`Incompatible avec: ${incompatibleWith.map(x=>optionLabels[x]||x).join(', ')}`);
            lines.push(sLine('Smart', gammes.Smart));
            lines.push(sLine('Mod',   gammes.Mod));
            lines.push(sLine('Evo',   gammes.Evo));
            const { clientX, clientY } = e;
            showTip(lines, Math.min(clientX, window.innerWidth-10), Math.min(clientY, window.innerHeight-10));
          })
          .on('mouseleave', ()=> hideTip());

        if (canClick && !isSel) {
          rect.on('mouseenter', function(){ d3.select(this).attr('stroke-width', 2).attr('stroke', cSelBorder); })
              .on('mouseleave', function(){ d3.select(this).attr('stroke-width', strokeW).attr('stroke', boxStroke); });
        }

        if (status !== 'normal') g.append('rect')
          .attr('class','accent')
          .attr('x', xOpt-4).attr('y', yOpt).attr('width',4).attr('height', 1)
          .attr('fill',accent).style('opacity',faded).style('pointer-events','none');

        const txt = g.append('text')
          .attr('class','node-label')
          .attr('font-size','14px').attr('fill',cText)
          .style('paint-order','stroke fill').attr('stroke',halo).attr('stroke-width',haloW)
          .style('font-weight', s && label.toLowerCase().includes(s) ? '700' : '500')
          .style('opacity',faded).style('pointer-events','none');

        const innerW = optionWidth - NODE_PAD_X*2;
        const labelBlockH = wrapLabel(txt, label, xOpt, yOpt, innerW, {
          align:'middle', padX:NODE_PAD_X, padY:NODE_PAD_Y, lineH:NODE_LINE_H
        });

        const rectH = Math.max(32, labelBlockH);
        rect.attr('height', rectH);
        g.select('.accent').attr('height', rectH);

        const caseW = optionWidth/3;
        const yPos  = yOpt + rectH + GAMME_BAR_GAP;

        [{key:'Smart', color:cSmart}, {key:'Mod', color:cMod}, {key:'Evo', color:cEvo}].forEach((c, idx) => {
          const st = (gammes?.[c.key] || {})[id] || { included:false, optional:false };
          g.append('rect')
            .attr('class','gbar')
            .attr('data-key', c.key)
            .attr('data-included', st.included ? '1' : '0')
            .attr('x', xOpt + idx*caseW).attr('y', yPos).attr('width', caseW).attr('height', 14)
            .attr('fill', st.included ? c.color : cBoxBg).attr('stroke', cStroke)
            .style('opacity', 1).style('pointer-events','none');
          if (st.optional) {
            g.append('rect')
              .attr('x', xOpt + idx*caseW).attr('y', yPos).attr('width', caseW).attr('height', 14)
              .attr('fill','url(#hatch)').attr('pointer-events','none').style('opacity', 1);
          }
        });
      });

      // Si le titre wrap prend beaucoup de place, on peut agrandir visuellement la box
      if (headerH > 30) {
        const delta = headerH - 30;
        subRect.attr('height', h + delta);
      }
    });

    gx += groupWidth + groupSpacing;
  }

  // === recenter / footer ====================================================
  function recenter(){
    [vw, vh] = ensureSize(svgEl);
    zoom.extent([[0,0],[vw, vh]]);
    const node = rootG.node();
    if (!node || typeof node.getBBox !== 'function') return;
    let bbox; try { bbox = node.getBBox(); } catch { return; }
    if (!bbox || !isFinite(bbox.width) || !isFinite(bbox.height)) return;

    const scale = Math.min(vw/(bbox.width+120), vh/(bbox.height+120), 1);
    const tx = (vw - bbox.width * scale)/2 - bbox.x * scale;
    const ty = (vh - bbox.height * scale)/2 - bbox.y * scale;
    svg.transition().duration(450).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  if (drawn === 0) {
    svg.append('text').attr('x',32).attr('y',96).attr('fill',cTextMuted).attr('font-size',14)
      .text('Aucune option à afficher. Ajoutez une option dans un groupe ou un sous-groupe.');
  } else {
    setTimeout(recenter, 0);
  }

  // === Recoloration (thème) =================================================
  function recolor() {
    readPalette();

    // defs
    svg.select('pattern#hatch path').attr('stroke', cTextMuted);
    svg.select('filter#selglow feDropShadow').attr('flood-color', cSelBorder);

    // légende
    legend.selectAll('text.legend-label').attr('fill', cText).attr('stroke', halo).attr('stroke-width', haloW);
    legend.select('.legend-stripe.req').attr('fill', cReqBorder);
    legend.select('.legend-stripe.inc').attr('fill', cIncBorder);
    legend.select('.legend-stripe.opt').attr('fill', cStroke);
    legend.select('.legend-box.req').attr('fill', cReqBg).attr('stroke', cReqBorder);
    legend.select('.legend-box.inc').attr('fill', cIncBg).attr('stroke', cIncBorder);
    legend.select('.legend-box.opt').attr('fill', 'url(#hatch)').attr('stroke', cStroke);

    // cadres
    rootG.selectAll('rect.group-box').attr('stroke', cStrokeGroup);
    rootG.selectAll('rect.subgroup-box').attr('stroke', cStrokeWeak);

    // titres groupe / sous-groupe
    rootG.selectAll('text.group-title, text.subgroup-title')
      .attr('fill', cText)
      .attr('stroke', halo)
      .attr('stroke-width', haloW);

    // labels nœuds
    rootG.selectAll('text.node-label').attr('fill', cText).attr('stroke', halo).attr('stroke-width', haloW);

    // nœuds
    rootG.selectAll('g[data-id]').each(function(){
      const g = d3.select(this);
      const status = g.attr('data-status') || 'normal';
      const rect = g.select('rect.node-bg');
      const accent = g.select('rect.accent');

      let fill=cBoxBg, border=cStroke, stripe=null, filter=null;
      if (status === 'blocked') { fill=cReqBg; border=cReqBorder; stripe=cReqBorder; }
      else if (status === 'incompatible') { fill=cIncBg; border=cIncBorder; stripe=cIncBorder; }
      else if (status === 'selected') { fill=cSelBg; border=cSelBorder; stripe=cSelStripe; filter='url(#selglow)'; }

      rect.attr('fill', fill).attr('stroke', border).attr('filter', filter || null);
      if (!accent.empty()) accent.attr('fill', stripe);

      // barres Smart/Mod/Evo
      g.selectAll('rect.gbar').each(function(){
        const bar = d3.select(this);
        const included = bar.attr('data-included') === '1';
        const key = bar.attr('data-key');
        let color = cBoxBg;
        if (included) color = key === 'Smart' ? cSmart : key === 'Mod' ? cMod : cEvo;
        bar.attr('fill', color).attr('stroke', cStroke);
      });
    });
  }

  // observer du thème
  const mo = new MutationObserver(() => queueMicrotask(recolor));
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  recolor();

  return () => {
    try { const tip = document.getElementById('tooltip'); tip && tip.classList.remove('visible'); } catch {}
    mo.disconnect();
    svg.selectAll('*').remove();
    if (unsubscribeSelected) unsubscribeSelected();
  };
}