/**
 * loop_clock.js — Global crossfade clock for ambience loop playback.
 *
 * Single instance in the parent patch. Manages crossfade timing only —
 * no audio objects. Broadcasts "go", "xfade", and "stop" symbols via
 * outlet 0 to a [route go xfade stop] which distributes to all
 * loop_voice.js instances via [send].
 *
 * All 5 ambience buses crossfade at the exact same moment, preventing
 * chord collisions between harmonically-structured WAVs.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  INLET (1)
 * ═══════════════════════════════════════════════════════════════════════
 *  0: messages:
 *     start         — begin playback + schedule crossfade loop
 *     stop          — stop playback, cancel scheduling
 *     buflen <ms>   — register a buffer length (sent by each loop_bus
 *                     on buffer~ load complete via info~)
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  OUTLET (1)
 * ═══════════════════════════════════════════════════════════════════════
 *  0: symbol messages:
 *     "go"     — start playing from beginning (first time)
 *     "xfade"  — crossfade now (periodic)
 *     "stop"   — stop all voices
 *
 *     Connect to [route go xfade stop] in parent patch.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  BUFFER LENGTH COLLECTION
 * ═══════════════════════════════════════════════════════════════════════
 *  Each loop_bus instance sends its buffer length (ms) via
 *  [s geosoni_buflen] after buffer~ load completes. The clock collects
 *  all received lengths and uses min(lengths) - XFADE_MS as the
 *  crossfade trigger point. If max - min > LEN_TOLERANCE, a warning
 *  is posted.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  PARENT PATCH WIRING
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Toggle ON path:
 *    [; max dsp 1] → [delay 50] → [message start] → this inlet 0
 *
 *  Toggle OFF path:
 *    [message stop] → this inlet 0 → [delay 100] → [; max dsp 0]
 *
 *  Buffer length:
 *    [r geosoni_buflen] → [prepend buflen] → this inlet 0
 *
 *  Output routing:
 *    this outlet 0 → [route go xfade stop]
 *      → [s geosoni_loop_go]
 *      → [s geosoni_xfade]
 *      → [s geosoni_loop_stop]
 */

// ─── Inlet / Outlet declaration ─────────────────────────────────────

inlets = 1;
outlets = 1;

setinletassist(0, "start / stop / buflen <ms>");
setoutletassist(0, "go / xfade / stop symbols");

// ─── Constants ──────────────────────────────────────────────────────

var XFADE_MS = 1875;             // 1 bar at 128 BPM
var MIN_EXPECTED_LEN = 120000;   // reject buffers shorter than 2 min
var EXPECTED_LEN = 121875;       // 2:01.875 = expected WAV length
var LEN_TOLERANCE = 500;         // ±ms tolerance for length mismatch warning

// ─── State ──────────────────────────────────────────────────────────

var bufLengths = [];
var triggerMs = 0;               // min(bufLengths) - XFADE_MS
var isRunning = false;

// ─── Task for crossfade scheduling ──────────────────────────────────

var crossfadeTask = new Task(doTick, this);

// ─── Message handlers ───────────────────────────────────────────────

function start() {
    if (inlet !== 0) return;
    if (isRunning) {
        post("loop_clock: already running, ignoring start\n");
        return;
    }
    if (bufLengths.length === 0) {
        post("loop_clock: ERROR — no buffer lengths received, cannot start\n");
        return;
    }
    if (triggerMs <= 0) {
        post("loop_clock: ERROR — triggerMs=" + triggerMs + " invalid, cannot start\n");
        return;
    }

    isRunning = true;
    outlet(0, "go");
    crossfadeTask.schedule(triggerMs);
    post("loop_clock: started — triggerMs=" + triggerMs +
         ", xfade=" + XFADE_MS + "ms, " +
         bufLengths.length + " buffer(s) registered\n");
}

function stop() {
    if (inlet !== 0) return;
    if (!isRunning) {
        post("loop_clock: not running, ignoring stop\n");
        return;
    }

    crossfadeTask.cancel();
    outlet(0, "stop");
    isRunning = false;
    post("loop_clock: stopped\n");
}

function buflen(ms) {
    if (inlet !== 0) return;
    if (typeof ms !== "number" || !isFinite(ms) || ms <= 0) {
        post("loop_clock: WARNING — invalid buflen: " + ms + "\n");
        return;
    }

    bufLengths.push(ms);

    // Update triggerMs from shortest buffer
    var minLen = Math.min.apply(null, bufLengths);
    var maxLen = Math.max.apply(null, bufLengths);
    triggerMs = minLen - XFADE_MS;

    // Length validation
    if (minLen < MIN_EXPECTED_LEN) {
        post("loop_clock: ERROR — buffer too short: " + minLen +
             "ms (minimum " + MIN_EXPECTED_LEN + "ms)\n");
    }
    if (maxLen - minLen > LEN_TOLERANCE) {
        post("loop_clock: WARNING — buffer lengths differ by " +
             (maxLen - minLen) + "ms (tolerance " + LEN_TOLERANCE + "ms)\n");
    }

    post("loop_clock: buflen " + ms + "ms registered (" +
         bufLengths.length + " total), triggerMs=" + triggerMs + "\n");
}

// ─── Core tick ──────────────────────────────────────────────────────

function doTick() {
    if (!isRunning) return;
    outlet(0, "xfade");
    crossfadeTask.schedule(triggerMs);
}

// ─── Catch-all for unknown messages ─────────────────────────────────

function anything() {
    var msg = messagename;
    if (msg === "start" || msg === "stop" || msg === "buflen") return;
    post("loop_clock: unknown message: " + msg + "\n");
}

// ─── Cleanup ────────────────────────────────────────────────────────

function notifydeleted() {
    crossfadeTask.cancel();
    crossfadeTask.freepeer();
}
