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
const shareButton = document.getElementById('shareButton');
const audioToggle = document.getElementById('audioToggle');
const mobileDpad = document.getElementById('mobileDpad');

// -- Constants -------------------------------------------------------
const GRID_SIZE = 30;
const MOVE_STEP = 0.5;
const MOVE_SPEED = 38; // Half-cell moves preserve the original travel speed with smoother curves.
const PLAYER_RADIUS = 0.3;
const RECORD_INTERVAL = 1000 / 30;
const PLAYBACK_INTERVAL = 1000 / 60;
let CELL_SIZE = 1;
let VIEW_OFFSET_X = 0;
let VIEW_OFFSET_Y = 0;

// -- Canvas ----------------------------------------------------------
function resizeCanvas() {
  const width = Math.max(320, window.innerWidth);
  const height = Math.max(320, window.innerHeight);
  const shortestSide = Math.min(width, height);
  const pixelRatio = shortestSide > 1100 ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  const worldSize = Math.min(canvas.width, canvas.height);
  CELL_SIZE = worldSize / GRID_SIZE;
  VIEW_OFFSET_X = (canvas.width - worldSize) / 2;
  VIEW_OFFSET_Y = (canvas.height - worldSize) / 2;
}
resizeCanvas();

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
    timer: 3500,
    playerStart: { x: 15, y: 17.5 },
    blue: { x: 15, y: 27.5 },
    pink: { x: 15, y: 7.5 },
    circles: LEVEL_CIRCLES[0],
    isWall: isWallLevel1,
  },
  {
    name: 'Level 2',
    timer: 9500,
    playerStart: { x: 15, y: 25.5 },
    blue: { x: 15, y: 7 },
    pink: { x: 15, y: 25.5 },
    circles: LEVEL_CIRCLES[1],
    isWall: isWallLevel2,
  },
  {
    name: 'Level 3',
    timer: 6500,
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

function snapshotGameplayFrame() {
  return {
    player: {
      x: gameState.player.x,
      y: gameState.player.y,
      angle: gameState.playerAngle,
    },
    blueCollected: gameState.blue.collected,
    pinkCollected: gameState.pink.collected,
  };
}

function recordGameplayFrame(force) {
  if (!gameState.frames) return;
  const now = performance.now();
  if (!force && now - gameState.lastRecordTime < RECORD_INTERVAL) return;
  gameState.frames.push(snapshotGameplayFrame());
  gameState.lastRecordTime = now;
}

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
    frames: [],
    lastRecordTime: performance.now(),
    timer: level.timer,
    state: gameStarted ? 'playing' : 'ready',
    lastMoveTime: 0,
    canMove: true,
    levelTwoEntrySide: null,
    levelTwoExitSide: null,
  };
  recordGameplayFrame(true);
  objectiveEl.textContent = level.name.toLowerCase() + ' · reach the blue octopus';
  statusEl.textContent = 'Hold two arrow keys to move diagonally.';
  timerEl.textContent = (level.timer / 1000).toFixed(1);
  timerEl.classList.remove('warning', 'critical');
  lastTime = Date.now();
}

// -- Input -----------------------------------------------------------
const keys = {};
const touchDirections = { up: false, down: false, left: false, right: false };
const dpadButtons = document.querySelectorAll('.mobile-dpad button');

function beginPlaying() {
  if (gameState.state !== 'ready') return;
  getAudioContext();
  gameStarted = true;
  gameState.state = 'playing';
  lastTime = Date.now();
  document.body.classList.add('playing');
}

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
    keys[e.key] = true;
    beginPlaying();
    const dx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
    const dy = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
    tryMove(dx, dy);
  }
});
window.addEventListener('keyup', (e) => {
  keys[e.key] = false;
});

function clearInput() {
  Object.keys(keys).forEach(function (key) { keys[key] = false; });
  Object.keys(touchDirections).forEach(function (direction) {
    touchDirections[direction] = false;
  });
  dpadButtons.forEach(function (button) { button.classList.remove('active'); });
}

window.addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', function () {
  clearInput();
  lastTime = Date.now();
  if (audioContext) {
    if (document.hidden) audioContext.suspend();
    else audioContext.resume();
  }
});

function syncDpadTouches(touches) {
  Object.keys(touchDirections).forEach(function (direction) {
    touchDirections[direction] = false;
  });
  dpadButtons.forEach(function (button) { button.classList.remove('active'); });
  if (revealActive) return;

  let hasDirection = false;
  Array.from(touches).forEach(function (touch) {
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const button = target && target.closest('.mobile-dpad button');
    if (!button || !mobileDpad.contains(button)) return;
    touchDirections[button.dataset.direction] = true;
    button.classList.add('active');
    hasDirection = true;
  });
  if (hasDirection) beginPlaying();
}

['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(function (eventName) {
  mobileDpad.addEventListener(eventName, function (event) {
    event.preventDefault();
    syncDpadTouches(event.touches);
  }, { passive: false });
});

// Keep mouse and stylus input useful when mobile emulation is enabled on desktop.
dpadButtons.forEach(function (button) {
  button.addEventListener('pointerdown', function (event) {
    if (event.pointerType === 'touch' || revealActive) return;
    event.preventDefault();
    touchDirections[button.dataset.direction] = true;
    button.classList.add('active');
    beginPlaying();
  });
  const releasePointer = function (event) {
    if (event.pointerType === 'touch') return;
    touchDirections[button.dataset.direction] = false;
    button.classList.remove('active');
  };
  button.addEventListener('pointerup', releasePointer);
  button.addEventListener('pointercancel', releasePointer);
  button.addEventListener('pointerleave', releasePointer);
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
    recordGameplayFrame(true);
  }

  if (b.collected && !pk.collected && Math.hypot(p.x - pk.x, p.y - pk.y) <= 0.6) {
    pk.collected = true;
    gameState.state = 'success';
    gameState.canMove = false;
    playCollectSound(800);
    recordGameplayFrame(true);

    allPaths.push({
      level: currentLevel,
      frames: gameState.frames.map(function (frame) {
        return {
          player: { ...frame.player },
          blueCollected: frame.blueCollected,
          pinkCollected: frame.pinkCollected,
        };
      }),
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
let audioContext = null;
let masterGain = null;
let musicGain = null;
let musicInterval = null;
let musicStep = 0;
let soundMuted = false;

try {
  soundMuted = window.localStorage.getItem('octopi-sound-muted') === 'true';
} catch (_) {}

function getAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioContext = new AudioContextClass();
    masterGain = audioContext.createGain();
    masterGain.gain.value = soundMuted ? 0 : 1;
    masterGain.connect(audioContext.destination);
    musicGain = audioContext.createGain();
    musicGain.gain.value = 0.16;
    musicGain.connect(masterGain);
  }
  if (audioContext.state === 'suspended') audioContext.resume();
  return audioContext;
}

function updateAudioToggle() {
  audioToggle.textContent = soundMuted ? 'sound off' : 'sound on';
  audioToggle.setAttribute('aria-pressed', String(soundMuted));
}

function setSoundMuted(muted) {
  soundMuted = muted;
  const context = getAudioContext();
  if (context && masterGain) {
    masterGain.gain.setTargetAtTime(muted ? 0 : 1, context.currentTime, 0.025);
  }
  try {
    window.localStorage.setItem('octopi-sound-muted', String(muted));
  } catch (_) {}
  updateAudioToggle();
}

audioToggle.addEventListener('click', function () {
  setSoundMuted(!soundMuted);
});

updateAudioToggle();

function playTone(frequency, duration, type, volume, endFrequency) {
  try {
    const context = getAudioContext();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain);
    gain.connect(masterGain);
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    if (endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, context.currentTime + duration);
    }
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + duration);
  } catch (_) {}
}

function playCollectSound(freq) {
  playTone(freq, 0.2, 'sine', 0.12);
}

function playErrorSound() {
  playTone(200, 0.15, 'square', 0.15);
}

function playMusicNote(frequency, duration) {
  const context = getAudioContext();
  if (!context || !musicGain) return;

  const noteGain = context.createGain();
  const fundamental = context.createOscillator();
  const harmonic = context.createOscillator();
  const harmonicGain = context.createGain();
  const now = context.currentTime;

  fundamental.type = 'sine';
  fundamental.frequency.value = frequency;
  harmonic.type = 'triangle';
  harmonic.frequency.value = frequency * 2;
  harmonic.detune.value = 4;
  harmonicGain.gain.value = 0.16;

  fundamental.connect(noteGain);
  harmonic.connect(harmonicGain);
  harmonicGain.connect(noteGain);
  noteGain.connect(musicGain);
  noteGain.gain.setValueAtTime(0.0001, now);
  noteGain.gain.exponentialRampToValueAtTime(0.11, now + 0.045);
  noteGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  fundamental.start(now);
  harmonic.start(now);
  fundamental.stop(now + duration);
  harmonic.stop(now + duration);
}

const REWIND_MELODY = [659.25, 523.25, 440, 392, 329.63, 261.63];
const FORWARD_MELODY = [
  261.63, 329.63, 392, 493.88,
  220, 261.63, 329.63, 392,
  174.61, 220, 261.63, 329.63,
  196, 246.94, 293.66, 329.63,
];

function startReplayMusic(mode) {
  if (musicInterval) window.clearInterval(musicInterval);
  const melody = mode === 'rewind' ? REWIND_MELODY : FORWARD_MELODY;
  const noteDuration = mode === 'rewind' ? 0.62 : 0.9;
  musicStep = 0;
  const playNextNote = function () {
    playMusicNote(melody[musicStep % melody.length], noteDuration);
    musicStep++;
  };
  playNextNote();
  musicInterval = window.setInterval(playNextNote, mode === 'rewind' ? 250 : 285);
}

function resolveReplayMusic() {
  if (musicInterval) window.clearInterval(musicInterval);
  musicInterval = null;
  [261.63, 329.63, 392, 493.88, 587.33].forEach(function (frequency, index) {
    window.setTimeout(function () {
      playMusicNote(frequency, 2.4);
    }, index * 55);
  });
}

// -- Timer -----------------------------------------------------------
function updateTimer() {
  if (gameState.state !== 'playing') return;

  const now = Date.now();
  const delta = Math.min(now - lastTime, 100);
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
    playErrorSound();
    document.body.classList.remove('time-up');
    void canvas.offsetWidth;
    document.body.classList.add('time-up');
    window.setTimeout(function () {
      document.body.classList.remove('time-up');
    }, 220);
    resetLevel();
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
  ctx.fillRect(0, 0, GRID_SIZE * CELL_SIZE, GRID_SIZE * CELL_SIZE);

  // Treat the extra widescreen space as the continuation of the side walls.
  // This preserves the original half-circle silhouettes while the canvas fills the viewport.
  if (VIEW_OFFSET_X > 0) {
    const leftWall = ctx.createLinearGradient(-VIEW_OFFSET_X, 0, 0, 0);
    leftWall.addColorStop(0, '#292a29');
    leftWall.addColorStop(1, '#3a3b3a');
    ctx.fillStyle = leftWall;
    ctx.fillRect(-VIEW_OFFSET_X, 0, VIEW_OFFSET_X, GRID_SIZE * CELL_SIZE);

    const rightWall = ctx.createLinearGradient(GRID_SIZE * CELL_SIZE, 0, GRID_SIZE * CELL_SIZE + VIEW_OFFSET_X, 0);
    rightWall.addColorStop(0, '#3a3b3a');
    rightWall.addColorStop(1, '#292a29');
    ctx.fillStyle = rightWall;
    ctx.fillRect(GRID_SIZE * CELL_SIZE, 0, VIEW_OFFSET_X, GRID_SIZE * CELL_SIZE);
  }

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
  ctx.fillStyle = '#bfc0bd';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(VIEW_OFFSET_X, VIEW_OFFSET_Y);
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
  ctx.restore();
}

// ====================================================================
// Reveal sequence
// ====================================================================

let revealActive = false;
let revealLevelIndex = 0;
let revealFrameIndex = 0;
let revealLastStepTime = 0;
let revealPhase = 'fadein';
let revealPhaseStart = 0;
let revealTransforms = [];
let revealDisplayFrames = [];
let revealPathLayers = [];

function setReplayLabel(text) {
  const label = document.getElementById('replayLabel');
  label.textContent = text;
  label.classList.toggle('visible', Boolean(text));
}

function startReveal() {
  revealActive = true;
  document.body.classList.add('replaying');
  revealPhase = 'fadein';
  revealPhaseStart = Date.now();
  revealLevelIndex = allPaths.length - 1;
  revealFrameIndex = allPaths[revealLevelIndex].frames.length - 1;
  revealDisplayFrames = allPaths.map(function (recording) {
    return recording.frames.length - 1;
  });
  document.body.classList.remove('reveal-complete');
  setReplayLabel('');

  // Hide gameplay UI
  document.querySelector('.ui-panel').style.display = 'none';

  buildRevealLayout();
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
      size: panelSize,
    };
  });
  rebuildPathLayers();
}

function rebuildPathLayers() {
  revealPathLayers = revealTransforms.map(function (transform, levelIndex) {
    const layer = document.createElement('canvas');
    layer.width = Math.max(1, Math.ceil(transform.size));
    layer.height = Math.max(1, Math.ceil(transform.size));
    const layerContext = layer.getContext('2d');
    const drawnThrough = revealPhase === 'drawing' || revealPhase === 'pause' || revealPhase === 'fadeout'
      ? revealDisplayFrames[levelIndex]
      : 0;
    if (drawnThrough > 0) {
      const frames = allPaths[levelIndex].frames;
      layerContext.strokeStyle = ['#303130', '#c75482', '#303130'][levelIndex];
      layerContext.lineWidth = Math.max(5, Math.min(10, transform.size * 0.021));
      layerContext.lineCap = 'round';
      layerContext.lineJoin = 'round';
      layerContext.beginPath();
      layerContext.moveTo(frames[0].player.x * transform.scale, frames[0].player.y * transform.scale);
      for (let frameIndex = 1; frameIndex <= drawnThrough; frameIndex++) {
        layerContext.lineTo(
          frames[frameIndex].player.x * transform.scale,
          frames[frameIndex].player.y * transform.scale,
        );
      }
      layerContext.stroke();
    }
    return layer;
  });
}

function drawNextPathSegment(levelIndex, previousIndex, nextIndex) {
  if (nextIndex <= 0 || previousIndex === nextIndex) return;
  const transform = revealTransforms[levelIndex];
  const frames = allPaths[levelIndex].frames;
  const layerContext = revealPathLayers[levelIndex].getContext('2d');
  const previousFrame = frames[Math.max(0, previousIndex)];
  const nextFrame = frames[nextIndex];
  layerContext.strokeStyle = ['#303130', '#c75482', '#303130'][levelIndex];
  layerContext.lineWidth = Math.max(5, Math.min(10, transform.size * 0.021));
  layerContext.lineCap = 'round';
  layerContext.lineJoin = 'round';
  layerContext.beginPath();
  layerContext.moveTo(
    previousFrame.player.x * transform.scale,
    previousFrame.player.y * transform.scale,
  );
  layerContext.lineTo(nextFrame.player.x * transform.scale, nextFrame.player.y * transform.scale);
  layerContext.stroke();
}

function updateReveal() {
  const now = Date.now();

  if (revealPhase === 'fadein') {
    // Pause on the completed run, then show the full recording ready to rewind.
    if (now - revealPhaseStart > 1000) {
      revealPhase = 'rewinding';
      revealLastStepTime = now;
      setReplayLabel('rewinding…');
      startReplayMusic('rewind');
    }
  } else if (revealPhase === 'rewinding') {
    while (now - revealLastStepTime >= PLAYBACK_INTERVAL) {
      revealFrameIndex--;
      revealLastStepTime += PLAYBACK_INTERVAL;
      if (revealFrameIndex < 0) {
        revealDisplayFrames[revealLevelIndex] = 0;
        revealLevelIndex--;
        if (revealLevelIndex < 0) {
          revealPhase = 'rewind-pause';
          revealPhaseStart = now;
          setReplayLabel('');
          break;
        }
        revealFrameIndex = allPaths[revealLevelIndex].frames.length - 1;
      } else {
        revealDisplayFrames[revealLevelIndex] = revealFrameIndex;
      }
    }
  } else if (revealPhase === 'rewind-pause') {
    if (now - revealPhaseStart > 500) {
      revealPhase = 'drawing';
      revealLevelIndex = 0;
      revealFrameIndex = 0;
      revealDisplayFrames = allPaths.map(function () { return 0; });
      rebuildPathLayers();
      revealLastStepTime = now;
      setReplayLabel('playing forward…');
      startReplayMusic('forward');
    }
  } else if (revealPhase === 'drawing') {
    while (now - revealLastStepTime >= PLAYBACK_INTERVAL) {
      const previousIndex = revealFrameIndex;
      revealFrameIndex++;
      revealLastStepTime += PLAYBACK_INTERVAL;
      if (revealFrameIndex >= allPaths[revealLevelIndex].frames.length) {
        revealDisplayFrames[revealLevelIndex] = allPaths[revealLevelIndex].frames.length - 1;
        revealLevelIndex++;
        if (revealLevelIndex >= allPaths.length) {
          revealPhase = 'pause';
          revealPhaseStart = now;
          setReplayLabel('');
          break;
        }
        revealFrameIndex = 0;
      } else {
        revealDisplayFrames[revealLevelIndex] = revealFrameIndex;
        drawNextPathSegment(revealLevelIndex, previousIndex, revealFrameIndex);
      }
    }
  } else if (revealPhase === 'pause') {
    if (now - revealPhaseStart > 800) {
      revealPhase = 'fadeout';
      revealPhaseStart = now;
    }
  } else if (revealPhase === 'fadeout' && now - revealPhaseStart > 400) {
    if (!document.body.classList.contains('reveal-complete')) {
      document.body.classList.add('reveal-complete');
      resolveReplayMusic();
    }
  }
}

window.addEventListener('resize', function () {
  resizeCanvas();
  if (revealActive) buildRevealLayout();
});

function drawRevealOutlines() {
  revealTransforms.forEach(function (transform, levelIndex) {
    const panelSize = GRID_SIZE * transform.scale;
    const circles = LEVELS[levelIndex].circles.filter(function (circle) {
      return !circle.invisible;
    });

    ctx.save();
    ctx.beginPath();
    ctx.rect(transform.offsetX, transform.offsetY, panelSize, panelSize);
    ctx.clip();

    // One even-odd path preserves the exact circle geometry without a pixel-grid staircase.
    ctx.beginPath();
    ctx.rect(transform.offsetX, transform.offsetY, panelSize, panelSize);
    circles.forEach(function (circle) {
      const centerX = transform.offsetX + circle.x * transform.scale;
      const centerY = transform.offsetY + circle.y * transform.scale;
      const radius = circle.radius * transform.scale;
      ctx.moveTo(centerX + radius, centerY);
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    });
    ctx.fillStyle = 'rgba(48, 49, 48, .1)';
    ctx.fill('evenodd');

    ctx.strokeStyle = 'rgba(48, 49, 48, .2)';
    ctx.lineWidth = Math.max(1, transform.scale * .08);
    circles.forEach(function (circle) {
      ctx.beginPath();
      ctx.arc(
        transform.offsetX + circle.x * transform.scale,
        transform.offsetY + circle.y * transform.scale,
        circle.radius * transform.scale,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    });
    ctx.strokeRect(transform.offsetX, transform.offsetY, panelSize, panelSize);
    ctx.restore();
  });
}

function drawReplayActors(alpha) {
  const previousCellSize = CELL_SIZE;
  ctx.save();
  ctx.globalAlpha = alpha;

  revealTransforms.forEach(function (transform, levelIndex) {
    const level = LEVELS[levelIndex];
    const frames = allPaths[levelIndex].frames;
    const frameIndex = Math.max(0, Math.min(revealDisplayFrames[levelIndex], frames.length - 1));
    const frame = frames[frameIndex];
    ctx.save();
    ctx.translate(transform.offsetX, transform.offsetY);
    CELL_SIZE = transform.scale;
    if (!frame.blueCollected) {
      drawOctopus(level.blue.x, level.blue.y, '#6496dc');
    }
    if (!frame.pinkCollected) {
      drawOctopus(level.pink.x, level.pink.y, '#df7fa7');
    }
    drawPlayer(frame.player.x, frame.player.y, frame.player.angle);
    ctx.restore();
  });

  CELL_SIZE = previousCellSize;
  ctx.restore();
}

function renderReveal() {
  // Background
  ctx.fillStyle = '#bfc0bd';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // During fadein, show the last game frame fading out
  if (revealPhase === 'fadein') {
    const t = (Date.now() - revealPhaseStart) / 1000;
    ctx.globalAlpha = Math.max(0, 1 - t);
    render();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(191, 192, 189, ' + Math.min(1, t) + ')';
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

  // Persistent offscreen layers make forward drawing incremental instead of O(n) each frame.
  if (revealPhase === 'drawing' || revealPhase === 'pause' || revealPhase === 'fadeout') {
    revealPathLayers.forEach(function (layer, levelIndex) {
      const transform = revealTransforms[levelIndex];
      ctx.save();
      ctx.shadowColor = 'rgba(48, 49, 48, .16)';
      ctx.shadowBlur = 12;
      ctx.drawImage(layer, transform.offsetX, transform.offsetY);
      ctx.restore();
    });
  }

  const actorPhases = ['rewinding', 'rewind-pause', 'drawing', 'pause', 'fadeout'];
  if (actorPhases.includes(revealPhase)) {
    const actorAlpha = revealPhase === 'fadeout'
      ? Math.max(0, 1 - (Date.now() - revealPhaseStart) / 700)
      : 1;
    if (actorAlpha > 0) drawReplayActors(actorAlpha);
  }
}

shareButton.addEventListener('click', async function () {
  const shareData = {
    title: 'octopi my heart',
    text: 'a tiny puzzle for you',
    url: window.location.origin + window.location.pathname,
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }

  try {
    await navigator.clipboard.writeText(shareData.url);
    shareButton.textContent = 'link copied';
    window.setTimeout(function () {
      shareButton.textContent = 'share this with someone';
    }, 1800);
  } catch (error) {
    window.location.href = 'mailto:?subject=' + encodeURIComponent(shareData.title)
      + '&body=' + encodeURIComponent(shareData.text + '\n\n' + shareData.url);
  }
});

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
  if (touchDirections.up) dy -= 1;
  if (touchDirections.down) dy += 1;
  if (touchDirections.left) dx -= 1;
  if (touchDirections.right) dx += 1;
  if (dx !== 0 || dy !== 0) tryMove(dx, dy);

  updateTimer();
  if (gameState.state === 'playing') recordGameplayFrame(false);
  render();
  requestAnimationFrame(gameLoop);
}

// -- Start -----------------------------------------------------------
if (window.matchMedia('(pointer: coarse)').matches) {
  document.getElementById('moveHint').textContent = 'use the arrow keys to move';
}
resetLevel();
gameLoop();
