import { renderPreview } from "./editor-render.js";
import { data, groupedCriteria, ruleSets } from "./editor-data.js";

// Sélecteurs du DOM principaux
const parentGroupSelect = document.getElementById("parent-group-select");
const subgroupSelect = document.getElementById("subgroup-select");
const groupSelect = document.getElementById("group-select");

const collapsedState = {};

// --- Fonctions d'UI --- //

export function initUI() {
  // Option (nœud)
  const optionInput = document.getElementById("option-name");
  const addOptionButton = document.getElementById("add-option");

  const selectSmart = document.getElementById("gamme-smart");
  const selectMod = document.getElementById("gamme-mod");
  const selectEvo = document.getElementById("gamme-evo");

  // Groupe
  const groupInput = document.getElementById("group-name");
  const addGroupButton = document.getElementById("add-group");

  // Sous-groupe
  const subgroupInput = document.getElementById("subgroup-name");
  const addSubgroupButton = document.getElementById("add-subgroup");

  // Règles
  const ruleFrom = document.getElementById("rule-from");
  const ruleTo = document.getElementById("rule-to");
  const ruleType = document.getElementById("rule-type");
  const ruleSetNameInput = document.getElementById("rule-set-name");
  const addRuleBtn = document.getElementById("add-rule");

  // --- Ajout d'option (nœud) --- //
  addOptionButton.addEventListener("click", () => {
    const name = optionInput.value.trim();
    if (!name) return;

    const group = groupSelect.value;
    if (!group) return;

    const newOption = {
      name,
      gammes: {
        Smart: selectSmart.value,
        Mod: selectMod.value,
        Evo: selectEvo.value
      }
    };

    if (!data[group]) {
      data[group] = [];
    }

    if (data[group].some(o => o.name === name)) {
      alert("Option déjà existante dans ce groupe !");
      return;
    }

    data[group].push(newOption);

    const subgroup = subgroupSelect.value;
    if (group && subgroup) {
      if (!groupedCriteria[group]) {
        groupedCriteria[group] = { subgroups: {} };
      }
      if (!groupedCriteria[group].subgroups[subgroup]) {
        groupedCriteria[group].subgroups[subgroup] = [];
      }
      if (!groupedCriteria[group].subgroups[subgroup].includes(name)) {
        groupedCriteria[group].subgroups[subgroup].push(name);
      }
    }

    optionInput.value = "";
    selectSmart.value = "absent";
    selectMod.value = "absent";
    selectEvo.value = "absent";

    renderPreview();
    refreshRuleOptionSelectors();
    renderGroupTree();
  });

  // --- Ajout de groupe --- //
  addGroupButton.addEventListener("click", () => {
    const groupName = groupInput.value.trim();
    if (!groupName) return;

    if (!groupedCriteria[groupName]) {
      groupedCriteria[groupName] = { subgroups: {} };
    }

    groupInput.value = "";
    refreshGroupSelectors();
    renderGroupTree();
    refreshRuleOptionSelectors();
    renderPreview();
  });

  // --- Ajout de sous-groupe --- //
  addSubgroupButton.addEventListener("click", () => {
    const group = parentGroupSelect.value;
    const subgroup = subgroupInput.value.trim();
    if (!group || !subgroup) return;

    if (!groupedCriteria[group]) {
      groupedCriteria[group] = { subgroups: {} };
    }
    if (!groupedCriteria[group].subgroups[subgroup]) {
      groupedCriteria[group].subgroups[subgroup] = [];
      if (!data[group]) data[group] = [];
    }

    subgroupInput.value = "";
    refreshSubgroupSelector();
    renderGroupTree();
  });

  // --- Ajout de règle --- //
  addRuleBtn.addEventListener("click", () => {
    const from = ruleFrom.value;
    const to = ruleTo.value;
    const type = ruleType.value;
    const setName = ruleSetNameInput.value.trim() || "default";

    if (!from || !to || !type || from === to) {
      alert("Veuillez sélectionner deux options différentes et le type de règle.");
      return;
    }

    if (!ruleSets[setName]) {
      ruleSets[setName] = { rules: {} };
    }
    if (!ruleSets[setName].rules[from]) {
      ruleSets[setName].rules[from] = {};
    }
    ruleSets[setName].rules[from][to] = type;

    ruleSetNameInput.value = "";

    refreshRulesListDisplay();
    renderPreview();
  });

  // --- Initialisation des selects et listes --- //
  refreshGroupSelectors();
  refreshRuleOptionSelectors();
  refreshRulesListDisplay();
  renderGroupTree();
}

// --- Rafraîchit les selecteurs de groupe --- //
function refreshGroupSelectors() {
  const groups = Object.keys(groupedCriteria);

  [groupSelect, parentGroupSelect].forEach(select => {
    const val = select.value;
    select.innerHTML = "";
    groups.forEach(g => {
      const opt = document.createElement("option");
      opt.value = g;
      opt.textContent = g;
      select.appendChild(opt);
    });
    // Sélectionne l'ancien groupe si toujours présent, sinon sélectionne le premier
    if (groups.includes(val)) {
      select.value = val;
    } else if (groups.length > 0) {
      select.value = groups[0];
    } else {
      select.value = ""; // plus aucun groupe
    }
  });

  refreshSubgroupSelector();
}
window.refreshGroupSelectors = refreshGroupSelectors;

// --- Rafraîchit le selecteur de sous-groupe --- //
function refreshSubgroupSelector() {
  const group = groupSelect.value;
  const subgroups = groupedCriteria[group]?.subgroups || {};
  const current = subgroupSelect.value;

  subgroupSelect.innerHTML = "";
  const subNames = Object.keys(subgroups);
  subNames.forEach(sg => {
    const opt = document.createElement("option");
    opt.value = sg;
    opt.textContent = sg;
    subgroupSelect.appendChild(opt);
  });

  // Sélectionne l'ancien sous-groupe si toujours présent, sinon le premier, sinon rien
  if (subgroups[current]) {
    subgroupSelect.value = current;
  } else if (subNames.length > 0) {
    subgroupSelect.value = subNames[0];
  } else {
    subgroupSelect.value = "";
  }
}

// --- Rafraîchit les selects pour les règles --- //
function refreshRuleOptionSelectors() {
  const allOptions = [];

  Object.values(data).forEach(options =>
    options.forEach(opt => allOptions.push(opt.name))
  );

  [document.getElementById("rule-from"), document.getElementById("rule-to")].forEach(select => {
    const current = select.value;
    select.innerHTML = "";
    allOptions.forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });
    if (allOptions.includes(current)) select.value = current;
  });
}
window.refreshRuleOptionSelectors = refreshRuleOptionSelectors;

// --- Rafraîchit la liste des règles --- //
function refreshRulesListDisplay() {
  const rulesList = document.getElementById("rules-list");
  
  rulesList.innerHTML = "";

  Object.entries(ruleSets).forEach(([setName, { rules }]) => {
    Object.entries(rules).forEach(([from, targets]) => {
      Object.entries(targets).forEach(([to, type]) => {
        const li = document.createElement("li");
        li.textContent = `${from} ${type === "requires" ? "dépend de" : "incompatible avec"} ${to} [${setName}]`;

        const btn = document.createElement("button");
        btn.textContent = "❌";
        btn.style.marginLeft = "8px";
        btn.onclick = () => {
          delete ruleSets[setName].rules[from][to];
          if (Object.keys(ruleSets[setName].rules[from]).length === 0) {
            delete ruleSets[setName].rules[from];
          }
          if (Object.keys(ruleSets[setName].rules).length === 0) {
            delete ruleSets[setName];
          }
          refreshRulesListDisplay();
          renderPreview();
        };

        li.appendChild(btn);
        rulesList.appendChild(li);
      });
    });
  });
}

// --- Affiche l'arbre Groupe/Sous-groupe/Noeuds avec boutons suppression --- //
function renderGroupTree() {
  const treeContainer = document.getElementById("group-tree");
  treeContainer.innerHTML = "";

  Object.entries(groupedCriteria).forEach(([groupName, groupObj]) => {
    // Groupe
    const groupEl = document.createElement("div");
    groupEl.style.fontWeight = "bold";
    groupEl.style.marginTop = "10px";
    groupEl.style.display = "flex";
    groupEl.style.alignItems = "center";
    groupEl.textContent = groupName + " ";

    // Bouton suppression groupe
    const delGroupBtn = document.createElement("button");
    delGroupBtn.textContent = "❌";
    delGroupBtn.style.marginLeft = "5px";
    delGroupBtn.title = "Supprimer ce groupe et tout son contenu";
    delGroupBtn.onclick = () => {
      if (confirm(`Supprimer le groupe "${groupName}" et tout son contenu ?`)) {
        delete groupedCriteria[groupName];
        delete data[groupName];
        renderGroupTree();
        renderPreview();
        window.refreshRuleOptionSelectors && window.refreshRuleOptionSelectors();
        window.refreshGroupSelectors && window.refreshGroupSelectors();
      }
    };
    groupEl.appendChild(delGroupBtn);

    treeContainer.appendChild(groupEl);

    Object.entries(groupObj.subgroups).forEach(([subName, options]) => {
  if (!collapsedState[groupName]) collapsedState[groupName] = {};
  const isCollapsed = collapsedState[groupName][subName];

  // Conteneur du sous-groupe
  const subEl = document.createElement("div");
  subEl.style.marginLeft = "20px";
  subEl.style.display = "flex";
  subEl.style.alignItems = "center";

  // Bouton d'ouverture/fermeture
  const toggleBtn = document.createElement("span");
  toggleBtn.textContent = isCollapsed ? "▶" : "▼";
  toggleBtn.style.cursor = "pointer";
  toggleBtn.style.marginRight = "3px";
  toggleBtn.onclick = () => {
    collapsedState[groupName][subName] = !isCollapsed;
    renderGroupTree(); // refresh vue
  };
  subEl.appendChild(toggleBtn);

  // Nom du sous-groupe
  const label = document.createElement("span");
  label.innerHTML = `📂 ${subName} `;
  subEl.appendChild(label);

  // Bouton suppression sous-groupe (identique à avant)
  const delSubBtn = document.createElement("button");
  delSubBtn.textContent = "❌";
  delSubBtn.style.marginLeft = "5px";
  delSubBtn.title = "Supprimer ce sous-groupe et ses options";
  delSubBtn.onclick = () => {
    if (confirm(`Supprimer le sous-groupe "${subName}" et toutes ses options ?`)) {
      if (options) {
        options.forEach(optName => {
          if (data[groupName]) {
            const idx = data[groupName].findIndex(o => o.name === optName);
            if (idx !== -1) data[groupName].splice(idx, 1);
          }
        });
      }
      delete groupedCriteria[groupName].subgroups[subName];
      renderGroupTree();
      renderPreview();
      window.refreshRuleOptionSelectors && window.refreshRuleOptionSelectors();
      window.refreshGroupSelectors && window.refreshGroupSelectors();
    }
  };
  subEl.appendChild(delSubBtn);

  treeContainer.appendChild(subEl);

  // Liste des noeuds (si ouvert)
  if (!isCollapsed) {
    if (options && options.length > 0) {
      const ul = document.createElement("ul");
      ul.style.margin = "4px 0 10px 28px";
      options.forEach(o => {
        const li = document.createElement("li");
        li.style.marginLeft = "8px";
        li.style.display = "flex";
        li.style.alignItems = "center";
        li.textContent = `📄 ${o} `;

        // Bouton suppression nœud (identique à avant)
        const delNodeBtn = document.createElement("button");
        delNodeBtn.textContent = "❌";
        delNodeBtn.style.marginLeft = "5px";
        delNodeBtn.title = "Supprimer ce nœud";
        delNodeBtn.onclick = () => {
          if (confirm(`Supprimer le nœud "${o}" ?`)) {
            if (data[groupName]) {
              const idx = data[groupName].findIndex(opt => opt.name === o);
              if (idx !== -1) data[groupName].splice(idx, 1);
            }
            const arr = groupedCriteria[groupName].subgroups[subName];
            const i = arr.indexOf(o);
            if (i !== -1) arr.splice(i, 1);
            renderGroupTree();
            renderPreview();
            window.refreshRuleOptionSelectors && window.refreshRuleOptionSelectors();
          }
        };
        li.appendChild(delNodeBtn);
        ul.appendChild(li);
      });
      treeContainer.appendChild(ul);
    } else {
      const empty = document.createElement("div");
      empty.style.marginLeft = "36px";
      empty.style.color = "#999";
      empty.textContent = "(aucune option)";
      treeContainer.appendChild(empty);
    }
  }
});
  });
}
