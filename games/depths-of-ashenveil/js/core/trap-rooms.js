/* ═══════════════════════════════════════════════════
   trap-rooms.js  —  Trap room state, detection, rewards
   Exports: TrapRooms (namespace)
════════════════════════════════════════════════════ */
const TrapRooms = (() => {

  function designateTrapRooms(dungeon, floor) {
    const trapRooms = [];
    if (!dungeon.rooms || dungeon.rooms.length < 3) return trapRooms;

    // Determine how many trap rooms based on floor
    let trapRoomCount = 0;
    if (floor >= 3) trapRoomCount = 1;
    if (floor >= 4) trapRoomCount = 2;
    if (floor >= 8) trapRoomCount = 3;

    const regularRooms = dungeon.rooms.slice(1, -1); // skip start and last
    if (regularRooms.length === 0) return trapRooms;

    // Pick random rooms, skip start room area
    const candidates = regularRooms.filter((r, i) => i > 1);
    const selected = [];
    for (let i = 0; i < Math.min(trapRoomCount, candidates.length); i++) {
      const idx = Math.floor(Math.random() * candidates.length);
      selected.push(candidates[idx]);
      candidates.splice(idx, 1);
    }

    for (const room of selected) {
      trapRooms.push({
        roomId: room.id || Math.random().toString(36).slice(2),
        x: room.x,
        y: room.y,
        w: room.w,
        h: room.h,
        state: 'inactive',    // inactive | active | cleared | rewarded
        enemies: [],
        trapsInRoom: [],
        rewardSpawned: false,
        doorLocked: false,
      });
    }

    return trapRooms;
  }

  function checkTrapRoomEntry(trapRooms, playerX, playerZ) {
    for (const tr of trapRooms) {
      if (tr.state !== 'inactive') continue;
      const TILE = 4;
      const roomX = tr.x * TILE;
      const roomY = tr.y * TILE;
      const roomW = tr.w * TILE;
      const roomH = tr.h * TILE;

      if (playerX >= roomX && playerX < roomX + roomW &&
          playerZ >= roomY && playerZ < roomY + roomH) {
        tr.state = 'active';
        tr.doorLocked = true;
        return tr;
      }
    }
    return null;
  }

  function clearTrapRoomCheck(trapRoom, enemies) {
    if (trapRoom.state !== 'active') return false;
    if (trapRoom.enemies.length === 0) return false;

    const allDead = trapRoom.enemies.every(id => {
      const e = enemies.find(en => en.id === id);
      return !e || e.dead;
    });

    if (allDead) {
      trapRoom.state = 'cleared';
      trapRoom.doorLocked = false;
      return true;
    }
    return false;
  }

  function spawnReward(trapRoom) {
    if (trapRoom.state !== 'cleared' || trapRoom.rewardSpawned) return null;
    trapRoom.rewardSpawned = true;
    trapRoom.state = 'rewarded';

    const roomCenterX = (trapRoom.x + trapRoom.w / 2) * 4;
    const roomCenterZ = (trapRoom.y + trapRoom.h / 2) * 4;

    return {
      x: roomCenterX,
      z: roomCenterZ,
      rarity: 'rare',
    };
  }

  return {
    designateTrapRooms,
    checkTrapRoomEntry,
    clearTrapRoomCheck,
    spawnReward,
  };

})();
