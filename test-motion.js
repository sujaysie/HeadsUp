const vm = require("vm");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

// ---- minimal fake DOM ----------------------------------------------------
function makeFakeElement() {
  const el = {
    _text: "",
    _hidden: false,
    _attrs: {},
    classList: {
      _set: new Set(),
      add(...names) { names.forEach((n) => this._set.add(n)); },
      remove(...names) { names.forEach((n) => this._set.delete(n)); },
      toggle(name, force) {
        if (force === undefined) {
          this._set.has(name) ? this._set.delete(name) : this._set.add(name);
        } else if (force) this._set.add(name);
        else this._set.delete(name);
      },
      contains(name) { return this._set.has(name); },
    },
    addEventListener() {},
    removeEventListener() {},
    setAttribute(name, value) { this._attrs[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this._attrs, name) ? this._attrs[name] : null; },
    removeAttribute(name) { delete this._attrs[name]; },
    querySelector() { return makeFakeElement(); },
    querySelectorAll() { return []; },
    append() {}, appendChild() {}, remove() {},
    cloneNode() { return makeFakeElement(); },
    get content() { return makeFakeElement(); },
    get textContent() { return this._text; },
    set textContent(v) { this._text = v; },
    get innerHTML() { return this._html || ""; },
    set innerHTML(v) { this._html = v; },
    get value() { return this._value || ""; },
    set value(v) { this._value = v; },
    get hidden() { return this._hidden; },
    set hidden(v) { this._hidden = v; },
    style: {},
  };
  return el;
}

const elementCache = new Map();
function getOrCreate(selector) {
  if (!elementCache.has(selector)) elementCache.set(selector, makeFakeElement());
  return elementCache.get(selector);
}

const fakeDocument = {
  querySelector: (sel) => getOrCreate(sel),
  querySelectorAll: () => [],
  createElement: () => makeFakeElement(),
  body: makeFakeElement(),
  addEventListener() {},
};

const fakeLocalStorage = {
  _data: {},
  getItem(key) { return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : null; },
  setItem(key, value) { this._data[key] = String(value); },
};

let fakeNow = 1_700_000_000_000;
const fakeDateCtor = { now: () => fakeNow };

const sandbox = {
  document: fakeDocument,
  localStorage: fakeLocalStorage,
  navigator: {},
  crypto: { randomUUID: () => "test-uuid" },
  console,
  Math,
  Date: fakeDateCtor,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  alert() {},
  confirm() { return true; },
};
sandbox.window = {
  addEventListener() {},
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  DeviceOrientationEvent: undefined,
  DeviceMotionEvent: undefined,
  AudioContext: undefined,
  webkitAudioContext: undefined,
};
vm.createContext(sandbox);

const src = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const exposer = "\nglobalThis.__state = state; globalThis.__els = els;\n";
vm.runInContext(src + exposer, sandbox, { filename: "app.js" });

const state = sandbox.__state;
const { calibrateMotion, stopMotionControls, handleDeviceOrientation } = sandbox;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function advance(ms) { fakeNow += ms; }

function feed(beta, gamma) {
  handleDeviceOrientation({ beta, gamma });
}

// A realistic "held roughly vertical against the forehead" pose has one axis
// pinned near +/-90 and the other near 0, but with device noise both jitter
// and can pass close to each other, which is the scenario that used to make
// the old per-sample dominant-axis pick flip-flop.
function jitter(base, amount) {
  return base + (Math.random() * 2 - 1) * amount;
}

async function run() {
  let failures = 0;
  function check(name, cond) {
    if (cond) {
      console.log(`PASS  ${name}`);
    } else {
      failures += 1;
      console.log(`FAIL  ${name}`);
    }
  }

  // --- Scenario 1: noisy neutral hold, beta/gamma close together ----------
  // beta hovers around 88, gamma hovers around 6 -- beta is the "true" axis,
  // but on any single sample they can cross (this used to make the app
  // flip which axis it read, mid-round).
  stopMotionControls();
  state.game = {
    finished: false,
    transitioning: false,
    currentWord: "Elephant",
    score: 0,
    correct: [],
    skipped: [],
    deck: ["Tiger", "Dolphin"],
    allCards: ["Elephant", "Tiger", "Dolphin"],
    used: [],
  };

  for (let i = 0; i < 20; i += 1) {
    feed(jitter(88, 6), jitter(6, 6));
    advance(16);
  }
  calibrateMotion();
  const lockedAxis = state.motion.axis;
  check("locks onto the dominant axis (beta) at calibration", lockedAxis === "beta");
  check("neutral baseline is close to the true neutral (~88°), not one noisy sample", Math.abs(state.motion.neutralTilt - 88) < 4);

  // Keep "holding roughly still" for 2 seconds of noisy samples, including
  // beta/gamma crossovers, and confirm the axis stays locked and nothing
  // spuriously triggers.
  let spuriousTrigger = false;
  for (let i = 0; i < 120; i += 1) {
    feed(jitter(88, 7), jitter(6, 7));
    advance(16);
    if (state.motion.axis !== lockedAxis) {
      console.log(`  axis changed mid-round at sample ${i}: ${state.motion.axis}`);
    }
    if (state.game.score > 0 || state.game.skipped.length > 0) spuriousTrigger = true;
  }
  check("axis stays locked through a noisy hold (no mid-round flip)", state.motion.axis === lockedAxis);
  check("noisy still-holding does not fire a false Correct/Skip", !spuriousTrigger);

  // --- Scenario 2: a single sensor-glitch spike should not trigger --------
  state.motion.state = "READY";
  state.game.score = 0;
  state.game.skipped = [];
  feed(88 + 70, 6); // one wild single-sample spike, ~70 degrees off
  advance(16);
  check("a single outlier spike alone does not fire a trigger", state.game.score === 0 && state.game.skipped.length === 0);
  // settle back down
  for (let i = 0; i < 10; i += 1) {
    feed(jitter(88, 5), jitter(6, 5));
    advance(16);
  }

  // --- Scenario 3: a genuine deliberate tilt still triggers reliably ------
  state.motion.state = "READY";
  state.motion.cooldownUntil = 0;
  state.game.score = 0;
  state.game.correct = [];
  state.game.currentWord = "Elephant";
  state.game.transitioning = false;
  const steps = 18;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    feed(88 + t * 60, 6); // ramps 60 degrees past neutral over ~300ms
    advance(16);
  }
  check("a genuine deliberate tilt fires Correct", state.game.score === 1 && state.game.correct.includes("Elephant"));
  check("state moves to WAIT_FOR_RETURN right after a trigger", state.motion.state === "WAIT_FOR_RETURN");

  await sleep(400); // let markCurrent's real setTimeout tail settle

  // --- Scenario 4: re-arms after returning to neutral ---------------------
  for (let i = 0; i < 20; i += 1) {
    feed(jitter(88, 3), jitter(6, 3));
    advance(20);
  }
  check("returns to READY after settling back near neutral", state.motion.state === "READY");

  const steps2 = 18;
  for (let i = 1; i <= steps2; i += 1) {
    const t = i / steps2;
    feed(88 - t * 60, 6); // tilt the other way this time
    advance(16);
  }
  check("a second deliberate tilt (opposite direction) fires Skip", state.game.skipped.length === 1);

  await sleep(400); // let that trigger's setTimeout tail settle before reusing state.game

  // --- Scenario 5: a sensor glitch arriving mid-gesture (genuinely tilted,
  // but still under the trigger threshold) should NOT cause a premature
  // trigger. This exact case fires a false "Correct" on the original code
  // (see the sibling test against the unmodified app.js) -- alpha alone
  // damps an isolated spike from neutral, but not one that lands on top of
  // a real partial tilt that's already most of the way there.
  state.motion.state = "READY";
  state.motion.cooldownUntil = 0;
  state.motion.neutralStableSince = null;
  state.motion.smoothedTilt = state.motion.neutralTilt; // back to neutral, like a fresh calibration
  state.game.score = 0;
  state.game.skipped = [];
  state.game.correct = [];
  state.game.currentWord = "Elephant";
  state.game.transitioning = false;
  for (let i = 1; i <= 12; i += 1) {
    feed(88 + (i / 12) * 35, 6);
    advance(16);
  }
  const midGestureRelative = state.motion.smoothedTilt - state.motion.neutralTilt;
  console.log(`  (mid-gesture relative tilt before glitch: ${midGestureRelative.toFixed(1)}° vs 45° threshold)`);
  feed(88 + 140, 6);
  advance(16);
  check("a glitch spike arriving mid-gesture does not fire a premature trigger", state.game.score === 0 && state.game.skipped.length === 0);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

run();
