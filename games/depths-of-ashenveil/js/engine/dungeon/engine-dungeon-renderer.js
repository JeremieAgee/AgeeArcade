window.EngineDungeonRenderer = {
  buildDungeon(...args) {
    return window.EngineCore.buildDungeon(...args);
  },
  buildDungeonChunked(...args) {
    return window.EngineCore.buildDungeonChunked(...args);
  },
  clearDungeon() {
    return window.EngineCore.clearDynamic();
  },
  updateDungeonVisibility() {},
};
