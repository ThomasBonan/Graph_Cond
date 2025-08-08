import { initData } from './editor-data.js';
import { initUI } from './editor-ui.js';
import { renderPreview, setupRecenterButton } from './editor-render.js';

window.addEventListener("DOMContentLoaded", () => {
  initData();
  initUI();
  renderPreview();
  setupRecenterButton();
});
