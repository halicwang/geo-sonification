/**
 * icon_trigger.js — Max JS object for probabilistic auditory icon triggering.
 *
 * Receives 11 land cover percentage values, a /proximity value, and a
 * metro bang. On each bang, evaluates trigger conditions and may output
 * an icon category + intensity for downstream sample playback.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  INLETS (13)
 * ═══════════════════════════════════════════════════════════════════════
 *  0:  /lc/10   Tree cover         float 0–1   store state only
 *  1:  /lc/20   Shrubland          float 0–1   store state only
 *  2:  /lc/30   Grassland          float 0–1   store state only
 *  3:  /lc/40   Cropland           float 0–1   store state only
 *  4:  /lc/50   Built-up (Urban)   float 0–1   store state only
 *  5:  /lc/60   Bare / Sparse      float 0–1   store state only
 *  6:  /lc/70   Snow and Ice       float 0–1   store state only
 *  7:  /lc/80   Water              float 0–1   store state only
 *  8:  /lc/90   Herbaceous Wetland float 0–1   store state only
 *  9:  /lc/95   Mangrove           float 0–1   store state only
 *  10: /lc/100  Moss and Lichen    float 0–1   store state only
 *  11: /proximity                  float 0–1   store state only
 *  12: bang                        metro tick   evaluate + output
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  OUTLETS (2)
 * ═══════════════════════════════════════════════════════════════════════
 *  0: icon category   int (ESA class code: 10, 20, 30, ..., 100)
 *  1: trigger intensity   float 0–1 (random value for downstream mixing)
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  TRIGGER ALGORITHM
 * ═══════════════════════════════════════════════════════════════════════
 *  On each metro bang (inlet 12):
 *
 *  1. For each land cover class, compute a trigger weight:
 *       weight[i] = lcPercent[i] * proximity
 *     Weight is zero if: the class is inactive, or its cooldown has not
 *     expired since last trigger.
 *
 *  2. Sum all weights → totalWeight.
 *     Trigger probability = totalWeight * baseRate.
 *     Roll dice: if random() >= triggerProb → no trigger, return.
 *
 *  3. If triggering: weighted random selection among eligible classes.
 *     Output right-to-left (intensity on outlet 1 first, then category
 *     on outlet 0) so downstream Max objects receive intensity before
 *     the category that gates playback.
 *
 *  4. Reset the cooldown timer for the triggered class.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  ACTIVE CLASSES (Phase 1)
 * ═══════════════════════════════════════════════════════════════════════
 *  Only classes with prepared icon samples should be active. Phase 1
 *  uses 3 types. Add class codes to the array as you add icon samples:
 *
 *  All ESA class codes: 10 20 30 40 50 60 70 80 90 95 100
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  CONFIGURATION MESSAGES (send to inlet 0)
 * ═══════════════════════════════════════════════════════════════════════
 *  baserate <float>   Base trigger probability per tick (default 0.05).
 *                     Higher = more frequent triggers.
 *  cooldown <ms>      Minimum interval between same-class triggers
 *                     (default 3000). Prevents rapid-fire.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  DELTA-DRIVEN DRAMA (recommended Max patch wiring)
 * ═══════════════════════════════════════════════════════════════════════
 *  This script does NOT receive /delta messages. For dynamic drama
 *  (icons prominent during viewport movement, quiet during stillness),
 *  multiply outlet 1 (intensity) by /delta/magnitude in the Max patch:
 *
 *    [icon_trigger.js]
 *         |              |
 *     outlet 0       outlet 1
 *     (category)     (intensity)
 *                        |
 *                       [*]───── /delta/magnitude
 *                        |
 *                   (scaled intensity → sample player gain)
 *
 *  This keeps the JS simple while achieving a narrative arc: stable
 *  texture when the map is still, active icons when the user explores.
 */

// ─── Inlet / Outlet declaration ─────────────────────────────────────

inlets = 13;
outlets = 2;

// ─── Inlet / Outlet assist strings ──────────────────────────────────

var LC_LABELS = [
    "Tree (10)", "Shrub (20)", "Grass (30)", "Crop (40)",
    "Urban (50)", "Bare (60)", "Snow/Ice (70)", "Water (80)",
    "Wetland (90)", "Mangrove (95)", "Moss/Lichen (100)"
];

var i;
for (i = 0; i < 11; i++) {
    setinletassist(i, "/lc/" + LC_LABELS[i] + " float 0-1 (state only)");
}
setinletassist(11, "/proximity float 0-1 (state only)");
setinletassist(12, "bang — metro tick to evaluate triggers");
setoutletassist(0, "Icon category (int: ESA class code 10–100)");
setoutletassist(1, "Trigger intensity (float 0-1)");

// ─── Constants ──────────────────────────────────────────────────────

var LC_CLASSES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100];
var NUM_CLASSES = 11;

// Phase 1: only these classes have icon samples.
// Add class codes here as you add icon samples for new land cover types.
// All ESA codes for reference: 10 20 30 40 50 60 70 80 90 95 100
var ACTIVE_CLASSES = [10, 40, 50, 60];

// ─── State ──────────────────────────────────────────────────────────

var lcPercent = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
var proximity = 0;
var lastTriggerTime = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
var baseRate = 0.05;
var cooldownMs = 3000;

// ─── Helpers ────────────────────────────────────────────────────────

function clamp01(v) {
    if (v !== v) return 0;  // NaN guard
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
}

/**
 * Build a lookup object from the ACTIVE_CLASSES array.
 * Returns an object where active class codes are keys with value true.
 */
function buildActiveSet() {
    var set = {};
    var a;
    for (a = 0; a < ACTIVE_CLASSES.length; a++) {
        set[ACTIVE_CLASSES[a]] = true;
    }
    return set;
}

// ─── Message handlers ───────────────────────────────────────────────

function msg_float(v) {
    var idx = inlet;
    if (idx < 11) {
        lcPercent[idx] = clamp01(v);
    } else if (idx === 11) {
        proximity = clamp01(v);
    }
}

function bang() {
    if (inlet !== 12) return;

    var now = new Date().getTime();
    var activeSet = buildActiveSet();

    // Compute per-class trigger weights
    var weights = [];
    var totalWeight = 0;
    var i;
    for (i = 0; i < NUM_CLASSES; i++) {
        var w = 0;
        if (activeSet[LC_CLASSES[i]]
            && (now - lastTriggerTime[i] >= cooldownMs)) {
            w = lcPercent[i] * proximity;
        }
        weights[i] = w;
        totalWeight += w;
    }

    // No eligible classes or zero weight
    if (totalWeight <= 0) return;

    // Probabilistic gate: higher totalWeight = more likely to trigger
    if (Math.random() >= totalWeight * baseRate) return;

    // Weighted random selection among eligible classes
    var r = Math.random() * totalWeight;
    var cumulative = 0;
    for (i = 0; i < NUM_CLASSES; i++) {
        cumulative += weights[i];
        if (r <= cumulative) {
            lastTriggerTime[i] = now;
            // Output right-to-left: intensity (outlet 1) before category (outlet 0)
            // so downstream objects have intensity ready when category arrives
            outlet(1, Math.random());
            outlet(0, LC_CLASSES[i]);
            return;
        }
    }
}

// ─── Configuration messages (send to inlet 0) ──────────────────────

/**
 * baserate <float> — set base trigger probability per tick.
 * Example: [baserate 0.1( → more frequent triggers
 */
function baserate(v) {
    if (inlet === 0 && v > 0) {
        baseRate = v;
        post("icon_trigger: baseRate set to " + v + "\n");
    }
}

/**
 * cooldown <ms> — set minimum interval between same-class triggers.
 * Example: [cooldown 2000( → 2-second cooldown
 */
function cooldown(v) {
    if (inlet === 0 && v >= 0) {
        cooldownMs = v;
        post("icon_trigger: cooldownMs set to " + v + " ms\n");
    }
}
