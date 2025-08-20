<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { graphEl, grouped, optionLabels, selected } from '../lib/stores.js';
  import { exportSVG, exportPNG, exportPDF } from '../lib/export-graph.js';

  let svg;                       // <svg> rendu du graphe
  let pngScale = 2;              // échelle PNG
  let bg = 'transparent';        // 'transparent' | 'white'

  let unsub;
  onMount(() => {
    unsub = graphEl.subscribe(v => (svg = v));
    return () => unsub && unsub();
  });

  // ---------- Exports image/doc ----------
  const doExportSVG = () =>
    exportSVG(svg, { background: bg === 'white' ? '#ffffff' : null });

  const doExportPNG = () =>
    exportPNG(svg, {
      scale: Number(pngScale) || 2,
      background: bg === 'white' ? '#ffffff' : null
    });

  const doExportPDF = () =>
    exportPDF(svg, { background: bg === 'white' ? '#ffffff' : null });

  // ---------- NOUVEAU : Export de la liste des sélections (TXT) ----------
  function exportSelectionListTXT(filename = `selection-${new Date().toISOString().slice(0,10)}.txt`) {
    const G = get(grouped);              // { group: { root:[], subgroups:{sg:[]} } }
    const L = get(optionLabels);         // { id: label }
    const S = get(selected);             // Set<string> (ou tableau)
    const sel = S instanceof Set ? S : new Set(S || []);

    // Construit un texte lisible par Groupe → Sous-groupe
    const lines = [];
    for (const [gname, obj] of Object.entries(G || {})) {
      const root = Array.isArray(obj?.root) ? obj.root : [];
      const sub  = obj?.subgroups || {};
      const bucket = [];

      const rootSel = root.filter(id => sel.has(id)).map(id => L[id] || id);
      if (rootSel.length) {
        bucket.push(...rootSel.map(l => `- ${l}`));
      }

      for (const [sg, ids] of Object.entries(sub)) {
        const list = (ids || []).filter(id => sel.has(id)).map(id => L[id] || id);
        if (list.length) {
          bucket.push(`- ${sg}`);
          list.forEach(l => bucket.push(`  • ${l}`));
        }
      }

      if (bucket.length) {
        lines.push(`## ${gname}`, ...bucket, ''); // ligne vide séparatrice
      }
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
</script>

<div class="exportbar">
  <span class="label">Export</span>

  <button class="btn" on:click={doExportSVG}  title="Exporter en SVG">SVG</button>
  <button class="btn" on:click={doExportPNG}  title="Exporter en PNG">PNG</button>
  <button class="btn" on:click={doExportPDF}  title="Exporter en PDF">PDF</button>

  <span class="sep"></span>

  <span class="label">Fond :</span>
  <button class="chip {bg==='white' ? 'active' : ''}" on:click={() => (bg='white')} title="Fond blanc">▢</button>
  <button class="chip {bg==='transparent' ? 'active' : ''}" on:click={() => (bg='transparent')} title="Fond transparent">ø</button>

  <span class="sep"></span>

  <label class="label" for="pngScale">Échelle PNG :</label>
  <input id="pngScale" class="input" type="number" min="1" max="6" step="1" bind:value={pngScale} />

  <span class="sep"></span>

  <!-- NOUVEAU -->
  <button class="btn accent" on:click={() => exportSelectionListTXT()} title="Exporter la liste des options sélectionnées (TXT)">
    Liste
  </button>
</div>

<style>
  .exportbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid var(--c-stroke);
    border-radius: 10px;
    background: var(--c-box-bg);
    color: var(--c-text);
    transition: background .15s ease, color .15s ease, border-color .15s ease;
  }

  .label { color: var(--c-text-muted); font-size: 13px; }

  .btn {
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--c-stroke);
    background: var(--c-bg);
    color: var(--c-text);
    font-weight: 600;
    transition: background .12s ease, color .12s ease, border-color .12s ease, filter .12s ease;
  }
  .btn:hover { filter: brightness(1.05); }

  /* bouton “Liste” accentué, couleur tirée des vars de sélection que nous avons ajoutées */
  .btn.accent {
    border-color: var(--c-selected-border, #16a34a);
    color: var(--c-selected-border, #16a34a);
    background: var(--c-bg);
  }

  .chip {
    width: 28px; height: 28px; line-height: 26px;
    text-align: center;
    border-radius: 8px;
    border: 1px solid var(--c-stroke);
    background: var(--c-bg);
    color: var(--c-text);
    transition: background .12s ease, color .12s ease, border-color .12s ease;
  }
  .chip.active {
    border-color: var(--c-selected-border, #16a34a);
    color: var(--c-selected-border, #16a34a);
  }

  .input {
    width: 56px; padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid var(--c-stroke);
    background: var(--c-bg);
    color: var(--c-text);
    text-align: center;
    transition: background .12s ease, color .12s ease, border-color .12s ease;
  }

  .sep {
    width: 1px; height: 22px;
    background: var(--c-stroke-weak);
    margin: 0 2px;
  }
</style>
