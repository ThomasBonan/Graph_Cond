<script>
  import { selected, gammes, optionLabels } from '../lib/stores.js';

  const keys = ['Smart','Mod','Evo'];
  function statusFor(g, id) {
    const st = (g || {})[id] || { included:false, optional:false };
    return st.included ? 'included' : (st.optional ? 'optional' : 'absent');
  }
  $: sel = Array.from($selected || []);
  $: compat = keys.filter(k => sel.every(id => {
    const st = statusFor($gammes[k], id);
    return st === 'included' || st === 'optional';
  }));
  $: blocking = Object.fromEntries(keys.map(k => {
    const bad = sel.filter(id => statusFor($gammes[k], id) === 'absent');
    return [k, bad];
  }));
</script>

<div class="card">
  <h3>Résumé gammes</h3>
  {#if sel.length === 0}
    <p class="muted">Aucune option sélectionnée. Toutes les gammes sont potentielles (Smart, Mod, Evo).</p>
  {:else}
    <p><strong>Gammes compatibles :</strong> {compat.length ? compat.join(', ') : 'aucune'}</p>
    {#if compat.length === 0}
      <p class="muted">Aucune gamme ne couvre l’ensemble de la sélection.</p>
    {/if}

    <details>
      <summary>Pourquoi ? (détails par gamme)</summary>
      {#each keys as k}
        <div class="line">
          <span class="k">{k}</span>
          {#if blocking[k].length === 0}
            <span class="ok">✓ compatible</span>
          {:else}
            <span class="bad">✗ bloqueurs&nbsp;: {blocking[k].map(id => $optionLabels[id] || id).join(', ')}</span>
          {/if}
        </div>
      {/each}
    </details>
  {/if}
</div>

<style>
  .card { border:1px solid var(--c-stroke); border-radius:8px; padding:10px; }
  .muted { color: var(--c-text-muted); }
  .line { margin:6px 0; }
  .k { display:inline-block; min-width:56px; font-weight:600; }
  .ok { color:#16a34a; }
  .bad { color:#dc2626; }
</style>
