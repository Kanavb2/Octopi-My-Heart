// ===================================================================
// Game: Octopi My Heart
// ===================================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const timerEl = document.getElementById('timer');
const objectiveEl = document.getElementById('objective');
const statusEl = document.getElementById('status');
const revealOverlay = document.getElementById('revealOverlay');
const revealMessage = document.getElementById('revealMessage');

// -- Constants -------------------------------------------------------
const GRID_SIZE = 20;
const MOVE_SPEED = 120; // ms between moves
let CELL_SIZE = 1;

// -- Canvas ----------------------------------------------------------
function resizeCanvas() {
  const size = Math.min(window.innerWidth - 40, window.innerHeight - 40, 800);
  canvas.width = size;
  canvas.height = size;
  CELL_SIZE = canvas.width / GRID_SIZE;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// -- Level definitions -----------------------------------------------

function isWallLevel1(x, y) {
  if (x < 9 || x > 11) return true;
  if (y < 1 || y > 18) return true;
  return false;
}

function isWallLevel2(x, y) {
  if (x < 1 || x > 18 || y < 1 || y > 18) return true;
  if (Math.hypot(x - 7, y - 6) < 3.5) return true;
  if (Math.hypot(x - 13, y - 6) < 3.5) return true;
  if (y >= 11) {
    const t = (y - 11) / 7;
    const halfWidth = 8 * (1 - t * t) + 0.5;
    if (Math.abs(x - 10) > halfWidth) return true;
  }
  return false;
}

function isWallLevel3(x, y) {
  if (x >= 3 && x <= 5 && y >= 2 && y <= 16) return false;
  if (x >= 3 && x <= 16 && y >= 14 && y <= 16) return false;
  if (x >= 14 && x <= 16 && y >= 2 && y <= 16) return false;
  return true;
}

const LEVELS = [
  {
    name: 'Level 1',
    timer: 6000,
    playerStart: { x: 10, y: 10 },
    blue: { x: 10, y: 2 },
    pink: { x: 10, y: 17 },
    isWall: isWallLevel1,
  },
  {
    name: 'Level 2',
    timer: 12000,
    playerStart: { x: 10, y: 16 },
    blue: { x: 10, y: 4 },
    pink: { x: 10, y: 17 },
    isWall: isWallLevel2,
  },
  {
    name: 'Level 3',
    timer: 6000,
    playerStart: { x: 4, y: 3 },
    blue: { x: 10, y: 15 },
    pink: { x: 15, y: 3 },
    isWall: isWallLevel3,
  },
];

// -- State -----------------------------------------------------------
let currentLevel = 0;
let lastTime = Date.now();
let gameState = {};
let allPaths = [];

function resetLevel() {
  const level = LEVELS[currentLevel];
  gameState = {
    player: { ...level.playerStart },
    blue: { ...level.blue, collected: false },
    pink: { ...level.pink, collected: false },
    path: [],
    timer: level.timer,
    state: 'playing',
    lastMoveTime: 0,
    canMove: true,
  };
  gameState.path.push({ ...gameState.player });
  objectiveEl.textContent = level.name + ': Reach the blue octopus';
  statusEl.textContent = '';
  timerEl.textContent = (level.timer / 1000).toFixed(1);
  timerEl.classList.remove('warning', 'critical');
  lastTime = Date.now();
}

// -- Input -----------------------------------------------------------
const keys = {};
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
    keys[e.key] = true;
  }
});
window.addEventListener('keyup', (e) => {
  keys[e.key] = false;
});

// -- Movement --------------------------------------------------------
function tryMove(dx, dy) {
  if (!gameState.canMove || gameState.state !== 'playing') return;

  const now = Date.now();
  if (now - gameState.lastMoveTime < MOVE_SPEED) return;

  const newX = gameState.player.x + dx;
  const newY = gameState.player.y + dy;

  if (newX < 0 || newX >= GRID_SIZE || newY < 0 || newY >= GRID_SIZE) return;
  if (LEVELS[currentLevel].isWall(newX, newY)) return;

  // Level 2: after collecting blue, block all previously visited cells
  if (gameState.blockedCells && gameState.blockedCells.has(newX + ',' + newY)) return;

  if (dx !== 0 && dy !== 0) {
    if (LEVELS[currentLevel].isWall(gameState.player.x + dx, gameState.player.y)) return;
    if (LEVELS[currentLevel].isWall(gameState.player.x, gameState.player.y + dy)) return;
    if (gameState.blockedCells && gameState.blockedCells.has((gameState.player.x + dx) + ',' + gameState.player.y)) return;
    if (gameState.blockedCells && gameState.blockedCells.has(gameState.player.x + ',' + (gameState.player.y + dy))) return;
  }

  gameState.player.x = newX;
  gameState.player.y = newY;
  gameState.lastMoveTime = now;
  gameState.path.push({ x: newX, y: newY });

  checkObjectives();
}

// -- Objectives ------------------------------------------------------
function checkObjectives() {
  const p = gameState.player;
  const b = gameState.blue;
  const pk = gameState.pink;

  if (!b.collected && p.x === b.x && p.y === b.y) {
    b.collected = true;
    objectiveEl.textContent = LEVELS[currentLevel].name + ': Now reach the pink octopus!';
    playCollectSound(600);

    // Level 2: block all cells visited on the way up so player must take a new route back
    if (currentLevel === 1) {
      gameState.blockedCells = new Set();
      for (const pt of gameState.path) {
        gameState.blockedCells.add(pt.x + ',' + pt.y);
      }
      // Keep current position and pink target open
      gameState.blockedCells.delete(p.x + ',' + p.y);
      gameState.blockedCells.delete(pk.x + ',' + pk.y);
    }
  }

  if (b.collected && !pk.collected && p.x === pk.x && p.y === pk.y) {
    pk.collected = true;
    gameState.state = 'success';
    gameState.canMove = false;
    playCollectSound(800);

    allPaths.push({
      level: currentLevel,
      path: [...gameState.path],
    });

    if (currentLevel < LEVELS.length - 1) {
      objectiveEl.textContent = 'Level complete!';
      statusEl.textContent = '';
      setTimeout(() => {
        currentLevel++;
        resetLevel();
      }, 1200);
    } else {
      objectiveEl.textContent = '';
      statusEl.textContent = '';
      timerEl.textContent = '';
      setTimeout(startReveal, 1500);
    }
  }
}

// -- Sounds ----------------------------------------------------------
function playCollectSound(freq) {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.12, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.2);
  } catch (_) {}
}

function playErrorSound() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.frequency.value = 200;
    osc.type = 'square';
    gain.gain.setValueAtTime(0.15, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.15);
  } catch (_) {}
}

// -- Timer -----------------------------------------------------------
function updateTimer() {
  if (gameState.state !== 'playing') return;

  const now = Date.now();
  const delta = now - lastTime;
  lastTime = now;
  gameState.timer -= delta;

  if (gameState.timer <= 0) {
    gameState.timer = 0;
    gameState.state = 'failed';
    gameState.canMove = false;
    timerEl.textContent = '0.0';
    timerEl.classList.add('critical');
    statusEl.textContent = 'Time\'s up!';
    playErrorSound();
    setTimeout(resetLevel, 1200);
  } else {
    timerEl.textContent = (gameState.timer / 1000).toFixed(1);
    if (gameState.timer < 2000) {
      timerEl.classList.add('critical');
      timerEl.classList.remove('warning');
    } else if (gameState.timer < 4000) {
      timerEl.classList.add('warning');
    }
  }
}

// -- Drawing (gameplay) ----------------------------------------------
function drawOctopus(x, y, color) {
  const px = x * CELL_SIZE + CELL_SIZE / 2;
  const py = y * CELL_SIZE + CELL_SIZE / 2;
  const r = CELL_SIZE * 0.4;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(px, py - r * 0.2, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px - r * 0.3, py - r * 0.35, r * 0.18, 0, Math.PI * 2);
  ctx.arc(px + r * 0.3, py - r * 0.35, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(px - r * 0.3, py - r * 0.35, r * 0.08, 0, Math.PI * 2);
  ctx.arc(px + r * 0.3, py - r * 0.35, r * 0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const tx = px - r * 0.6 + i * r * 0.4;
    ctx.beginPath();
    ctx.moveTo(tx, py + r * 0.4);
    ctx.quadraticCurveTo(tx + r * 0.15, py + r * 0.8, tx - r * 0.1, py + r);
    ctx.stroke();
  }
}

function drawPlayer(x, y) {
  const px = x * CELL_SIZE + CELL_SIZE / 2;
  const py = y * CELL_SIZE + CELL_SIZE / 2;
  const r = CELL_SIZE * 0.3;

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#94a3b8';
  ctx.beginPath();
  ctx.arc(px, py - r * 0.3, r * 0.15, 0, Math.PI * 2);
  ctx.fill();
}

function drawWalkableArea() {
  const level = LEVELS[currentLevel];
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      if (!level.isWall(x, y)) {
        // Tint blocked cells with a subtle red so the player sees them
        if (gameState.blockedCells && gameState.blockedCells.has(x + ',' + y)) {
          ctx.fillStyle = '#1a0808';
        } else {
          ctx.fillStyle = '#111111';
        }
        ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }
  }
}

function render() {
  CELL_SIZE = canvas.width / GRID_SIZE;

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawWalkableArea();

  if (!gameState.blue.collected) {
    drawOctopus(gameState.blue.x, gameState.blue.y, '#3b82f6');
  }
  if (!gameState.pink.collected) {
    drawOctopus(gameState.pink.x, gameState.pink.y, '#ec4899');
  }

  drawPlayer(gameState.player.x, gameState.player.y);
}

// ====================================================================
// Reveal sequence
// ====================================================================

let revealActive = false;
let revealFrames = [];
let revealProgress = 0;
let revealLastDrawTime = 0;
let revealSpeed = 20; // ms per point
let revealPhase = 'fadein'; // 'fadein', 'drawing', 'pause', 'text'
let revealPhaseStart = 0;
let revealTransforms = [];

function startReveal() {
  revealActive = true;
  revealPhase = 'fadein';
  revealPhaseStart = Date.now();
  revealProgress = 0;

  // Hide gameplay UI
  document.querySelector('.ui-panel').style.display = 'none';

  buildRevealLayout();
  buildRevealFrames();
}

function buildRevealLayout() {
  // Compute bounding box for each level's recorded path
  const bounds = allPaths.map(function (lp) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const p of lp.path) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return {
      minX: minX,
      maxX: maxX,
      minY: minY,
      maxY: maxY,
      w: Math.max(maxX - minX, 1),
      h: Math.max(maxY - minY, 1),
    };
  });

  // Layout: all three paths at the same height, arranged left to right
  const padding = 50;
  const gap = 35;
  const availH = canvas.height - padding * 2;
  const targetH = availH * 0.55;

  // Per-level scale so each path fills the target height
  const perScale = bounds.map(function (b) {
    return targetH / b.h;
  });
  const perWidth = bounds.map(function (b, i) {
    return b.w * perScale[i];
  });
  const totalW = perWidth.reduce(function (a, b) { return a + b; }, 0) + gap * (perWidth.length - 1);

  // Shrink if wider than canvas
  const availW = canvas.width - padding * 2;
  let gScale = 1;
  if (totalW > availW) gScale = availW / totalW;

  const finalScales = perScale.map(function (s) { return s * gScale; });
  const finalWidths = perWidth.map(function (w) { return w * gScale; });
  const finalTotal = finalWidths.reduce(function (a, b) { return a + b; }, 0) + gap * (finalWidths.length - 1);

  let xCursor = (canvas.width - finalTotal) / 2;
  const yCenter = canvas.height * 0.42;

  revealTransforms = [];
  for (let i = 0; i < bounds.length; i++) {
    const b = bounds[i];
    const s = finalScales[i];
    const h = b.h * s;

    revealTransforms.push({
      offsetX: xCursor - b.minX * s,
      offsetY: yCenter - h / 2 - b.minY * s,
      scale: s,
    });

    xCursor += finalWidths[i] + gap;
  }
}

function buildRevealFrames() {
  revealFrames = [];

  // Process levels in reverse chronological order (last completed first)
  for (let i = allPaths.length - 1; i >= 0; i--) {
    const lp = allPaths[i];
    const t = revealTransforms[i];
    const reversed = [...lp.path].reverse();

    for (const p of reversed) {
      revealFrames.push({
        levelIdx: i,
        px: p.x * t.scale + t.offsetX,
        py: p.y * t.scale + t.offsetY,
      });
    }

    // Break marker between levels
    if (i > 0) {
      revealFrames.push({ levelIdx: -1, px: 0, py: 0 });
    }
  }
}

function updateReveal() {
  const now = Date.now();

  if (revealPhase === 'fadein') {
    // 1-second fade to black before drawing starts
    if (now - revealPhaseStart > 1000) {
      revealPhase = 'drawing';
      revealLastDrawTime = now;
    }
  } else if (revealPhase === 'drawing') {
    while (now - revealLastDrawTime >= revealSpeed && revealProgress < revealFrames.length) {
      revealProgress++;
      revealLastDrawTime += revealSpeed;
    }
    if (revealProgress >= revealFrames.length) {
      revealPhase = 'pause';
      revealPhaseStart = now;
    }
  } else if (revealPhase === 'pause') {
    if (now - revealPhaseStart > 800) {
      revealPhase = 'fadeout';
      revealPhaseStart = now;
    }
  }
}

function drawRevealOutlines() {
  const wallFns = [isWallLevel1, isWallLevel2, isWallLevel3];

  for (let lvl = 0; lvl < revealTransforms.length; lvl++) {
    const t = revealTransforms[lvl];
    const isWall = wallFns[lvl];
    if (!isWall) continue;

    // Draw walkable cells as subtle fill
    ctx.fillStyle = '#141414';
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        if (!isWall(x, y)) {
          const px = x * t.scale + t.offsetX - t.scale / 2;
          const py = y * t.scale + t.offsetY - t.scale / 2;
          ctx.fillRect(px, py, t.scale, t.scale);
        }
      }
    }

    // Draw edges where walkable meets wall for a thin outline effect
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1;
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        if (isWall(x, y)) continue;
        const px = x * t.scale + t.offsetX - t.scale / 2;
        const py = y * t.scale + t.offsetY - t.scale / 2;

        // Check each neighbor; draw edge if neighbor is wall or out of bounds
        if (x === 0 || isWall(x - 1, y)) {
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + t.scale); ctx.stroke();
        }
        if (x === GRID_SIZE - 1 || isWall(x + 1, y)) {
          ctx.beginPath(); ctx.moveTo(px + t.scale, py); ctx.lineTo(px + t.scale, py + t.scale); ctx.stroke();
        }
        if (y === 0 || isWall(x, y - 1)) {
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + t.scale, py); ctx.stroke();
        }
        if (y === GRID_SIZE - 1 || isWall(x, y + 1)) {
          ctx.beginPath(); ctx.moveTo(px, py + t.scale); ctx.lineTo(px + t.scale, py + t.scale); ctx.stroke();
        }
      }
    }
  }
}

function renderReveal() {
  // Background
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // During fadein, show the last game frame fading out
  if (revealPhase === 'fadein') {
    const t = (Date.now() - revealPhaseStart) / 1000;
    ctx.globalAlpha = Math.max(0, 1 - t);
    render();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(10, 10, 10, ' + Math.min(1, t) + ')';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }

  // Draw level corridor outlines behind the path lines (fade out during fadeout phase)
  if (revealPhase === 'fadeout') {
    const elapsed = Date.now() - revealPhaseStart;
    const alpha = Math.max(0, 1 - elapsed / 1500);
    if (alpha > 0) {
      ctx.globalAlpha = alpha;
      drawRevealOutlines();
      ctx.globalAlpha = 1;
    }
  } else {
    drawRevealOutlines();
  }

  // Draw accumulated path lines grouped by level
  const levelColors = ['#ffffff', '#ec4899', '#ffffff'];
  const byLevel = {};

  for (let i = 0; i < Math.min(revealProgress, revealFrames.length); i++) {
    const f = revealFrames[i];
    if (f.levelIdx === -1) continue;
    if (!byLevel[f.levelIdx]) byLevel[f.levelIdx] = [];
    byLevel[f.levelIdx].push(f);
  }

  for (const lvl in byLevel) {
    const points = byLevel[lvl];
    if (points.length < 2) continue;

    const color = levelColors[lvl] || '#ffffff';

    // Glow layer
    ctx.strokeStyle = color;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.15;
    ctx.beginPath();
    ctx.moveTo(points[0].px, points[0].py);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].px, points[i].py);
    }
    ctx.stroke();

    // Main line
    ctx.globalAlpha = 1;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(points[0].px, points[0].py);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].px, points[i].py);
    }
    ctx.stroke();
  }

  // Drawing cursor -- small bright dot at the current drawing position
  if (revealPhase === 'drawing' && revealProgress > 0 && revealProgress <= revealFrames.length) {
    let idx = revealProgress - 1;
    // Skip break markers
    while (idx >= 0 && revealFrames[idx].levelIdx === -1) idx--;
    if (idx >= 0) {
      const f = revealFrames[idx];
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(f.px, f.py, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

}

// -- Game loop -------------------------------------------------------
function gameLoop() {
  if (revealActive) {
    updateReveal();
    renderReveal();
    requestAnimationFrame(gameLoop);
    return;
  }

  let dx = 0;
  let dy = 0;
  if (keys['ArrowUp']) dy -= 1;
  if (keys['ArrowDown']) dy += 1;
  if (keys['ArrowLeft']) dx -= 1;
  if (keys['ArrowRight']) dx += 1;
  if (dx !== 0 || dy !== 0) tryMove(dx, dy);

  updateTimer();
  render();
  requestAnimationFrame(gameLoop);
}

// -- Start -----------------------------------------------------------
resetLevel();
gameLoop();
