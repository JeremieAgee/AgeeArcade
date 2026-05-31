window.EngineInteractables = {
  buildDoors(...args) {
    return window.EngineCore.openBossDoor(...args);
  },
  openBossDoor(...args) {
    return window.EngineCore.openBossDoor(...args);
  },
  buildChests() {},
  buildTorches() {},
  buildPortals(...args) {
    return window.EngineCore.buildExitPortal(...args);
  },
  buildExitPortal(...args) {
    return window.EngineCore.buildExitPortal(...args);
  },
  removeExitPortal(...args) {
    return window.EngineCore.removeExitPortal(...args);
  },
  revealExitPortal(...args) {
    return window.EngineCore.revealExitPortal(...args);
  },
  buildArrivalPortal(...args) {
    return window.EngineCore.buildArrivalPortal(...args);
  },
  removeArrivalPortal(...args) {
    return window.EngineCore.removeArrivalPortal(...args);
  },
  startStairDescent(...args) {
    return window.EngineCore.startStairDescent(...args);
  },
  tickStairDescent(...args) {
    return window.EngineCore.tickStairDescent(...args);
  },
  updateChests(...args) {
    return window.EngineCore.updateChests(...args);
  },
  updateTorches(...args) {
    return window.EngineCore.updateTorchPrompt(...args);
  },
  updatePortals(...args) {
    return window.EngineCore.updateStairPrompt(...args);
  },
  updatePrompts(player, dungeon, doorOpened, exitOpen) {
    window.EngineCore.updateChestPrompt(player);
    window.EngineCore.updateTorchPrompt(player);
    window.EngineCore.updateDoorPrompt(player, dungeon, doorOpened);
    window.EngineCore.updateStairPrompt(player, exitOpen, dungeon);
  },
  updateChestPrompt(...args) {
    return window.EngineCore.updateChestPrompt(...args);
  },
  updateTorchPrompt(...args) {
    return window.EngineCore.updateTorchPrompt(...args);
  },
  updateDoorPrompt(...args) {
    return window.EngineCore.updateDoorPrompt(...args);
  },
  updateStairPrompt(...args) {
    return window.EngineCore.updateStairPrompt(...args);
  },
  startChestOpenAnimation(...args) {
    return window.EngineCore.startChestOpenAnimation(...args);
  },
  getChestAnim(...args) {
    return window.EngineCore.getChestAnim(...args);
  },
  toggleNearbyWallTorch(...args) {
    return window.EngineCore.toggleNearbyWallTorch(...args);
  },
  clearInteractables() {
    return window.EngineCore.clearDynamic();
  },
};
