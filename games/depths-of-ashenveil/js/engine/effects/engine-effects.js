window.EngineEffects = {
  spawnParticles(...args) {
    return window.EngineCore.spawnParticles(...args);
  },
  spawnBolt(...args) {
    return window.EngineCore.fireBolt(...args);
  },
  fireBolt(...args) {
    return window.EngineCore.fireBolt(...args);
  },
  updateParticles(...args) {
    return window.EngineCore.updateParticles(...args);
  },
  updateBolts(...args) {
    return window.EngineCore.updateBolts(...args);
  },
  updateLights(...args) {
    return window.EngineCore.updateTorchFlicker(...args);
  },
  updateTorchFlicker(...args) {
    return window.EngineCore.updateTorchFlicker(...args);
  },
  clearEffects() {
    return window.EngineCore.clearDynamic();
  },
};
