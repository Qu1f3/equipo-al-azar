(function () {
  "use strict";

  var STORAGE_KEY = "bombos-voley:v1";

  var TIERS = [
    { key: "tier1", label: "Tier 1" },
    { key: "tier2", label: "Tier 2" },
    { key: "tier3", label: "Tier 3" }
  ];

  var TEAM_COLORS = [
    "#E5A335", "#3EA39C", "#C1487B", "#5B8DD9",
    "#8BC152", "#B07BC7", "#E2543A", "#7C8AA0"
  ];

  var state = loadState();

  function defaultState() {
    return {
      tiers: { tier1: [], tier2: [], tier3: [] },
      numTeams: 2,
      lastResult: null
    };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      var parsed = JSON.parse(raw);
      var base = defaultState();
      return {
        tiers: {
          tier1: Array.isArray(parsed.tiers && parsed.tiers.tier1) ? parsed.tiers.tier1 : base.tiers.tier1,
          tier2: Array.isArray(parsed.tiers && parsed.tiers.tier2) ? parsed.tiers.tier2 : base.tiers.tier2,
          tier3: Array.isArray(parsed.tiers && parsed.tiers.tier3) ? parsed.tiers.tier3 : base.tiers.tier3
        },
        numTeams: Number.isFinite(parsed.numTeams) ? parsed.numTeams : base.numTeams,
        lastResult: parsed.lastResult || null
      };
    } catch (e) {
      console.warn("No se pudo leer localStorage, empezando de cero.", e);
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("No se pudo guardar en localStorage.", e);
    }
  }

  function tierLabel(key) {
    for (var i = 0; i < TIERS.length; i++) {
      if (TIERS[i].key === key) return TIERS[i].label;
    }
    return key;
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // ---------- player CRUD ----------

  function addPlayer(tierKey, name) {
    var trimmed = name.trim();
    if (!trimmed) return;
    state.tiers[tierKey].push(trimmed);
    saveState();
    render();
  }

  function removePlayer(tierKey, index) {
    state.tiers[tierKey].splice(index, 1);
    saveState();
    render();
  }

  function renamePlayer(tierKey, index, newName) {
    var trimmed = newName.trim();
    if (!trimmed) { render(); return; }
    state.tiers[tierKey][index] = trimmed;
    saveState();
    render();
  }

  function movePlayer(fromTierKey, index, toTierKey) {
    if (fromTierKey === toTierKey) return;
    var name = state.tiers[fromTierKey][index];
    state.tiers[fromTierKey].splice(index, 1);
    state.tiers[toTierKey].push(name);
    saveState();
    render();
  }

  function clearAll() {
    var ok = window.confirm(
      "¿Seguro que quieres borrar todos los jugadores y los equipos generados? Esta acción no se puede deshacer."
    );
    if (!ok) return;
    state = defaultState();
    saveState();
    render();
    showToast("Todo limpio. Listo para empezar de nuevo.");
  }

  // ---------- team draw algorithm ----------

  function distributeTeams(numTeams) {
    var n = Math.max(2, Math.floor(numTeams) || 2);
    var teams = [];
    for (var t = 0; t < n; t++) teams.push({ id: t + 1, players: [] });

    var warnings = [];
    var currentTotals = teams.map(function () { return 0; });

    TIERS.forEach(function (tier) {
      var pool = state.tiers[tier.key];
      if (!pool.length) return;

      var shuffledPlayers = shuffle(pool);

      // Rotate through every team once per full cycle (keeps the tier mix
      // proportional), but when a tier doesn't divide evenly, hand the
      // leftover seats to whichever teams are currently smallest overall —
      // shuffled first so ties between equally-sized teams stay random —
      // so a run of unlucky remainders doesn't stack onto the same team.
      var teamOrder = shuffle(teams.map(function (_, i) { return i; }));
      teamOrder.sort(function (a, b) { return currentTotals[a] - currentTotals[b]; });

      shuffledPlayers.forEach(function (name, idx) {
        var teamIndex = teamOrder[idx % n];
        teams[teamIndex].players.push({ name: name, tierKey: tier.key });
        currentTotals[teamIndex]++;
      });

      var extra = pool.length % n;
      if (extra !== 0) {
        warnings.push(
          tierLabel(tier.key) + " no alcanza para repartir igual entre los " + n +
          " equipos: " + extra + (extra === 1 ? " equipo tendrá" : " equipos tendrán") +
          " uno más que los demás en ese nivel."
        );
      }
    });

    var totalPlayers = TIERS.reduce(function (sum, t) { return sum + state.tiers[t.key].length; }, 0);
    if (totalPlayers > 0 && totalPlayers < n) {
      warnings.push("Hay más equipos (" + n + ") que jugadores (" + totalPlayers + "): algunos equipos quedarán vacíos.");
    }

    // shuffle player order within each team so a tier doesn't always list first
    teams.forEach(function (team) { team.players = shuffle(team.players); });

    return { teams: teams, warnings: warnings };
  }

  function generateTeams() {
    var totalPlayers = TIERS.reduce(function (sum, t) { return sum + state.tiers[t.key].length; }, 0);
    if (totalPlayers === 0) {
      showToast("Agrega jugadores a los bombos antes de generar equipos.");
      return;
    }
    var numTeamsInput = document.getElementById("input-num-teams");
    var numTeams = parseInt(numTeamsInput.value, 10);
    if (!Number.isFinite(numTeams) || numTeams < 2) {
      numTeams = 2;
      numTeamsInput.value = "2";
    }
    state.numTeams = numTeams;
    state.lastResult = distributeTeams(numTeams);
    saveState();
    renderResults();
    document.getElementById("btn-reshuffle").hidden = false;
    document.getElementById("results-section").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- copy to clipboard ----------

  function copyResults() {
    if (!state.lastResult) return;
    var lines = [];
    state.lastResult.teams.forEach(function (team) {
      lines.push("Equipo " + team.id + ":");
      team.players.forEach(function (p) { lines.push("- " + p.name); });
      lines.push("");
    });
    var text = lines.join("\n").trim();

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showToast("Equipos copiados. Ya puedes pegarlos en el chat del equipo.");
      }, function () {
        showToast("No se pudo copiar. Copia el texto manualmente.");
      });
    } else {
      showToast("Este navegador no soporta copiar automáticamente.");
    }
  }

  // ---------- toast ----------

  var toastTimer = null;
  function showToast(msg) {
    var el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2600);
  }

  // ---------- rendering ----------

  function render() {
    TIERS.forEach(function (tier) { renderTier(tier.key); });
    renderTotals();
    renderWarningsPreview();
  }

  function renderTier(tierKey) {
    var list = document.getElementById("list-" + tierKey);
    var countEl = document.getElementById("count-" + tierKey);
    var players = state.tiers[tierKey];

    countEl.textContent = String(players.length);
    list.innerHTML = "";

    players.forEach(function (name, index) {
      var li = document.createElement("li");
      li.className = "player-row";

      var nameSpan = document.createElement("span");
      nameSpan.className = "player-name";
      nameSpan.textContent = name;
      li.appendChild(nameSpan);

      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "icon-btn";
      editBtn.setAttribute("aria-label", "Editar nombre de " + name);
      editBtn.textContent = "✎";
      editBtn.addEventListener("click", function () {
        startEdit(li, nameSpan, tierKey, index);
      });
      li.appendChild(editBtn);

      var moveSelect = document.createElement("select");
      moveSelect.className = "move-select";
      moveSelect.setAttribute("aria-label", "Mover a otro tier a " + name);
      var placeholderOpt = document.createElement("option");
      placeholderOpt.textContent = "Mover";
      placeholderOpt.value = "";
      placeholderOpt.disabled = true;
      placeholderOpt.selected = true;
      moveSelect.appendChild(placeholderOpt);
      TIERS.forEach(function (t) {
        if (t.key === tierKey) return;
        var opt = document.createElement("option");
        opt.value = t.key;
        opt.textContent = "→ " + t.label;
        moveSelect.appendChild(opt);
      });
      moveSelect.addEventListener("change", function () {
        var target = moveSelect.value;
        if (target) movePlayer(tierKey, index, target);
      });
      li.appendChild(moveSelect);

      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "icon-btn";
      delBtn.setAttribute("aria-label", "Eliminar a " + name);
      delBtn.textContent = "🗑";
      delBtn.addEventListener("click", function () { removePlayer(tierKey, index); });
      li.appendChild(delBtn);

      list.appendChild(li);
    });
  }

  function startEdit(li, nameSpan, tierKey, index) {
    var input = document.createElement("input");
    input.type = "text";
    input.className = "player-name-edit";
    input.value = nameSpan.textContent;
    input.maxLength = 40;
    li.replaceChild(input, nameSpan);
    input.focus();
    input.select();

    function commit() { renamePlayer(tierKey, index, input.value); }

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      if (e.key === "Escape") { e.preventDefault(); render(); }
    });
    input.addEventListener("blur", commit);
  }

  function renderTotals() {
    var total = TIERS.reduce(function (sum, t) { return sum + state.tiers[t.key].length; }, 0);
    document.getElementById("total-players").textContent = String(total);
  }

  function renderWarningsPreview() {
    // live preview of tier-imbalance warnings as the coach types the team count,
    // so they see it before hitting "Generar equipos"
    var numTeamsInput = document.getElementById("input-num-teams");
    var n = parseInt(numTeamsInput.value, 10);
    var container = document.getElementById("warnings");
    container.innerHTML = "";
    if (!Number.isFinite(n) || n < 2) return;

    var total = TIERS.reduce(function (sum, t) { return sum + state.tiers[t.key].length; }, 0);
    if (total === 0) return;

    var msgs = [];
    TIERS.forEach(function (tier) {
      var len = state.tiers[tier.key].length;
      if (len === 0) return;
      var extra = len % n;
      if (extra !== 0) {
        msgs.push(
          tierLabel(tier.key) + " no alcanza para repartir igual entre los " + n +
          " equipos: " + extra + (extra === 1 ? " equipo tendrá" : " equipos tendrán") +
          " uno más que los demás en ese nivel."
        );
      }
    });
    if (total < n) {
      msgs.push("Hay más equipos (" + n + ") que jugadores (" + total + "): algunos equipos quedarán vacíos.");
    }
    msgs.forEach(function (m) {
      var p = document.createElement("p");
      p.className = "warning-item";
      p.textContent = m;
      container.appendChild(p);
    });
  }

  function renderResults() {
    var section = document.getElementById("results-section");
    var grid = document.getElementById("teams-grid");
    var result = state.lastResult;

    if (!result) { section.hidden = true; return; }

    section.hidden = false;
    grid.innerHTML = "";

    // re-show any warnings inside the results area too (they matched what was used at generation time)
    var container = document.getElementById("warnings");
    container.innerHTML = "";
    result.warnings.forEach(function (m) {
      var p = document.createElement("p");
      p.className = "warning-item";
      p.textContent = m;
      container.appendChild(p);
    });

    result.teams.forEach(function (team, i) {
      var color = TEAM_COLORS[i % TEAM_COLORS.length];

      var card = document.createElement("div");
      card.className = "team-card";
      card.style.borderTopColor = color;

      var head = document.createElement("div");
      head.className = "team-card__head";

      var badge = document.createElement("span");
      badge.className = "team-badge";
      badge.style.background = color;
      badge.textContent = String(team.id);
      head.appendChild(badge);

      var title = document.createElement("span");
      title.textContent = "Equipo " + team.id;
      head.appendChild(title);

      var count = document.createElement("span");
      count.className = "team-card__count";
      count.textContent = team.players.length + (team.players.length === 1 ? " jugador" : " jugadores");
      head.appendChild(count);

      card.appendChild(head);

      var body = document.createElement("div");
      body.className = "team-card__body";
      team.players.forEach(function (p) {
        var row = document.createElement("div");
        row.className = "team-player";
        var dot = document.createElement("span");
        dot.className = "tier-dot " + p.tierKey;
        row.appendChild(dot);
        var name = document.createElement("span");
        name.textContent = p.name;
        row.appendChild(name);
        body.appendChild(row);
      });
      card.appendChild(body);

      grid.appendChild(card);
    });
  }

  // ---------- events ----------

  function init() {
    TIERS.forEach(function (tier) {
      var form = document.querySelector('.add-player-form[data-tier="' + tier.key + '"]');
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var input = document.getElementById("input-" + tier.key);
        addPlayer(tier.key, input.value);
        input.value = "";
        input.focus();
      });
    });

    var numTeamsInput = document.getElementById("input-num-teams");
    numTeamsInput.value = String(state.numTeams || 2);
    numTeamsInput.addEventListener("input", renderWarningsPreview);

    document.getElementById("btn-generate").addEventListener("click", generateTeams);
    document.getElementById("btn-reshuffle").addEventListener("click", generateTeams);
    document.getElementById("btn-copy").addEventListener("click", copyResults);
    document.getElementById("btn-clear-all").addEventListener("click", clearAll);

    render();

    if (state.lastResult) {
      renderResults();
      document.getElementById("btn-reshuffle").hidden = false;
    }

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function (err) {
          console.warn("No se pudo registrar el service worker.", err);
        });
      });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
