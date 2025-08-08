// src/lib/export-graph.js
// Export SVG/PNG/PDF : styles inline, zoom neutralisé, mesure fiable via DOM off-screen, cadrage global.

const PADDING = 24;   // marge autour du contenu
const EXTRA   = 8;    // marge anti-coupure (strokes)

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ---------- Styles inline ---------- */

function inlineStylesRecursive(node) {
  if (!node || node.nodeType !== 1) return;
  const st = node.ownerDocument.defaultView.getComputedStyle(node);
  const props = [
    'fill','fill-opacity','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-opacity',
    'opacity','font','font-family','font-size','font-weight','font-style','text-anchor','paint-order',
    'shape-rendering','vector-effect','mix-blend-mode'
  ];
  for (const p of props) {
    const v = st.getPropertyValue(p);
    if (v && v !== 'initial' && v !== 'normal' && v !== 'none') node.setAttribute(p, v);
  }
  node.setAttribute('color', st.getPropertyValue('color') || 'currentColor');
  for (const c of node.children) inlineStylesRecursive(c);
}

/* ---------- Clone + wrapper + neutralisation du zoom ---------- */

function cloneSvgWithStyles(svg) {
  const clone = svg.cloneNode(true);
  // retire styles injectés dynamiquement (HMR)
  clone.querySelectorAll('style').forEach(s => s.remove());
  inlineStylesRecursive(clone);

  // garantir <defs>
  let defs = clone.querySelector('defs');
  if (!defs) {
    defs = clone.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'defs');
    clone.insertBefore(defs, clone.firstChild);
  }

  // wrapper global qui contiendra tout (légende + graphe)
  const wrapper = clone.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
  wrapper.setAttribute('id', 'export-wrapper');

  // insère wrapper juste après <defs>, et y déplace tout sauf <defs>
  const anchor = defs.nextSibling;
  clone.insertBefore(wrapper, anchor);
  Array.from(clone.children)
    .filter(el => el.tagName.toLowerCase() !== 'defs' && el !== wrapper)
    .forEach(el => wrapper.appendChild(el));

  // neutralise le zoom/pan D3
  wrapper.querySelectorAll('#zoom-container').forEach(g => g.removeAttribute('transform'));

  // namespaces + nettoyage de width/height (on utilisera viewBox)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.removeAttribute('width');
  clone.removeAttribute('height');
  clone.setAttribute('preserveAspectRatio', 'xMinYMin meet');

  return clone;
}

/* ---------- Mesure fiable via DOM off-screen + recadrage ---------- */

function measureAndTighten(clone) {
  // attache off-screen pour fiabiliser getBBox()
  const sandbox = document.createElement('div');
  sandbox.style.cssText = 'position:fixed; left:-10000px; top:-10000px; visibility:hidden; pointer-events:none;';
  document.body.appendChild(sandbox);
  sandbox.appendChild(clone);

  const wrapper = clone.querySelector('#export-wrapper') || clone.firstElementChild;
  let bbox;
  try { bbox = wrapper.getBBox(); }
  catch { bbox = { x:0, y:0, width:1200, height:800 }; }

  const width  = Math.max(1, bbox.width  + 2*PADDING + EXTRA);
  const height = Math.max(1, bbox.height + 2*PADDING + EXTRA);
  const tx = PADDING + EXTRA/2 - bbox.x;
  const ty = PADDING + EXTRA/2 - bbox.y;

  const prev = wrapper.getAttribute('transform') || '';
  wrapper.setAttribute('transform', `translate(${tx},${ty}) ${prev}`.trim());
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`);

  // détache du DOM (le clone reste utilisable/serialisable)
  sandbox.remove();

  return { width, height };
}

/* ---------- Sérialisation & raster ---------- */

function serializeSvg(svg) {
  return new XMLSerializer().serializeToString(svg);
}

async function svgStringToPng(svgText, outW, outH, bg = '#ffffff') {
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.decoding = 'sync';
  const loaded = new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
  img.src = url;
  await loaded;

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(outW);
  canvas.height = Math.ceil(outH);
  const ctx = canvas.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1));
}

async function getJsPDF() {
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
  await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
  return window.jspdf.jsPDF;
}

/* ---------- API ---------- */

export function exportSVG(svgEl, { filename = 'graph.svg', background = null } = {}) {
  if (!svgEl) return;
  const clone = cloneSvgWithStyles(svgEl);
  const { width, height } = measureAndTighten(clone);

  if (background) {
    const bg = clone.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x','0'); bg.setAttribute('y','0');
    bg.setAttribute('width', String(width));
    bg.setAttribute('height', String(height));
    bg.setAttribute('fill', background);
    clone.insertBefore(bg, clone.firstChild);
  }

  const text = serializeSvg(clone);
  downloadBlob(filename, new Blob([text], { type:'image/svg+xml;charset=utf-8' }));
}

export async function exportPNG(svgEl, { filename='graph.png', scale=2, background='#ffffff' } = {}) {
  if (!svgEl) return;
  const clone = cloneSvgWithStyles(svgEl);
  const { width, height } = measureAndTighten(clone);
  const svgText = serializeSvg(clone);
  const png = await svgStringToPng(svgText, width * (Number(scale)||2), height * (Number(scale)||2), background);
  downloadBlob(filename, png);
}

export async function exportPDF(svgEl, { filename='graph.pdf', background='#ffffff' } = {}) {
  if (!svgEl) return;
  const clone = cloneSvgWithStyles(svgEl);
  const { width, height } = measureAndTighten(clone);
  const svgText = serializeSvg(clone);
  const png = await svgStringToPng(svgText, width*2, height*2, background);
  const url = URL.createObjectURL(png);

  const jsPDF = await getJsPDF();
  const dpi = 72, mmPerPt = 25.4 / dpi;
  const wMm = width * mmPerPt, hMm = height * mmPerPt;
  const doc = new jsPDF({ orientation: width>height ? 'l':'p', unit:'mm', format:[wMm,hMm] });
  doc.addImage(url, 'PNG', 0, 0, wMm, hMm);
  doc.save(filename);
  URL.revokeObjectURL(url);
}
