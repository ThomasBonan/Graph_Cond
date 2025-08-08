<script>
  import { graphEl, mode } from '../lib/stores.js';
  import { exportSVG, exportPNG, exportPDF } from '../lib/export-graph.js';

  // options utilisateur
  let bg = '#ffffff';   // fond clair pour documents
  let scale = 2;        // échelle PNG

  $: canExport = !!$graphEl;

  function doSVG()  { exportSVG($graphEl, { filename: `graph-${$mode}.svg`, background: bg || null }); }
  function doPNG()  { exportPNG($graphEl, { filename: `graph-${$mode}.png`, background: bg || '#ffffff', scale: Number(scale)||2 }); }
  function doPDF()  { exportPDF($graphEl, { filename: `graph-${$mode}.pdf`, background: bg || '#ffffff' }); }
</script>

<div class="exportbar">
  <div class="left">
    <strong>Export</strong>
    <button class="btn" on:click={doSVG} disabled={!canExport}>SVG</button>
    <button class="btn" on:click={doPNG} disabled={!canExport}>PNG</button>
    <button class="btn" on:click={doPDF} disabled={!canExport}>PDF</button>
  </div>

  <div class="right">
    <label title="Couleur de fond (utile pour les thèmes sombres)">
      Fond&nbsp;:
      <input type="color" bind:value={bg} />
      <button class="btn ghost" on:click={() => bg = ''} title="Transparent">⌀</button>
    </label>
    <label title="Échelle d’export PNG">
      Échelle PNG&nbsp;:
      <input class="num" type="number" min="1" max="4" step="1" bind:value={scale} />
    </label>
  </div>
</div>

<style>
  .exportbar {
    display:flex; justify-content:space-between; align-items:center;
    gap:12px; padding:8px; margin-bottom:8px;
    border:1px solid var(--c-stroke); border-radius:8px; background:var(--c-box-bg);
  }
  .left, .right { display:flex; align-items:center; gap:8px; }
  .btn {
    border:1px solid var(--c-stroke); background:var(--c-box-bg);
    color:var(--c-text); border-radius:8px; padding:6px 10px; cursor:pointer;
  }
  .btn:disabled { opacity:.5; cursor:not-allowed; }
  .btn.ghost { padding:4px 8px; opacity:.8; }
  label { display:flex; align-items:center; gap:6px; color:var(--c-text-muted); }
  input.num { width:54px; }
</style>
