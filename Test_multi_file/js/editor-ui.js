import { renderPreview } from "./editor-render.js";
import { data, groupedCriteria, ruleSets, saveState, loadState, getAllOptions } from "./editor-data.js";
import { exportCommercialJSON, exportLegacyJS } from "./editor-export.js";

const parentGroupSelect = document.getElementById("parent-group-select");
const subgroupSelect = document.getElementById("subgroup-select");
const groupSelect = document.getElementById("group-select");

const collapsedState = {};
let currentSearch = "";

// Permet au main de pousser le filtre
export function setSearchTerm(term){
  currentSearch = (term || "").toLowerCase();
  renderGroupTree();
  renderPreview({ search: currentSearch });
}

export function initUI() {
  loadState();

  const optionInput = document.getElementById("option-name");
  const addOptionButton = document.getElementById("add-option");

  const selectSmart = document.getElementById("gamme-smart");
  const selectMod = document.getElementById("gamme-mod");
  const selectEvo = document.getElementById("gamme-evo");

  const groupInput = document.getElementById("group-name");
  const addGroupButton = document.getElementById("add-group");

  const subgroupInput = document.getElementById("subgroup-name");
  const addSubgroupButton = document.getElementById("add-subgroup");

  const ruleFrom = document.getElementById("rule-from");
  const ruleTo = document.getElementById("rule-to");
  const ruleType = document.getElementById("rule-type");
  const ruleSetNameInput = document.getElementById("rule-set-name");
  const addRuleBtn = document.getElementById("add-rule");

  const exportJsonBtn = document.getElementById("export-json");
  const exportLegacyBtn = document.getElementById("export-legacy");
  exportJsonBtn?.addEventListener("click", () => exportCommercialJSON(data, groupedCriteria, ruleSets));
  exportLegacyBtn?.addEventListener("click", () => exportLegacyJS(data, groupedCriteria, ruleSets));

  // Ajouter option (✅ autorise même nom si autre sous-groupe ou groupe)
  addOptionButton.addEventListener("click", () => {
    const name = optionInput.value.trim();
    if (!name) return;

    const group = groupSelect.value;
    if (!group) return;

    const sg = subgroupSelect.value;
    const id = self.crypto?.randomUUID?.() ?? ("o_" + Math.random().toString(36).slice(2) + Date.now());

    const newOption = {
      id,
      name,
      gammes: {
        Smart: selectSmart.value,
        Mod: selectMod.value,
        Evo: selectEvo.value
      }
    };

    if (!data[group]) data[group] = [];
    // ❌ on ne bloque plus sur le nom; on autorise les doublons
    data[group].push(newOption);

    if (!groupedCriteria[group]) groupedCriteria[group] = { subgroups: {} };
    if (!groupedCriteria[group].subgroups[sg]) groupedCriteria[group].subgroups[sg] = [];
    groupedCriteria[group].subgroups[sg].push(id);

    optionInput.value = "";
    selectSmart.value = "absent";
    selectMod.value = "absent";
    selectEvo.value = "absent";

    saveState();
    renderPreview({ search: currentSearch });
    refreshRuleOptionSelectors();
    renderGroupTree();
  });

  addGroupButton.addEventListener("click", () => {
    const groupName = groupInput.value.trim();
    if (!groupName) return;
    if (!groupedCriteria[groupName]) groupedCriteria[groupName] = { subgroups: {} };
    groupInput.value = "";
    saveState();
    refreshGroupSelectors();
    renderGroupTree();
    refreshRuleOptionSelectors();
    renderPreview({ search: currentSearch });
  });

  addSubgroupButton.addEventListener("click", () => {
    const group = parentGroupSelect.value;
    const sg = subgroupInput.value.trim();
    if (!group || !sg) return;
    if (!groupedCriteria[group]) groupedCriteria[group] = { subgroups: {} };
    if (!groupedCriteria[group].subgroups[sg]) {
      groupedCriteria[group].subgroups[sg] = [];
      if (!data[group]) data[group] = [];
    }
    subgroupInput.value = "";
    saveState();
    refreshSubgroupSelector();
    renderGroupTree();
  });

  // Ajout règle (valeurs = IDs)
  addRuleBtn.addEventListener("click", () => {
    const from = ruleFrom.value;
    const to = ruleTo.value;
    const type = ruleType.value;
    const setName = ruleSetNameInput.value.trim() || "default";
    if (!from || !to || !type || from === to) {
      alert("Veuillez sélectionner deux options différentes et le type de règle.");
      return;
    }
    if (!ruleSets[setName]) ruleSets[setName] = { rules: {} };
    if (!ruleSets[setName].rules[from]) ruleSets[setName].rules[from] = {};
    ruleSets[setName].rules[from][to] = type;
    ruleSetNameInput.value = "";
    saveState();
    refreshRulesListDisplay();
    renderPreview({ search: currentSearch });
  });

  refreshGroupSelectors();
  refreshRuleOptionSelectors();
  refreshRulesListDisplay();
  renderGroupTree();
}

function refreshGroupSelectors() {
  const groups = Object.keys(groupedCriteria);
  [groupSelect, parentGroupSelect].forEach(select => {
    if (!select) return;
    const prev = select.value;
    select.innerHTML = "";
    groups.forEach(g => {
      const opt = document.createElement("option");
      opt.value = g; opt.textContent = g;
      select.appendChild(opt);
    });
    if (groups.includes(prev)) select.value = prev;
    else if (groups.length > 0) select.value = groups[0];
    else select.value = "";
  });
  refreshSubgroupSelector();
}

function refreshSubgroupSelector() {
  const group = groupSelect.value;
  const subgroups = groupedCriteria[group]?.subgroups || {};
  const current = subgroupSelect?.value;
  if (subgroupSelect) {
    subgroupSelect.innerHTML = "";
    const names = Object.keys(subgroups);
    names.forEach(sg => {
      const opt = document.createElement("option");
      opt.value = sg; opt.textContent = sg;
      subgroupSelect.appendChild(opt);
    });
    if (subgroups[current]) subgroupSelect.value = current;
    else if (names.length > 0) subgroupSelect.value = names[0];
    else subgroupSelect.value = "";
  }
}

// Règles: listes d’options (IDs) avec label "Nom (Groupe / Sous-groupe)"
function refreshRuleOptionSelectors() {
  const all = getAllOptions(); // [{id,name,group,subgroups:[...] }]
  [document.getElementById("rule-from"), document.getElementById("rule-to")].forEach(select => {
    if (!select) return;
    const prev = select.value;
    select.innerHTML = "";
    all.forEach(({ id, name, group, subgroups }) => {
      const opt = document.createElement("option");
      const context = subgroups.length ? ` (${group} / ${subgroups[0]})` : ` (${group})`;
      opt.value = id;
      opt.textContent = name + context;
      select.appendChild(opt);
    });
    if (all.some(o => o.id === prev)) select.value = prev;
  });
}

function refreshRulesListDisplay() {
  const rulesList = document.getElementById("rules-list");
  if (!rulesList) return;
  rulesList.innerHTML = "";

  // helper pour id->label
  const labelOf = (id) => {
    const all = getAllOptions();
    const f = all.find(o => o.id === id);
    return f ? `${f.name} (${f.group}${f.subgroups[0] ? " / " + f.subgroups[0] : ""})` : id;
    };

  Object.entries(ruleSets).forEach(([setName, { rules }]) => {
    Object.entries(rules).forEach(([fromId, targets]) => {
      Object.entries(targets).forEach(([toId, type]) => {
        const li = document.createElement("li");
        li.textContent = `${labelOf(fromId)} ${type === "requires" ? "dépend de" : "incompatible avec"} ${labelOf(toId)} [${setName}]`;

        const btn = document.createElement("button");
        btn.textContent = "❌";
        btn.style.marginLeft = "8px";
        btn.addEventListener("click", () => {
          delete ruleSets[setName].rules[fromId][toId];
          if (Object.keys(ruleSets[setName].rules[fromId]).length === 0) delete ruleSets[setName].rules[fromId];
          if (Object.keys(ruleSets[setName].rules).length === 0) delete ruleSets[setName];
          saveState();
          refreshRulesListDisplay();
          renderPreview({ search: currentSearch });
        });

        li.appendChild(btn);
        rulesList.appendChild(li);
      });
    });
  });
}

function renderGroupTree() {
  const tree = document.getElementById("group-tree");
  if (!tree) return;
  tree.innerHTML = "";

  Object.entries(groupedCriteria).forEach(([groupName, groupObj]) => {
    const groupMatch = groupName.toLowerCase().includes(currentSearch);

    const groupEl = document.createElement("div");
    groupEl.style.fontWeight = "bold";
    groupEl.style.marginTop = "10px";
    groupEl.style.display = "flex";
    groupEl.style.alignItems = "center";

    const gText = document.createElement("span");
    gText.textContent = groupName + " ";
    if (currentSearch && groupMatch) gText.style.fontWeight = "800";
    groupEl.appendChild(gText);

    const delGroupBtn = document.createElement("button");
    delGroupBtn.textContent = "❌";
    delGroupBtn.style.marginLeft = "5px";
    delGroupBtn.title = "Supprimer ce groupe et tout son contenu";
    delGroupBtn.addEventListener("click", () => {
      if (confirm(`Supprimer le groupe "${groupName}" et tout son contenu ?`)) {
        delete groupedCriteria[groupName];
        delete data[groupName];
        saveState();
        renderGroupTree();
        renderPreview({ search: currentSearch });
        window.refreshRuleOptionSelectors && window.refreshRuleOptionSelectors();
        window.refreshGroupSelectors && window.refreshGroupSelectors();
      }
    });
    groupEl.appendChild(delGroupBtn);
    tree.appendChild(groupEl);

    Object.entries(groupObj.subgroups || {}).forEach(([subName, idList]) => {
      if (!collapsedState[groupName]) collapsedState[groupName] = {};
      const isCollapsed = !!collapsedState[groupName][subName];

      const subEl = document.createElement("div");
      subEl.style.marginLeft = "20px";
      subEl.style.display = "flex";
      subEl.style.alignItems = "center";

      const toggleBtn = document.createElement("span");
      toggleBtn.textContent = isCollapsed ? "▶" : "▼";
      toggleBtn.style.cursor = "pointer";
      toggleBtn.style.marginRight = "6px";
      toggleBtn.addEventListener("click", () => {
        collapsedState[groupName][subName] = !isCollapsed;
        renderGroupTree();
      });
      subEl.appendChild(toggleBtn);

      const emoji = document.createElement("span");
      emoji.textContent = "📂 ";
      const label = document.createElement("span");
      label.textContent = subName;
      if (currentSearch && subName.toLowerCase().includes(currentSearch)) label.style.fontWeight = "800";
      subEl.appendChild(emoji);
      subEl.appendChild(label);

      const delSubBtn = document.createElement("button");
      delSubBtn.textContent = "❌";
      delSubBtn.style.marginLeft = "5px";
      delSubBtn.title = "Supprimer ce sous-groupe et ses options";
      delSubBtn.addEventListener("click", () => {
        if (confirm(`Supprimer le sous-groupe "${subName}" et toutes ses options ?`)) {
          // retire les options de data[groupName]
          (idList || []).forEach(id => {
            const arr = data[groupName] || [];
            const idx = arr.findIndex(o => o.id === id);
            if (idx !== -1) arr.splice(idx, 1);
          });
          delete groupedCriteria[groupName].subgroups[subName];
          saveState();
          renderGroupTree();
          renderPreview({ search: currentSearch });
          window.refreshRuleOptionSelectors && window.refreshRuleOptionSelectors();
          window.refreshGroupSelectors && window.refreshGroupSelectors();
        }
      });
      subEl.appendChild(delSubBtn);
      tree.appendChild(subEl);

      if (!isCollapsed) {
        const filtered = (idList || []).filter(id => {
          const opt = (data[groupName] || []).find(o => o.id === id);
          if (!opt) return false;
          return groupMatch || (currentSearch ? opt.name.toLowerCase().includes(currentSearch) : true);
        });

        if (filtered.length > 0) {
          const ul = document.createElement("ul");
          ul.style.margin = "4px 0 10px 28px";
          filtered.forEach(id => {
            const item = (data[groupName] || []).find(o => o.id === id);
            if (!item) return;
            const li = document.createElement("li");
            li.style.marginLeft = "8px";
            li.style.display = "flex";
            li.style.alignItems = "center";

            const fileEmoji = document.createElement("span");
            fileEmoji.textContent = "📄 ";
            const fileLabel = document.createElement("span");
            fileLabel.textContent = item.name;
            if (currentSearch && item.name.toLowerCase().includes(currentSearch)) fileLabel.style.fontWeight = "800";
            li.appendChild(fileEmoji);
            li.appendChild(fileLabel);

            const delNodeBtn = document.createElement("button");
            delNodeBtn.textContent = "❌";
            delNodeBtn.style.marginLeft = "5px";
            delNodeBtn.title = "Supprimer cette option";
            delNodeBtn.addEventListener("click", () => {
              if (confirm(`Supprimer l'option "${item.name}" ?`)) {
                const arr = data[groupName] || [];
                const idx = arr.findIndex(o => o.id === id);
                if (idx !== -1) arr.splice(idx, 1);
                const sga = groupedCriteria[groupName].subgroups[subName];
                const i = sga.indexOf(id);
                if (i !== -1) sga.splice(i, 1);
                saveState();
                renderGroupTree();
                renderPreview({ search: currentSearch });
                window.refreshRuleOptionSelectors && window.refreshRuleOptionSelectors();
              }
            });
            li.appendChild(delNodeBtn);
            ul.appendChild(li);
          });
          tree.appendChild(ul);
        } else {
          const empty = document.createElement("div");
          empty.style.marginLeft = "36px";
          empty.style.color = "#9aa4af";
          empty.textContent = "(aucune option)";
          tree.appendChild(empty);
        }
      }
    });
  });
}

// Expose (debug)
window.refreshRuleOptionSelectors = refreshRuleOptionSelectors;
window.refreshGroupSelectors = refreshGroupSelectors;