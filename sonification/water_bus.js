/**
 * water_bus.js — Max JS object for three-level ocean detection with smoothing.
 *
 * Produces a smoothed "ocean level" signal based on viewport data coverage
 * and proximity. Designed to be combined (via [maximum]) with the crossfade
 * controller's class 70+80 sum, giving the Water bus both macro ocean
 * awareness and fine-grained grid-level water detail.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  CONCEPT
 * ═══════════════════════════════════════════════════════════════════════
 *  "Ocean" is defined as the ABSENCE of grid data, not a land cover class.
 *  The metric is (1 − coverage): the fraction of the viewport with no data.
 *  Over the open ocean there are no grids, so coverage ≈ 0 and ocean ≈ 1.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  THREE LEVELS
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  1.0  Pure ocean    proximity == 0
 *                     No grid data at all — the viewport is entirely over
 *                     open water. Full ocean signal.
 *
 *  0.7  Coastal       coverage < 0.1  AND  proximity > 0.7
 *                     More than 90% of the viewport lacks data (ocean),
 *                     but there are enough grids for high proximity.
 *                     Typical for a coastline view: land on one side,
 *                     open water on the other.
 *
 *  0.0  Land          otherwise
 *                     Sufficient data coverage — the viewport is over land.
 *                     Any water signal comes from the crossfade controller's
 *                     class 70/80 outputs, not from this detector.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  INLETS (2)
 * ═══════════════════════════════════════════════════════════════════════
 *  0: /proximity     float 0–1   store only
 *  1: /coverage      float 0–1   store AND trigger evaluation + output
 *
 *  /coverage is the last OSC message in each server update cycle
 *  (send order: /proximity → /lc/* → /coverage), so when inlet 1
 *  triggers, inlet 0 already holds the current-frame proximity.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  OUTLETS (1)
 * ═══════════════════════════════════════════════════════════════════════
 *  0: smoothed ocean level   float 0–1
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  SMOOTHING
 * ═══════════════════════════════════════════════════════════════════════
 *  EMA (exponential moving average), identical formula to
 *  crossfade_controller.js:
 *
 *      alpha = 1 - exp(-dt / smoothingTime)
 *      smoothed += alpha * (target - smoothed)
 *
 *  Default smoothingTime: 500 ms. Configurable via 'smoothtime' message.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  CONFIGURATION MESSAGES (send to inlet 0)
 * ═══════════════════════════════════════════════════════════════════════
 *  smoothtime <ms>   Set EMA time constant (default 500).
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  MAX PATCH WIRING
 * ═══════════════════════════════════════════════════════════════════════
 *  [js water_bus.js]
 *       |
 *    outlet 0 (ocean level)
 *       |
 *    [maximum 0.] RIGHT inlet (stores)
 *       |
 *    LEFT inlet ← [+ 0.] (crossfade class 70 + 80 sum)
 *       |
 *    output → flonum (Water bus display)
 */

// ─── Inlet / Outlet declaration ─────────────────────────────────────

inlets = 2;
outlets = 1;

// ─── Inlet / Outlet assist strings ──────────────────────────────────

setinletassist(0, "/proximity float 0-1 (store only)");
setinletassist(1, "/coverage float 0-1 (store + trigger)");
setoutletassist(0, "Smoothed ocean level float 0-1");

// ─── Constants ──────────────────────────────────────────────────────

var OCEAN_COVERAGE_THRESHOLD = 0.1; // coverage below this → "mostly ocean"
var COASTAL_PROX_THRESHOLD = 0.7; // proximity above this → "zoomed in enough"
var COASTAL_LEVEL = 0.7; // output level for coastal zone

// ─── State ──────────────────────────────────────────────────────────

var proximity = 0;
var coverage = 0;
var smoothed = 0;
var smoothingTime = 500; // ms — EMA time constant
var lastTime = 0;
var initialized = false;

// ─── Helpers ────────────────────────────────────────────────────────

function clamp01(v) {
    if (v !== v) return 0; // NaN guard
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
}

// ─── Message handlers ───────────────────────────────────────────────

function msg_float(v) {
    var idx = inlet;
    if (idx === 0) {
        proximity = clamp01(v);
    } else if (idx === 1) {
        coverage = clamp01(v);
        evaluate();
    }
}

/**
 * smoothtime <ms> — configure the EMA time constant.
 * Send to inlet 0 as a named message: [smoothtime 500(
 */
function smoothtime(v) {
    if (inlet === 0 && v > 0) {
        smoothingTime = v;
        post("water_bus: smoothingTime set to " + v + " ms\n");
    }
}

// ─── Core evaluation ────────────────────────────────────────────────

function evaluate() {
    // ── Determine target level ──
    var target;
    if (proximity <= 0) {
        target = 1.0; // pure ocean
    } else if (coverage < OCEAN_COVERAGE_THRESHOLD && proximity > COASTAL_PROX_THRESHOLD) {
        target = COASTAL_LEVEL; // coastal
    } else {
        target = 0.0; // land
    }

    // ── EMA smoothing ──
    var now = new Date().getTime();
    var dt = now - lastTime;
    lastTime = now;

    var alpha;
    if (!initialized || dt <= 0 || dt > 5000) {
        alpha = 1.0;
        initialized = true;
    } else {
        alpha = 1 - Math.exp(-dt / smoothingTime);
    }

    smoothed += alpha * (target - smoothed);

    // ── Output ──
    outlet(0, smoothed);
}
