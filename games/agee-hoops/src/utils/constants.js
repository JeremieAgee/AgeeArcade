/**
 * Game Constants — Agee Hoops
 */
window.HOOPS_CONSTANTS = {
  // Game Rules
  GAME_DURATION: 60,     // seconds
  INITIAL_SHOT_POWER: 0.5,
  MAX_CHARGE_TIME: 0.6,  // seconds

  // Scoring
  CLOSE_SHOT_POINTS: 1,
  MID_SHOT_POINTS: 2,
  THREE_POINTER_POINTS: 3,
  SWISH_BONUS: 1,
  STREAK_3X_MULTIPLIER: 1.5,
  STREAK_5X_MULTIPLIER: 2.0,

  // Physics
  GRAVITY: 9.8,
  BALL_RADIUS: 0.15,
  RIM_BOUNCE_DAMPING: 0.55,
  BACKBOARD_BOUNCE_DAMPING: 0.55,

  // Hoop Geometry
  HOOP_RIM_CENTER: { x: 0, y: 3.5, z: -12.5 },
  HOOP_RIM_RADIUS: 0.5,
  HOOP_RIM_TUBE_RADIUS: 0.06,
  HOOP_SCORE_PLANE_Y: 3.45,
  HOOP_BACKBOARD_Z: -13.1,

  // Shot Spots
  SHOT_SPOTS: [
    { x: 0, z: 6, name: 'Close Shot', distance: 14, points: 1 },
    { x: 3, z: 4, name: 'Mid-range', distance: 16, points: 2 },
    { x: -3, z: 4, name: 'Mid-range', distance: 16, points: 2 },
    { x: 5, z: 2, name: 'Three Pointer', distance: 18.5, points: 3 },
    { x: -5, z: 2, name: 'Three Pointer', distance: 18.5, points: 3 },
  ],

  // Camera
  CAMERA_POSITION: { x: 0, y: 2.2, z: 6 },
  CAMERA_TARGET: { x: 0, y: 3, z: -8 },

  // UI
  HUD_UPDATE_INTERVAL: 0.1,
};
