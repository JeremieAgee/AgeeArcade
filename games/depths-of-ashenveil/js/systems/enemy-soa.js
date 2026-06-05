window.EnemySoa = (() => {
  const TYPE_IDS = {
    skeleton: 1,
    goblin: 2,
    wraith: 3,
    troll: 4,
    archer: 5,
    shardgolem: 6,
    boss: 100,
  };

  const STATE_IDS = {
    idle: 0,
    chase: 1,
    attack: 2,
    dead: 255,
  };

  let capacity = 0;
  let count = 0;
  let ids = [];
  let indexById = new Map();
  let typeId = new Uint16Array(0);
  let state = new Uint8Array(0);
  let posX = new Float32Array(0);
  let posY = new Float32Array(0);
  let posZ = new Float32Array(0);
  let rotY = new Float32Array(0);
  let hp = new Float32Array(0);
  let maxHp = new Float32Array(0);
  let radius = new Float32Array(0);
  let height = new Float32Array(0);
  let animTime = new Float32Array(0);
  let attackTime = new Float32Array(0);
  let hitFlash = new Float32Array(0);
  let meshSlot = new Int16Array(0);

  function nextCapacity(size) {
    let next = Math.max(32, capacity || 0);
    while (next < size) next *= 2;
    return next;
  }

  function ensureCapacity(size) {
    if (size <= capacity) return;
    capacity = nextCapacity(size);
    typeId = new Uint16Array(capacity);
    state = new Uint8Array(capacity);
    posX = new Float32Array(capacity);
    posY = new Float32Array(capacity);
    posZ = new Float32Array(capacity);
    rotY = new Float32Array(capacity);
    hp = new Float32Array(capacity);
    maxHp = new Float32Array(capacity);
    radius = new Float32Array(capacity);
    height = new Float32Array(capacity);
    animTime = new Float32Array(capacity);
    attackTime = new Float32Array(capacity);
    hitFlash = new Float32Array(capacity);
    meshSlot = new Int16Array(capacity);
    meshSlot.fill(-1);
  }

  function stateId(value) {
    return STATE_IDS[value] ?? STATE_IDS.idle;
  }

  function typeIdFor(enemy) {
    return TYPE_IDS[enemy.typeKey] || (enemy.isBoss ? TYPE_IDS.boss : 0);
  }

  function rotationY(enemy) {
    return enemy.mesh ? enemy.mesh.rotation.y : 0;
  }

  function writeEnemy(i, enemy) {
    ids[i] = enemy.id;
    indexById.set(enemy.id, i);
    typeId[i] = typeIdFor(enemy);
    state[i] = enemy.dead ? STATE_IDS.dead : stateId(enemy.state);
    posX[i] = enemy.x || 0;
    posY[i] = enemy.y || 0;
    posZ[i] = enemy.z || 0;
    rotY[i] = rotationY(enemy);
    hp[i] = enemy.hp || 0;
    maxHp[i] = enemy.maxHp || 0;
    radius[i] = enemy.radius || 0;
    height[i] = enemy.height || 0;
    attackTime[i] = enemy.atkAnim || 0;
    hitFlash[i] = enemy.hitFlash || 0;
    animTime[i] += 1;
  }

  function rebuild(enemies) {
    const list = Array.isArray(enemies) ? enemies : [];
    ensureCapacity(list.length);
    count = list.length;
    ids = new Array(count);
    indexById = new Map();
    meshSlot.fill(-1);
    for (let i = 0; i < count; i++) writeEnemy(i, list[i]);
    return count;
  }

  function syncFromEnemies(enemies) {
    const list = Array.isArray(enemies) ? enemies : [];
    if (list.length !== count) return rebuild(list);

    for (let i = 0; i < list.length; i++) {
      if (ids[i] !== list[i].id) return rebuild(list);
      writeEnemy(i, list[i]);
    }
    return count;
  }

  function removeAtSwap(index) {
    if (index < 0 || index >= count) return count;

    const last = count - 1;
    const removedId = ids[index];
    if (removedId !== undefined) indexById.delete(removedId);

    if (index !== last) {
      const movedId = ids[last];
      ids[index] = movedId;
      indexById.set(movedId, index);
      typeId[index] = typeId[last];
      state[index] = state[last];
      posX[index] = posX[last];
      posY[index] = posY[last];
      posZ[index] = posZ[last];
      rotY[index] = rotY[last];
      hp[index] = hp[last];
      maxHp[index] = maxHp[last];
      radius[index] = radius[last];
      height[index] = height[last];
      animTime[index] = animTime[last];
      attackTime[index] = attackTime[last];
      hitFlash[index] = hitFlash[last];
      meshSlot[index] = meshSlot[last];
    }

    ids.length = last;
    count = last;
    return count;
  }

  function indexOf(id) {
    return indexById.has(id) ? indexById.get(id) : -1;
  }

  function arrays() {
    return {
      count,
      capacity,
      ids,
      typeId,
      state,
      posX,
      posY,
      posZ,
      rotY,
      hp,
      maxHp,
      radius,
      height,
      animTime,
      attackTime,
      hitFlash,
      meshSlot,
    };
  }

  return {
    TYPE_IDS,
    STATE_IDS,
    rebuild,
    syncFromEnemies,
    removeAtSwap,
    indexOf,
    arrays,
  };
})();
