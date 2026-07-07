/* ═══════════════════════════════════════════════════
   seed-utils.js — Utilities for deterministic floor generation

   Provides helpers for generating consistent seeds and supporting
   URL-based floor sharing across Maze Runner and Depths of Ashenveil.
════════════════════════════════════════════════════ */
window.SeedUtils = (() => {

  /* ── Simple hash function for strings ──────────── */
  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /* ── Generate seed from floor number ──────────── */
  // Consistent across sessions for the same floor
  function seedFromFloor(floorNum) {
    return (floorNum * 0x9e3779b9) ^ 0x517cc1b5;
  }

  /* ── Generate seed from run identifier ────────── */
  // Useful for custom runs or sharing specific layouts
  // Example: seedFromRun('player123-run456') generates a consistent seed
  function seedFromRun(runId) {
    return hashString(runId);
  }

  /* ── Generate seed from floor + run ──────────── */
  // Combines floor number with run identifier for per-run consistency
  function seedFromFloorAndRun(floorNum, runId) {
    const floorSeed = seedFromFloor(floorNum);
    const runSeed = seedFromRun(runId);
    return floorSeed ^ runSeed;
  }

  /* ── URL parameter helpers ──────────────────── */
  // Add seed parameter to current URL
  function updateUrlWithSeed(seed) {
    const url = new URL(window.location);
    url.searchParams.set('seed', seed.toString());
    window.history.replaceState({}, '', url.toString());
  }

  // Get seed from URL parameters
  function getSeedFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const seedStr = params.get('seed');
    return seedStr ? parseInt(seedStr, 10) : null;
  }

  return {
    hashString,
    seedFromFloor,
    seedFromRun,
    seedFromFloorAndRun,
    updateUrlWithSeed,
    getSeedFromUrl,
  };

})();
