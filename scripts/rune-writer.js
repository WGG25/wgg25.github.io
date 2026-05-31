    const FINNISH_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖŊ";
    const FINNISH_VOWELS = "AEIOUYÅÄÖ";
    const UNASSIGNED_RUNE_PREFIX = "__unassigned__";
    const MAX_IMPORT_BYTES = 256 * 1024;
    const MAX_RUNE_COUNT = 512;

    const points = {
      TL: [60, 60],  TM: [150, 60],  TR: [240, 60],
      ML: [60, 150], C:  [150, 150], MR: [240, 150],
      BL: [60, 240], BM: [150, 240], BR: [240, 240],
    };

    // Only these connections are allowed.
    const allowedEdges = [
    // outer rectangle, split into half-edges so corners can connect to edge-middle dots
    ["TL", "TM"], ["TM", "TR"],
    ["TR", "MR"], ["MR", "BR"],
    ["BR", "BM"], ["BM", "BL"],
    ["BL", "ML"], ["ML", "TL"],

    // edge middles as neighbors
    ["TM", "MR"], ["MR", "BM"], ["BM", "ML"], ["ML", "TM"],

    // edge middles to center
    ["TM", "C"], ["MR", "C"], ["BM", "C"], ["ML", "C"],
    ];

    const edgeKey = (a, b) => [a, b].sort().join("-");
    const allEdgeKeys = allowedEdges.map(([a, b]) => edgeKey(a, b));

    let activeEdges = new Set();
    let selectedLetters = null;
    let runeMap = loadRunes(); // { "A": ["TL-TR", ...], "KS": [...] }
    let readRunes = loadReadRunes();

    const builder = document.getElementById("builder");
    const alphabet = document.getElementById("alphabet");
    const statusEl = document.getElementById("status");
    const lettersEl = document.getElementById("letters");
    const output = document.getElementById("output");
    const readSequence = document.getElementById("readSequence");
    const readText = document.getElementById("readText");

    function setStatus(message, type = "") {
      statusEl.textContent = message;
      statusEl.className = `status ${type}`;
    }

    function normalizeLetters(value) {
      return value.trim().toUpperCase().replace(/\s+/g, "");
    }

    function letterVariants(value) {
      return value
        .split(/[|,;]+/)
        .map(normalizeLetters)
        .filter(Boolean);
    }

    function canonicalLetterKey(value) {
      return [...new Set(letterVariants(value))].join("|");
    }

    function validLetters(value) {
      if (!value || value.length > 2) return false;
      return [...value].every(ch => FINNISH_LETTERS.includes(ch));
    }

    function isUnassignedRuneKey(value) {
      return value === "." || value.startsWith(`${UNASSIGNED_RUNE_PREFIX}:`);
    }

    function validRuneKey(value) {
      return isUnassignedRuneKey(value) || (letterVariants(value).length > 0 && letterVariants(value).every(validLetters));
    }

    function displayLetters(value) {
      return isUnassignedRuneKey(value) ? "." : letterVariants(value).join(" / ");
    }

    function decodedReadValue(value) {
      if (value === " ") return " ";
      if (value === "/") return "/";
      if (isUnassignedRuneKey(value)) return ".";
      const variants = letterVariants(value);
      return variants.length > 1 ? `[${variants.join("|")}]` : variants[0];
    }

    function sharesAnyVariant(a, b) {
      const bVariants = new Set(letterVariants(b));
      return letterVariants(a).some(variant => bVariants.has(variant));
    }

    function runeKeyForText(text) {
      return Object.keys(runeMap).find(key => !isUnassignedRuneKey(key) && letterVariants(key).includes(text)) || null;
    }

    function letterRole(value) {
      if (isUnassignedRuneKey(value)) return "unknown";

      const roles = new Set(letterVariants(value).map(variant => {
        const chars = [...variant];
        if (chars.every(ch => FINNISH_VOWELS.includes(ch))) return "vowel";
        if (chars.every(ch => FINNISH_LETTERS.includes(ch) && !FINNISH_VOWELS.includes(ch))) return "consonant";
        return "unknown";
      }));

      return roles.size === 1 ? [...roles][0] : "unknown";
    }

    function currentTripletRoles(values) {
      const roles = [];

      for (const value of values) {
        if (value === " " || value === "/") {
          roles.length = 0;
        } else if (runeMap[value]) {
          const role = letterRole(value);
          if (shouldStartNewTriplet(roles, role)) roles.length = 0;
          roles.push(role);
        }
      }

      return roles;
    }

    function isCompleteTriplet(roles) {
      return roles.length === 3 || (roles.length === 2 && roles[0] === "vowel" && roles[1] === "consonant");
    }

    function isInvalidTripletContinuation(existingRoles, nextRole) {
      if (!existingRoles.length) return false;
      if (existingRoles.length === 1 && existingRoles[0] === nextRole && (nextRole === "consonant" || nextRole === "vowel")) return true;
      if (existingRoles.length === 2 && existingRoles[0] === "consonant" && existingRoles[1] === "vowel" && nextRole !== "consonant") return true;
      return false;
    }

    function shouldStartNewTriplet(existingRoles, nextRole) {
      return isCompleteTriplet(existingRoles) || isInvalidTripletContinuation(existingRoles, nextRole);
    }

    function shouldReverseInTriplet(existingRoles, nextRole) {
      const position = existingRoles.length;
      if (position === 1 && existingRoles[0] === "vowel" && nextRole === "consonant") return true;
      if (position === 2 && existingRoles[0] === "consonant" && existingRoles[1] === "vowel" && nextRole === "consonant") return true;
      return false;
    }

    function canAppendToCurrentReadTriplet(letters) {
      return !isInvalidTripletContinuation(currentTripletRoles(readRunes), letterRole(letters));
    }

    function decodedReadText(includeTripletBreaks) {
      return readRunes
        .filter(value => includeTripletBreaks || value !== "/")
        .map(decodedReadValue)
        .join("");
    }

    function makeUnassignedRuneKey(map = runeMap) {
      let key;
      do {
        key = `${UNASSIGNED_RUNE_PREFIX}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      } while (map[key]);
      return key;
    }

    function normalizeRuneMapKeys(map) {
      const normalized = {};

      for (const [key, edges] of Object.entries(map)) {
        const normalizedKey = key === "."
          ? makeUnassignedRuneKey(normalized)
          : (isUnassignedRuneKey(key) ? key : canonicalLetterKey(key));
        normalized[normalizedKey] = edges;
      }

      return normalized;
    }

    function validateRuneMap(map) {
      if (!map || typeof map !== "object" || Array.isArray(map)) {
        throw new Error("Rune data must be a JSON object.");
      }

      const normalized = normalizeRuneMapKeys(map);
      const entries = Object.entries(normalized);
      if (entries.length > MAX_RUNE_COUNT) {
        throw new Error(`Rune data has too many entries. Maximum is ${MAX_RUNE_COUNT}.`);
      }

      for (const [letters, edges] of entries) {
        if (!validRuneKey(letters)) throw new Error(`Invalid letter key: ${letters}`);
        if (!Array.isArray(edges)) throw new Error(`Invalid strokes for ${displayLetters(letters)}.`);
        if (edges.length > allEdgeKeys.length) throw new Error(`Too many strokes for ${displayLetters(letters)}.`);
        if (!edges.every(edge => allEdgeKeys.includes(edge))) {
          throw new Error(`Invalid strokes for ${displayLetters(letters)}.`);
        }
        if (new Set(edges).size !== edges.length) {
          throw new Error(`Duplicate strokes for ${displayLetters(letters)}.`);
        }
      }

      return normalized;
    }

    function canonicalEdgeList(edgeSet) {
      return [...edgeSet].sort((a, b) => allEdgeKeys.indexOf(a) - allEdgeKeys.indexOf(b));
    }

    function sameRune(a, b) {
      return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    }

    function loadRunes() {
      try {
        const loaded = JSON.parse(localStorage.getItem("runeMap.v1")) || {};
        const normalized = validateRuneMap(loaded);
        if (JSON.stringify(loaded) !== JSON.stringify(normalized)) {
          localStorage.setItem("runeMap.v1", JSON.stringify(normalized));
        }
        return normalized;
      } catch {
        return {};
      }
    }

    function persistRunes() {
      localStorage.setItem("runeMap.v1", JSON.stringify(runeMap));
    }

    function loadReadRunes() {
      try {
        const loaded = JSON.parse(localStorage.getItem("readRunes.v1")) || [];
        if (!Array.isArray(loaded)) return [];
        return loaded
          .filter(value => value === " " || value === "/" || runeMap[value])
          .slice(0, MAX_RUNE_COUNT);
      } catch {
        return [];
      }
    }

    function persistReadRunes() {
      localStorage.setItem("readRunes.v1", JSON.stringify(readRunes));
    }

    function makeLine(svg, a, b, className, extra = {}) {
      const [x1, y1] = points[a];
      const [x2, y2] = points[b];
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("class", className);
      for (const [key, value] of Object.entries(extra)) line.setAttribute(key, value);
      svg.appendChild(line);
      return line;
    }

    function drawDots(svg, scale = 1) {
      for (const [name, [x, y]] of Object.entries(points)) {
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("cx", x);
        dot.setAttribute("cy", y);
        dot.setAttribute("r", name === "C" ? 8 * scale : 7 * scale);
        dot.setAttribute("class", name === "C" ? "dot dot-center" : "dot");
        svg.appendChild(dot);
      }
    }

    function syncBuilderSelectionWithSavedRune() {
      if (activeEdges.size === 0) {
        selectedLetters = null;
        lettersEl.value = "";
        return null;
      }

      const match = findRuneLettersByEdges(canonicalEdgeList(activeEdges));
      if (!match) {
        selectedLetters = null;
        return null;
      }

      selectedLetters = match;
      lettersEl.value = isUnassignedRuneKey(match) ? "" : letterVariants(match).join(", ");
      return match;
    }

    function renderBuilder() {
      builder.innerHTML = "";

      for (const [a, b] of allowedEdges) {
        const key = edgeKey(a, b);
        makeLine(builder, a, b, `edge-line ${activeEdges.has(key) ? "edge-on" : ""}`);
      }

      for (const [a, b] of allowedEdges) {
        const key = edgeKey(a, b);
        const hit = makeLine(builder, a, b, "edge-hit", { "data-edge": key });
        hit.addEventListener("click", () => {
          if (activeEdges.has(key)) activeEdges.delete(key);
          else activeEdges.add(key);
          const match = syncBuilderSelectionWithSavedRune();
          renderBuilder();
          if (match) {
            setStatus(`Current shape matches ${displayLetters(match)}.`, "ok");
          } else {
            setStatus(`${activeEdges.size} stroke${activeEdges.size === 1 ? "" : "s"} selected.`);
          }
        });
      }

      drawDots(builder);
    }

    function runeSvg(edges, size = 78) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 300 300");
      svg.setAttribute("class", "mini-rune");
      svg.setAttribute("width", size);
      svg.setAttribute("height", size);

      for (const edge of edges) {
        const [a, b] = edge.split("-");
        makeLine(svg, a, b, "edge-line edge-on");
      }
      drawDots(svg, 0.8);
      return svg;
    }

    function makeUnknownToken(ch) {
      const unknown = document.createElement("div");
      unknown.className = "unknown";
      unknown.textContent = ch;
      unknown.title = `No rune assigned for ${ch}`;
      return unknown;
    }

    function renderRuneSequence(container, tokens, size = 64) {
      let triplet = null;
      let tripletCount = 0;
      let tripletRoles = [];

      function resetTriplet() {
        triplet = null;
        tripletCount = 0;
        tripletRoles = [];
      }

      function appendBreak() {
        resetTriplet();
        container.appendChild(document.createElement("span")).className = "word-break";
      }

      function appendTripletBreak() {
        resetTriplet();
      }

      function appendRune(token) {
        const role = token.role || "unknown";
        if (!triplet || shouldStartNewTriplet(tripletRoles, role)) {
          triplet = document.createElement("span");
          triplet.className = "rune-triplet";
          container.appendChild(triplet);
          tripletCount = 0;
          tripletRoles = [];
        }

        const svg = runeSvg(token.edges, size);
        if (shouldReverseInTriplet(tripletRoles, role)) svg.classList.add("rune-reversed");
        triplet.appendChild(svg);
        tripletCount++;
        tripletRoles.push(role);
      }

      for (const token of tokens) {
        if (token.type === "space") appendBreak();
        else if (token.type === "triplet-break") appendTripletBreak();
        else if (token.type === "unknown") {
          resetTriplet();
          container.appendChild(makeUnknownToken(token.value));
        } else {
          appendRune(token);
        }
      }
    }

    function renderReadRunes() {
      readSequence.innerHTML = "";

      if (!readRunes.length) {
        const empty = document.createElement("p");
        empty.className = "help";
        empty.textContent = "Click Add on saved runes, or draw/load a saved rune and click Add current rune.";
        readSequence.appendChild(empty);
      } else {
        const tokens = readRunes
          .map(letters => {
            if (letters === " ") return { type: "space" };
            if (letters === "/") return { type: "triplet-break" };
            return { type: "rune", key: letters, edges: runeMap[letters], role: letterRole(letters) };
          })
          .filter(token => token.type === "space" || token.type === "triplet-break" || token.edges);
        renderRuneSequence(readSequence, tokens, 64);
      }

      readText.value = decodedReadText(!document.getElementById("plainReadText").checked);
      updateAlphabetSelectionState();
    }

    function appendReadRune(letters) {
      if (runeMap[letters] && !canAppendToCurrentReadTriplet(letters)) {
        setStatus(`Cannot add ${displayLetters(letters)} here: the next rune must alternate vowel/consonant.`, "err");
        return false;
      }

      readRunes.push(letters);
      persistReadRunes();
      renderReadRunes();
      return true;
    }

    function findRuneLettersByEdges(edges) {
      return Object.entries(runeMap).find(([, value]) => sameRune(value, edges))?.[0] || null;
    }

    function addCurrentRuneToRead() {
      if (activeEdges.size === 0) {
        setStatus("Draw or load a saved rune before adding it to the reader.", "err");
        return;
      }

      const letters = findRuneLettersByEdges(canonicalEdgeList(activeEdges));
      if (!letters) {
        setStatus("The current rune shape is not assigned to any letters yet.", "err");
        return;
      }

      if (appendReadRune(letters)) setStatus(`Added ${displayLetters(letters)} to the read sequence.`, "ok");
    }

    function nextReadRuneWillBeReversed(letters) {
      return shouldReverseInTriplet(currentTripletRoles(readRunes), letterRole(letters));
    }

    function updateAlphabetSelectionState() {
      for (const card of alphabet.querySelectorAll(".rune-card")) {
        const canAppend = canAppendToCurrentReadTriplet(card.dataset.letters);
        const shouldReverse = canAppend && nextReadRuneWillBeReversed(card.dataset.letters);
        const addButton = card.querySelector("button");
        if (addButton) addButton.disabled = !canAppend;
        card.classList.toggle("disabled-next", !canAppend);
        card.classList.toggle("next-reversed", shouldReverse);
        card.title = shouldReverse
          ? "Click to load this rune. Shift+click to add it reversed by triplet rules."
          : (canAppend
            ? "Click to load this rune. Shift+click to add it to the read sequence."
            : "This rune cannot be added next because the triplet must alternate vowel/consonant.");
      }
    }

    function renderAlphabet() {
      alphabet.innerHTML = "";
      const entries = Object.entries(runeMap).sort(([a], [b]) => a.localeCompare(b, "fi"));

      if (!entries.length) {
        const empty = document.createElement("p");
        empty.className = "help";
        empty.textContent = "No runes saved yet. Draw one, enter one or two letters, and click Save rune.";
        alphabet.appendChild(empty);
        return;
      }

      for (const [letters, edges] of entries) {
        const card = document.createElement("div");
        card.className = "rune-card";
        card.dataset.letters = letters;
        card.title = "Click to load this rune. Shift+click to add it to the read sequence.";
        card.addEventListener("click", event => {
          if (event.shiftKey) {
            if (appendReadRune(letters)) setStatus(`Added ${displayLetters(letters)} to the read sequence.`, "ok");
            return;
          }

          activeEdges = new Set(edges);
          selectedLetters = letters;
          lettersEl.value = isUnassignedRuneKey(letters) ? "" : letterVariants(letters).join(", ");
          renderBuilder();
          setStatus(`Loaded rune for ${displayLetters(letters)}.`, "ok");
        });

        const label = document.createElement("div");
        label.className = "rune-label";
        label.textContent = displayLetters(letters);

        card.appendChild(runeSvg(edges));
        card.appendChild(label);

        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.textContent = "Add";
        addButton.title = `Add ${displayLetters(letters)} to the read sequence`;
        addButton.addEventListener("click", event => {
          event.stopPropagation();
          if (appendReadRune(letters)) setStatus(`Added ${displayLetters(letters)} to the read sequence.`, "ok");
        });
        card.appendChild(addButton);

        alphabet.appendChild(card);
      }

      renderReadRunes();
      updateAlphabetSelectionState();
    }

    function saveRune() {
      const normalizedLetters = canonicalLetterKey(lettersEl.value);
      const letters = normalizedLetters || (isUnassignedRuneKey(selectedLetters || "") ? selectedLetters : makeUnassignedRuneKey());
      if (!validRuneKey(letters)) {
        setStatus("Use one or more one/two-letter variants separated by commas, or leave the field empty for a placeholder rune.", "err");
        return;
      }
      if (activeEdges.size === 0) {
        setStatus("Draw at least one stroke before saving.", "err");
        return;
      }

      const edges = canonicalEdgeList(activeEdges);
      const previousKey = selectedLetters && runeMap[selectedLetters] && sameRune(runeMap[selectedLetters], edges)
        ? selectedLetters
        : null;
      const variantDuplicate = Object.keys(runeMap)
        .find(key => key !== previousKey && !isUnassignedRuneKey(key) && !isUnassignedRuneKey(letters) && sharesAnyVariant(key, letters));
      if (variantDuplicate) {
        setStatus(`${displayLetters(variantDuplicate)} already uses one of those variants.`, "err");
        return;
      }

      const existingTarget = runeMap[letters];
      if (existingTarget && letters !== previousKey && !sameRune(existingTarget, edges)) {
        setStatus(`${displayLetters(letters)} is already assigned to another rune.`, "err");
        return;
      }

      const duplicate = Object.entries(runeMap)
        .find(([key, value]) => key !== letters && key !== previousKey && sameRune(value, edges));
      if (duplicate) {
        setStatus(`That shape is already assigned to ${displayLetters(duplicate[0])}.`, "err");
        return;
      }

      if (previousKey && previousKey !== letters) {
        delete runeMap[previousKey];
        readRunes = readRunes.map(value => value === previousKey ? letters : value);
        persistReadRunes();
      }

      runeMap[letters] = edges;
      selectedLetters = letters;
      persistRunes();
      renderAlphabet();
      setStatus(`Saved rune for ${displayLetters(letters)}.`, "ok");
    }

    function deleteSelectedRune() {
      const letters = lettersEl.value.trim()
        ? canonicalLetterKey(lettersEl.value)
        : selectedLetters;
      if (!letters || !runeMap[letters]) {
        setStatus("Enter or select a saved rune to delete.", "err");
        return;
      }
      delete runeMap[letters];
      readRunes = readRunes.filter(value => value !== letters);
      persistRunes();
      persistReadRunes();
      selectedLetters = null;
      renderAlphabet();
      renderReadRunes();
      setStatus(`Deleted rune for ${displayLetters(letters)}.`, "ok");
    }

    function clearDrawing() {
      activeEdges.clear();
      selectedLetters = null;
      lettersEl.value = "";
      renderBuilder();
      setStatus("Drawing cleared.");
    }

    function exportData() {
      const blob = new Blob([JSON.stringify(runeMap, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "rune-alphabet.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("Exported rune alphabet as JSON.", "ok");
    }

    function importData(file) {
      if (file.size > MAX_IMPORT_BYTES) {
        setStatus(`Import failed: JSON file must be ${Math.floor(MAX_IMPORT_BYTES / 1024)} KB or smaller.`, "err");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = validateRuneMap(JSON.parse(reader.result));
          runeMap = imported;
          readRunes = readRunes.filter(value => value === " " || value === "/" || runeMap[value]);
          persistRunes();
          persistReadRunes();
          renderAlphabet();
          renderReadRunes();
          setStatus("Imported rune alphabet.", "ok");
        } catch (err) {
          setStatus(`Import failed: ${err.message}`, "err");
        }
      };
      reader.readAsText(file);
    }

    function renderTextAsRunes() {
      output.innerHTML = "";
      const text = document.getElementById("textInput").value.toUpperCase();
      const mode = document.getElementById("matchingMode").value;
      const tokens = [];
      let i = 0;

      while (i < text.length) {
        const ch = text[i];

        if (/\s/.test(ch)) {
          tokens.push({ type: "space" });
          i++;
          continue;
        }

        if (ch === "/") {
          tokens.push({ type: "triplet-break" });
          i++;
          continue;
        }

        const two = text.slice(i, i + 2);
        let match = null;

        if (mode === "longest" && two.length === 2) match = runeKeyForText(two);
        if (!match) match = runeKeyForText(ch);

        if (match) {
          tokens.push({ type: "rune", key: match, edges: runeMap[match], role: letterRole(match) });
          i += mode === "longest" && letterVariants(match).includes(two) ? 2 : 1;
        } else {
          tokens.push({ type: "unknown", value: ch });
          i++;
        }
      }

      renderRuneSequence(output, tokens, 64);
    }

    document.getElementById("saveRune").addEventListener("click", saveRune);
    document.getElementById("deleteRune").addEventListener("click", deleteSelectedRune);
    document.getElementById("clearDrawing").addEventListener("click", clearDrawing);
    document.getElementById("exportData").addEventListener("click", exportData);
    document.getElementById("importButton").addEventListener("click", () => document.getElementById("importData").click());
    document.getElementById("importData").addEventListener("change", event => {
      const file = event.target.files[0];
      if (file) importData(file);
      event.target.value = "";
    });
    document.getElementById("renderText").addEventListener("click", renderTextAsRunes);
    document.getElementById("clearText").addEventListener("click", () => {
      document.getElementById("textInput").value = "";
      output.innerHTML = "";
    });
    document.getElementById("textInput").addEventListener("input", renderTextAsRunes);
    document.getElementById("matchingMode").addEventListener("change", renderTextAsRunes);
    document.getElementById("addCurrentRune").addEventListener("click", addCurrentRuneToRead);
    document.getElementById("addTripletBreak").addEventListener("click", () => appendReadRune("/"));
    document.getElementById("addSpaceRune").addEventListener("click", () => appendReadRune(" "));
    document.getElementById("undoReadRune").addEventListener("click", () => {
      readRunes.pop();
      persistReadRunes();
      renderReadRunes();
    });
    document.getElementById("clearReadRunes").addEventListener("click", () => {
      readRunes = [];
      persistReadRunes();
      renderReadRunes();
    });
    document.getElementById("plainReadText").addEventListener("change", renderReadRunes);

    document.addEventListener("keydown", event => {
      const tag = event.target.tagName;
      const isTyping = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.target.isContentEditable;
      if (isTyping || event.code !== "Space") return;

      event.preventDefault();
      appendReadRune(event.shiftKey ? "/" : " ");
    });

    lettersEl.addEventListener("input", () => {
      lettersEl.value = normalizeLetters(lettersEl.value);
    });

    renderBuilder();
    renderAlphabet();
    renderReadRunes();
