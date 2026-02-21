/**
 * loop_voice.js — Per-bus voice manager for double-buffered loop playback.
 *
 * One instance per audio bus inside loop_bus.maxpat. Pure executor —
 * receives "start_playing", "xfade", and "stop" commands from the
 * global loop_clock.js (via [send]/[receive]). Does NOT schedule
 * crossfade timing itself — only schedules post-fade cleanup Tasks.
 *
 * Two groove~ objects (voice A and voice B) alternate playback.
 * On each "xfade" command, the incoming voice starts from 0ms and
 * fades in over 1875ms while the outgoing voice fades out.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  INLET (1)
 * ═══════════════════════════════════════════════════════════════════════
 *  0: messages:
 *     start_playing  — begin playback from the beginning (voice A)
 *     xfade          — crossfade to the other voice now
 *     stop           — fade out and stop both voices
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  OUTLETS (6)
 * ═══════════════════════════════════════════════════════════════════════
 *  0: voice A control    → groove~ left inlet (startloop / stop messages)
 *  1: voice A position   → groove~ right inlet (ms, 0 = seek to start)
 *  2: voice B control    → groove~ left inlet (startloop / stop messages)
 *  3: voice B position   → groove~ right inlet
 *  4: voice A fade       → line~ (envelope 0–1)
 *  5: voice B fade       → line~ (envelope 0–1)
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  FADE PROTOCOL
 * ═══════════════════════════════════════════════════════════════════════
 *  Instant set:  outlet(n, level)         — e.g. outlet(4, 0.0)
 *  Ramp:         outlet(n, level, rampMs) — e.g. outlet(4, 1.0, 1875)
 *
 *  line~ interprets:
 *    single float → jump to value immediately
 *    two values   → ramp to first value over second value ms
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  ANTI-CLICK
 * ═══════════════════════════════════════════════════════════════════════
 *  - start: 10ms fade-in (STARTUP_FADE_MS) instead of instant jump
 *  - stop:  20ms fade-out (STOP_FADE_MS), groove~ stopped AFTER fade
 *  - xfade: incoming fade reset to 0 before ramp (state determinism)
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  TASK SEPARATION
 * ═══════════════════════════════════════════════════════════════════════
 *  Two independent Task objects:
 *  - stopOutgoingTask: stops the old voice after xfade completes
 *  - stopBothTask:     stops both voices after stop fade completes
 *  They never conflict because they serve different code paths.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  LOOP_BUS.MAXPAT WIRING
 * ═══════════════════════════════════════════════════════════════════════
 *  [r geosoni_loop_go]   → [message start_playing] → this inlet 0
 *  [r geosoni_xfade]     → [message xfade]         → this inlet 0
 *  [r geosoni_loop_stop] → [message stop]           → this inlet 0
 *
 *  this outlet 0 → groove~ A left inlet (startloop/stop messages)
 *  this outlet 1 → groove~ A right inlet (position seek ms)
 *  this outlet 2 → groove~ B left inlet (startloop/stop messages)
 *  this outlet 3 → groove~ B right inlet (position seek ms)
 *
 *  NOTE: groove~ playback speed is driven by sig~ 1. (constant signal),
 *  NOT by this JS. This JS only sends control messages + position seeks.
 *  this outlet 4 → line~ A (fade envelope)
 *  this outlet 5 → line~ B (fade envelope)
 */

// ─── Inlet / Outlet declaration ─────────────────────────────────────

inlets = 1;
outlets = 6;

setinletassist(0, "start_playing / xfade / stop");
setoutletassist(0, "Voice A control (groove~ startloop/stop)");
setoutletassist(1, "Voice A position ms (groove~ right inlet)");
setoutletassist(2, "Voice B control (groove~ startloop/stop)");
setoutletassist(3, "Voice B position ms (groove~ right inlet)");
setoutletassist(4, "Voice A fade (line~)");
setoutletassist(5, "Voice B fade (line~)");

// ─── Constants ──────────────────────────────────────────────────────

var XFADE_MS = 1875; // 1 bar at 128 BPM
var STARTUP_FADE_MS = 10; // anti-click ramp on start
var STOP_FADE_MS = 20; // anti-click ramp on stop

// ─── State ──────────────────────────────────────────────────────────

var isPlaying = false;
var activeVoice = 0; // 0 = voice A, 1 = voice B

// Saved outlet index for stopOutgoingTask callback
var pendingStopOutlet = -1;

// ─── Tasks ──────────────────────────────────────────────────────────

var stopOutgoingTask = new Task(doStopOutgoing, this);
var stopBothTask = new Task(doStopBoth, this);

// ─── Helpers ────────────────────────────────────────────────────────

function voiceSpeedOutlet(v) {
    return v * 2;
} // 0 or 2 (startloop/stop messages)
function voicePosOutlet(v) {
    return v * 2 + 1;
} // 1 or 3
function voiceFadeOutlet(v) {
    return v + 4;
} // 4 or 5

// ─── Message handlers ───────────────────────────────────────────────

function start_playing() {
    if (inlet !== 0) return;

    // Cancel any pending Tasks from previous session
    stopOutgoingTask.cancel();
    stopBothTask.cancel();

    isPlaying = true;
    activeVoice = 0;

    // Fade A: instant 0, then ramp to 1 over STARTUP_FADE_MS (anti-click)
    outlet(voiceFadeOutlet(0), 0.0);
    outlet(voiceFadeOutlet(0), 1.0, STARTUP_FADE_MS);

    // Fade B: instant 0 (silence)
    outlet(voiceFadeOutlet(1), 0.0);

    // Stop voice B (in case it was playing)
    outlet(voiceSpeedOutlet(1), "stop");

    // Seek voice A to 0ms then start playback
    outlet(voicePosOutlet(0), 0);
    outlet(voiceSpeedOutlet(0), "startloop");

    post("loop_voice: start_playing — voice A active\n");
}

function xfade() {
    if (inlet !== 0) return;
    if (!isPlaying) return;

    // Cancel pending stop from previous crossfade
    stopOutgoingTask.cancel();

    var incoming = 1 - activeVoice;
    var outgoing = activeVoice;

    // Reset incoming fade to 0 (state determinism)
    outlet(voiceFadeOutlet(incoming), 0.0);

    // Seek incoming voice to 0ms then start playback
    outlet(voicePosOutlet(incoming), 0);
    outlet(voiceSpeedOutlet(incoming), "startloop");

    // Fade incoming in: 0 → 1 over XFADE_MS
    outlet(voiceFadeOutlet(incoming), 1.0, XFADE_MS);

    // Fade outgoing out: 1 → 0 over XFADE_MS
    outlet(voiceFadeOutlet(outgoing), 0.0, XFADE_MS);

    // Schedule stop for outgoing voice after fade completes
    pendingStopOutlet = voiceSpeedOutlet(outgoing);
    stopOutgoingTask.schedule(XFADE_MS);

    // Swap active voice
    activeVoice = incoming;
}

function stop() {
    if (inlet !== 0) return;

    // Cancel all pending Tasks
    stopOutgoingTask.cancel();
    stopBothTask.cancel();

    // Fade both out with anti-click ramp
    outlet(voiceFadeOutlet(0), 0.0, STOP_FADE_MS);
    outlet(voiceFadeOutlet(1), 0.0, STOP_FADE_MS);

    // Stop groove~ AFTER fade completes (avoid click)
    stopBothTask.schedule(STOP_FADE_MS);

    isPlaying = false;
    post("loop_voice: stop — fading out\n");
}

// ─── Task callbacks ─────────────────────────────────────────────────

function doStopOutgoing() {
    if (pendingStopOutlet >= 0) {
        outlet(pendingStopOutlet, "stop");
        pendingStopOutlet = -1;
    }
}

function doStopBoth() {
    outlet(voiceSpeedOutlet(0), "stop");
    outlet(voiceSpeedOutlet(1), "stop");
}

// ─── Catch-all for unknown messages ─────────────────────────────────

function anything() {
    var msg = messagename;
    if (msg === "start_playing" || msg === "xfade" || msg === "stop") return;
    post("loop_voice: unknown message: " + msg + "\n");
}

// ─── Cleanup ────────────────────────────────────────────────────────

function notifydeleted() {
    stopOutgoingTask.cancel();
    stopOutgoingTask.freepeer();
    stopBothTask.cancel();
    stopBothTask.freepeer();
}
