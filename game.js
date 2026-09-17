const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const lifeIconsEl = document.getElementById('lifeIcons');
const levelEl = document.getElementById('level');
const startBtn = document.getElementById('startBtn');

function loadImage(source) {
  const image = new Image();
  image.decoding = 'async';
  image.src = `${source}?v=3`;
  return image;
}

const assets = {
  asteroid: loadImage('asteroid-sprites-cutout.png'),
  backgrounds: [
    loadImage('space-background-1.jpg'),
    loadImage('space-background-2.jpg'),
    loadImage('space-background-3.jpg'),
    loadImage('space-background-4.jpg')
  ],
  stars: loadImage('star-layer.png'),
  hero: loadImage('hero-cutout.png'),
  planes: loadImage('enemy-planes-cutout.png'),
  powerUps: loadImage('powerups-cutout.png'),
  projectiles: loadImage('projectiles.png'),
  frame: loadImage('game-frame.png'),
  heart: loadImage('life-heart.png'),
  shield: loadImage('shield-cutout.png')
};
function getTransparentTexture(name, image) {
  return image.complete && image.naturalWidth > 0 ? image : null;
}

const width = canvas.width;
const height = canvas.height;
const arena = {
  left: 58,
  right: width - 58,
  top: 42,
  bottom: height - 42
};
const state = {
  running: false,
  score: 0,
  lives: 3,
  level: 1,
  lastTime: 0,
  spawnTimer: 0,
  enemyPlaneTimer: 5,
  shootCooldown: 0,
  stars: [],
  musicTimer: null,
  notice: '',
  noticeTimer: 0,
  rapidFireUntil: 0,
  shieldUntil: 0,
  playerHitFlash: 0,
  backgroundOffset: 0,
  backgroundIndex: 0,
  backgroundTimer: 0,
  backgroundTransition: 0
};

function getLevelConfig(level = state.level) {
  const safeLevel = Math.max(1, level);

  return {
    asteroidSpeed: 1 + (safeLevel - 1) * 0.18,
    asteroidCount: Math.min(7, 1 + Math.floor((safeLevel - 1) / 2)),
    planeCount: Math.min(7, 1 + Math.floor((safeLevel - 1) / 1.4)),
    planeGap: Math.max(2.1, 5 - (safeLevel - 1) * 0.35),
    planeSpeed: 105 + (safeLevel - 1) * 18,
    planeShotInterval: Math.max(0.45, 1.1 - (safeLevel - 1) * 0.07)
  };
}

const keys = {
  left: false,
  right: false,
  shoot: false
};

const player = {
  x: width / 2,
  y: height - 62,
  width: 42,
  height: 48,
  speed: 340
};

const bullets = [];
const enemies = [];
const enemyPlanes = [];
const enemyBullets = [];
const powerUps = [];
const explosions = [];

const audio = {
  ctx: null,
  master: null
};

function getLevelFromScore(value) {
  return Math.max(1, Math.floor(value / 30) + 1);
}

function updateLevelUI() {
  const nextLevel = getLevelFromScore(state.score);
  if (state.level !== nextLevel) {
    state.level = nextLevel;
    state.notice = `Уровень ${state.level}!`;
    state.noticeTimer = 1.8;
    playLevelSound();
  }
  levelEl.textContent = String(state.level);
}

function updateLivesUI() {
  livesEl.textContent = String(state.lives);
  lifeIconsEl.innerHTML = '';
  for (let index = 0; index < 3; index += 1) {
    const icon = document.createElement('span');
    icon.className = 'life-icon';
    icon.style.opacity = index < state.lives ? '1' : '0.28';
    lifeIconsEl.appendChild(icon);
  }
}

function createStars() {
  state.stars = Array.from({ length: 80 }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: Math.random() * 2 + 1,
    speed: Math.random() * 40 + 20
  }));
}

function resetGame() {
  state.score = 0;
  state.lives = 3;
  state.level = 1;
  state.spawnTimer = 0.9;
  state.enemyPlaneTimer = 5;
  state.shootCooldown = 0;
  state.notice = '';
  state.noticeTimer = 0;
  state.rapidFireUntil = 0;
  state.shieldUntil = 0;
  state.playerHitFlash = 0;
  state.backgroundOffset = 0;
  state.backgroundIndex = 0;
  state.backgroundTimer = 0;
  state.backgroundTransition = 0;
  player.x = width / 2;
  bullets.length = 0;
  enemies.length = 0;
  enemyPlanes.length = 0;
  enemyBullets.length = 0;
  powerUps.length = 0;
  explosions.length = 0;
  state.starOffset = 0;
  scoreEl.textContent = '0';
  updateLivesUI();
  updateLevelUI();
}

function initAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  if (!audio.ctx) {
    audio.ctx = new AudioContextClass();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.08;
    audio.master.connect(audio.ctx.destination);
  }

  if (audio.ctx.state === 'suspended') {
    audio.ctx.resume();
  }
}

function playTone(frequency, duration, type = 'sine', volume = 0.04, slide = 0) {
  if (!audio.ctx || !audio.master) return;

  const oscillator = audio.ctx.createOscillator();
  const gainNode = audio.ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audio.ctx.currentTime);

  if (slide !== 0) {
    oscillator.frequency.linearRampToValueAtTime(frequency + slide, audio.ctx.currentTime + duration);
  }

  gainNode.gain.setValueAtTime(0.0001, audio.ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(volume, audio.ctx.currentTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, audio.ctx.currentTime + duration);

  oscillator.connect(gainNode);
  gainNode.connect(audio.master);

  oscillator.start();
  oscillator.stop(audio.ctx.currentTime + duration);
}

function playShootSound() {
  playTone(560, 0.09, 'square', 0.06, 130);
}

function playExplosionSound() {
  playTone(190, 0.18, 'sawtooth', 0.08, -80);
}

function playPowerUpSound() {
  playTone(760, 0.12, 'triangle', 0.05, 80);
}

function playLevelSound() {
  playTone(400, 0.14, 'triangle', 0.05, 120);
  setTimeout(() => playTone(520, 0.14, 'triangle', 0.05, 80), 120);
}

function stopMusicLoop() {
  if (state.musicTimer) {
    clearTimeout(state.musicTimer);
    state.musicTimer = null;
  }
}

function startMusicLoop() {
  if (!audio.ctx || !state.running) return;

  stopMusicLoop();

  const melody = [220, 277.18, 329.63, 277.18, 196, 246.94, 220, 174.61];
  let noteIndex = 0;

  const tick = () => {
    if (!state.running || !audio.ctx) return;
    playTone(melody[noteIndex % melody.length], 0.14, 'triangle', 0.02);
    noteIndex += 1;
    state.musicTimer = setTimeout(tick, 320);
  };

  tick();
}

function startGame() {
  initAudio();
  resetGame();
  state.running = true;
  startBtn.textContent = 'Рестарт';
  startMusicLoop();
}

function endGame() {
  state.running = false;
  stopMusicLoop();
  startBtn.textContent = 'Играть снова';
}

function shoot() {
  if (!state.running) return;
  if (state.shootCooldown > 0) return;

  const rapidFireActive = state.rapidFireUntil > 0;
  const fireRate = rapidFireActive ? 0.09 : 0.22;

  bullets.push({
    x: player.x,
    y: player.y - 14,
    radius: 5,
    speed: 520
  });

  state.shootCooldown = fireRate;
  playShootSound();
}

function spawnEnemy() {
  const size = 18 + Math.random() * 18;
  const level = getLevelFromScore(state.score);
  const config = getLevelConfig(level);

  enemies.push({
    x: arena.left + 20 + Math.random() * (arena.right - arena.left - 40),
    y: -size,
    radius: size,
    speed: (level === 1 ? 150 + Math.random() * 110 : level === 2 ? 220 + Math.random() * 150 : 270 + Math.random() * 180) * config.asteroidSpeed,
    drift: (Math.random() - 0.5) * (level === 1 ? 42 : level === 2 ? 60 : 72)
  });
}

function spawnSplitAsteroids(enemy) {
  const radius = Math.max(10, enemy.radius * 0.42);
  const splitSpeed = enemy.speed * 1.08;

  for (const direction of [-1, 1]) {
    enemies.push({
      x: enemy.x + direction * radius,
      y: enemy.y,
      radius,
      speed: splitSpeed,
      drift: direction * (70 + Math.random() * 45)
    });
  }
}

function spawnWave() {
  const level = getLevelFromScore(state.score);
  const count = getLevelConfig(level).asteroidCount;

  for (let i = 0; i < count; i += 1) {
    spawnEnemy();
  }
}

function spawnEnemyPlaneWave() {
  const level = getLevelFromScore(state.score);
  const config = getLevelConfig(level);
  const count = config.planeCount;

  const hasDoubleShooter = level >= 2 && enemyPlanes.filter((p) => p.doubleShot).length === 0;

  for (let i = 0; i < count; i += 1) {
    const x = 80 + i * 120 + Math.random() * 40;
    const isDoubleShooter = hasDoubleShooter && i === count - 1;
    const hp = isDoubleShooter ? 4 : 2;

    enemyPlanes.push({
      x: Math.min(width - 40, x),
      y: 40 + Math.random() * 120,
      width: 58,
      height: 76,
      speed: config.planeSpeed + level * 12,
      shootTimer: config.planeShotInterval + Math.random() * 0.6,
      drift: (Math.random() - 0.5) * 55,
      phase: Math.random() * Math.PI * 2,
      doubleShot: isDoubleShooter,
      hp,
      maxHp: hp,
      hitFlash: 0
    });
  }
}

function spawnPowerUp(x, y, forcedType = null) {
  const types = ['rapid', 'shield', 'life', 'heart'];
  const type = forcedType || types[Math.floor(Math.random() * types.length)];
  powerUps.push({
    x,
    y,
    radius: 13,
    type,
    speed: 90,
    drift: (Math.random() - 0.5) * 30,
    phase: Math.random() * Math.PI * 2
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function handleInput(deltaSeconds) {
  if (keys.left) {
    player.x -= player.speed * deltaSeconds;
  }
  if (keys.right) {
    player.x += player.speed * deltaSeconds;
  }

  player.x = clamp(player.x, arena.left + player.width / 2, arena.right - player.width / 2);

  if (keys.shoot) {
    shoot();
  }
}

function applyPowerUp(type) {
  if (type === 'rapid') {
    state.rapidFireUntil = 6;
    state.notice = 'Бонус: быстрая стрельба!';
    state.noticeTimer = 1.5;
  }

  if (type === 'shield') {
    state.shieldUntil = 6;
    state.notice = 'Щит активен!';
    state.noticeTimer = 1.5;
  }

  if (type === 'life' || type === 'heart') {
    state.lives = Math.min(3, state.lives + 1);
    updateLivesUI();
    state.notice = type === 'heart' ? 'Сердце +1!' : 'Дополнительная жизнь!';
    state.noticeTimer = 1.5;
  }

  playPowerUpSound();
}

function fireEnemyBullet(plane) {
  const dx = player.x - plane.x;
  const dy = player.y - plane.y;
  const length = Math.hypot(dx, dy) || 1;
  const speed = 240;

  const spread = plane.doubleShot ? 0.18 : 0;
  const baseAngle = Math.atan2(dy, dx);

  enemyBullets.push({
    x: plane.x + plane.width / 2,
    y: plane.y + plane.height - 8,
    radius: 5,
    vx: Math.cos(baseAngle - spread) * speed,
    vy: Math.sin(baseAngle - spread) * speed
  });

  if (plane.doubleShot) {
    enemyBullets.push({
      x: plane.x + plane.width / 2,
      y: plane.y + plane.height - 8,
      radius: 5,
      vx: Math.cos(baseAngle + spread) * speed,
      vy: Math.sin(baseAngle + spread) * speed
    });
  }
}

function spawnExplosion(x, y, color = '#fca5a5', amount = 12, scale = 1) {
  for (let i = 0; i < amount; i += 1) {
    const angle = (Math.PI * 2 * i) / amount + Math.random() * 0.6;
    const speed = (35 + Math.random() * 90) * scale;
    explosions.push({
      x,
      y,
      color,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: (2 + Math.random() * 4) * scale,
      life: (0.45 + Math.random() * 0.3) * scale,
      maxLife: (0.45 + Math.random() * 0.3) * scale
    });
  }

  explosions.push({
    x,
    y,
    color: color,
    vx: 0,
    vy: 0,
    radius: 18 * scale,
    life: 0.28 * scale,
    maxLife: 0.28 * scale,
    glow: true
  });
}

function loseLifeIfNeeded() {
  if (state.shieldUntil > 0) return;

  state.lives -= 1;
  state.playerHitFlash = 0.45;
  updateLivesUI();
  playExplosionSound();
  spawnExplosion(player.x, player.y, '#f87171', 18, 1.5);

  if (state.lives <= 0) {
    endGame();
  }
}

function update(deltaSeconds) {
  state.shootCooldown = Math.max(0, state.shootCooldown - deltaSeconds);
  state.spawnTimer -= deltaSeconds;
  state.enemyPlaneTimer -= deltaSeconds;
  state.noticeTimer = Math.max(0, state.noticeTimer - deltaSeconds);
  state.rapidFireUntil = Math.max(0, state.rapidFireUntil - deltaSeconds);
  state.shieldUntil = Math.max(0, state.shieldUntil - deltaSeconds);
  state.playerHitFlash = Math.max(0, state.playerHitFlash - deltaSeconds);
  state.starOffset = (state.starOffset + 44 * deltaSeconds) % height;
  state.backgroundOffset += 28 * deltaSeconds;
  state.backgroundTimer += deltaSeconds;
  if (state.backgroundTransition > 0) {
    state.backgroundTransition = Math.max(0, state.backgroundTransition - deltaSeconds);
    if (state.backgroundTransition === 0) {
      state.backgroundIndex = (state.backgroundIndex + 1) % assets.backgrounds.length;
    }
  } else if (state.backgroundTimer >= 14) {
    state.backgroundTimer = 0;
    state.backgroundTransition = 2.4;
  }

  for (let i = explosions.length - 1; i >= 0; i -= 1) {
    const effect = explosions[i];
    effect.x += effect.vx * deltaSeconds;
    effect.y += effect.vy * deltaSeconds;
    effect.life -= deltaSeconds;
    if (effect.life <= 0) {
      explosions.splice(i, 1);
    }
  }

  updateLevelUI();

  if (state.spawnTimer <= 0) {
    spawnWave();
    const level = getLevelFromScore(state.score);
    state.spawnTimer = level === 3 ? 0.38 + Math.random() * 0.18 : level === 2 ? 0.58 + Math.random() * 0.24 : 0.82 + Math.random() * 0.45;
  }

  if (state.enemyPlaneTimer <= 0 && enemyPlanes.length < 5) {
    spawnEnemyPlaneWave();
    const level = getLevelFromScore(state.score);
    state.enemyPlaneTimer = getLevelConfig(level).planeGap;
  }

  for (const star of state.stars) {
    star.y += star.speed * deltaSeconds;
    if (star.y > height) {
      star.y = -10;
      star.x = Math.random() * width;
    }
  }

  handleInput(deltaSeconds);

  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    bullets[i].y -= bullets[i].speed * deltaSeconds;
    if (bullets[i].y < -20) {
      bullets.splice(i, 1);
    }
  }

  for (let i = powerUps.length - 1; i >= 0; i -= 1) {
    const bonus = powerUps[i];
    bonus.y += bonus.speed * deltaSeconds;
    bonus.x += bonus.drift * deltaSeconds;
    bonus.phase += deltaSeconds * 4.5;

    if (bonus.y > height + 20) {
      powerUps.splice(i, 1);
      continue;
    }

    const dx = player.x - bonus.x;
    const dy = player.y - bonus.y;
    if (Math.hypot(dx, dy) < player.width / 2 + bonus.radius) {
      applyPowerUp(bonus.type);
      powerUps.splice(i, 1);
    }
  }

  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i];
    enemy.y += enemy.speed * deltaSeconds;
    enemy.x += enemy.drift * deltaSeconds;

    if (enemy.x < arena.left + enemy.radius || enemy.x > arena.right - enemy.radius) {
      enemy.drift *= -1;
      enemy.x = clamp(enemy.x, arena.left + enemy.radius, arena.right - enemy.radius);
    }

    const hitX = Math.abs(enemy.x - player.x) < player.width / 2 + enemy.radius;
    const hitY = enemy.y + enemy.radius >= player.y - 10 && enemy.y - enemy.radius <= player.y + 18;
    if (hitX && hitY) {
      enemies.splice(i, 1);
      loseLifeIfNeeded();
      if (!state.running) return;
    }
  }

  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const bullet = bullets[i];

    for (let j = enemies.length - 1; j >= 0; j -= 1) {
      const enemy = enemies[j];
      const dx = bullet.x - enemy.x;
      const dy = bullet.y - enemy.y;
      if (Math.hypot(dx, dy) < bullet.radius + enemy.radius) {
        bullets.splice(i, 1);
        enemies.splice(j, 1);
        const wasLarge = enemy.radius >= 27;
        state.score += 1;
        scoreEl.textContent = String(state.score);
        playExplosionSound();
        spawnExplosion(enemy.x, enemy.y, '#fbbf24', 10);
        if (wasLarge) {
          spawnSplitAsteroids(enemy);
        }
        if (Math.random() < 0.18) {
          spawnPowerUp(enemy.x, enemy.y);
        }
        break;
      }
    }
  }

  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const bullet = bullets[i];

    for (let j = enemyPlanes.length - 1; j >= 0; j -= 1) {
      const plane = enemyPlanes[j];
      const hitX = bullet.x + bullet.radius >= plane.x && bullet.x - bullet.radius <= plane.x + plane.width;
      const hitY = bullet.y + bullet.radius >= plane.y && bullet.y - bullet.radius <= plane.y + plane.height;
      if (hitX && hitY) {
        bullets.splice(i, 1);

        plane.hp -= 1;
        plane.hitFlash = 0.18;

        if (plane.hp <= 0) {
          enemyPlanes.splice(j, 1);
          state.score += plane.doubleShot ? 5 : 3;
          scoreEl.textContent = String(state.score);
          playExplosionSound();
          spawnExplosion(plane.x + plane.width / 2, plane.y + plane.height / 2, '#fb7185', 14);
          if (Math.random() < 0.5) {
            spawnPowerUp(plane.x + plane.width / 2, plane.y + plane.height / 2, 'heart');
          }
        }
        break;
      }
    }
  }

  for (let i = enemyPlanes.length - 1; i >= 0; i -= 1) {
    const plane = enemyPlanes[i];
    plane.phase += deltaSeconds * 2.2;
    plane.hitFlash = Math.max(0, plane.hitFlash - deltaSeconds);
    plane.x += Math.sin(plane.phase) * 35 * deltaSeconds;

    const targetDirection = player.x - plane.x;
    const horizontalMove = clamp(targetDirection * 0.35, -90, 90);
    plane.x += horizontalMove * deltaSeconds;
    plane.y += Math.sin(plane.phase * 1.5) * 18 * deltaSeconds;
    plane.y = clamp(plane.y, 30, 180);
    plane.shootTimer -= deltaSeconds;

    if (plane.shootTimer <= 0) {
      fireEnemyBullet(plane);
      plane.shootTimer = Math.max(0.5, getLevelConfig(getLevelFromScore(state.score)).planeShotInterval + Math.random() * 0.6);
    }

    const hitX = Math.abs(player.x - (plane.x + plane.width / 2)) < player.width / 2 + plane.width / 2;
    const hitY = plane.y + plane.height >= player.y - player.height / 2 && plane.y <= player.y + player.height / 2;
    if (hitX && hitY) {
      enemyPlanes.splice(i, 1);
      loseLifeIfNeeded();
      if (!state.running) return;
      continue;
    }

    if (plane.x < arena.left - plane.width || plane.x > arena.right) {
      enemyPlanes.splice(i, 1);
    }
  }

  for (let i = enemyBullets.length - 1; i >= 0; i -= 1) {
    const bullet = enemyBullets[i];
    bullet.x += bullet.vx * deltaSeconds;
    bullet.y += bullet.vy * deltaSeconds;

    const hitX = Math.abs(bullet.x - player.x) < player.width / 2 + 5;
    const hitY = Math.abs(bullet.y - player.y) < player.height / 2 + 10;
    if (hitX && hitY) {
      enemyBullets.splice(i, 1);
      loseLifeIfNeeded();
      if (!state.running) return;
      continue;
    }

    if (bullet.x < -20 || bullet.x > width + 20 || bullet.y < -20 || bullet.y > height + 20) {
      enemyBullets.splice(i, 1);
    }
  }
}

function drawShip() {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.translate(player.x, player.y);

  const heroTexture = getTransparentTexture('hero', assets.hero);
  const spriteReady = Boolean(heroTexture);
  if (spriteReady) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(heroTexture, -36, -36, 72, 72);
    if (state.playerHitFlash > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(248, 113, 113, 0.65)';
      ctx.fillRect(-36, -36, 72, 72);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  if (state.shieldUntil > 0) {
    const shieldTexture = getTransparentTexture('shield', assets.shield);
    if (shieldTexture) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(shieldTexture, -42, -42, 84, 84);
      ctx.restore();
    }
  }

  if (!spriteReady) {
    ctx.fillStyle = '#7dd3fc';
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(14, 18);
    ctx.lineTo(0, 12);
    ctx.lineTo(-14, 18);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawBullet(bullet) {
  const spriteReady = assets.projectiles.complete && assets.projectiles.naturalWidth > 0;
  ctx.save();
  ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
  ctx.beginPath();
  ctx.arc(bullet.x, bullet.y, 9, 0, Math.PI * 2);
  ctx.fill();

  if (spriteReady) {
    ctx.globalCompositeOperation = 'screen';
    ctx.imageSmoothingEnabled = false;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 8, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(assets.projectiles, 255, 110, 130, 130, bullet.x - 9, bullet.y - 9, 18, 18);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawEnemy(enemy) {
  const asteroidTexture = getTransparentTexture('asteroid', assets.asteroid);
  const spriteReady = Boolean(asteroidTexture);
  const isLarge = enemy.radius >= 27;

  if (spriteReady) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const sourceX = isLarge ? 110 : 1120;
    const sourceY = isLarge ? 100 : 380;
    const sourceSize = isLarge ? 860 : 360;
    const drawSize = enemy.radius * 2.6;
    const trailDistance = Math.min(18, Math.max(5, enemy.speed * 0.035));

    ctx.globalAlpha = 0.14;
    ctx.drawImage(
      asteroidTexture,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      enemy.x - drawSize / 2,
      enemy.y - drawSize / 2 - trailDistance,
      drawSize,
      drawSize * 1.12
    );
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      asteroidTexture,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      enemy.x - drawSize / 2,
      enemy.y - drawSize / 2,
      drawSize,
      drawSize
    );
    ctx.restore();
    return;
  }

  ctx.fillStyle = '#667085';
  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawEnemyPlane(plane) {
  const planeTexture = getTransparentTexture('planes', assets.planes);
  const spriteReady = Boolean(planeTexture);

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(plane.x, plane.y - 10, plane.width, 5);

  const healthRatio = Math.max(0, plane.hp / plane.maxHp);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(plane.x + 1, plane.y - 9, (plane.width - 2) * healthRatio, 3);

  if (spriteReady) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(plane.x + plane.width / 2, plane.y + plane.height / 2);
    ctx.rotate(Math.PI);
    ctx.imageSmoothingEnabled = false;
    const sourceX = plane.doubleShot ? 768 : 0;
    ctx.drawImage(planeTexture, sourceX, 0, 768, 1024, -plane.width / 2, -plane.height / 2, plane.width, plane.height);
    if (plane.hitFlash > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(248, 113, 113, 0.7)';
      ctx.fillRect(-plane.width / 2, -plane.height / 2, plane.width, plane.height);
    }
    ctx.restore();
    return;
  }

  ctx.fillStyle = plane.doubleShot ? '#f97316' : '#f43f5e';
  ctx.fillRect(plane.x + 8, plane.y + 8, plane.width - 16, plane.height - 16);
}

function drawEnemyBullet(bullet) {
  const spriteReady = assets.projectiles.complete && assets.projectiles.naturalWidth > 0;
  ctx.save();
  ctx.fillStyle = 'rgba(251, 113, 133, 0.4)';
  ctx.beginPath();
  ctx.arc(bullet.x, bullet.y, 9, 0, Math.PI * 2);
  ctx.fill();

  if (spriteReady) {
    ctx.globalCompositeOperation = 'screen';
    ctx.imageSmoothingEnabled = false;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 8, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(assets.projectiles, 995, 110, 130, 130, bullet.x - 9, bullet.y - 9, 18, 18);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff7ed';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.fillStyle = '#fff7ed';
  ctx.beginPath();
  ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawPowerUp(powerUp) {
  const powerUpTexture = getTransparentTexture('powerUps', assets.powerUps);
  const spriteReady = Boolean(powerUpTexture);
  const pulse = 1 + Math.sin(powerUp.phase) * 0.12;
  if (spriteReady) {
    const sourceX = powerUp.type === 'heart' || powerUp.type === 'life' ? 0 : powerUp.type === 'shield' ? 512 : 1024;
    const drawSize = 44 * pulse;
    ctx.save();
    ctx.translate(powerUp.x, powerUp.y);
    ctx.rotate(Math.sin(powerUp.phase * 0.5) * 0.08);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(powerUpTexture, sourceX, 256, 512, 512, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    ctx.restore();
    return;
  }

  ctx.fillStyle = '#4ade80';
  ctx.beginPath();
  ctx.arc(powerUp.x, powerUp.y, powerUp.radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawExplosion() {
  for (const effect of explosions) {
    const alpha = Math.max(0, effect.life / effect.maxLife);

    if (effect.glow) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillStyle = effect.color;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius * 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.globalAlpha = alpha;
    ctx.fillStyle = effect.color;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawBackground() {
  ctx.fillStyle = '#0a1528';
  ctx.fillRect(0, 0, width, height);

  const currentBackground = assets.backgrounds[state.backgroundIndex];
  const nextBackground = assets.backgrounds[(state.backgroundIndex + 1) % assets.backgrounds.length];
  const backgroundReady = currentBackground.complete && currentBackground.naturalWidth > 0;

  if (backgroundReady) {
    const backgroundHeight = currentBackground.naturalHeight * (width / currentBackground.naturalWidth);
    if (state.backgroundOffset >= backgroundHeight) {
      state.backgroundOffset -= backgroundHeight;
    }

    const backgroundY = state.backgroundOffset - backgroundHeight;
    const drawLoop = (image, alpha) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(image, 0, backgroundY, width, backgroundHeight);
      ctx.drawImage(image, 0, backgroundY + backgroundHeight, width, backgroundHeight);
      ctx.drawImage(image, 0, backgroundY + backgroundHeight * 2, width, backgroundHeight);
      ctx.restore();
    };

    drawLoop(currentBackground, 1);

    if (state.backgroundTransition > 0 && nextBackground.complete && nextBackground.naturalWidth > 0) {
      const transitionProgress = 1 - state.backgroundTransition / 2.4;
      drawLoop(nextBackground, transitionProgress);
    }
  }

  ctx.fillStyle = 'rgba(2, 6, 23, 0.28)';
  ctx.fillRect(0, 0, width, height);

  const starsTextureReady = assets.stars.complete && assets.stars.naturalWidth > 0;
  if (starsTextureReady) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.16;
    const starY = state.starOffset;
    ctx.drawImage(assets.stars, 0, starY, width, height);
    ctx.drawImage(assets.stars, 0, starY - height, width, height);
    ctx.restore();
  }

  for (const star of state.stars) {
    ctx.fillStyle = star.r > 2 ? 'rgba(125, 211, 252, 0.9)' : 'rgba(255,255,255,0.75)';
    ctx.fillRect(star.x, star.y, star.r, star.r * 2.4);
  }

}

function drawTentacleFrame() {
  if (assets.frame.complete && assets.frame.naturalWidth > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(assets.frame, 0, 0, assets.frame.naturalWidth, assets.frame.naturalHeight, 0, 0, width, height);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(20, 184, 166, 0.8)';
  ctx.shadowColor = 'rgba(45, 212, 191, 0.75)';
  ctx.shadowBlur = 10;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';

  for (const side of [-1, 1]) {
    const baseX = side < 0 ? 8 : width - 8;
    for (let index = 0; index < 3; index += 1) {
      const offset = index * 34;
      ctx.beginPath();
      ctx.moveTo(baseX, 80 + offset);
      ctx.bezierCurveTo(
        baseX + side * 18,
        112 + offset,
        baseX - side * 8,
        142 + offset,
        baseX + side * 20,
        174 + offset
      );
      ctx.bezierCurveTo(
        baseX + side * 42,
        204 + offset,
        baseX + side * 16,
        232 + offset,
        baseX + side * 28,
        260 + offset
      );
      ctx.stroke();
    }
  }

  ctx.strokeStyle = 'rgba(45, 212, 191, 0.45)';
  ctx.lineWidth = 2;
  ctx.shadowBlur = 0;
  ctx.strokeRect(4, 4, width - 8, height - 8);
  ctx.restore();
}

function drawLevelBadge() {
  if (!state.running) return;

  ctx.fillStyle = 'rgba(125, 211, 252, 0.12)';
  ctx.fillRect(20, 18, 155, 30);
  ctx.fillStyle = '#e0f2fe';
  ctx.font = 'bold 18px Hardpixel';
  ctx.textAlign = 'left';
  ctx.fillText(`Уровень ${state.level}`, 32, 40);
}

function drawNotice() {
  if (!state.notice || state.noticeTimer <= 0) return;

  ctx.fillStyle = 'rgba(8, 17, 31, 0.68)';
  ctx.fillRect(width / 2 - 150, 30, 300, 52);
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px Hardpixel';
  ctx.fillText(state.notice, width / 2, 62);
}

function drawReadyScreen() {
  ctx.fillStyle = 'rgba(3, 7, 18, 0.48)';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#e2e8f0';
  ctx.textAlign = 'center';
  ctx.font = 'bold 46px Hardpixel';
  ctx.fillText('Sky Dodge', width / 2, height / 2 - 90);

  ctx.font = '20px Hardpixel';
  ctx.fillText('Управление: A / D или стрелки', width / 2, height / 2 - 20);
  ctx.fillText('Пробел — выстрел', width / 2, height / 2 + 15);
  ctx.fillText('Нажмите любую клавишу, чтобы начать', width / 2, height / 2 + 52);
  ctx.fillText('Уровни генерируются бесконечно', width / 2, height / 2 + 92);
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(3, 7, 18, 0.6)';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#fca5a5';
  ctx.textAlign = 'center';
  ctx.font = 'bold 42px Hardpixel';
  ctx.fillText('Игра окончена', width / 2, height / 2 - 30);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '22px Hardpixel';
  ctx.fillText(`Финальный счёт: ${state.score}`, width / 2, height / 2 + 10);
  ctx.fillText('Нажмите Старт или Enter, чтобы сыграть снова', width / 2, height / 2 + 50);
}

function render() {
  ctx.save();
  drawBackground();
  drawLevelBadge();
  drawNotice();

  if (!state.running) {
    if (state.score > 0 || state.lives < 3) {
      drawGameOver();
    } else {
      drawReadyScreen();
    }
  }

  for (const bonus of powerUps) {
    drawPowerUp(bonus);
  }

  drawExplosion();

  for (const bullet of bullets) {
    drawBullet(bullet);
  }

  for (const enemy of enemies) {
    drawEnemy(enemy);
  }

  for (const plane of enemyPlanes) {
    drawEnemyPlane(plane);
  }

  for (const bullet of enemyBullets) {
    drawEnemyBullet(bullet);
  }

  drawShip();
  ctx.restore();
}

function gameLoop(timestamp) {
  const deltaSeconds = Math.min((timestamp - state.lastTime) / 1000 || 0.016, 0.032);
  state.lastTime = timestamp;

  if (state.running) {
    update(deltaSeconds);
  }

  render();
  requestAnimationFrame(gameLoop);
}

window.addEventListener('keydown', (event) => {
  if (!state.running) {
    if (event.repeat) return;
    startGame();
    return;
  }

  if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
    keys.left = true;
  }
  if (event.code === 'ArrowRight' || event.code === 'KeyD') {
    keys.right = true;
  }
  if (event.code === 'Space') {
    event.preventDefault();
    keys.shoot = true;
    shoot();
  }
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
    keys.left = false;
  }
  if (event.code === 'ArrowRight' || event.code === 'KeyD') {
    keys.right = false;
  }
  if (event.code === 'Space') {
    keys.shoot = false;
  }
});

startBtn.addEventListener('click', () => {
  startGame();
});

createStars();
resetGame();
requestAnimationFrame(gameLoop);
