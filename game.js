// ===================================================================
// Game: octopi my heart
// ===================================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const timerEl = document.getElementById('timer');
const objectiveEl = document.getElementById('objective');
const statusEl = document.getElementById('status');
const revealOverlay = document.getElementById('revealOverlay');
const revealMessage = document.getElementById('revealMessage');

// -- Constants -------------------------------------------------------
const GRID_SIZE = 30;
const MOVE_STEP = 0.5;
const MOVE_SPEED = 38; // Half-cell moves preserve the original travel speed with smoother curves.
const PLAYER_RADIUS = 0.3;
let CELL_SIZE = 1;

// -- Canvas ----------------------------------------------------------
function resizeCanvas() {
  const size = Math.max(220, Math.min(window.innerWidth - 24, window.innerHeight - 24));
  const pixelRatio = size > 1100 ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  canvas.width = Math.round(size * pixelRatio);
  canvas.height = Math.round(size * pixelRatio);
  CELL_SIZE = canvas.width / GRID_SIZE;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// -- Level definitions -----------------------------------------------

const LEVEL_CIRCLES = [
  [
    { x: 0, y: 15, radius: 10 },
    { x: 30, y: 15, radius: 10 },
  ],
  [
    { x: 10, y: 10, radius: 5 },
    { x: 20, y: 10, radius: 5 },
    { x: 0, y: 30, radius: 14.5 },
    { x: 30, y: 30, radius: 14.5 },
  ],
  [
    { x: 15, y: 15, radius: 11.5 },
  ],
];

function makeCircleCollision(circles) {
  return function isWall(x, y) {
    return circles.some(function (circle) {
      return Math.hypot(x - circle.x, y - circle.y) < circle.radius + PLAYER_RADIUS;
    });
  };
}

function movementHitsCircle(startX, startY, endX, endY, circle) {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const segmentLengthSquared = deltaX * deltaX + deltaY * deltaY;
  const projection = segmentLengthSquared === 0
    ? 0
    : ((circle.x - startX) * deltaX + (circle.y - startY) * deltaY) / segmentLengthSquared;
  const clampedProjection = Math.max(0, Math.min(1, projection));
  const closestX = startX + deltaX * clampedProjection;
  const closestY = startY + deltaY * clampedProjection;
  return Math.hypot(closestX - circle.x, closestY - circle.y) < circle.radius + PLAYER_RADIUS;
}

function isMovementBlocked(level, startX, startY, endX, endY) {
  return level.circles.some(function (circle) {
    return movementHitsCircle(startX, startY, endX, endY, circle);
  });
}

function slideAlongCircle(level, startX, startY, deltaX, deltaY) {
  const blockingCircles = level.circles.filter(function (circle) {
    return movementHitsCircle(startX, startY, startX + deltaX, startY + deltaY, circle);
  });
  let bestCandidate = null;
  let bestDistance = 0;

  blockingCircles.forEach(function (circle) {
    const offsetX = startX - circle.x;
    const offsetY = startY - circle.y;
    const offsetLength = Math.hypot(offsetX, offsetY);
    if (offsetLength === 0) return;

    const normalX = offsetX / offsetLength;
    const normalY = offsetY / offsetLength;
    const inwardAmount = deltaX * normalX + deltaY * normalY;
    const tangentX = deltaX - inwardAmount * normalX;
    const tangentY = deltaY - inwardAmount * normalY;
    const tangentDistance = Math.hypot(tangentX, tangentY);
    if (tangentDistance < 0.001) return;

    let candidateX = startX + tangentX;
    let candidateY = startY + tangentY;
    const safeRadius = circle.radius + PLAYER_RADIUS + 0.002;
    const candidateOffsetX = candidateX - circle.x;
    const candidateOffsetY = candidateY - circle.y;
    const candidateRadius = Math.hypot(candidateOffsetX, candidateOffsetY);
    if (candidateRadius < safeRadius) {
      candidateX = circle.x + (candidateOffsetX / candidateRadius) * safeRadius;
      candidateY = circle.y + (candidateOffsetY / candidateRadius) * safeRadius;
    }

    if (
      candidateX < PLAYER_RADIUS || candidateX > GRID_SIZE - PLAYER_RADIUS
      || candidateY < PLAYER_RADIUS || candidateY > GRID_SIZE - PLAYER_RADIUS
      || isMovementBlocked(level, startX, startY, candidateX, candidateY)
      || level.isWall(candidateX, candidateY)
    ) return;

    if (tangentDistance > bestDistance) {
      bestDistance = tangentDistance;
      bestCandidate = { x: candidateX, y: candidateY };
    }
  });

  return bestCandidate;
}

const isWallLevel1 = makeCircleCollision(LEVEL_CIRCLES[0]);
const isWallLevel2 = makeCircleCollision(LEVEL_CIRCLES[1]);
const isWallLevel3 = makeCircleCollision(LEVEL_CIRCLES[2]);

const LEVELS = [
  {
    name: 'Level 1',
    timer: 6000,
    playerStart: { x: 15, y: 17.5 },
    blue: { x: 15, y: 27.5 },
    pink: { x: 15, y: 7.5 },
    circles: LEVEL_CIRCLES[0],
    isWall: isWallLevel1,
  },
  {
    name: 'Level 2',
    timer: 12000,
    playerStart: { x: 15, y: 25.5 },
    blue: { x: 15, y: 7 },
    pink: { x: 15, y: 25.5 },
    circles: LEVEL_CIRCLES[1],
    isWall: isWallLevel2,
  },
  {
    name: 'Level 3',
    timer: 12000,
    playerStart: { x: 3, y: 7.5 },
    blue: { x: 15, y: 27 },
    pink: { x: 27, y: 7.5 },
    circles: LEVEL_CIRCLES[2],
    isWall: isWallLevel3,
  },
];

// -- State -----------------------------------------------------------
let currentLevel = 0;
let lastTime = Date.now();
let gameState = {};
let allPaths = [];
let gameStarted = false;

function resetLevel() {
  const level = LEVELS[currentLevel];
  gameState = {
    player: { ...level.playerStart },
    playerAngle: Math.atan2(
      level.blue.y - level.playerStart.y,
      level.blue.x - level.playerStart.x,
    ),
    blue: { ...level.blue, collected: false },
    pink: { ...level.pink, collected: false },
    path: [],
    timer: level.timer,
    state: gameStarted ? 'playing' : 'ready',
    lastMoveTime: 0,
    canMove: true,
    levelTwoEntrySide: null,
    levelTwoExitSide: null,
  };
  gameState.path.push({ ...gameState.player });
  objectiveEl.textContent = level.name.toLowerCase() + ' · reach the blue octopus';
  statusEl.textContent = 'Hold two arrow keys to move diagonally.';
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
    if (gameState.state === 'ready') {
      gameStarted = true;
      gameState.state = 'playing';
      lastTime = Date.now();
      document.body.classList.add('playing');
    }
    const dx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
    const dy = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
    tryMove(dx, dy);
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

  const deltaX = dx * MOVE_STEP;
  const deltaY = dy * MOVE_STEP;
  let newX = gameState.player.x + deltaX;
  let newY = gameState.player.y + deltaY;

  if (
    newX < PLAYER_RADIUS || newX > GRID_SIZE - PLAYER_RADIUS
    || newY < PLAYER_RADIUS || newY > GRID_SIZE - PLAYER_RADIUS
  ) return;
  const level = LEVELS[currentLevel];
  if (isMovementBlocked(level, gameState.player.x, gameState.player.y, newX, newY)) {
    const slideTarget = slideAlongCircle(
      level,
      gameState.player.x,
      gameState.player.y,
      deltaX,
      deltaY,
    );
    if (!slideTarget) return;
    newX = slideTarget.x;
    newY = slideTarget.y;
  }

  gameState.playerAngle = Math.atan2(
    newY - gameState.player.y,
    newX - gameState.player.x,
  );
  gameState.player.x = newX;
  gameState.player.y = newY;
  gameState.lastMoveTime = now;
  gameState.path.push({ x: newX, y: newY });

  checkObjectives();

  if (currentLevel === 1) {
    if (!gameState.blue.collected && !gameState.levelTwoEntrySide && newY < 15) {
      gameState.levelTwoEntrySide = newX < 15 ? 'left' : 'right';
    }
    if (
      gameState.blue.collected
      && !gameState.levelTwoExitSide
      && newY > 15
      && Math.abs(newX - 15) > 3
    ) {
      gameState.levelTwoExitSide = newX < 15 ? 'left' : 'right';
    }
  }
}

// -- Objectives ------------------------------------------------------
function checkObjectives() {
  const p = gameState.player;
  const b = gameState.blue;
  const pk = gameState.pink;

  if (!b.collected && Math.hypot(p.x - b.x, p.y - b.y) <= 0.6) {
    b.collected = true;
    objectiveEl.textContent = LEVELS[currentLevel].name.toLowerCase() + ' · now reach the pink octopus';
    playCollectSound(600);
  }

  if (b.collected && !pk.collected && Math.hypot(p.x - pk.x, p.y - pk.y) <= 0.6) {
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
  const wrongWayPenalty = currentLevel === 1
    && gameState.levelTwoEntrySide
    && gameState.levelTwoEntrySide === gameState.levelTwoExitSide
    ? 2.8
    : 1;
  gameState.timer -= delta * wrongWayPenalty;

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
  const px = x * CELL_SIZE;
  const py = y * CELL_SIZE;
  const r = CELL_SIZE * 0.68;
  const now = performance.now();
  const isBlue = color === '#6496dc';
  const phase = isBlue ? 0 : Math.PI;
  const bob = Math.sin(now / 520 + phase) * r * 0.055;
  const sway = Math.sin(now / 760 + phase) * 0.025;
  const blinkTime = (now + (phase ? 1100 : 0)) % 3600;
  const eyeHeight = blinkTime > 3450 ? 0.13 : 1;
  const outline = isBlue ? '#426c9e' : '#99506d';
  const lightColor = isBlue ? '#91b9eb' : '#f0a7c2';
  const cheekColor = isBlue ? 'rgba(244, 174, 188, .7)' : 'rgba(255, 197, 206, .78)';

  ctx.save();
  ctx.translate(px, py + bob);
  ctx.rotate(sway);

  ctx.fillStyle = 'rgba(39, 40, 39, .18)';
  ctx.beginPath();
  ctx.ellipse(0, r * 1.02 - bob, r * .75, r * .16, 0, 0, Math.PI * 2);
  ctx.fill();

  // Soft side arms give the silhouette some life without looking spidery.
  ctx.strokeStyle = outline;
  ctx.lineWidth = r * .28;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const wave = Math.sin(now / 420 + side + phase) * r * .08;
    ctx.beginPath();
    ctx.moveTo(side * r * .64, r * .35);
    ctx.quadraticCurveTo(side * r * 1.03, r * .58 + wave, side * r * .9, r * .82);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = r * .16;
    ctx.stroke();
    ctx.strokeStyle = outline;
    ctx.lineWidth = r * .28;
  }

  // Rounded tentacle lobes read as a single soft skirt.
  for (let i = 0; i < 5; i++) {
    const tentacleX = (-.58 + i * .29) * r;
    const tentacleBob = Math.sin(now / 390 + i * 1.1 + phase) * r * .035;
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.ellipse(tentacleX, r * .66 + tentacleBob, r * .2, r * .34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(tentacleX, r * .62 + tentacleBob, r * .13, r * .25, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const headGradient = ctx.createRadialGradient(-r * .28, -r * .48, r * .08, 0, 0, r * 1.15);
  headGradient.addColorStop(0, lightColor);
  headGradient.addColorStop(1, color);
  ctx.fillStyle = headGradient;
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(1.2, r * .075);
  ctx.beginPath();
  ctx.moveTo(-r * .78, r * .4);
  ctx.bezierCurveTo(-r * .94, -r * .13, -r * .62, -r * .88, 0, -r * .92);
  ctx.bezierCurveTo(r * .62, -r * .88, r * .94, -r * .13, r * .78, r * .4);
  ctx.quadraticCurveTo(r * .52, r * .6, 0, r * .57);
  ctx.quadraticCurveTo(-r * .52, r * .6, -r * .78, r * .4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, .32)';
  ctx.beginPath();
  ctx.ellipse(-r * .32, -r * .59, r * .22, r * .1, -.45, 0, Math.PI * 2);
  ctx.fill();

  for (const eyeX of [-.27, .27]) {
    ctx.save();
    ctx.translate(r * eyeX, -r * .16);
    ctx.scale(1, eyeHeight);
    ctx.fillStyle = '#fffdf8';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * .2, r * .25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#26313a';
    ctx.beginPath();
    ctx.arc(r * .015, r * .015, r * .105, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-r * .025, -r * .035, r * .035, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = cheekColor;
  ctx.beginPath();
  ctx.ellipse(-r * .55, r * .14, r * .12, r * .07, 0, 0, Math.PI * 2);
  ctx.ellipse(r * .55, r * .14, r * .12, r * .07, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#26313a';
  ctx.lineWidth = Math.max(1, r * .055);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, r * .11, r * .15, .14 * Math.PI, .86 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

function drawPlayer(x, y, angle) {
  const px = x * CELL_SIZE;
  const py = y * CELL_SIZE;
  const r = CELL_SIZE * .38;
  const now = performance.now();

  ctx.fillStyle = 'rgba(48, 49, 48, .18)';
  ctx.beginPath();
  ctx.ellipse(px, py + r * 1.5, r * 1.25, r * .34, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(angle);

  // Propeller and tail sit behind the body.
  ctx.strokeStyle = '#655431';
  ctx.lineWidth = Math.max(1, r * .1);
  ctx.beginPath();
  ctx.moveTo(-r * 1.08, 0);
  ctx.lineTo(-r * 1.38, 0);
  ctx.stroke();
  ctx.save();
  ctx.translate(-r * 1.42, 0);
  ctx.rotate(now / 85);
  ctx.fillStyle = '#df9360';
  ctx.beginPath();
  ctx.ellipse(0, -r * .22, r * .1, r * .28, 0, 0, Math.PI * 2);
  ctx.ellipse(0, r * .22, r * .1, r * .28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#d7a943';
  ctx.strokeStyle = '#655431';
  ctx.lineWidth = Math.max(1.2, r * .095);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.18, r * .62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#f2cf68';
  ctx.beginPath();
  ctx.ellipse(r * .67, -r * .08, r * .46, r * .45, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#78b5c8';
  ctx.strokeStyle = '#4b6870';
  ctx.lineWidth = Math.max(1, r * .075);
  ctx.beginPath();
  ctx.arc(r * .32, -r * .04, r * .27, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, .55)';
  ctx.beginPath();
  ctx.arc(r * .24, -r * .12, r * .07, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#655431';
  ctx.lineWidth = Math.max(1.1, r * .09);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * .25, -r * .54);
  ctx.lineTo(-r * .25, -r * .86);
  ctx.lineTo(r * .03, -r * .86);
  ctx.stroke();

  ctx.fillStyle = '#bb7d3c';
  ctx.beginPath();
  ctx.moveTo(-r * .55, r * .5);
  ctx.lineTo(-r * .18, r * .83);
  ctx.lineTo(r * .1, r * .52);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGoalHalo(x, y, color) {
  const pulse = (Math.sin(performance.now() / 360) + 1) / 2;
  const px = x * CELL_SIZE;
  const py = y * CELL_SIZE;
  const radius = CELL_SIZE * (1.02 + pulse * .12);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = .34 - pulse * .12;
  ctx.lineWidth = Math.max(1.5, CELL_SIZE * .07);
  ctx.beginPath();
  ctx.arc(px, py, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawWalkableArea() {
  const level = LEVELS[currentLevel];
  ctx.fillStyle = '#bfc0bd';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  level.circles.forEach(function (circle) {
    if (circle.invisible) return;
    const px = circle.x * CELL_SIZE;
    const py = circle.y * CELL_SIZE;
    const radius = circle.radius * CELL_SIZE;
    const gradient = ctx.createRadialGradient(
      px - radius * .2,
      py - radius * .25,
      radius * .08,
      px,
      py,
      radius,
    );
    gradient.addColorStop(0, '#3a3b3a');
    gradient.addColorStop(1, '#292a29');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function render() {
  CELL_SIZE = canvas.width / GRID_SIZE;

  ctx.fillStyle = '#bfc0bd';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawWalkableArea();

  if (!gameState.blue.collected) {
    if (!gameState.blue.collected) drawGoalHalo(gameState.blue.x, gameState.blue.y, '#4f82ca');
    drawOctopus(gameState.blue.x, gameState.blue.y, '#6496dc');
  }
  if (!gameState.pink.collected) {
    if (gameState.blue.collected) drawGoalHalo(gameState.pink.x, gameState.pink.y, '#cb638f');
    drawOctopus(gameState.pink.x, gameState.pink.y, '#df7fa7');
  }

  drawPlayer(gameState.player.x, gameState.player.y, gameState.playerAngle);
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
  const panelCount = allPaths.length;
  const padding = canvas.width * 0.06;
  const gap = canvas.width * 0.035;
  const availableWidth = canvas.width - padding * 2 - gap * Math.max(0, panelCount - 1);
  const panelSize = Math.min(availableWidth / panelCount, canvas.height * 0.62);
  const totalWidth = panelSize * panelCount + gap * Math.max(0, panelCount - 1);
  const startX = (canvas.width - totalWidth) / 2;
  const startY = (canvas.height - panelSize) / 2;
  const scale = panelSize / GRID_SIZE;

  revealTransforms = allPaths.map(function (_, index) {
    return {
      offsetX: startX + index * (panelSize + gap),
      offsetY: startY,
      scale: scale,
    };
  });
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
        if (!isWall(x + 0.5, y + 0.5)) {
          const px = x * t.scale + t.offsetX;
          const py = y * t.scale + t.offsetY;
          ctx.fillRect(px, py, t.scale, t.scale);
        }
      }
    }

    // Draw edges where walkable meets wall for a thin outline effect
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1;
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        if (isWall(x + 0.5, y + 0.5)) continue;
        const px = x * t.scale + t.offsetX;
        const py = y * t.scale + t.offsetY;

        // Check each neighbor; draw edge if neighbor is wall or out of bounds
        if (x === 0 || isWall(x - 0.5, y + 0.5)) {
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + t.scale); ctx.stroke();
        }
        if (x === GRID_SIZE - 1 || isWall(x + 1.5, y + 0.5)) {
          ctx.beginPath(); ctx.moveTo(px + t.scale, py); ctx.lineTo(px + t.scale, py + t.scale); ctx.stroke();
        }
        if (y === 0 || isWall(x + 0.5, y - 0.5)) {
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + t.scale, py); ctx.stroke();
        }
        if (y === GRID_SIZE - 1 || isWall(x + 0.5, y + 1.5)) {
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
