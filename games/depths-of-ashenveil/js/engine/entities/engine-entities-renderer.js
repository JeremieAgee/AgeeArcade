window.EngineEntitiesRenderer = {
  buildPlayer(...args) {
    return window.EngineCore.buildPlayerMesh(...args);
  },
  buildPlayerMesh(...args) {
    return window.EngineCore.buildPlayerMesh(...args);
  },
  updatePlayer(...args) {
    return window.EngineCore.updatePlayerEquipment(...args);
  },
  updatePlayerEquipment(...args) {
    return window.EngineCore.updatePlayerEquipment(...args);
  },
  triggerSwing(...args) {
    return window.EngineCore.triggerSwing(...args);
  },
  buildEnemies(enemies) {
    return enemies.map(enemy => window.EngineCore.buildEnemyMesh(enemy));
  },
  buildEnemyMesh(...args) {
    return window.EngineCore.buildEnemyMesh(...args);
  },
  updateEnemies(...args) {
    return window.EngineCore.updateEnemyAnimations(...args);
  },
  updateEnemyAnimations(...args) {
    return window.EngineCore.updateEnemyAnimations(...args);
  },
  updateEnemyHpBar(...args) {
    return window.EngineCore.updateEnemyHpBar(...args);
  },
  removeEnemyMesh(...args) {
    return window.EngineCore.removeEnemyMesh(...args);
  },
  clearEnemies() {},
};
