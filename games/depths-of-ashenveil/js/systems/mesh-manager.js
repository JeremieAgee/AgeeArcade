/* ═══════════════════════════════════════════════════
   mesh-manager.js  —  Three.js mesh registry
   Exports: MeshManager (window global)

   Two layers:

   1. Individual mesh registry  (id → THREE.Object3D)
      Used right now — every enemy/chest/torch gets
      registered here so any system can get its mesh
      by ID without coupling to the enemy[] array or
      engine internals.

   2. Instanced batch registry  (typeKey → batch)
      Placeholder for the upcoming InstancedMesh path.
      engine-core.js calls registerBatch() when it builds
      a THREE.InstancedMesh for a given type.  Per-type
      monster managers read their meshSlot[] from here
      to update transforms without touching the array.

      Dead instances are hidden by setting scale to 0
      in the instanced matrix — the slot is reclaimed on
      the next full rebuild (e.g. nextFloor()).
════════════════════════════════════════════════════ */
window.MeshManager = (() => {

  /* ── Individual mesh registry ────────────────── */
  const _byId = new Map(); // id → THREE.Object3D

  function register(id, mesh) {
    _byId.set(id, mesh);
  }

  function unregister(id) {
    const mesh = _byId.get(id) || null;
    _byId.delete(id);
    return mesh;
  }

  function get(id)  { return _byId.get(id) || null; }
  function has(id)  { return _byId.has(id); }

  function clearMeshes() {
    _byId.clear();
  }

  /* ── Instanced batch registry ────────────────── */
  // batch = { mesh: THREE.InstancedMesh, capacity: number,
  //           slots: Map<id, slotIdx>, nextFree: number }
  const _batches = new Map(); // typeKey → batch

  function registerBatch(typeKey, instancedMesh, capacity) {
    _batches.set(typeKey, {
      mesh:     instancedMesh,
      capacity: capacity,
      slots:    new Map(),
      nextFree: 0,
    });
  }

  function getBatch(typeKey) {
    return _batches.get(typeKey) || null;
  }

  // Allocate the next free slot in a batch. Returns slot index or -1 if full.
  function allocSlot(typeKey, id) {
    const b = _batches.get(typeKey);
    if (!b || b.nextFree >= b.capacity) return -1;
    const slot = b.nextFree++;
    b.slots.set(id, slot);
    return slot;
  }

  // Mark a slot as unused. The InstancedMesh matrix is zeroed by the caller.
  // Slots are not compacted here — that happens on full batch rebuild (floor change).
  function freeSlot(typeKey, id) {
    const b = _batches.get(typeKey);
    if (!b) return;
    b.slots.delete(id);
  }

  function getSlot(typeKey, id) {
    const b = _batches.get(typeKey);
    return b ? (b.slots.get(id) ?? -1) : -1;
  }

  // Rebuild a batch's slot map from scratch (call after floor load).
  // Existing InstancedMesh is kept; only the slot bookkeeping resets.
  function rebuildSlots(typeKey) {
    const b = _batches.get(typeKey);
    if (!b) return;
    b.slots.clear();
    b.nextFree = 0;
  }

  function clearBatches() {
    _batches.clear();
  }

  /* ── Full clear (floor unload) ───────────────── */
  function clear() {
    clearMeshes();
    clearBatches();
  }

  /* ── Debug ───────────────────────────────────── */
  function stats() {
    const batches = {};
    for (const [key, b] of _batches) {
      batches[key] = { capacity: b.capacity, used: b.nextFree, alive: b.slots.size };
    }
    return { individualMeshes: _byId.size, batches };
  }

  /* ── Public ──────────────────────────────────── */
  return {
    // Individual
    register,
    unregister,
    get,
    has,
    clearMeshes,
    // Instanced batches
    registerBatch,
    getBatch,
    allocSlot,
    freeSlot,
    getSlot,
    rebuildSlots,
    clearBatches,
    // Combined
    clear,
    stats,
    count: () => _byId.size,
  };

})();
