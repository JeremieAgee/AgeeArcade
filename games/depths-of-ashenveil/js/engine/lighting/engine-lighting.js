window.EngineLighting = {
  updateTorchFlicker(...args) {
    return window.EngineCore.updateTorchFlicker(...args);
  },
  updateLights(...args) {
    return window.EngineCore.updateActiveLanternLights(...args);
  },
};
