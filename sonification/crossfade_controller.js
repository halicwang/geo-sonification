/**
 * crossfade_controller.js — Max JS object for land cover crossfade mixing.
 *
 * Receives 11 land cover percentage values (/lc/10 through /lc/100) and a
 * /proximity value. Applies frame-based exponential smoothing to produce
 * 11 independent volume outputs (0–1), attenuated by proximity.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  INLETS (12)
 * ═══════════════════════════════════════════════════════════════════════
 *  0:  /lc/10   Tree cover         float 0–1   store target only
 *  1:  /lc/20   Shrubland          float 0–1   store target only
 *  2:  /lc/30   Grassland          float 0–1   store target only
 *  3:  /lc/40   Cropland           float 0–1   store target only
 *  4:  /lc/50   Built-up (Urban)   float 0–1   store target only
 *  5:  /lc/60   Bare / Sparse      float 0–1   store target only
 *  6:  /lc/70   Snow and Ice       float 0–1   store target only
 *  7:  /lc/80   Water              float 0–1   store target only
 *  8:  /lc/90   Herbaceous Wetland float 0–1   store target only
 *  9:  /lc/95   Mangrove           float 0–1   store target only
 *  10: /lc/100  Moss and Lichen    float 0–1   store target AND trigger
 *                                               frame update + output
 *  11: /proximity                  float 0–1   store for attenuation
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  OUTLETS (11)
 * ═══════════════════════════════════════════════════════════════════════
 *  0:  smoothed volume for class 10  (Tree)          float 0–1
 *  1:  smoothed volume for class 20  (Shrub)         float 0–1
 *  2:  smoothed volume for class 30  (Grass)         float 0–1
 *  3:  smoothed volume for class 40  (Crop)          float 0–1
 *  4:  smoothed volume for class 50  (Urban)         float 0–1
 *  5:  smoothed volume for class 60  (Bare)          float 0–1
 *  6:  smoothed volume for class 70  (Snow/Ice)      float 0–1
 *  7:  smoothed volume for class 80  (Water)         float 0–1
 *  8:  smoothed volume for class 90  (Wetland)       float 0–1
 *  9:  smoothed volume for class 95  (Mangrove)      float 0–1
 *  10: smoothed volume for class 100 (Moss/Lichen)   float 0–1
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  FRAME-BASED SMOOTHING RATIONALE
 * ═══════════════════════════════════════════════════════════════════════
 *  The server sends 11 /lc/* messages in rapid succession per viewport
 *  update (near-zero interval between them). If smoothing ran per-inlet,
 *  the first inlet would see dt ≈ 200ms while the remaining 10 see
 *  dt ≈ 0ms, causing inconsistent smoothing across channels.
 *
 *  Solution: inlets 0–9 only store their new target value. Inlet 10
 *  (/lc/100, the last class in the canonical send order) stores its
 *  target AND triggers updateFrame(), which applies EMA smoothing to
 *  ALL 11 channels using the same dt. This ensures identical smoothing
 *  behaviour across all channels within each server update.
 *
 *  Smoothing formula (EMA):
 *      alpha = 1 - exp(-dt / smoothingTime)
 *      smoothed[i] += alpha * (target[i] - smoothed[i])
 *
 *  Default smoothingTime: 500 ms. Configurable via 'smoothtime' message.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  CONFIGURATION MESSAGES (send to inlet 0)
 * ═══════════════════════════════════════════════════════════════════════
 *  smoothtime <ms>   Set EMA time constant (default 500). Higher values
 *                    produce slower, smoother transitions.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  MAX PATCH WIRING HINTS
 * ═══════════════════════════════════════════════════════════════════════
 *  1. Route /lc/10 .. /lc/100 from udpreceive → route → this js inlets
 *  2. Route /proximity → inlet 11
 *  3. Connect outlets 0–10 to gain~ or *~ objects controlling audio
 *  4. Fold 11 outlets into 5 audio buses in the patch:
 *       Tree bus:  outlets 0,1,2,8,9,10   (classes 10,20,30,90,95,100)
 *       Crop bus:  outlet 3               (class 40)
 *       Urban bus: outlet 4               (class 50)
 *       Bare bus:  outlet 5               (class 60)
 *       Water bus: outlets 6,7            (classes 70,80)
 *                  + ocean 3-level detector (water_bus.js) via maximum
 *     This fold-mapping is a Max wiring concern — this script always
 *     outputs all 11 independent channels.
 */

// ─── Inlet / Outlet declaration ─────────────────────────────────────

inlets = 12;
outlets = 11;

// ─── Inlet / Outlet assist strings ──────────────────────────────────

var LC_LABELS = [
    "Tree (10)", "Shrub (20)", "Grass (30)", "Crop (40)",
    "Urban (50)", "Bare (60)", "Snow/Ice (70)", "Water (80)",
    "Wetland (90)", "Mangrove (95)", "Moss/Lichen (100)"
];

var i;
for (i = 0; i < 11; i++) {
    setinletassist(i, "/lc/" + LC_LABELS[i] + " float 0-1" +
        (i < 10 ? " (store only)" : " (store + trigger frame)"));
    setoutletassist(i, "Smoothed volume: " + LC_LABELS[i] + " float 0-1");
}
setinletassist(11, "/proximity float 0-1 (attenuation)");

// ─── State ──────────────────────────────────────────────────────────

var NUM_CHANNELS = 11;
var target = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
var smoothed = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
var proximity = 0;
var smoothingTime = 500;    // ms — EMA time constant
var lastFrameTime = 0;
var initialized = false;

// ─── Helpers ────────────────────────────────────────────────────────

function clamp01(v) {
    if (v !== v) return 0;  // NaN guard (NaN !== NaN)
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
}

// ─── Message handlers ───────────────────────────────────────────────

function msg_float(v) {
    var idx = inlet;
    if (idx < 10) {
        target[idx] = clamp01(v);
    } else if (idx === 10) {
        target[10] = clamp01(v);
        updateFrame();
    } else if (idx === 11) {
        proximity = clamp01(v);
    }
}

/**
 * smoothtime <ms> — configure the EMA time constant.
 * Send to inlet 0 as a named message: [smoothtime 500(
 */
function smoothtime(v) {
    if (inlet === 0 && v > 0) {
        smoothingTime = v;
        post("crossfade_controller: smoothingTime set to " + v + " ms\n");
    }
}

// ─── Core smoothing ─────────────────────────────────────────────────

function updateFrame() {
    var now = new Date().getTime();
    var dt = now - lastFrameTime;
    lastFrameTime = now;

    // Compute alpha — snap on first frame or stale dt
    var alpha;
    if (!initialized || dt <= 0 || dt > 5000) {
        alpha = 1.0;
        initialized = true;
    } else {
        alpha = 1 - Math.exp(-dt / smoothingTime);
    }

    // Apply EMA to all 11 channels with identical alpha and dt
    var i;
    for (i = 0; i < NUM_CHANNELS; i++) {
        smoothed[i] += alpha * (target[i] - smoothed[i]);
    }

    // Output right-to-left (Max convention: rightmost outlet first)
    // Each output is the smoothed value attenuated by proximity
    for (i = NUM_CHANNELS - 1; i >= 0; i--) {
        outlet(i, smoothed[i] * proximity);
    }
}
