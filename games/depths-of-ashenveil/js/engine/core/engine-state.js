window.EngineState = {
  renderer: null,
  scene: null,
  camera: null,

  playerMesh: null,
  enemyMeshes: {},
  wallMeshes: [],
  floorMeshes: [],

  particles: [],
  bolts: [],
  chestMeshes: [],
  chests: [],
  torches: [],
  portals: [],

  aimAngle: 0,

  dungeonCamera: {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
  },
};
