const BUILT_IN_COLLECTIONS = [
  {
    id: "builtin-animals",
    name: "Animals",
    builtIn: true,
    cards: ["Elephant", "Tiger", "Dolphin", "Penguin", "Giraffe", "Kangaroo", "Panda", "Octopus", "Zebra", "Cheetah", "Koala", "Eagle"],
  },
  {
    id: "builtin-movies",
    name: "Movies",
    builtIn: true,
    cards: ["Titanic", "Avatar", "Frozen", "Inception", "Jaws", "Coco", "Gladiator", "Interstellar", "Aladdin", "Rocky", "Shrek", "Up"],
  },
  {
    id: "builtin-sports",
    name: "Sports",
    builtIn: true,
    cards: ["Cricket", "Football", "Tennis", "Basketball", "Badminton", "Hockey", "Swimming", "Boxing", "Baseball", "Golf", "Cycling", "Volleyball"],
  },
  {
    id: "builtin-countries",
    name: "Countries",
    builtIn: true,
    cards: ["India", "Japan", "Brazil", "France", "Canada", "Australia", "Egypt", "Mexico", "Italy", "Kenya", "Spain", "Thailand"],
  },
  {
    id: "builtin-food",
    name: "Food",
    builtIn: true,
    cards: ["Pizza", "Sushi", "Burger", "Biryani", "Pasta", "Tacos", "Dosa", "Pancakes", "Falafel", "Noodles", "Cupcake", "Popcorn"],
  },
];

const STORAGE_KEY = "headsup.collections.v1";
const SETTINGS_KEY = "headsup.settings.v1";
const SCORES_KEY = "headsup.scores.v1";

const state = {
  collections: [],
  selectedCollectionId: "builtin-animals",
  selectedDuration: 60,
  selectedEditorId: null,
  game: null,
  timerId: null,
  countdownId: null,
  feedbackTimerId: null,
  audioContext: null,
  motion: {
    active: false,
    listening: false,
    state: "READY",
    axis: null,
    neutralTilt: null,
    smoothedTilt: 0,
    rawTilt: 0,
    lastTilt: 0,
    recentSamples: [],
    cooldownUntil: 0,
    neutralStableSince: null,
    triggerThreshold: 45,
    resetThreshold: 15,
    returnStabilityMs: 250,
    debounceMs: 600,
    smoothingAlpha: 0.34,
    maxStepDegrees: 20,
    lastEventSource: "none",
  },
};

const screens = {
  home: document.querySelector("#homeScreen"),
  countdown: document.querySelector("#countdownScreen"),
  game: document.querySelector("#gameScreen"),
  results: document.querySelector("#resultsScreen"),
  collections: document.querySelector("#collectionsScreen"),
};

const els = {
  homeButton: document.querySelector("#homeButton"),
  collectionsButton: document.querySelector("#collectionsButton"),
  categorySelect: document.querySelector("#categorySelect"),
  durationChoices: document.querySelector("#durationChoices"),
  startButton: document.querySelector("#startButton"),
  manageButton: document.querySelector("#manageButton"),
  countdownNumber: document.querySelector("#countdownNumber"),
  timeRemaining: document.querySelector("#timeRemaining"),
  scoreValue: document.querySelector("#scoreValue"),
  currentWord: document.querySelector("#currentWord"),
  cueStage: document.querySelector("#cueStage"),
  motionFeedback: document.querySelector("#motionFeedback"),
  motionDebug: document.querySelector("#motionDebug"),
  motionDebugToggle: document.querySelector("#motionDebugToggle"),
  motionDebugGrid: document.querySelector("#motionDebugGrid"),
  motionStateValue: document.querySelector("#motionStateValue"),
  motionAxisValue: document.querySelector("#motionAxisValue"),
  motionRawValue: document.querySelector("#motionRawValue"),
  motionNeutralValue: document.querySelector("#motionNeutralValue"),
  motionRelativeValue: document.querySelector("#motionRelativeValue"),
  motionThresholdValue: document.querySelector("#motionThresholdValue"),
  motionNeutralZoneValue: document.querySelector("#motionNeutralZoneValue"),
  skipButton: document.querySelector("#skipButton"),
  correctButton: document.querySelector("#correctButton"),
  finalScore: document.querySelector("#finalScore"),
  correctList: document.querySelector("#correctList"),
  skippedList: document.querySelector("#skippedList"),
  nextPlayerButton: document.querySelector("#nextPlayerButton"),
  playAgainButton: document.querySelector("#playAgainButton"),
  scoreboard: document.querySelector("#scoreboard"),
  newCollectionButton: document.querySelector("#newCollectionButton"),
  collectionList: document.querySelector("#collectionList"),
  collectionEditor: document.querySelector("#collectionEditor"),
  collectionEditorTemplate: document.querySelector("#collectionEditorTemplate"),
};

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeCard(text) {
  return text.trim().replace(/\s+/g, " ");
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getAllCollections() {
  return [...BUILT_IN_COLLECTIONS, ...state.collections];
}

function getSelectedCollection() {
  const collections = getAllCollections();
  return collections.find((collection) => collection.id === state.selectedCollectionId) || collections[0];
}

function showScreen(name) {
  Object.values(screens).forEach((screen) => screen.classList.remove("is-active"));
  screens[name].classList.add("is-active");
}

function saveSettings() {
  saveJson(SETTINGS_KEY, {
    selectedCollectionId: state.selectedCollectionId,
    selectedDuration: state.selectedDuration,
  });
}

function loadState() {
  const collections = loadJson(STORAGE_KEY, []);
  const settings = loadJson(SETTINGS_KEY, {});
  state.collections = Array.isArray(collections) ? collections : [];
  state.selectedCollectionId = settings.selectedCollectionId || "builtin-animals";
  state.selectedDuration = Number(settings.selectedDuration) || 60;

  if (!getAllCollections().some((collection) => collection.id === state.selectedCollectionId)) {
    state.selectedCollectionId = "builtin-animals";
  }
}

function renderCategorySelect() {
  els.categorySelect.innerHTML = "";
  getAllCollections().forEach((collection) => {
    const option = document.createElement("option");
    option.value = collection.id;
    option.textContent = collection.builtIn ? collection.name : `My: ${collection.name}`;
    els.categorySelect.append(option);
  });
  els.categorySelect.value = state.selectedCollectionId;
}

function renderDuration() {
  document.querySelectorAll("input[name='duration']").forEach((input) => {
    input.checked = Number(input.value) === state.selectedDuration;
  });
}

function renderScoreboard() {
  const scores = loadJson(SCORES_KEY, []);
  els.scoreboard.innerHTML = "";
  scores.slice(0, 4).forEach((score) => {
    const tile = document.createElement("div");
    tile.className = "score-tile";
    const name = document.createElement("span");
    const value = document.createElement("strong");
    name.textContent = score.collectionName;
    value.textContent = String(score.score);
    tile.append(name, value);
    els.scoreboard.append(tile);
  });
}

function renderHome() {
  renderCategorySelect();
  renderDuration();
  renderScoreboard();
}

function renderCollections() {
  els.collectionList.innerHTML = "";
  state.collections.forEach((collection) => {
    const button = document.createElement("button");
    button.className = "collection-item";
    button.classList.toggle("is-selected", collection.id === state.selectedEditorId);
    button.innerHTML = `<strong></strong><span></span>`;
    button.querySelector("strong").textContent = collection.name;
    button.querySelector("span").textContent = `${collection.cards.length} cards`;
    button.addEventListener("click", () => {
      state.selectedEditorId = collection.id;
      renderCollections();
    });
    els.collectionList.append(button);
  });

  if (!state.collections.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No custom collections yet.";
    els.collectionList.append(empty);
  }

  renderCollectionEditor();
}

function renderCollectionEditor() {
  const collection = state.collections.find((item) => item.id === state.selectedEditorId);
  if (!collection) {
    els.collectionEditor.innerHTML = '<div class="empty-state"><strong>Select or create a collection</strong><p>Custom decks are saved on this device and work offline.</p></div>';
    return;
  }

  els.collectionEditor.innerHTML = "";
  els.collectionEditor.append(els.collectionEditorTemplate.content.cloneNode(true));

  const nameInput = els.collectionEditor.querySelector("#collectionNameInput");
  const addForm = els.collectionEditor.querySelector("#addCardForm");
  const cardInput = els.collectionEditor.querySelector("#cardTextInput");
  const cardSearch = els.collectionEditor.querySelector("#cardSearchInput");
  const cardList = els.collectionEditor.querySelector("#cardList");
  const cardCount = els.collectionEditor.querySelector("#cardCountLabel");
  const importInput = els.collectionEditor.querySelector("#importCollectionInput");

  nameInput.value = collection.name;
  nameInput.addEventListener("change", () => {
    collection.name = normalizeCard(nameInput.value) || "Untitled Collection";
    touchCollection(collection);
    persistCollections();
    renderCategorySelect();
    renderCollections();
  });

  els.collectionEditor.querySelector("#exportCollectionButton").addEventListener("click", () => exportCollectionCsv(collection));
  importInput.addEventListener("change", () => importCollectionCsv(collection, importInput.files?.[0]));
  els.collectionEditor.querySelector("#duplicateCollectionButton").addEventListener("click", () => duplicateCollection(collection.id));
  els.collectionEditor.querySelector("#deleteCollectionButton").addEventListener("click", () => deleteCollection(collection.id));

  addForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addCard(collection, cardInput.value);
    cardInput.value = "";
    renderCollectionEditor();
  });

  cardSearch.addEventListener("input", () => drawCards(collection, cardSearch.value, cardList, cardCount));
  drawCards(collection, "", cardList, cardCount);
}

function drawCards(collection, query, cardList, cardCount) {
  const q = query.trim().toLowerCase();
  const cards = collection.cards.filter((card) => card.text.toLowerCase().includes(q));
  cardCount.textContent = `${collection.cards.length} ${collection.cards.length === 1 ? "card" : "cards"}`;
  cardList.innerHTML = "";

  cards.forEach((card) => {
    const li = document.createElement("li");
    li.className = "card-row";
    const input = document.createElement("input");
    input.value = card.text;
    input.maxLength = 80;
    input.addEventListener("change", () => updateCard(collection, card.id, input.value));

    const actions = document.createElement("div");
    actions.className = "card-actions";
    actions.innerHTML = `
      <button type="button" class="move-up" aria-label="Move up" title="Move up">↑</button>
      <button type="button" class="move-down" aria-label="Move down" title="Move down">↓</button>
      <button type="button" class="delete-card" aria-label="Delete card" title="Delete">×</button>
    `;
    actions.querySelector(".move-up").addEventListener("click", () => moveCard(collection, card.id, -1));
    actions.querySelector(".move-down").addEventListener("click", () => moveCard(collection, card.id, 1));
    actions.querySelector(".delete-card").addEventListener("click", () => deleteCard(collection, card.id));

    li.append(input, actions);
    cardList.append(li);
  });

  if (!cards.length) {
    const empty = document.createElement("li");
    empty.textContent = q ? "No matching cards." : "Add at least 10 cards for the best round.";
    cardList.append(empty);
  }
}

function persistCollections() {
  saveJson(STORAGE_KEY, state.collections);
}

function touchCollection(collection) {
  collection.updatedAt = new Date().toISOString();
}

function createCollection() {
  const now = new Date().toISOString();
  const collection = {
    id: createId(),
    name: "New Collection",
    createdAt: now,
    updatedAt: now,
    cards: [],
  };
  state.collections.unshift(collection);
  state.selectedEditorId = collection.id;
  persistCollections();
  renderCategorySelect();
  renderCollections();
}

function duplicateCollection(id) {
  const source = state.collections.find((collection) => collection.id === id);
  if (!source) return;
  const now = new Date().toISOString();
  const copy = {
    id: createId(),
    name: `${source.name} Copy`,
    createdAt: now,
    updatedAt: now,
    cards: source.cards.map((card, index) => ({
      id: createId(),
      text: card.text,
      order: index,
      createdAt: now,
    })),
  };
  state.collections.unshift(copy);
  state.selectedEditorId = copy.id;
  persistCollections();
  renderHome();
  renderCollections();
}

function deleteCollection(id) {
  const collection = state.collections.find((item) => item.id === id);
  if (!collection || !confirm(`Delete "${collection.name}"?`)) return;
  state.collections = state.collections.filter((item) => item.id !== id);
  state.selectedEditorId = state.collections[0]?.id || null;
  if (state.selectedCollectionId === id) state.selectedCollectionId = "builtin-animals";
  persistCollections();
  saveSettings();
  renderHome();
  renderCollections();
}

function hasDuplicate(collection, text, ignoredId = null) {
  const lowered = text.toLowerCase();
  return collection.cards.some((card) => card.id !== ignoredId && card.text.toLowerCase() === lowered);
}

function addCard(collection, rawText) {
  const text = normalizeCard(rawText);
  if (!text || hasDuplicate(collection, text)) return;
  collection.cards.push({
    id: createId(),
    text,
    order: collection.cards.length,
    createdAt: new Date().toISOString(),
  });
  touchCollection(collection);
  persistCollections();
  renderCategorySelect();
  renderCollections();
}

function updateCard(collection, id, rawText) {
  const text = normalizeCard(rawText);
  if (!text || hasDuplicate(collection, text, id)) {
    renderCollectionEditor();
    return;
  }
  const card = collection.cards.find((item) => item.id === id);
  if (!card) return;
  card.text = text;
  touchCollection(collection);
  persistCollections();
  renderCategorySelect();
  renderCollections();
}

function deleteCard(collection, id) {
  collection.cards = collection.cards.filter((card) => card.id !== id);
  collection.cards.forEach((card, index) => {
    card.order = index;
  });
  touchCollection(collection);
  persistCollections();
  renderCategorySelect();
  renderCollections();
}

function moveCard(collection, id, direction) {
  const index = collection.cards.findIndex((card) => card.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= collection.cards.length) return;
  [collection.cards[index], collection.cards[target]] = [collection.cards[target], collection.cards[index]];
  collection.cards.forEach((card, order) => {
    card.order = order;
  });
  touchCollection(collection);
  persistCollections();
  renderCollectionEditor();
}

function exportCollectionCsv(collection) {
  const csv = [
    "text",
    ...collection.cards.map((card) => escapeCsvValue(card.text)),
  ].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(collection.name) || "collection"}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function importCollectionCsv(collection, file) {
  if (!file) return;
  try {
    const csv = await file.text();
    const imported = parseCueCardsCsv(csv);
    const added = addImportedCards(collection, imported);
    alert(added ? `Imported ${added} cue cards.` : "No new cue cards found in that CSV.");
  } catch {
    alert("That CSV could not be imported. Use a CSV with a text column or one card per row.");
  } finally {
    renderCollectionEditor();
  }
}

function addImportedCards(collection, values) {
  let added = 0;
  values.forEach((value) => {
    const text = normalizeCard(value);
    if (!text || hasDuplicate(collection, text)) return;
    collection.cards.push({
      id: createId(),
      text,
      order: collection.cards.length,
      createdAt: new Date().toISOString(),
    });
    added += 1;
  });
  if (added) {
    touchCollection(collection);
    persistCollections();
    renderCategorySelect();
  }
  return added;
}

function escapeCsvValue(value) {
  const text = String(value ?? "");
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function parseCueCardsCsv(csv) {
  const rows = parseCsvRows(csv);
  if (!rows.length) return [];
  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const textIndex = header.indexOf("text");
  const startIndex = textIndex >= 0 ? 1 : 0;
  const columnIndex = textIndex >= 0 ? textIndex : 0;
  return rows.slice(startIndex).map((row) => row[columnIndex] || "");
}

function parseCsvRows(csv) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

async function startCountdown() {
  const collection = getSelectedCollection();
  const cards = collection.cards.map((card) => (typeof card === "string" ? card : card.text)).filter(Boolean);
  if (!cards.length) {
    alert("Add at least one cue card before playing this collection.");
    return;
  }
  await prepareMotionControls();
  unlockAudio();
  clearGameTimers();
  state.game = {
    collectionId: collection.id,
    collectionName: collection.name,
    allCards: cards,
    deck: shuffle(cards),
    used: [],
    currentWord: "",
    score: 0,
    timeRemaining: state.selectedDuration,
    correct: [],
    skipped: [],
    finished: false,
    transitioning: false,
  };
  els.countdownNumber.textContent = "3";
  showScreen("countdown");

  let count = 3;
  state.countdownId = window.setInterval(() => {
    count -= 1;
    if (count > 0) {
      els.countdownNumber.textContent = String(count);
      pulse();
      return;
    }
    clearInterval(state.countdownId);
    startRound();
  }, 900);
}

function startRound() {
  calibrateMotion();
  nextWord();
  updateGameUi();
  showScreen("game");
  state.timerId = window.setInterval(() => {
    state.game.timeRemaining -= 1;
    updateGameUi();
    if (state.game.timeRemaining <= 0) finishRound();
  }, 1000);
}

function nextWord() {
  if (!state.game.deck.length) {
    state.game.deck = shuffle(state.game.allCards);
  }
  state.game.currentWord = state.game.deck.pop();
  state.game.used.push(state.game.currentWord);
}

function markCurrent(result) {
  if (!state.game || state.game.finished || state.game.transitioning || !state.game.currentWord) return;
  state.game.transitioning = true;
  if (result === "correct") {
    state.game.score += 1;
    state.game.correct.push(state.game.currentWord);
  } else {
    state.game.skipped.push(state.game.currentWord);
  }
  state.motion.state = "WAIT_FOR_RETURN";
  state.motion.cooldownUntil = Date.now() + state.motion.debounceMs;
  state.motion.neutralStableSince = null;
  showMotionFeedback(result);
  pulse(result);
  playTone(result);
  window.setTimeout(() => {
    if (!state.game || state.game.finished) return;
    nextWord();
    state.game.transitioning = false;
    updateGameUi();
  }, 320);
}

function updateGameUi() {
  if (!state.game) return;
  els.timeRemaining.textContent = String(Math.max(0, state.game.timeRemaining));
  els.scoreValue.textContent = String(state.game.score);
  els.currentWord.textContent = state.game.currentWord;
}

function clearGameTimers() {
  clearInterval(state.timerId);
  clearInterval(state.countdownId);
  clearTimeout(state.feedbackTimerId);
  stopMotionControls();
  clearMotionFeedback();
}

function finishRound() {
  if (!state.game || state.game.finished) return;
  state.game.finished = true;
  stopMotionControls();
  clearGameTimers();
  els.finalScore.textContent = String(state.game.score);
  renderWordList(els.correctList, state.game.correct, "No correct cards this round.");
  renderWordList(els.skippedList, state.game.skipped, "No skipped cards.");
  saveScore();
  renderScoreboard();
  showScreen("results");
}

function renderWordList(element, words, emptyText) {
  element.innerHTML = "";
  if (!words.length) {
    const li = document.createElement("li");
    li.textContent = emptyText;
    element.append(li);
    return;
  }
  words.forEach((word) => {
    const li = document.createElement("li");
    li.textContent = word;
    element.append(li);
  });
}

function saveScore() {
  const scores = loadJson(SCORES_KEY, []);
  scores.unshift({
    collectionName: state.game.collectionName,
    score: state.game.score,
    playedAt: new Date().toISOString(),
  });
  saveJson(SCORES_KEY, scores.slice(0, 8));
}

function showMotionFeedback(result) {
  clearMotionFeedback();
  const isCorrect = result === "correct";
  els.cueStage.classList.add(isCorrect ? "feedback-correct" : "feedback-skip");
  els.motionFeedback.textContent = isCorrect ? "Correct" : "Pass";
  els.motionFeedback.classList.add("is-visible");
  state.feedbackTimerId = window.setTimeout(clearMotionFeedback, 420);
}

function clearMotionFeedback() {
  els.cueStage.classList.remove("feedback-correct", "feedback-skip");
  els.motionFeedback.classList.remove("is-visible");
  els.motionFeedback.textContent = "";
}

function pulse(result = "correct") {
  if (!navigator.vibrate) return;
  navigator.vibrate(result === "correct" ? 45 : [25, 35, 25]);
}

function unlockAudio() {
  if (state.audioContext) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  state.audioContext = new AudioContext();
  state.audioContext.resume?.();
}

function playTone(result) {
  const context = state.audioContext;
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  oscillator.type = "sine";
  oscillator.frequency.value = result === "correct" ? 660 : 260;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.18);
}

async function prepareMotionControls() {
  const orientationApi = window.DeviceOrientationEvent;
  const motionApi = window.DeviceMotionEvent;

  if (typeof orientationApi?.requestPermission === "function") {
    try {
      const permission = await orientationApi.requestPermission();
      if (permission !== "granted") return;
    } catch {
      return;
    }
  }

  if (typeof motionApi?.requestPermission === "function") {
    try {
      const permission = await motionApi.requestPermission();
      if (permission !== "granted") return;
    } catch {
      return;
    }
  }

  if (!state.motion.listening) {
    window.addEventListener("deviceorientation", handleDeviceOrientation);
    window.addEventListener("devicemotion", handleDeviceMotion);
    state.motion.listening = true;
  }
}

function calibrateMotion() {
  state.motion.active = true;
  state.motion.state = "READY";
  if (state.motion.recentSamples.length) {
    state.motion.axis = pickDominantAxis();
    state.motion.neutralTilt = averageAxis(state.motion.axis);
  } else {
    state.motion.axis = null;
    state.motion.neutralTilt = null;
  }
  state.motion.smoothedTilt = state.motion.neutralTilt ?? 0;
  state.motion.cooldownUntil = 0;
  state.motion.neutralStableSince = null;
  updateMotionDebugOverlay();
}

function stopMotionControls() {
  state.motion.active = false;
  state.motion.state = "READY";
  state.motion.axis = null;
  state.motion.neutralTilt = null;
  state.motion.smoothedTilt = 0;
  state.motion.cooldownUntil = 0;
  state.motion.neutralStableSince = null;
  updateMotionDebugOverlay();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const TILT_CALIBRATION_WINDOW_MS = 400;

function recordTiltSample(event) {
  const beta = typeof event.beta === "number" ? event.beta : null;
  const gamma = typeof event.gamma === "number" ? event.gamma : null;
  if (beta == null && gamma == null) return null;

  const sample = { beta: beta ?? 0, gamma: gamma ?? 0, time: Date.now() };
  const samples = state.motion.recentSamples;
  samples.push(sample);
  const cutoff = sample.time - TILT_CALIBRATION_WINDOW_MS;
  while (samples.length && samples[0].time < cutoff) samples.shift();
  return sample;
}

function averageAxis(axis) {
  const samples = state.motion.recentSamples;
  if (!samples.length) return 0;
  const total = samples.reduce((sum, sample) => sum + sample[axis], 0);
  return total / samples.length;
}

function pickDominantAxis() {
  return Math.abs(averageAxis("beta")) >= Math.abs(averageAxis("gamma")) ? "beta" : "gamma";
}

function updateMotionDebugOverlay() {
  if (!els.motionDebug) return;

  const relativeTilt = state.motion.neutralTilt == null ? 0 : state.motion.smoothedTilt - state.motion.neutralTilt;
  const inNeutralZone = Math.abs(relativeTilt) <= state.motion.resetThreshold;
  const triggerThreshold = state.motion.triggerThreshold;

  els.motionStateValue.textContent = state.motion.state;
  els.motionAxisValue.textContent = state.motion.axis ? state.motion.axis.toUpperCase() : "—";
  els.motionRawValue.textContent = `${state.motion.rawTilt.toFixed(1)}°`;
  els.motionNeutralValue.textContent = state.motion.neutralTilt == null ? "—" : `${state.motion.neutralTilt.toFixed(1)}°`;
  els.motionRelativeValue.textContent = `${relativeTilt.toFixed(1)}°`;
  els.motionThresholdValue.textContent = `${triggerThreshold}° / ${state.motion.resetThreshold}°`;
  els.motionNeutralZoneValue.textContent = inNeutralZone ? "Yes" : "No";
}

function handleDeviceMotion(event) {
  if (!state.motion.active || !state.game || state.game.finished) return;
  const motionMagnitude = Math.hypot(event.accelerationIncludingGravity?.x ?? 0, event.accelerationIncludingGravity?.y ?? 0, event.accelerationIncludingGravity?.z ?? 0);
  state.motion.lastEventSource = motionMagnitude > 1 ? "motion" : "orientation";
  updateMotionDebugOverlay();
}

function handleDeviceOrientation(event) {
  const sample = recordTiltSample(event);
  if (!sample) return;

  const axis = state.motion.axis || pickDominantAxis();
  const rawTilt = sample[axis];
  state.motion.rawTilt = rawTilt;
  state.motion.lastTilt = rawTilt;
  if (!state.motion.active || !state.game || state.game.finished) return;

  if (state.motion.neutralTilt == null) {
    state.motion.axis = axis;
    state.motion.neutralTilt = rawTilt;
    state.motion.smoothedTilt = rawTilt;
    updateMotionDebugOverlay();
    return;
  }

  const boundedRaw = clamp(rawTilt, state.motion.smoothedTilt - state.motion.maxStepDegrees, state.motion.smoothedTilt + state.motion.maxStepDegrees);
  const alpha = state.motion.smoothingAlpha;
  state.motion.smoothedTilt = state.motion.smoothedTilt + alpha * (boundedRaw - state.motion.smoothedTilt);
  const relativeTilt = state.motion.smoothedTilt - state.motion.neutralTilt;
  const now = Date.now();

  if (state.motion.state === "WAIT_FOR_RETURN") {
    if (Math.abs(relativeTilt) <= state.motion.resetThreshold) {
      if (state.motion.neutralStableSince == null) {
        state.motion.neutralStableSince = now;
      } else if (now - state.motion.neutralStableSince >= state.motion.returnStabilityMs) {
        state.motion.state = "READY";
        state.motion.neutralStableSince = null;
      }
    } else {
      state.motion.neutralStableSince = null;
    }
    updateMotionDebugOverlay();
    return;
  }

  if (now < state.motion.cooldownUntil) {
    updateMotionDebugOverlay();
    return;
  }

  if (relativeTilt >= state.motion.triggerThreshold) {
    markCurrent("correct");
  } else if (relativeTilt <= -state.motion.triggerThreshold) {
    markCurrent("skip");
  }

  updateMotionDebugOverlay();
}

function wireGestures() {
  let startY = 0;
  let startX = 0;

  els.cueStage.addEventListener("pointerdown", (event) => {
    startY = event.clientY;
    startX = event.clientX;
  });

  els.cueStage.addEventListener("pointerup", (event) => {
    const dy = event.clientY - startY;
    const dx = event.clientX - startX;
    if (Math.abs(dy) < 48 || Math.abs(dy) < Math.abs(dx)) return;
    markCurrent(dy > 0 ? "correct" : "skip");
  });
}

function wireEvents() {
  els.homeButton.addEventListener("click", () => {
    clearGameTimers();
    renderHome();
    showScreen("home");
  });
  els.collectionsButton.addEventListener("click", () => {
    renderCollections();
    showScreen("collections");
  });
  els.manageButton.addEventListener("click", () => {
    renderCollections();
    showScreen("collections");
  });
  els.newCollectionButton.addEventListener("click", createCollection);
  els.categorySelect.addEventListener("change", () => {
    state.selectedCollectionId = els.categorySelect.value;
    saveSettings();
  });
  els.durationChoices.addEventListener("change", (event) => {
    state.selectedDuration = Number(event.target.value);
    saveSettings();
  });
  els.startButton.addEventListener("click", startCountdown);
  els.correctButton.addEventListener("click", () => markCurrent("correct"));
  els.skipButton.addEventListener("click", () => markCurrent("skip"));
  els.motionDebugToggle.addEventListener("click", () => {
    const expanded = els.motionDebugToggle.getAttribute("aria-expanded") === "true";
    els.motionDebugToggle.setAttribute("aria-expanded", String(!expanded));
    els.motionDebugGrid.hidden = expanded;
  });
  els.nextPlayerButton.addEventListener("click", startCountdown);
  els.playAgainButton.addEventListener("click", startCountdown);
  window.addEventListener("beforeunload", clearGameTimers);
  wireGestures();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}

loadState();
wireEvents();
renderHome();
registerServiceWorker();
