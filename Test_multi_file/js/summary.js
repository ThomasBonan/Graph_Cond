import { determineGammes, explainGammes } from "./gamme-engine.js";
import { selected, gammes } from "./setup.js";

export function updateGammeSummary() {
  const div = document.getElementById("gamme-summary");
  div.innerHTML = "<h3>Résumé de gamme</h3>";

  const possibles = determineGammes(selected, gammes);
  const explications = explainGammes(selected, gammes);

  for (const [gamme, details] of Object.entries(explications)) {
    const valid = details.valid;
    const status = valid ? "✅ VALIDE" : "❌ Non valide";
    const list = [];

    if (details.invalid.length)
      list.push(`<span style="color:red">Indisponible : ${details.invalid.join(", ")}</span>`);
    if (details.missing.length)
      list.push(`<span style="color:orange">Option : ${details.missing.join(", ")}</span>`);

    div.innerHTML += `<p><b>${gamme}</b> – ${status}<br>${list.join("<br>")}</p>`;
  }

  if (possibles.length === 1) {
    div.innerHTML += `<hr><h4>🎯 Gamme recommandée : <b>${possibles[0]}</b></h4>`;
  } else if (possibles.length > 1) {
    div.innerHTML += `<hr><h4>🎯 Gammes compatibles : <b>${possibles.join(", ")}</b></h4>`;
  } else {
    div.innerHTML += `<hr><h4>❗Aucune gamme compatible</h4>`;
  }
}