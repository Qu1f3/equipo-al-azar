(function () {
  "use strict";

  var STORAGE_KEY = "bombos-voley:v1";

  var TIERS = [
    { key: "tier1", label: "Tier 1" },
    { key: "tier2", label: "Tier 2" },
    { key: "tier3", label: "Tier 3" }
  ];

  // Cada posición define cuántos jugadores de ese tipo necesita CADA equipo.
  // "optional" quiere decir que un equipo puede quedarse sin nadie ahí (líbero)
  // sin que se considere un problema.
  var POSITIONS = [
    { key: "colocador", label: "Colocador", short: "COL", perTeam: 1, optional: false },
    { key: "opuesto", label: "Opuesto", short: "OPU", perTeam: 1, optional: false },
    { key: "central", label: "Central", short: "CEN", perTeam: 2, optional: false },
    { key: "salida", label: "Salida", short: "SAL", perTeam: 2, optional: false },
    { key: "libero", label: "Líbero", short: "LIB", perTeam: 1, optional: true }
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

  // Normaliza un jugador guardado: acepta tanto el formato viejo (solo texto)
  // como el nuevo ({name, position}), para no perder los bombos ya cargados.
  function normalizePlayer(raw) {
    if (typeof raw === "string") {
      return { name: raw, position: null };
    }
    if (raw && typeof raw === "object" && typeof raw.name === "string") {
      var pos = POSITIONS.some(function (p) { return p.key === raw.position; }) ? raw.position : null;
      return { name: raw.name, position: pos };
    }
    return null;
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      var parsed = JSON.parse(raw);
      var base = defaultState();

      function normTier(arr) {
        if (!Array.isArray(arr)) return [];
        return arr.map(normalizePlayer).filter(Boolean);
      }

      return {
        tiers: {
          tier1: normTier(parsed.tiers && parsed.tiers.tier1),
          tier2: normTier(parsed.tiers && parsed.tiers.tier2),
          tier3: normTier(parsed.tiers && parsed.tiers.tier3)
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

  function positionByKey(key) {
    for (var i = 0; i < POSITIONS.length; i++) {
      if (POSITIONS[i].key === key) return POSITIONS[i];
    }
    return null;
  }

  function positionLabel(key) {
    var p = positionByKey(key);
    return p ? p.label : "Sin posición";
  }

  function positionShort(key) {
    var p = positionByKey(key);
    return p ? p.short : "?";
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

  function addPlayer(tierKey, name, position) {
    var trimmed = name.trim();
    if (!trimmed) return;
    var pos = POSITIONS.some(function (p) { return p.key === position; }) ? position : null;
    state.tiers[tierKey].push({ name: trimmed, position: pos });
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
    state.tiers[tierKey][index].name = trimmed;
    saveState();
    render();
  }

  function changePlayerPosition(tierKey, index, position) {
    var pos = POSITIONS.some(function (p) { return p.key === position; }) ? position : null;
    state.tiers[tierKey][index].position = pos;
    saveState();
    render();
  }

  function movePlayer(fromTierKey, index, toTierKey) {
    if (fromTierKey === toTierKey) return;
    var player = state.tiers[fromTierKey][index];
    state.tiers[fromTierKey].splice(index, 1);
    state.tiers[toTierKey].push(player);
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

  // ---------- helpers sobre todos los jugadores ----------

  function allPlayers() {
    var list = [];
    TIERS.forEach(function (tier) {
      state.tiers[tier.key].forEach(function (player) {
        list.push({ name: player.name, tierKey: tier.key, position: player.position });
      });
    });
    return list;
  }

  function playersByPosition(posKey) {
    return allPlayers().filter(function (p) { return p.position === posKey; });
  }

  function playersWithoutPosition() {
    return allPlayers().filter(function (p) { return !p.position; });
  }

  // Calcula, para "n" equipos, si cada posición alcanza para cumplir la
  // formación (perTeam por equipo). Es puramente aritmético (no depende del
  // sorteo), así que sirve tanto para la vista previa como para el resultado.
  function computePositionWarnings(n) {
    var warnings = [];
    POSITIONS.forEach(function (pos) {
      var count = playersByPosition(pos.key).length;
      var target = pos.perTeam * n;
      if (count === 0) {
        if (!pos.optional) {
          warnings.push("No hay nadie anotado como " + pos.label.toLowerCase() + ": ningún equipo tendrá " + pos.label.toLowerCase() + ".");
        }
        return;
      }
      if (count < target) {
        var short = target - count;
        warnings.push(
          pos.label + ": hay " + count + " para " + n + " equipos (se necesitan " + pos.perTeam + " por equipo) — " +
          short + (short === 1 ? " equipo quedará" : " equipos quedarán") + " con menos " + pos.label.toLowerCase() + " de lo ideal."
        );
      } else if (count > target) {
        var extra = count - target;
        warnings.push(
          pos.label + ": hay " + count + " para " + n + " equipos (se necesitan " + pos.perTeam + " por equipo) — " +
          extra + (extra === 1 ? " equipo tendrá" : " equipos tendrán") + " uno de más en esa posición."
        );
      }
    });
    var sinPosicion = playersWithoutPosition().length;
    if (sinPosicion > 0) {
      warnings.push(
        sinPosicion + (sinPosicion === 1 ? " jugador no tiene" : " jugadores no tienen") +
        " posición asignada y " + (sinPosicion === 1 ? "se repartirá" : "se repartirán") +
        " aparte, sin respetar la formación. Edítalo(s) para asignarle(s) una posición."
      );
    }
    return warnings;
  }

  // ---------- team draw algorithm ----------

  function distributeTeams(numTeams) {
    var n = Math.max(2, Math.floor(numTeams) || 2);
    var teams = [];
    for (var t = 0; t < n; t++) teams.push({ id: t + 1, players: [] });

    var currentTotals = teams.map(function () { return 0; });
    var warnings = computePositionWarnings(n);

    // 1) Reparte posición por posición (colocador y opuesto primero, porque
    // solo hace falta 1 por equipo y son los que más "chocan" si se agrupan).
    POSITIONS.forEach(function (pos) {
      var pool = playersByPosition(pos.key);
      if (!pool.length) return;

      // Agrupa por tier y baraja cada grupo, para intercalar niveles al
      // armar el orden de reparto (así el reparto por posición no rompe
      // del todo el balance por nivel).
      var byTier = {};
      TIERS.forEach(function (tr) { byTier[tr.key] = []; });
      pool.forEach(function (p) { byTier[p.tierKey].push(p); });
      TIERS.forEach(function (tr) { byTier[tr.key] = shuffle(byTier[tr.key]); });

      var maxLen = 0;
      TIERS.forEach(function (tr) { maxLen = Math.max(maxLen, byTier[tr.key].length); });

      var orderedPool = [];
      for (var i = 0; i < maxLen; i++) {
        TIERS.forEach(function (tr) {
          if (byTier[tr.key][i]) orderedPool.push(byTier[tr.key][i]);
        });
      }

      var positionCounts = teams.map(function () { return 0; });

      orderedPool.forEach(function (player) {
        // Siempre elige el equipo que menos tiene de ESTA posición todavía;
        // si hay empate, el que tenga menos jugadores en total; si sigue
        // empatado, al azar. Esto evita apilar 2 colocadores en el mismo
        // equipo salvo que sea matemáticamente inevitable (y en ese caso
        // reparte el excedente lo más parejo posible entre equipos distintos).
        var order = shuffle(teams.map(function (_, idx) { return idx; }));
        order.sort(function (a, b) {
          if (positionCounts[a] !== positionCounts[b]) return positionCounts[a] - positionCounts[b];
          return currentTotals[a] - currentTotals[b];
        });
        var teamIndex = order[0];
        teams[teamIndex].players.push({ name: player.name, tierKey: player.tierKey, position: pos.key });
        positionCounts[teamIndex]++;
        currentTotals[teamIndex]++;
      });
    });

    // 2) Jugadores sin posición asignada: se reparten aparte, balanceando
    // solo por tamaño total de equipo (como antes), para no perderlos.
    var sinPosicion = shuffle(playersWithoutPosition());
    sinPosicion.forEach(function (player) {
      var order = shuffle(teams.map(function (_, idx) { return idx; }));
      order.sort(function (a, b) { return currentTotals[a] - currentTotals[b]; });
      var teamIndex = order[0];
      teams[teamIndex].players.push({ name: player.name, tierKey: player.tierKey, position: null });
      currentTotals[teamIndex]++;
    });

    var totalPlayers = allPlayers().length;
    if (totalPlayers > 0 && totalPlayers < n) {
      warnings.push("Hay más equipos (" + n + ") que jugadores (" + totalPlayers + "): algunos equipos quedarán vacíos.");
    }

    // baraja el orden dentro de cada equipo solo para que la lista no salga
    // siempre agrupada por posición
    teams.forEach(function (team) { team.players = shuffle(team.players); });

    return { teams: teams, warnings: warnings };
  }

  function generateTeams() {
    var totalPlayers = allPlayers().length;
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
      team.players.forEach(function (p) {
        var tag = p.position ? positionLabel(p.position) : "sin posición";
        lines.push("- " + p.name + " (" + tag + ")");
      });
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

  function buildPositionSelect(player, tierKey, index) {
    var select = document.createElement("select");
    select.className = "position-select";
    select.setAttribute("aria-label", "Posición de " + player.name);

    var placeholderOpt = document.createElement("option");
    placeholderOpt.textContent = "Posición";
    placeholderOpt.value = "";
    placeholderOpt.disabled = true;
    if (!player.position) placeholderOpt.selected = true;
    select.appendChild(placeholderOpt);

    POSITIONS.forEach(function (pos) {
      var opt = document.createElement("option");
      opt.value = pos.key;
      opt.textContent = pos.label;
      if (player.position === pos.key) opt.selected = true;
      select.appendChild(opt);
    });

    select.addEventListener("change", function () {
      changePlayerPosition(tierKey, index, select.value);
    });

    return select;
  }

  function renderTier(tierKey) {
    var list = document.getElementById("list-" + tierKey);
    var countEl = document.getElementById("count-" + tierKey);
    var players = state.tiers[tierKey];

    countEl.textContent = String(players.length);
    list.innerHTML = "";

    players.forEach(function (player, index) {
      var li = document.createElement("li");
      li.className = "player-row";

      var nameSpan = document.createElement("span");
      nameSpan.className = "player-name";
      nameSpan.textContent = player.name;
      li.appendChild(nameSpan);

      var posBadge = document.createElement("span");
      posBadge.className = "pos-badge" + (player.position ? " pos-" + player.position : " pos-none");
      posBadge.textContent = player.position ? positionShort(player.position) : "?";
      posBadge.title = player.position ? positionLabel(player.position) : "Sin posición asignada";
      li.appendChild(posBadge);

      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "icon-btn";
      editBtn.setAttribute("aria-label", "Editar nombre de " + player.name);
      editBtn.textContent = "✎";
      editBtn.addEventListener("click", function () {
        startEdit(li, nameSpan, tierKey, index);
      });
      li.appendChild(editBtn);

      li.appendChild(buildPositionSelect(player, tierKey, index));

      var moveSelect = document.createElement("select");
      moveSelect.className = "move-select";
      moveSelect.setAttribute("aria-label", "Mover a otro tier a " + player.name);
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
      delBtn.setAttribute("aria-label", "Eliminar a " + player.name);
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
    var total = allPlayers().length;
    document.getElementById("total-players").textContent = String(total);
  }

  function renderWarningsPreview() {
    // vista previa en vivo de los avisos de formación, mientras el
    // entrenador escribe la cantidad de equipos, antes de generar
    var numTeamsInput = document.getElementById("input-num-teams");
    var n = parseInt(numTeamsInput.value, 10);
    var container = document.getElementById("warnings");
    container.innerHTML = "";
    if (!Number.isFinite(n) || n < 2) return;

    var total = allPlayers().length;
    if (total === 0) return;

    var msgs = computePositionWarnings(n);
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

    // vuelve a mostrar los avisos también en la zona de resultados
    // (corresponden a lo que se usó al momento de generar)
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
        name.className = "team-player__name";
        name.textContent = p.name;
        row.appendChild(name);
        var posBadge = document.createElement("span");
        posBadge.className = "pos-badge" + (p.position ? " pos-" + p.position : " pos-none");
        posBadge.textContent = p.position ? positionShort(p.position) : "?";
        posBadge.title = p.position ? positionLabel(p.position) : "Sin posición asignada";
        row.appendChild(posBadge);
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
        var positionSelect = document.getElementById("add-position-" + tier.key);
        addPlayer(tier.key, input.value, positionSelect.value);
        input.value = "";
        positionSelect.value = "";
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
