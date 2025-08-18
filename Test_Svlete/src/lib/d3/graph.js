import * as d3 from 'd3';

// === Wrapping label optimisé pour SVG =======================================
const NODE_PAD_X = 10, NODE_PAD_Y = 8, NODE_LINE_H = 14, GAMME_BAR_GAP = 4;

/**
 * Écrit `label` en plusieurs lignes dans `textSel` (tspans), limité à `innerW`.
 * Aligne: 'middle' (centré). Retourne la HAUTEUR totale du bloc (label + padding).
 */
function wrapLabel(textSel, label, baseX, baseY, innerW, {
  align = 'middle', padX = NODE_PAD_X, padY = NODE_PAD_Y, lineH = NODE_LINE_H
} = {}) {
  const anchor = align === 'middle' ? 'middle' : (align === 'right' ? 'end' : 'start');
  const xBase  = align === 'middle' ? (baseX + padX + innerW/2)
              : align === 'right'  ? (baseX + padX + innerW)
              : (baseX + padX);

  textSel.text('').attr('text-anchor', anchor); // on reconstruit
  let line = [], lineNo = 0;

  const tspan = () => textSel.append('tspan')
    .attr('x', xBase)
    .attr('y', lineNo === 0 ? (baseY + padY + lineH*0.85) : null)
    .attr('dy', lineNo === 0 ? null : lineH);

  let tsp = tspan();
  const words = tokenize(label);

  for (const w of words) {
    if (w === '\n') { // retour dur
      tsp.text(line.join(' ')); line = []; lineNo++; tsp = tspan(); continue;
    }
    line.push(w);
    tsp.text(line.join(' '));
    if (tsp.node().getComputedTextLength() > innerW) {
      if (line.length === 1) {
        // mot très long : découpe en segments avec tiret
        const parts = chunkWord(w, innerW, tsp);
        if (parts.length) {
          tsp.text(parts.shift());
          for (const p of parts) { lineNo++; tsp = tspan().text(p); }
          line = [];
          continue;
        }
      }
      // renvoyer le dernier mot à la ligne suivante
      line.pop();
      tsp.text(line.join(' '));
      line = [w];
      lineNo++; tsp = tspan().text(w);
      if (tsp.node().getComputedTextLength() > innerW) {
        const parts = chunkWord(w, innerW, tsp);
        tsp.text(parts.shift() || '');
        for (const p of parts) { lineNo++; tsp = tspan().text(p); }
        line = [];
      }
    }
  }

  const h = Math.ceil(textSel.node().getBBox().height);
  return h + padY*2;

  // Helpers
  function tokenize(s) {
    const parts = [];
    s.split(/\n/).forEach((line, i, arr) => {
      line.split(/(\s+|-)/).forEach(tok => { if (tok) parts.push(tok.trim()==='' ? ' ' : tok); });
      if (i < arr.length - 1) parts.push('\n');
    });
    // compact espaces
    return parts.reduce((acc,t)=>{ if(t==='\n'){acc.push(t);return acc;} const last=acc[acc.length-1]; if(last===' '&&t===' ')return acc; acc.push(t); return acc;},[]);
  }
  function chunkWord(word, innerW, tsp) {
    const out=[]; let i=0;
    while (i<word.length) {
      let lo=1, hi=word.length-i, best=1;
      while (lo<=hi) {
        const mid=(lo+hi)>>1, slice=word.slice(i,i+mid)+(i+mid<word.length?'-':'');
        tsp.text(slice);
        if (tsp.node().getComputedTextLength() <= innerW) { best=mid; lo=mid+1; } else { hi=mid-1; }
      }
      const piece=word.slice(i,i+best); i+=best; out.push(i<word.length?piece+'-':piece);
    }
    return out;
  }
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

  // === Const layout pour le wrapping =================================================
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
  const cText = css('--c-text','#e8eef5'), cTextMuted = css('--c-text-muted','#94a3b8');
  const cStroke=css('--c-stroke','#4b5563'), cStrokeWeak=css('--c-stroke-weak','#3a4658'), cStrokeGroup=css('--c-stroke-group','#2c3645');
  const cBoxBg=css('--c-box-bg','#0f172a');
  const cReqBg=css('--c-rule-req-bg','#60a5fa'), cReqBorder=css('--c-rule-req-border','#2563eb');
  const cIncBg=css('--c-rule-inc-bg','#f87171'), cIncBorder=css('--c-rule-inc-border','#dc2626');
  const cSmart=css('--c-smart','#646363'), cMod=css('--c-mod','#da261b'), cEvo=css('--c-evo','#304e9c');
  const halo = css('--c-text-halo','transparent'); const haloW = parseFloat(css('--c-text-halo-w','0'))||0;

  // defs + blink
  const defs = svg.append('defs');
  defs.append('pattern').attr('id','hatch').attr('patternUnits','userSpaceOnUse').attr('width',6).attr('height',6)
    .append('path').attr('d','M0,0 l6,6').attr('stroke',cTextMuted).attr('stroke-width',1);
  defs.append('style').text(`@keyframes blink {0%{opacity:1}50%{opacity:.25}100%{opacity:1}} .blink{animation:blink .9s ease-in-out 0s 1}`);

  // légende
  const legend = svg.append('g').attr('transform','translate(16,16)');
  [
    {label:'Bloqué par dépendance',fill:cReqBg,border:cReqBorder,stripe:cReqBorder},
    {label:'Incompatible',fill:cIncBg,border:cIncBorder,stripe:cIncBorder},
    {label:'Optionnelle (gamme)',fill:'url(#hatch)',border:cStroke,stripe:cStroke}
  ].forEach((it,i)=>{
    const y = i*22;
    legend.append('rect').attr('x',0).attr('y',y).attr('width',4).attr('height',14).attr('fill',it.stripe);
    legend.append('rect').attr('x',4).attr('y',y).attr('width',18).attr('height',14).attr('fill',it.fill).attr('stroke',it.border).attr('rx',2).attr('ry',2);
    legend.append('text').attr('x',26).attr('y',y+11).attr('fill',cText).attr('font-size',12).style('paint-order','stroke fill').attr('stroke',halo).attr('stroke-width',haloW).text(it.label);
  });

  // zoom
  const rootG = svg.append('g').attr('id','zoom-container');
  const zoom = d3.zoom().scaleExtent([0.5,2]).extent([[0,0],[vw, vh]]).on('zoom', (e) => rootG.attr('transform', e.transform));
  svg.call(zoom);
  svg.on('recenter', () => recenter());

  // flash infra
  const nodeMap = new Map();
  svg.on('flash', (event) => {
    const ids = (event?.detail || []);
    ids.forEach(id => {
      const g = nodeMap.get(id);
      if (g) { g.classed('blink', true); setTimeout(() => g.classed('blink', false), 900); }
    });
  });

  // tooltip
  let tipEl = document.getElementById('tooltip');
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.id='tooltip'; tipEl.setAttribute('aria-hidden','true'); document.body.appendChild(tipEl); }
  const showTip = (lines,x,y)=>{ tipEl.replaceChildren(...lines.map(t=>{const p=document.createElement('div');p.textContent=t;return p;})); tipEl.style.left=x+'px'; tipEl.style.top=y+'px'; tipEl.classList.add('visible'); tipEl.setAttribute('aria-hidden','false'); };
  const hideTip = ()=>{ tipEl.classList.remove('visible'); tipEl.setAttribute('aria-hidden','true'); };

  // layout groupes / sous-groupes
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

    if (filteredEntries.length === 0) { gx += 250; continue; }

    const cols = groupCollapsed ? 1 : Math.min(3, Math.max(1, Math.ceil(Math.sqrt(filteredEntries.length))));
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

    rootG.append('rect').attr('x',gx).attr('y',groupY).attr('width',groupWidth).attr('height',groupHeight)
      .attr('fill','none').attr('stroke',cStrokeGroup).attr('stroke-dasharray','4,2').attr('rx',6).attr('ry',6);

    const title = rootG.append('text').attr('x',gx+groupWidth/2).attr('y',groupY-10)
      .text(groupName).attr('font-size',16).attr('font-weight','bold').attr('text-anchor','middle').attr('fill',cText)
      .style('cursor','pointer').style('paint-order','stroke fill').attr('stroke',halo).attr('stroke-width',haloW);
    title.on('click',()=> onToggleGroup(groupName));

    positions.forEach(({ sg, key, ids, x, y, height, collapsed: isCollapsed }) => {
      const sx=x, sy=groupY+y, h=isCollapsed?40:height;
      rootG.append('rect').attr('x',sx).attr('y',sy).attr('width',subgroupWidth).attr('height',h)
        .attr('fill','none').attr('stroke',cStrokeWeak).attr('stroke-dasharray','4,2').attr('rx',6).attr('ry',6);

      if (sg !== '__root') {
        const sgTitle = rootG.append('text').attr('x', sx + subgroupWidth/2).attr('y', sy + 15)
          .text(sg).attr('font-size',13).attr('font-weight','bold').attr('text-anchor','middle').attr('fill',cText)
          .style('cursor','pointer');
        sgTitle.on('click',()=> onToggleSubgroup(groupName, key));
      }

      if (isCollapsed) return;

      ids.forEach((id,i)=>{
        drawn++;
        const label = optionLabels[id] || id;
        const yOpt = sy + 30 + i*itemGapY;
        const xOpt = sx + (subgroupWidth - optionWidth)/2;

        const reqs = (rules[id]?.requires) || [];
        const unmet = reqs.filter(dep => !selectedValue.has(dep));
        const blocked = unmet.length > 0;
        const incompatibleWithSel = Array.from(selectedValue).some(s =>
          (rules[id]?.incompatible_with || []).includes(s) ||
          (rules[s]?.incompatible_with || []).includes(id)
        );

        let boxFill=cBoxBg, boxStroke=cStroke, accent=null;
        if (blocked) { boxFill=cReqBg; boxStroke=cReqBorder; accent=cReqBorder; }
        else if (incompatibleWithSel) { boxFill=cIncBg; boxStroke=cIncBorder; accent=cIncBorder; }

        const isSel = selectedValue?.has?.(id);
        const strokeW = isSel ? 2.5 : 1.0;
        const faded = s ? (label.toLowerCase().includes(s) ? 1 : 0.25) : 1;

        const canClick = interactive && !blocked && !incompatibleWithSel;

        const g = rootG.append('g').attr('data-id', id);
        const cursor = canClick ? 'pointer' : ((blocked || incompatibleWithSel) ? 'not-allowed' : 'default');

        // === RECT de fond (hauteur ajustée après wrap) ======================
        const rect = g.append('rect')
          .attr('x',xOpt).attr('y',yOpt).attr('width',optionWidth).attr('height', 1) // provisoire
          .attr('fill',boxFill).attr('stroke',boxStroke).attr('rx',6).attr('ry',6).attr('stroke-width',strokeW)
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

        // Accent gauche si besoin (hauteur ajustée après wrap)
        if (accent) g.append('rect')
          .attr('class','accent')
          .attr('x', xOpt-4).attr('y', yOpt).attr('width',4).attr('height', 1)
          .attr('fill',accent).style('opacity',faded).style('pointer-events','none');

        // === LABEL multi-lignes ============================================
        const txt = g.append('text')
          .attr('font-size','14px').attr('fill',cText)
          .style('paint-order','stroke fill').attr('stroke',halo).attr('stroke-width',haloW)
          .style('font-weight', s && label.toLowerCase().includes(s) ? '700' : '500')
          .style('opacity',faded).style('pointer-events','none');

        const innerW = optionWidth - NODE_PAD_X*2;
        const labelBlockH = wrapLabel(txt, label, xOpt, yOpt, innerW, {
          align:'middle', padX:NODE_PAD_X, padY:NODE_PAD_Y, lineH:NODE_LINE_H
        });

        // Ajuster hauteur du rect (et de l'accent) à la hauteur réelle du label
        const rectH = Math.max(32, labelBlockH);
        rect.attr('height', rectH);
        if (accent) g.select('.accent').attr('height', rectH);

        // === Cases Smart/Mod/Evo juste sous le label =======================
        const caseW = optionWidth/3;
        const yPos  = yOpt + rectH + GAMME_BAR_GAP;

        [{key:'Smart', color:cSmart}, {key:'Mod', color:cMod}, {key:'Evo', color:cEvo}].forEach((c, idx) => {
          const st = (gammes?.[c.key] || {})[id] || { included:false, optional:false };
          g.append('rect')
            .attr('x', xOpt + idx*caseW).attr('y', yPos).attr('width', caseW).attr('height', 14)
            .attr('fill', st.included ? c.color : cBoxBg).attr('stroke', cStroke)
            .style('opacity', faded).style('pointer-events','none');
          if (st.optional) {
            g.append('rect')
              .attr('x', xOpt + idx*caseW).attr('y', yPos).attr('width', caseW).attr('height', 14)
              .attr('fill','url(#hatch)').attr('pointer-events','none').style('opacity', faded);
          }
        });

        // map pour flash
        nodeMap.set(id, g);
      });
    });

    gx += groupWidth + groupSpacing;
  }

  // === recenter et footer (DANS renderGraph) =================================
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

  return () => {
    try { const tip = document.getElementById('tooltip'); tip && tip.classList.remove('visible'); } catch {}
    svg.selectAll('*').remove();
    if (unsubscribeSelected) unsubscribeSelected();
  };
}
