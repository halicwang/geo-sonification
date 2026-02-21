/**
 * Delta state manager:
 * - WebSocket: create in-memory per-connection state via createDeltaState()
 * - HTTP: persist per-client snapshot using clientId-first keying + TTL cleanup
 *
 * Important: this module is independent from mode-manager hysteresis state.
 */

const HTTP_DELTA_TTL_MS = 5 * 60 * 1000; // 5 min
const HTTP_DELTA_CLEANUP_INTERVAL_MS = 60 * 1000; // 1 min

const httpDeltaByClient = new Map(); // key -> { snapshot, lastSeen }
let cleanupTimer = null;

function ensureCleanupTimer() {
    if (cleanupTimer) return;
    cleanupTimer = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of httpDeltaByClient) {
            if (now - entry.lastSeen > HTTP_DELTA_TTL_MS) {
                httpDeltaByClient.delete(key);
            }
        }
        if (httpDeltaByClient.size === 0) {
            clearInterval(cleanupTimer);
            cleanupTimer = null;
        }
    }, HTTP_DELTA_CLEANUP_INTERVAL_MS);
    cleanupTimer.unref();
}

function cloneSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    if (!Array.isArray(snapshot.lcFractions)) return null;
    return { lcFractions: snapshot.lcFractions.slice() };
}

function createDeltaState() {
    return { previousSnapshot: null };
}

function getHttpDeltaState(clientKey) {
    const entry = httpDeltaByClient.get(clientKey);
    const deltaState = createDeltaState();
    if (entry && entry.snapshot) {
        deltaState.previousSnapshot = cloneSnapshot(entry.snapshot);
    }
    return { deltaState };
}

function saveHttpDeltaState(clientKey, deltaState) {
    httpDeltaByClient.set(clientKey, {
        snapshot: cloneSnapshot(deltaState.previousSnapshot),
        lastSeen: Date.now(),
    });
    ensureCleanupTimer();
}

function normalizeClientId(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : '';
}

/**
 * Delta client key priority:
 * 1) body.clientId (validated non-empty string <=128)
 * 2) requester IP
 */
function getHttpDeltaClientKey(req) {
    const body = req.body;
    if (body && typeof body === 'object') {
        const clientId = normalizeClientId(body.clientId);
        if (clientId) {
            return `client:${clientId}`;
        }
    }

    const xff = req.headers['x-forwarded-for'];
    const xffValue = Array.isArray(xff) ? xff[0] : xff;
    const ip =
        typeof xffValue === 'string' && xffValue.trim() !== ''
            ? xffValue.split(',')[0].trim()
            : req.ip || req.socket?.remoteAddress || 'unknown';

    return `ip:${ip}`;
}

module.exports = {
    createDeltaState,
    getHttpDeltaState,
    saveHttpDeltaState,
    getHttpDeltaClientKey,
};
