// wave-director.js — wave budget, spawn pacing, wave lifecycle

const WaveDirector = (() => {
  let _wave       = 0;
  let _spawnQueue = [];   // archetypes queued to spawn this wave
  let _spawnTimer = 0;
  let _spawnInterval = 4;
  let _waveStarted   = false;
  let _spawningDone  = false;
  let _onSpawn       = null;  // callback(archetype, lane)
  let _onWaveComplete = null; // callback()
  let _waveCompleteTimer = 0; // grace period after last ship

  const WAVE_COMPLETE_DELAY = 2.5; // seconds after last ship to declare wave done

  function reset() {
    _wave            = 0;
    _spawnQueue      = [];
    _spawnTimer      = 0;
    _waveStarted     = false;
    _spawningDone    = false;
    _waveCompleteTimer = 0;
  }

  function startWave(waveNumber, onSpawn, onWaveComplete) {
    _wave           = waveNumber;
    _onSpawn        = onSpawn;
    _onWaveComplete = onWaveComplete;
    _waveStarted    = true;
    _spawningDone   = false;
    _waveCompleteTimer = 0;

    const budget   = waveBudget(waveNumber);
    _spawnQueue    = buildComposition(budget, waveNumber);
    _spawnInterval = spawnInterval(waveNumber);
    _spawnTimer    = 0.4; // small delay before first spawn
  }

  function update(dt, activeShipCount) {
    if (!_waveStarted) return;

    // Spawning phase
    if (!_spawningDone) {
      _spawnTimer -= dt;
      if (_spawnTimer <= 0 && _spawnQueue.length > 0) {
        const archetype = _spawnQueue.shift();
        const lane      = _pickLane(activeShipCount);
        _onSpawn && _onSpawn(archetype, lane);
        _spawnTimer = _spawnInterval;
      }
      if (_spawnQueue.length === 0) _spawningDone = true;
    }

    // Wave complete detection: all spawned AND all ships resolved
    if (_spawningDone && activeShipCount === 0) {
      _waveCompleteTimer += dt;
      if (_waveCompleteTimer >= WAVE_COMPLETE_DELAY) {
        _waveStarted = false;
        _onWaveComplete && _onWaveComplete();
      }
    } else {
      _waveCompleteTimer = 0;
    }
  }

  // Pick a lane, preferring less-crowded lanes
  function _pickLane(activeShipCount) {
    // Simple random lane for now; counts would require per-lane tracking
    return Math.floor(Math.random() * 3);
  }

  function getWave()    { return _wave; }
  function isDone()     { return !_waveStarted; }

  return { reset, startWave, update, getWave, isDone };
})();
