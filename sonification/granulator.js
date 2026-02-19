/**
 * granulator.js — Max JS object for granular synthesis scheduling.
 *
 * Reads from a downstream Max buffer~ via play~ objects. Outputs grain
 * playback commands and amplitude envelopes for 4-voice polyphony.
 * Proximity modulates grain density: close-up = varied texture,
 * distant = slow blurry ambient wash.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  INLETS (8)
 * ═══════════════════════════════════════════════════════════════════════
 *  0: bang          start/stop toggle
 *  1: dur min       grain duration minimum in ms (default 500)
 *  2: dur max       grain duration maximum in ms (default 1000)
 *  3: interval min  grain trigger interval minimum in ms (default 1000)
 *  4: interval max  grain trigger interval maximum in ms (default 2000)
 *  5: start range   grain start time upper limit in ms (default 10000)
 *                   Typically: buffer length minus max grain duration.
 *                   Grains start at random positions within 0..startRange.
 *  6: amp variation float 0–1 (default 0)
 *                   0 = all grains at equal peak amplitude
 *                   1 = fully random peak amplitude (0–1)
 *  7: proximity     float 0–1 (from /proximity OSC message)
 *                   As proximity decreases (zoom out):
 *                   - grain durations shift toward maximum (longer)
 *                   - trigger intervals shift toward maximum (sparser)
 *                   Result: slow, blurry texture for distant view.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  OUTLETS (8)
 * ═══════════════════════════════════════════════════════════════════════
 *  0–3: grain playback messages for voices 0–3
 *        list: start_ms end_ms duration_ms
 *        Connect each to a [play~ mybuf] object.
 *
 *  4–7: grain envelope messages for voices 0–3
 *        line~ compatible format:
 *          first message: 0        (reset to silence)
 *          second message: peak attack_ms peak sustain_ms 0 release_ms
 *        Connect each to a [line~] object, then multiply with the
 *        corresponding play~ output using [*~].
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  ENVELOPE SHAPE
 * ═══════════════════════════════════════════════════════════════════════
 *  3-phase envelope, each phase = grainDuration / 3:
 *
 *    peak ┌──────────┐
 *         │  attack  │ sustain  │ release
 *    0 ───┘          │          └─── 0
 *         |── d/3 ──|── d/3 ──|── d/3 ──|
 *
 *  Peak amplitude = 1 - random() * ampVariation
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  PROXIMITY INFLUENCE
 * ═══════════════════════════════════════════════════════════════════════
 *  effectiveMin = min + (max - min) * (1 - proximity)
 *
 *  proximity=1 (close): effectiveMin = min → full range [min, max]
 *  proximity=0 (distant): effectiveMin = max → always max value
 *
 *  Applied to both grain duration and trigger interval.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  MAX PATCH WIRING (see granulator_README.md for full guide)
 * ═══════════════════════════════════════════════════════════════════════
 *  [buffer~ mybuf]
 *       |
 *  [js granulator.js]
 *   |  |  |  |  |  |  |  |
 *  play~ x4       line~ x4
 *   |  |  |  |    |  |  |  |
 *   [*~] x4   (audio * envelope)
 *       |
 *      [+~] → output (mix 4 voices)
 */

// ─── Inlet / Outlet declaration ─────────────────────────────────────

inlets = 8;
outlets = 8;

// ─── Inlet / Outlet assist strings ──────────────────────────────────

setinletassist(0, "bang — start/stop toggle");
setinletassist(1, "Grain duration min (ms, default 500)");
setinletassist(2, "Grain duration max (ms, default 1000)");
setinletassist(3, "Grain interval min (ms, default 1000)");
setinletassist(4, "Grain interval max (ms, default 2000)");
setinletassist(5, "Start time range (ms, default 10000)");
setinletassist(6, "Amplitude variation (float 0-1, default 0)");
setinletassist(7, "/proximity (float 0-1)");

var i;
for (i = 0; i < 4; i++) {
    setoutletassist(i, "Voice " + i + " playback: start_ms end_ms dur_ms");
    setoutletassist(i + 4, "Voice " + i + " envelope: line~ compatible");
}

// ─── Constants ──────────────────────────────────────────────────────

var NUM_VOICES = 4;

// ─── State ──────────────────────────────────────────────────────────

var voiceIndex = 0;
var running = false;

// Parameters with sensible defaults
var durMin = 500;
var durMax = 1000;
var intervalMin = 1000;
var intervalMax = 2000;
var startRange = 10000;
var ampVariation = 0;
var proximity = 1;

// ─── Task for grain scheduling ──────────────────────────────────────

var grainTask = new Task(triggerGrain, this);

// ─── Helpers ────────────────────────────────────────────────────────

function clamp01(v) {
    if (v !== v) return 0;  // NaN guard
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
}

// ─── Message handlers ───────────────────────────────────────────────

function bang() {
    if (inlet !== 0) return;
    running = !running;
    if (running) {
        voiceIndex = 0;
        grainTask.schedule(0);  // fire immediately
        post("granulator: started\n");
    } else {
        grainTask.cancel();
        post("granulator: stopped\n");
    }
}

function msg_float(v) {
    var idx = inlet;
    if (idx === 1) durMin = Math.max(1, v);
    else if (idx === 2) durMax = Math.max(1, v);
    else if (idx === 3) intervalMin = Math.max(1, v);
    else if (idx === 4) intervalMax = Math.max(1, v);
    else if (idx === 5) startRange = Math.max(0, v);
    else if (idx === 6) ampVariation = clamp01(v);
    else if (idx === 7) proximity = clamp01(v);
}

function msg_int(v) {
    // Treat integer input same as float for all parameter inlets
    msg_float(v);
}

// ─── Core grain trigger ─────────────────────────────────────────────

function triggerGrain() {
    if (!running) return;

    // Proximity-influenced effective minimums:
    // As proximity → 0, effective min shifts toward max (longer, sparser)
    var pInv = 1 - proximity;
    var effDurMin = durMin + (durMax - durMin) * pInv;
    var effIntMin = intervalMin + (intervalMax - intervalMin) * pInv;

    // Ensure effective min doesn't exceed max (defensive guard)
    if (effDurMin > durMax) effDurMin = durMax;
    if (effIntMin > intervalMax) effIntMin = intervalMax;

    // Random grain duration within [effDurMin, durMax]
    var durRange = durMax - effDurMin;
    var dur = effDurMin + Math.random() * (durRange > 0 ? durRange : 0);

    // Random start position within buffer (0 to startRange)
    var maxStart = startRange - dur;
    var startMs = Math.random() * (maxStart > 0 ? maxStart : 0);

    // Peak amplitude (1.0 when ampVariation=0, random when ampVariation=1)
    var amplitude = 1 - Math.random() * ampVariation;

    // 3-phase envelope: attack / sustain / release, each = dur/3
    var phase = dur / 3;

    // ── Output: playback command (outlet 0–3) ──
    // list: start_ms, end_ms, duration_ms → for [play~ mybuf]
    outlet(voiceIndex, startMs, startMs + dur, dur);

    // ── Output: envelope (outlet 4–7) ──
    // First set to 0 (silence), then ramp: peak over attack,
    // hold peak over sustain, fade to 0 over release
    var envOutlet = voiceIndex + NUM_VOICES;
    outlet(envOutlet, 0);
    outlet(envOutlet, amplitude, phase, amplitude, phase, 0, phase);

    // Advance to next voice (round-robin: 0→1→2→3→0...)
    voiceIndex = (voiceIndex + 1) % NUM_VOICES;

    // Schedule next grain
    var intRange = intervalMax - effIntMin;
    var nextInterval = effIntMin + Math.random() * (intRange > 0 ? intRange : 0);
    grainTask.schedule(nextInterval);
}

// ─── Cleanup ────────────────────────────────────────────────────────

function notifydeleted() {
    // Called by Max when the js object is deleted — clean up Task
    grainTask.cancel();
    grainTask.freepeer();
}
