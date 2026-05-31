# Instancing and SOA Rendering Roadmap

Depths of Ashenveil currently renders through Three.js/WebGL, with most mesh construction and animation centralized in `js/engine-core.js`. The thin modules `engine-dungeon-renderer.js` and `engine-entities-renderer.js` mostly proxy into `EngineCore`, so the first step is to separate data layout from rendering before attempting WebGPU/WGPU-style work.

## Goal

Move repeated objects and animated actors toward a data-oriented layout:

- static repeated geometry uses `THREE.InstancedMesh`
- enemy state is stored as struct-of-arrays data
- animation updates write batched transform data
- later WebGPU/WGPU rendering can consume the same SOA buffers

## Phase 1: Static Instancing

Start with repeated meshes that do not need individual skeletal animation.

Good first targets:

- floor tiles
- wall blocks
- perimeter walls
- torch handles/collars/sconces
- simple chest trim/details
- portal particles or small repeated decoration meshes

Implementation shape:

```js
const wallInstances = new THREE.InstancedMesh(wallGeo, wallMat, wallCount);
const matrix = new THREE.Matrix4();

for (let i = 0; i < wallCount; i++) {
  matrix.compose(position, rotation, scale);
  wallInstances.setMatrixAt(i, matrix);
}

wallInstances.instanceMatrix.needsUpdate = true;
scene.add(wallInstances);
```

Keep torches split into:

- instanced static torch mesh parts
- a small capped set of active `PointLight`s around the player
- individual flame meshes only when needed for close/visible torches

## Phase 2: SOA Enemy State

Keep the gameplay API stable at first, but mirror enemy object fields into arrays.

Example SOA layout:

```js
const EnemySoa = {
  count: 0,
  id: [],
  typeId: new Uint8Array(maxEnemies),
  posX: new Float32Array(maxEnemies),
  posY: new Float32Array(maxEnemies),
  posZ: new Float32Array(maxEnemies),
  rotY: new Float32Array(maxEnemies),
  hp: new Float32Array(maxEnemies),
  maxHp: new Float32Array(maxEnemies),
  state: new Uint8Array(maxEnemies),
  animTime: new Float32Array(maxEnemies),
  attackTime: new Float32Array(maxEnemies),
  meshSlot: new Int16Array(maxEnemies),
};
```

Migration order:

1. Populate SOA from existing `Enemies.spawnAll()`.
2. Update movement/combat from SOA arrays.
3. Write transforms back to existing meshes.
4. Replace per-enemy meshes with instanced render batches per enemy type.

## Phase 3: Instanced Enemy Rendering

Batch enemies by visual type:

- skeleton batch
- goblin batch
- archer batch
- troll batch
- wraith batch
- shard golem batch

Each batch owns one or more `InstancedMesh` objects. For simple multipart enemies, use matching instance slots across body-part meshes:

```js
enemyBodies.setMatrixAt(slot, bodyMatrix);
enemyHeads.setMatrixAt(slot, headMatrix);
enemyWeapons.setMatrixAt(slot, weaponMatrix);
```

This gets most of the draw-call win before true skeletal GPU animation.

## Phase 4: Animation Model

Use procedural animation first, because the current enemies are built from primitives.

SOA animation data:

- `animTime[i]`
- `moveSpeed[i]`
- `attackTime[i]`
- `hitFlash[i]`
- `state[i]`

Renderer computes body-part matrices from those arrays. This is effectively skeletal-style motion without a bone hierarchy yet.

Later options:

- bone texture palettes for GPU skinning
- baked vertex animation textures
- WebGPU storage buffers for per-instance skeleton transforms

## Phase 5: WebGPU/WGPU Path

Do this only after SOA is in place. The browser path would be WebGPU, not native WGPU, but the buffer model can be WGPU-friendly.

Target buffer layout:

- transform buffer
- animation state buffer
- material/type buffer
- optional bone matrix buffer

Renderer can then migrate from Three.js batches to a custom WebGPU pipeline without rewriting gameplay.

## Practical First PR

The safest first implementation is:

1. Create `js/engine-instancing.js`.
2. Add an `InstanceBatch` helper for static geometry.
3. Convert floor tiles to one `InstancedMesh`.
4. Convert wall blocks to one `InstancedMesh`.
5. Leave lights, doors, chests, enemies, and gameplay untouched.

That gives a clear performance win while keeping the risk contained.
