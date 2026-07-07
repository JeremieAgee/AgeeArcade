/**
 * HallOfFameRoom — 3D Hall of Fame room integrated into the arcade
 *
 * Builds a dedicated room as part of the arcade world that displays
 * leaderboards and achievements on interactive 3D panels.
 */
window.HallOfFameRoom = (() => {
  'use strict';

  const SUPABASE_URL = 'https://xdvrgeaivfqpcsmuqeyi.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_1UoSYMFfHQerkvlvHvbpRQ_JGIYH14O';

  const gameConfigs = {
    'depths-of-ashenveil': {
      title: 'Depths of Ashenveil',
      table: 'depths_leaderboard',
      metric: 'Level',
      icon: '🔮',
      neon: 0xd4880a,
      select: 'nickname,level,floor,created_at',
      order: 'level.desc,floor.desc,created_at.asc',
      mapRow: (row) => ({
        nickname: row.nickname || 'Adventurer',
        score: Number(row.level) || 1,
        detail: `Floor ${Number(row.floor) || 1}`,
      }),
    },
    'maze-runner': {
      title: 'Maze Runner',
      table: 'maze_runner_runs',
      metric: 'Score',
      icon: '🌀',
      neon: 0x00ff88,
      select: 'user_id,floors,score,time_ms',
      order: 'score.desc,floors.desc,time_ms.asc',
      mapRow: (row) => ({
        nickname: (String(row.user_id || 'Guest')).split('-')[0] || 'Runner',
        score: Number(row.score) || 0,
        detail: `Floor ${Number(row.floors) || 0}`,
      }),
    },
    'blacktide-bastion': {
      title: 'Blacktide Bastion',
      table: 'blacktide_bastion_leaderboard',
      metric: 'Score',
      icon: '⚓',
      neon: 0xff4433,
      select: 'nickname,score,wave,created_at',
      order: 'score.desc,wave.desc,created_at.asc',
      mapRow: (row) => ({
        nickname: row.nickname || 'Captain',
        score: Number(row.score) || 0,
        detail: `Wave ${Number(row.wave) || 0}`,
      }),
    },
    'spear_fisher': {
      title: 'Spear Fisher',
      table: 'spear_fisher_leaderboard',
      metric: 'Score',
      icon: '🎣',
      neon: 0x00ccff,
      select: 'nickname,score,created_at',
      order: 'score.desc,created_at.asc',
      mapRow: (row) => ({
        nickname: row.nickname || 'Fisher',
        score: Number(row.score) || 0,
        detail: 'Score',
      }),
    },
  };

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let _leaderboards = {};
  let _dataLoaded = false;

  async function _fetchLeaderboards() {
    for (const [gameId, config] of Object.entries(gameConfigs)) {
      try {
        const { data, error } = await supabase
          .from(config.table)
          .select(config.select)
          .order(config.order.split(',')[0].split('.')[0], { ascending: false })
          .limit(5);

        if (!error && data) {
          _leaderboards[gameId] = data.map(config.mapRow);
        }
      } catch (e) {
        console.error(`Error fetching ${gameId}:`, e);
      }
    }
    _dataLoaded = true;
  }

  function _makeLeaderboardTexture(gameId, scores) {
    const config = gameConfigs[gameId];
    const w = 512, h = 640;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');

    // Background with game's neon color
    const neonColor = '#' + config.neon.toString(16).padStart(6, '0');
    ctx.fillStyle = '#0a0818';
    ctx.fillRect(0, 0, w, h);

    // Title bar
    ctx.fillStyle = neonColor + '44';
    ctx.fillRect(0, 0, w, 60);

    // Title
    ctx.fillStyle = neonColor;
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(config.icon + ' ' + config.title, w / 2, 8);
    ctx.font = '12px "Courier New", monospace';
    ctx.fillText(config.metric.toUpperCase(), w / 2, 32);

    // Separator
    ctx.strokeStyle = neonColor + '88';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 60);
    ctx.lineTo(w - 20, 60);
    ctx.stroke();

    // Leaderboard rows
    ctx.fillStyle = '#b0b0ff';
    ctx.font = '14px "Courier New", monospace';
    ctx.textAlign = 'left';

    const rowHeight = 105;
    scores.slice(0, 5).forEach((score, idx) => {
      const y = 80 + idx * rowHeight;

      // Rank badge
      const rankColors = [neonColor, '#c0c0c0', '#cd7f32', '#a0a0ff', '#808080'];
      ctx.fillStyle = rankColors[idx];
      ctx.font = 'bold 24px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(['🥇', '🥈', '🥉', '#4', '#5'][idx], 40, y);

      // Name
      ctx.fillStyle = '#e0e0ff';
      ctx.font = 'bold 13px "Courier New", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(score.nickname.slice(0, 18), 70, y);

      // Score
      ctx.fillStyle = neonColor;
      ctx.font = 'bold 16px "Courier New", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(score.score.toString(), w - 30, y);

      // Detail
      ctx.fillStyle = '#9090c0';
      ctx.font = '11px "Courier New", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(score.detail, 70, y + 18);
    });

    return new THREE.CanvasTexture(c);
  }

  function _makeHeaderTexture() {
    const w = 1024, h = 256;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#0a0818';
    ctx.fillRect(0, 0, w, h);

    // Glow gradient
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(255,0,255,0)');
    grad.addColorStop(0.15, 'rgba(255,0,255,0.3)');
    grad.addColorStop(0.85, 'rgba(255,0,255,0.3)');
    grad.addColorStop(1, 'rgba(255,0,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Main text
    for (let i = 3; i >= 0; i--) {
      ctx.shadowColor = '#ff00ff';
      ctx.shadowBlur = 8 + i * 16;
      ctx.fillStyle = i === 0 ? '#ffffff' : `rgba(255,0,255,${0.2 + i * 0.15})`;
      ctx.font = 'bold 96px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('HALL OF FAME', w / 2, h / 2 - 20);
    }

    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ff00ff';
    ctx.fillStyle = '#ff99ff';
    ctx.font = '28px "Courier New", monospace';
    ctx.fillText('⭐ CHAMPIONS ⭐', w / 2, h / 2 + 50);

    return new THREE.CanvasTexture(c);
  }

  function buildRoom(scene) {
    const CEIL_Y = 9;
    const ROOM_W = 12;   // Increased from 8
    const ROOM_D = 14;   // Increased from 10

    // Room positioned far left, away from main arcade
    const ROOM_X = -27;
    const ROOM_Z = -8;

    // Floor
    const floorGeo = new THREE.PlaneGeometry(ROOM_W, ROOM_D, 16, 20);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x1a1428 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(ROOM_X, 0, ROOM_Z);
    scene.add(floor);

    // Ceiling
    const ceilGeo = new THREE.PlaneGeometry(ROOM_W, ROOM_D, 10, 10);
    const ceilMat = new THREE.MeshLambertMaterial({ color: 0x080508 });
    const ceil = new THREE.Mesh(ceilGeo, ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(ROOM_X, CEIL_Y, ROOM_Z);
    scene.add(ceil);

    // Walls
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x0f0c20 });
    const WALL_HEIGHT = CEIL_Y;

    // Left wall (magenta accent)
    const leftWall = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM_D, WALL_HEIGHT, 20, 9),
      wallMat.clone()
    );
    leftWall.position.set(ROOM_X - ROOM_W / 2, WALL_HEIGHT / 2, ROOM_Z);
    leftWall.rotation.y = Math.PI / 2;
    scene.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM_D, WALL_HEIGHT, 20, 9),
      wallMat.clone()
    );
    rightWall.position.set(ROOM_X + ROOM_W / 2, WALL_HEIGHT / 2, ROOM_Z);
    rightWall.rotation.y = -Math.PI / 2;
    scene.add(rightWall);

    // Back wall
    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM_W, WALL_HEIGHT, 16, 9),
      wallMat.clone()
    );
    backWall.position.set(ROOM_X, WALL_HEIGHT / 2, ROOM_Z - ROOM_D / 2);
    scene.add(backWall);

    // Front wall (open to arcade)
    // We'll keep this open for player entry

    // Neon accent strips
    const mkStrip = (geo, x, y, z) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff00ff }));
      m.position.set(x, y, z);
      scene.add(m);
    };

    // Baseboard
    mkStrip(new THREE.BoxGeometry(ROOM_W, 0.06, 0.06), ROOM_X, 0.03, ROOM_Z);

    // Ceiling trim
    mkStrip(new THREE.BoxGeometry(ROOM_W, 0.06, 0.06), ROOM_X, CEIL_Y - 0.03, ROOM_Z);

    // Mid-wall strips
    mkStrip(new THREE.BoxGeometry(ROOM_D, 0.06, 0.06), ROOM_X - ROOM_W / 2 + 0.03, 3.5, ROOM_Z);
    mkStrip(new THREE.BoxGeometry(ROOM_D, 0.06, 0.06), ROOM_X + ROOM_W / 2 - 0.03, 3.5, ROOM_Z);

    // Central pillar/structure
    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, CEIL_Y - 0.2, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xff00ff })
    );
    pillar.position.set(ROOM_X, CEIL_Y / 2, ROOM_Z);
    scene.add(pillar);

    // Header sign above entrance
    const headerTexture = _makeHeaderTexture();
    const headerSign = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 1.5),
      new THREE.MeshBasicMaterial({ map: headerTexture, transparent: true })
    );
    headerSign.position.set(ROOM_X - 1.5, 7.5, ROOM_Z - ROOM_D / 2 + 0.05);
    scene.add(headerSign);

    // Leaderboard panels
    const panelPositions = [
      { x: ROOM_X - 2.5, z: ROOM_Z - ROOM_D / 2 + 0.1, gameId: 'depths-of-ashenveil' },
      { x: ROOM_X + 0.5, z: ROOM_Z - ROOM_D / 2 + 0.1, gameId: 'maze-runner' },
      { x: ROOM_X - 2.5, z: ROOM_Z + 1.5, gameId: 'blacktide-bastion' },
      { x: ROOM_X + 0.5, z: ROOM_Z + 1.5, gameId: 'spear_fisher' },
    ];

    panelPositions.forEach((panelPos) => {
      const gameId = panelPos.gameId;
      const scores = _leaderboards[gameId] || [];

      if (scores.length === 0) {
        return; // Skip if no data loaded yet
      }

      const texture = _makeLeaderboardTexture(gameId, scores);
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(2.8, 3.5),
        new THREE.MeshLambertMaterial({ map: texture })
      );
      panel.position.set(panelPos.x, 2, panelPos.z);
      scene.add(panel);

      // Glow light for each panel
      const config = gameConfigs[gameId];
      const light = new THREE.PointLight(config.neon, 1.5, 8);
      light.position.set(panelPos.x, 3, panelPos.z + 0.5);
      scene.add(light);
    });

    // Ambient magenta glow
    const amb = new THREE.PointLight(0xff00ff, 2, 20);
    amb.position.set(ROOM_X, 6, ROOM_Z);
    scene.add(amb);

    // Floor glow
    const floorGlowGeo = new THREE.PlaneGeometry(ROOM_W - 0.2, ROOM_D - 0.2);
    const floorGlowMat = new THREE.MeshBasicMaterial({
      color: 0xff00ff,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
    });
    const floorGlow = new THREE.Mesh(floorGlowGeo, floorGlowMat);
    floorGlow.rotation.x = -Math.PI / 2;
    floorGlow.position.set(ROOM_X, 0.01, ROOM_Z);
    scene.add(floorGlow);
  }

  async function init(scene) {
    await _fetchLeaderboards();
    buildRoom(scene);
  }

  return { init };
})();
