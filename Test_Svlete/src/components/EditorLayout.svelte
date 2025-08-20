<script>
  import { writable, get } from 'svelte/store';
  import EditorSidebar from './EditorSidebar.svelte';
  import GraphPane from './GraphPane.svelte';
  import RuleEditor from './RuleEditor.svelte';

  // Largeurs persistées (px)
  const leftW  = writable(parseInt(localStorage.getItem('ed_leftW'))  || 320);
  const graphW = writable(parseInt(localStorage.getItem('ed_graphW')) || 900);

  leftW.subscribe(v  => localStorage.setItem('ed_leftW',  String(v)));
  graphW.subscribe(v => localStorage.setItem('ed_graphW', String(v)));

  let host;

  function startDrag(which, e) {
    e.preventDefault();
    const startX = e.clientX;
    const rect = host.getBoundingClientRect();
    const start = { L: get(leftW), G: get(graphW) };
    const min   = { L: 240, G: 720 };

    function onMove(ev) {
      const dx = ev.clientX - startX;
      if (which === 'L') leftW.set(Math.max(min.L, start.L + dx));
      if (which === 'G') graphW.set(Math.max(min.G, start.G + dx));
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
</script>

<!-- Grille sans colonne de résumé -->
<div bind:this={host} class="layout editor-grid no-summary"
     style="--leftW: {$leftW}px; --graphW: {$graphW}px;">
  <!-- Col 1 -->
  <aside class="panel-left">
    <EditorSidebar />
  </aside>

  <!-- Col 2 : splitter 1 -->
  <div class="splitter" on:mousedown={(e)=>startDrag('L', e)} />

  <!-- Col 3 : GraphPane large -->
  <section class="graphpane">
    <GraphPane />
  </section>

  <!-- Col 4 : splitter 2 -->
  <div class="splitter" on:mousedown={(e)=>startDrag('G', e)} />

  <!-- Col 5 : RuleEditor -->
  <section class="ruleeditor">
    <RuleEditor />
  </section>
</div>

<style>
  /* 5 colonnes (2 splitters de 6px) */
  .editor-grid.no-summary {
    display: grid;
    grid-template-columns: var(--leftW) 6px var(--graphW) 6px minmax(460px, 1fr);
    grid-template-rows: 1fr;
    gap: 0;
    height: calc(100% - 52px);
    min-width: 1200px;
    background: var(--c-bg);
    color: var(--c-text);
  }

  .panel-left  { grid-column: 1; overflow: auto; background: var(--c-box-bg); padding: 12px 16px; border-right: 1px solid var(--c-stroke); }
  .graphpane   { grid-column: 3; overflow: hidden; display: flex; min-width: 720px; background: var(--c-bg); }
  .ruleeditor  { grid-column: 5; overflow: auto; background: var(--c-bg); border-left: 1px solid var(--c-stroke); }

  /* Le graph occupe TOUT l'espace dispo */
  .graphpane :global(svg),
  .graphpane :global(canvas) {
    flex: 1;
    min-height: 0;
  }

  /* Splitters */
  .splitter { background: transparent; cursor: col-resize; }
  .splitter:hover { background: color-mix(in srgb, var(--c-stroke) 50%, transparent); }
</style>
