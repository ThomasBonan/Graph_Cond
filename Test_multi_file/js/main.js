import * as setup from "./setup.js";
import { renderNodes, recenterGraph } from "./render.js";
import { updateGammeSummary } from "./summary.js";
import { handleClick, isDisabledWithContext } from "./selection.js";
import { setupImportHandlers } from "./import-handler.js";
import { setupRulesetSelector } from "./ruleset-ui.js";

/* ------------------------ Thème (parité éditeur) ------------------------ */

function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('be-ui-theme', theme); } catch {}
  const btn = document.getElementById('theme-toggle');
  if (btn){
    const isLight = theme === 'light';
    btn.setAttribute('aria-pressed', String(isLight));
    btn.textContent = isLight ? "🌙 Thème sombre" : "☀️ Thème clair";
  }
  // Re-render pour que le SVG prenne les variables CSS
  rerender();
}

function loadInitialTheme(){
  try {
    const saved = localStorage.getItem('be-ui-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {}
  const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
  return prefersLight ? 'light' : 'dark';
}

/* ------------------------ Rendu centralisé ------------------------ */

let searchTerm = ""; // A9: filtre live

function rerender(){
  // S’assure qu’on a toujours des règles courantes
  if (!setup.store.currentRuleSetName) {
    setup.store.currentRuleSetName = Object.keys(setup.store.ruleSets)[0] || "default";
  }
  setup.store.currentRules = setup.store.ruleSets[setup.store.currentRuleSetName]?.rules || {};

  // Render (A3: toujours passer currentRules)
  const svg = d3.select("#graph");
  svg.selectAll("*").remove();
  renderNodes(
    setup.nodes,
    setup.selected,
    handleClick,
    isDisabledWithContext,
    setup.store.currentRules,
    { search: searchTerm }
  );
  updateGammeSummary();
}

/* ------------------------ Bootstrap ------------------------ */

window.addEventListener("DOMContentLoaded", () => {
  // Thème au plus tôt
  applyTheme(loadInitialTheme());

  // Construire nodes à partir des données initiales (si présentes)
  setup.setupNodes();

  // UI import + ruleset
  setupImportHandlers();
  setupRulesetSelector();

  // Rendu initial + recentrage
  rerender();
  document.getElementById("recenter-graph")?.addEventListener("click", () => {
    recenterGraph();
  });
  // petit délai pour laisser le SVG se poser
  requestAnimationFrame(() => recenterGraph());

  // Bouton thème
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(cur === 'light' ? 'dark' : 'light');
  });

  // Clear selection
  document.getElementById("clear-selection")?.addEventListener("click", () => {
    setup.selected.clear();
    rerender();
  });

  // Recherche live (A9)
  const searchInput = document.getElementById("search-input");
  searchInput?.addEventListener("input", (e) => {
    searchTerm = (e.target.value || "").toString().trim().toLowerCase();
    rerender();
  });

  // Raccourcis (A9)
  document.addEventListener("keydown", (e) => {
    if (e.key === "r" || e.key === "R") {
      recenterGraph();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
      e.preventDefault();
      searchInput?.focus();
      searchInput?.select();
    }
    if (e.key === "Escape") {
      if (searchTerm) {
        searchTerm = "";
        if (searchInput) searchInput.value = "";
        rerender();
      } else {
        setup.selected.clear();
        rerender();
      }
    }
  });

  // Expose debug (facultatif)
  window.__be = { setup, rerender };
});