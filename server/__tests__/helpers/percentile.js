/**
 * Percentile calculation utility for benchmark measurements.
 *
 * @param {number[]} sorted - Pre-sorted array of numeric values (ascending).
 * @param {number} p - Percentile in [0, 100].
 * @returns {number} Value at the p-th percentile (nearest-rank method).
 */
function percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
}

module.exports = { percentile };
