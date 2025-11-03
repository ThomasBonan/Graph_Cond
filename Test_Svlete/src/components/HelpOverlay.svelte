<!--
  HelpOverlay.svelte
  ----------------------------------------------------------------------------
  Floating help entry point that exposes two tabs: a quick mode-specific guide
  and a lightweight README derived from the shared readme-content module. This
  keeps onboarding hints a click away on both editor and configurator screens.
-->
<script>
  import { onMount } from 'svelte';
  import { mode } from '../lib/stores.js';
  import { readmeSections, readmeShortcuts, readmeLinks } from '../lib/readme-content.js';

  let open = false;
  let activeTab = 'guide';

  $: guideTitle =
    $mode === 'editor'
      ? 'Guide rapide - Mode editeur'
      : 'Guide rapide - Mode configurateur';
  $: modalTitle = activeTab === 'guide' ? guideTitle : 'README de reference';

  function toggle(tab = 'guide') {
    if (open && activeTab === tab) {
      open = false;
      return;
    }
    activeTab = tab;
    open = true;
  }

  function close() {
    open = false;
  }

  function showReadme() {
    activeTab = 'readme';
    open = true;
  }

  function openReadmeExternal() {
    if (typeof window === 'undefined') return;
    const target = readmeLinks?.readmeUrl;
    if (target) {
      window.open(target, '_blank', 'noopener');
    }
  }

  function handleKey(event) {
    if (!open) return;
    if (event.key === 'Escape') {
      close();
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });
</script>

<button
  class="help-trigger"
  type="button"
  aria-expanded={open}
  aria-controls="help-overlay"
  on:click={() => toggle('guide')}
>
  ?
</button>

{#if open}
  <div
    class="help-backdrop"
    role="button"
    tabindex="0"
    aria-label="Fermer l'aide"
    on:click={(event) => {
      if (event.currentTarget === event.target) close();
    }}
    on:keydown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        close();
      }
    }}
  >
    <div
      id="help-overlay"
      class="help-modal"
      role="dialog"
      aria-modal="true"
      aria-label={modalTitle}
    >
      <header class="help-header">
        <div class="title-block">
          <h2>{modalTitle}</h2>
          <div class="help-tabs" role="tablist" aria-label="Aide disponible">
            <button
              type="button"
              role="tab"
              class:selected={activeTab === 'guide'}
              aria-selected={activeTab === 'guide'}
              on:click={() => (activeTab = 'guide')}
            >
              Guide rapide
            </button>
            <button
              type="button"
              role="tab"
              class:selected={activeTab === 'readme'}
              aria-selected={activeTab === 'readme'}
              on:click={showReadme}
            >
              README
            </button>
          </div>
        </div>
        <button class="close-btn" type="button" on:click={close} aria-label="Fermer l'aide">
          &times;
        </button>
      </header>

      {#if activeTab === 'guide'}
        {#if $mode === 'editor'}
          <section>
            <h3>Objectif</h3>
            <p>Creer ou modifier des schemas, organiser les options et regler les dependances.</p>
          </section>
          <section>
            <h3>Actions clefs</h3>
            <ul>
              <li>Nommer le schema puis utiliser <strong>Enregistrer</strong> ou <strong>Mettre a jour</strong>.</li>
              <li><strong>Archiver</strong> pour retirer un schema de la liste principale tout en le restaurant depuis la section dediee.</li>
              <li><strong>Voir les logs</strong> (compte bootstrap) affiche l historique des operations sur le schema.</li>
              <li><strong>Dupliquer</strong> pour cloner le schema courant avant d iterer.</li>
              <li><strong>Supprimer</strong> retire definitivement le schema selectionne.</li>
              <li>Liste deroulante pour charger un schema conserve en base.</li>
              <li>Historique disponible via <em>Annuler</em> / <em>Retablir</em>.</li>
              <li><em>Restaurer</em> importe un brouillon stocke en local.</li>
            </ul>
          </section>
          <section>
            <h3>Raccourcis</h3>
            <ul>
              <li><kbd>Ctrl</kbd> ou <kbd>Cmd</kbd> + <kbd>S</kbd> — Enregistrer le schema.</li>
              <li><kbd>Ctrl</kbd> ou <kbd>Cmd</kbd> + <kbd>F</kbd> — Ouvrir l aide et positionner la recherche.</li>
              <li><kbd>Escape</kbd> — Fermer le menu ou le formulaire de connexion.</li>
            </ul>
          </section>
          <section>
            <h3>Conseils</h3>
            <ul>
              <li>Structurer groupes et sous-groupes avant d ajouter des regles.</li>
              <li>Utiliser la duplication pour tester des variantes sans perdre la version d origine.</li>
              <li>Les brouillons locaux se restaurent apres un rafraichissement.</li>
            </ul>
          </section>
        {:else}
          <section>
            <h3>Objectif</h3>
            <p>Explorer les schemas en lecture seule et visualiser les regles dans le configurateur.</p>
          </section>
          <section>
            <h3>Actions disponibles</h3>
            <ul>
              <li>Selectionner un schema via la liste deroulante.</li>
              <li><strong>Importer</strong> / <strong>Exporter JSON</strong> pour partager un schema.</li>
              <li><strong>Reinitialiser</strong> pour revenir a l etat neutre.</li>
              <li>Basculer le theme clair/sombre depuis le menu.</li>
            </ul>
          </section>
          <section>
            <h3>Raccourcis</h3>
            <ul>
              <li><kbd>Ctrl</kbd> ou <kbd>Cmd</kbd> + <kbd>F</kbd> — Ouvrir l aide et lancer la recherche.</li>
              <li><kbd>Escape</kbd> — Fermer le menu ou le formulaire de connexion.</li>
            </ul>
          </section>
          <section>
            <h3>Bonnes pratiques</h3>
            <ul>
              <li>Utiliser les filtres (groupe, gamme) pour isoler un sous-ensemble.</li>
              <li>Verifier les toasts apres import/export pour confirmer l action.</li>
              <li>Consulter le resume pour controler les regles appliquees.</li>
            </ul>
          </section>
        {/if}
      {:else}
        <section class="readme-intro">
          <p>Ce resume reprend les actions frequentes et les points d attention pour la petite equipe terrain.</p>
        </section>
        {#each readmeSections as section (section.id)}
          <section>
            <h3>{section.title}</h3>
            <ul>
              {#each section.bullets as bullet}
                <li>{bullet}</li>
              {/each}
            </ul>
          </section>
        {/each}
        <section class="readme-shortcuts">
          <h3>Raccourcis clavier</h3>
          <ul>
            {#each readmeShortcuts as shortcut, index (index)}
              <li>
                <span class="shortcut-keys">
                  {#if shortcut.combo?.length}
                    <kbd>{shortcut.combo.join(' ou ')}</kbd>
                    <span class="operator">+</span>
                  {/if}
                  <kbd>{shortcut.key}</kbd>
                </span>
                <span class="shortcut-note">{shortcut.note}</span>
              </li>
            {/each}
          </ul>
        </section>
        <div class="readme-footer">
          <button type="button" class="btn-outline" on:click={openReadmeExternal}>
            Ouvrir le README complet
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .help-trigger {
    position: fixed;
    bottom: 18px;
    right: 18px;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: none;
    background: #1d4ed8;
    color: #fff;
    font-size: 24px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 8px 20px rgba(29, 78, 216, 0.35);
    z-index: 900;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .help-trigger:hover {
    background: #2563eb;
  }
  .help-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.35);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 950;
    padding: 32px 16px;
  }
  .help-modal {
    background: var(--panel-bg, #f7f8fa);
    color: var(--text-color, #0f172a);
    border-radius: 16px;
    padding: 24px;
    max-width: 640px;
    width: min(92vw, 640px);
    max-height: calc(100vh - 64px);
    overflow-y: auto;
    box-shadow: 0 20px 40px rgba(15, 23, 42, 0.28);
  }
  .help-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 20px;
  }
  .title-block {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .help-header h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
  }
  .help-tabs {
    display: inline-flex;
    background: rgba(148, 163, 184, 0.18);
    border-radius: 999px;
    padding: 4px;
    gap: 4px;
  }
  .help-tabs button {
    border: none;
    background: transparent;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    color: #475569;
    cursor: pointer;
  }
  .help-tabs button.selected {
    background: #1d4ed8;
    color: #fff;
  }
  .close-btn {
    border: none;
    background: transparent;
    font-size: 28px;
    line-height: 1;
    color: inherit;
    cursor: pointer;
  }
  section {
    margin-bottom: 18px;
  }
  section:last-of-type {
    margin-bottom: 0;
  }
  h3 {
    margin: 0 0 6px;
    font-size: 15px;
    font-weight: 700;
    color: var(--c-text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  p {
    margin: 0 0 8px;
    font-size: 14px;
    line-height: 1.5;
  }
  ul {
    margin: 0;
    padding-left: 18px;
    font-size: 14px;
    line-height: 1.5;
  }
  kbd {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 6px;
    border: 1px solid rgba(148, 163, 184, 0.6);
    background: rgba(226, 232, 240, 0.6);
    font-family: inherit;
    font-size: 12px;
    margin: 0 2px;
  }
  .readme-intro p {
    font-style: italic;
    color: #475569;
  }
  .readme-shortcuts ul {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .readme-shortcuts li {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }
  .shortcut-keys {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .operator {
    font-weight: 600;
    color: #475569;
  }
  .shortcut-note {
    font-size: 13px;
    color: #4b5563;
  }
  .readme-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 12px;
  }
  .btn-outline {
    border: 1px solid #1d4ed8;
    color: #1d4ed8;
    background: transparent;
    border-radius: 8px;
    padding: 6px 14px;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-outline:hover {
    background: rgba(29, 78, 216, 0.1);
  }
  @media (max-width: 520px) {
    .help-modal {
      padding: 18px;
      border-radius: 12px;
    }
    .help-trigger {
      bottom: 14px;
      right: 14px;
    }
    .help-tabs {
      width: 100%;
      justify-content: space-between;
    }
  }
</style>
