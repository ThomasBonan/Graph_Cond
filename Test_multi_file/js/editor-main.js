import { initData } from './editor-data.js';
import { initUI, setSearchTerm } from './editor-ui.js';
import { renderPreview, setupRecenterButton, recenterPreview } from './editor-render.js';

let currentSearch = "";

function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('be-editor-theme', theme); } catch {}
  const btn = document.getElementById('theme-toggle');
  if (btn){
    const isLight = theme === 'light';
    btn.setAttribute('aria-pressed', String(isLight));
    btn.textContent = isLight ? "🌙 Thème sombre" : "☀️ Thème clair";
  }
  renderPreview({ search: currentSearch });
}

function loadInitialTheme(){
  try {
    const saved = localStorage.getItem('be-editor-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {}
  const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
  return prefersLight ? 'light' : 'dark';
}

window.addEventListener("DOMContentLoaded", () => {
  // Thème au plus tôt
  applyTheme(loadInitialTheme());

  initData();
  initUI();             // construit l’arbre & branche les boutons
  renderPreview();      // 1er rendu
  setupRecenterButton();// branche le bouton recentrer

  // Barre de recherche (filtre arbre + aperçu)
  const searchInput = document.getElementById("search-input-editor");
  if (searchInput){
    searchInput.addEventListener("input", (e) => {
      currentSearch = (e.target.value || "").toString().trim().toLowerCase();
      setSearchTerm(currentSearch);
      renderPreview({ search: currentSearch });
    });
  }

  // Bouton de toggle thème
  const toggle = document.getElementById('theme-toggle');
  if (toggle){
    toggle.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      applyTheme(cur === 'light' ? 'dark' : 'light');
    });
  }

  // Raccourci clavier: R → recenter
  document.addEventListener("keydown", (e) => {
    if (e.key === "r" || e.key === "R") {
      recenterPreview();
    }
  });
});