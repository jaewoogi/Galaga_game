'use strict';
// Original procedural pixel sprites and synthesized audio. No ROM or external assets.
// Enhanced: faster stick response, capture pull-up anim + SFX, deadly side-exit challenge stages, richer Galaga-style SFX & graphics.
(() => {
const canvas = document.querySelector('#game'), ctx = canvas.getContext('2d');
const overlay = document.querySelector('#overlay'), msg = document.querySelector('#message'), start = document.querySelector('#start');
const W = 480, H = 640, keys = new Set();
const sprites = {
  ship: ['000010000','000121000','000121000','010121010','012121210','112121211','122222221','110121011','100010001'],
  bee: ['010000010','001000100','003303300','033333330','113333311','111333111','010333010','010101010'],
  butterfly: ['100000001','110000011','122101221','122212221','011222110','001222100','012101210','110000011'],
  boss: ['001000100','011101110','122222221','122121221','112222211','011222110','001111100','011000110','110000011']
};
const palettes = {
  ship: ['', '#e8f5ff', '#ef424f'],
  bee: ['', '#ffd34c', '#ed485b', '#58b7f5'],
  butterfly: ['', '#ec435d', '#7895ff'],
  boss: ['', '#44d99d', '#87f1d4']
};
function sprite(c, type, x, y, scale = 3, angle = 0, damaged = false) {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  const a = sprites[type], p = damaged ? ['', '#8990ff', '#d1aeff'] : palettes[type];
  for (let r = 0; r < a.length; r++)
    for (let q = 0; q < a[r].length; q++) {
      const v = +a[r][q];
      if (v) {
        c.fillStyle = p[v];
        c.fillRect((q - a[r].length / 2) * scale, (r - a.length / 2) * scale, scale, scale);
      }
    }
  c.restore();
}
document.querySelectorAll('[data-sprite]').forEach(c => sprite(c.getContext('2d'), c.dataset.sprite, 33, 24, 4));

let audio, muted = false;
function sound(f = 440, d = .08, type = 'square', slide = .5, vol = .045) {
  if (muted) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, audio.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), audio.currentTime + d);
    g.gain.setValueAtTime(vol, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, audio.currentTime + d);
    o.connect(g);
    g.connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + d);
  } catch {}
}
// Galaga-style multi-tone / arpeggio helpers
function soundSeq(notes, gap = .07, type = 'square', vol = .04) {
  if (muted) return;
  notes.forEach((n, i) => setTimeout(() => sound(n.f, n.d || .09, type, n.s || .6, vol), i * gap * 1000));
}
function captureSound() {
  // Distinctive rising-then-falling tractor + capture chirp (Galaga spirit)
  soundSeq([
    {f: 220, d: .12, s: 1.4},
    {f: 330, d: .14, s: 1.3},
    {f: 440, d: .16, s: 1.2},
    {f: 550, d: .18, s: .7},
    {f: 380, d: .22, s: .4},
    {f: 180, d: .28, s: .25}
  ], .09, 'sawtooth', .055);
  setTimeout(() => sound(90, .35, 'triangle', .3, .06), 420);
}
function dualSound() {
  soundSeq([{f: 520, d: .1}, {f: 660, d: .12}, {f: 880, d: .18, s: 1.1}], .08, 'triangle', .05);
}
function stageClearSound() {
  soundSeq([{f: 400, d: .1}, {f: 500, d: .1}, {f: 600, d: .12}, {f: 800, d: .2, s: 1.2}], .07, 'square', .045);
}
function dangerSound() {
  soundSeq([{f: 180, d: .15, s: .7}, {f: 140, d: .18, s: .5}, {f: 110, d: .25, s: .3}], .11, 'sawtooth', .05);
}

let best = 0;
try { best = Number(localStorage.getItem('galaga-best-v1')) || 0 } catch {}
let turbo = false, touchMode = 'stick', stickAxis = 0;
try {
  turbo = localStorage.getItem('galaga-turbo') === '1';
  touchMode = localStorage.getItem('galaga-touch-mode') || 'stick';
} catch {}

let state = 'title', score = 0, stage = 1, lives = 3, player, foes = [], shots = [], bullets = [], particles = [], trails = [], captured = null;
let clock = 0, stageTime = 0, fireTime = 0, attackTime = 0, clearTimer = 0, bonus = false, bonusHits = 0, extraAt = 20000;
let banner = '', bannerTime = 0, shake = 0, flash = 0;

const stars = Array.from({length: 140}, () => ({
  x: Math.random() * W,
  y: Math.random() * H,
  s: Math.random() * 2.1 + .25,
  color: ['#76b4d7', '#ebcf92', '#a971c1', '#66758b', '#9ad4ff', '#ffd6a8'][Math.floor(Math.random() * 6)],
  tw: Math.random() * Math.PI * 2
}));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function announce(t, d = 2) { banner = t; bannerTime = d; }
function newPlayer() {
  player = { x: 240, y: 575, dual: false, inv: 3, dead: 0, captAnim: 0, captY: 575 };
}
function wave() {
  foes = []; shots = []; bullets = []; trails = [];
  stageTime = 0; clearTimer = 0; attackTime = 4;
  bonus = stage % 4 === 3;
  bonusHits = 0;
  if (bonus) {
    announce('CHALLENGING STAGE', 2.7);
    stageClearSound();
  } else {
    announce(`STAGE ${stage}`, 2.7);
  }
  for (let i = 0; i < 40; i++) {
    let row = Math.floor(i / 8), col = i % 8;
    foes.push({
      id: i,
      type: row === 0 ? 'boss' : row < 3 ? 'butterfly' : 'bee',
      hp: row === 0 && !bonus ? 2 : 1,
      x: -50, y: -50,
      homeX: 93 + col * 42,
      homeY: 108 + row * 36,
      mode: 'waiting',
      delay: Math.floor(i / 8) * 1.15 + (i % 8) * .1,
      t: 0,
      side: i % 2 ? 1 : -1,
      shot: false,
      carry: false,
      angle: 0,
      diving: false
    });
  }
}
function begin() {
  score = 0; stage = 1; lives = 3; captured = null; particles = []; trails = [];
  extraAt = 20000; clock = 0; flash = 0;
  newPlayer();
  wave();
  state = 'play';
  overlay.hidden = true;
  document.querySelector('#pause').textContent = '일시정지';
  sound(440, .3, 'triangle', 2);
}
function addScore(n) {
  score += n;
  if (score > best) {
    best = score;
    try { localStorage.setItem('galaga-best-v1', String(best)) } catch {}
  }
  while (score >= extraAt) {
    lives++;
    extraAt += 70000;
    announce('EXTRA FIGHTER', 1.5);
    sound(880, .4, 'triangle', 2);
  }
}
function boom(x, y, color = '#ffc86b', count = 22) {
  shake = 4;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, v = Math.random() * 160 + 30;
    particles.push({
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      t: .55 + Math.random() * .4,
      color,
      s: 2 + Math.random() * 3
    });
  }
  sound(140, .17, 'sawtooth', .2);
}
function hurt() {
  if (player.inv > 0 || player.dead > 0 || player.captAnim > 0 || state !== 'play') return;
  boom(player.x, player.y);
  if (player.dual) {
    player.dual = false;
    player.inv = 2;
    return;
  }
  lives--;
  player.dead = 1.6;
  if (lives <= 0) {
    state = 'over';
    msg.textContent = `GAME OVER\n점수 ${score.toLocaleString()} · 스테이지 ${stage}`;
    start.innerHTML = '다시 출격 ↗';
    overlay.hidden = false;
  }
}
function hit(e) {
  e.hp--;
  if (e.hp > 0) {
    sound(240, .09);
    return;
  }
  e.mode = 'gone';
  boom(e.x, e.y, e.type === 'boss' ? '#62f5b2' : '#ffa45b', e.type === 'boss' ? 28 : 18);
  if (bonus) bonusHits++;
  addScore(bonus ? 100 : e.type === 'boss' ? (e.diving ? 400 : 150) : e.type === 'butterfly' ? (e.diving ? 160 : 80) : (e.diving ? 100 : 50));
  if (e.carry && captured) {
    if (e.diving) {
      player.dual = true;
      player.inv = 2;
      announce('DUAL FIGHTER!', 2);
      dualSound();
    } else {
      announce('CAPTURED FIGHTER LOST', 2);
    }
    captured = null;
  }
}
function fire() {
  if (player.dead > 0 || player.captAnim > 0 || shots.length >= (player.dual ? 4 : 2)) return;
  for (const dx of player.dual ? [-14, 14] : [0]) {
    shots.push({ x: player.x + dx, y: player.y - 15, trail: [] });
  }
  sound(turbo ? 1100 : 950, .065, 'square', .32);
}
function aim(e) {
  const dx = player.x - e.x, dy = player.y - e.y, l = Math.hypot(dx, dy) || 1;
  const v = 130 + Math.min(stage * 9, 85);
  bullets.push({ x: e.x, y: e.y, vx: dx / l * v, vy: dy / l * v });
}
function formation(e) {
  return {
    x: e.homeX + Math.sin(clock * .9) * 17,
    y: e.homeY + Math.sin(clock * 1.2) * 4
  };
}
function dive(e, tractor = false) {
  e.mode = tractor ? 'tractor' : 'dive';
  e.t = 0;
  e.sx = e.x;
  e.sy = e.y;
  e.target = player.x;
  e.shot = false;
  e.diving = true;
}
function update(dt) {
  clock += dt;
  stars.forEach(s => {
    s.y += s.s * 26 * dt;
    s.tw += dt * 3;
    if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
  });
  particles.forEach(p => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.t -= dt;
    p.vx *= 0.98;
    p.vy *= 0.98;
  });
  particles = particles.filter(p => p.t > 0);
  shake = Math.max(0, shake - dt * 14);
  flash = Math.max(0, flash - dt * 3);
  if (state !== 'play') return;
  stageTime += dt;
  bannerTime -= dt;
  player.inv -= dt;

  // Capture pull-up animation
  if (player.captAnim > 0) {
    player.captAnim -= dt;
    player.captY -= 95 * dt; // rise upward
    player.x += Math.sin(clock * 12) * 1.2; // slight wobble
    if (player.captAnim <= 0) {
      player.dead = 1.8;
      player.captY = 575;
      player.x = 240;
    }
    // still allow enemy updates below
  } else if (player.dead > 0) {
    player.dead -= dt;
    if (player.dead <= 0) {
      player.x = 240;
      player.inv = 3;
    }
  } else {
    // Faster, more responsive movement – stick especially sensitive
    let dir = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
    if (Math.abs(stickAxis) > 0.04) dir = stickAxis; // lower deadzone
    const speed = 380; // was 270 – noticeably snappier
    player.x = clamp(player.x + dir * speed * dt, player.dual ? 30 : 16, player.dual ? W - 30 : W - 16);
    fireTime -= dt;
    if (keys.has('Space') && fireTime <= 0) {
      fire();
      fireTime = turbo ? .12 : .17;
    }
  }

  for (const e of foes) {
    e.t += dt;
    if (e.mode === 'waiting') {
      if (stageTime >= e.delay) { e.mode = 'enter'; e.t = 0; }
      continue;
    }
    if (e.mode === 'gone') continue;
    const home = formation(e);

    if (e.mode === 'enter') {
      const t = e.t;
      if (bonus) {
        // Easy CHALLENGING STAGE: gentle left-right exit (not straight down)
        // Slow, high up, wide spacing – easy to hit, low collision risk
        const amp = 90 + t * 18;
        const freq = 1.1 + (e.id % 5) * 0.06;
        e.x = 240 + Math.sin(t * freq + e.id * 0.4) * amp + (t * 38 * e.side);
        e.y = 55 + Math.sin(t * 1.1 + e.id * 0.3) * 28 + Math.min(t * 12, 90);
        e.angle = Math.sin(t * 1.6) * 0.45;
        // Exit when far left/right (plenty of time to shoot)
        if (e.x < -70 || e.x > W + 70 || t > 7.5) e.mode = 'gone';
      } else {
        const p = clamp(t / 2.5, 0, 1), ease = 1 - Math.pow(1 - p, 2);
        e.x = (e.side < 0 ? -70 : 550) * (1 - ease) + home.x * ease + Math.sin(p * Math.PI * 2) * 95 * (1 - p);
        e.y = -40 + (home.y + 40) * ease + Math.sin(p * Math.PI) * 180;
        e.angle = Math.cos(p * Math.PI * 2) * (1 - p);
        if (p === 1) { e.mode = 'formation'; e.angle = 0; e.diving = false; }
      }
    } else if (e.mode === 'formation') {
      e.x = home.x;
      e.y = home.y;
      e.angle = 0;
    } else if (e.mode === 'dive') {
      const t = e.t;
      const speed = 125 + Math.min(stage * 5, 65);
      e.y = e.sy + t * speed;
      e.x = clamp(e.sx + (e.target - e.sx) * Math.min(t / 2, 1) + Math.sin(t * 3) * 65, 18, W - 18);
      e.angle = Math.sin(t * 3) * .7;
      if (!e.shot && t > 1.2 && !bonus) { aim(e); e.shot = true; }
      if (e.y > H + 35) { e.mode = 'return'; e.t = 0; e.x = home.x; e.y = -35; }
    } else if (e.mode === 'return') {
      e.y += 160 * dt;
      e.angle = 0;
      if (e.y >= home.y) { e.mode = 'formation'; e.diving = false; }
    } else if (e.mode === 'tractor') {
      e.angle = 0;
      const p = Math.min(e.t / 1.2, 1);
      e.x = e.sx + (e.target - e.sx) * p;
      e.y = e.sy + (330 - e.sy) * p;
      if (e.t > 1.5 && e.t < 4.7 && !player.dual && player.dead <= 0 && player.captAnim <= 0 &&
          Math.abs(player.x - e.x) < 31 && lives > 1 && !captured) {
        // Start capture sequence
        captured = { boss: e.id };
        e.carry = true;
        lives--;
        player.captAnim = 1.35; // pull-up duration
        player.captY = player.y;
        boom(player.x, player.y, '#66f2f7', 16);
        flash = 0.7;
        announce('FIGHTER CAPTURED!', 2.2);
        captureSound();
      }
      if (e.t > 5.3) {
        e.mode = 'return';
        e.y = -30;
        e.diving = false;
      }
    }
    // Collision (also active during danger stage pass-by)
    if (e.mode !== 'gone' && player.captAnim <= 0 && player.dead <= 0 &&
        Math.abs(e.x - player.x) < (player.dual ? 36 : 22) && Math.abs(e.y - player.y) < 22) {
      hurt();
    }
  }

  attackTime -= dt;
  if (!bonus && attackTime <= 0) {
    const pool = foes.filter(e => e.mode === 'formation');
    if (pool.length) {
      const carrier = pool.find(e => e.carry);
      const boss = pool.find(e => e.type === 'boss');
      const e = carrier || ((!captured && !player.dual && lives > 1 && Math.random() < .35) ? boss : null) || pool[Math.floor(Math.random() * pool.length)];
      dive(e, !e.carry && e.type === 'boss' && !captured && !player.dual && lives > 1 && Math.random() < .55);
    }
    attackTime = Math.max(.5, 1.8 - stage * .08);
  }

  // Shots + trails
  for (const s of shots) {
    s.y -= (turbo ? 860 : 480) * dt;
    s.trail.push({ x: s.x, y: s.y, t: .12 });
    s.trail = s.trail.filter(tr => (tr.t -= dt) > 0);
    for (const e of foes) {
      if (!['gone', 'waiting'].includes(e.mode) && Math.abs(s.x - e.x) < 16 && Math.abs(s.y - e.y) < 15) {
        hit(e);
        s.y = -100;
        break;
      }
    }
  }
  shots = shots.filter(s => s.y > -20);

  for (const b of bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (player.dead <= 0 && player.captAnim <= 0 &&
        Math.abs(b.x - player.x) < (player.dual ? 29 : 10) && Math.abs(b.y - player.y) < 12) {
      hurt();
      b.y = H + 20;
    }
  }
  bullets = bullets.filter(b => b.y < H + 10 && b.x > -10 && b.x < W + 10);

  if (foes.every(e => e.mode === 'gone')) {
    if (clearTimer === 0) {
      clearTimer = 3.5;
      if (bonus) {
        const reward = bonusHits === 40 ? 10000 : bonusHits * 100;
        addScore(reward);
        announce(`${bonusHits === 40 ? 'PERFECT!' : `HITS ${bonusHits} / 40`}  BONUS ${reward}`, 3.4);
        stageClearSound();
      } else {
        announce('STAGE CLEAR', 2);
        stageClearSound();
      }
    } else {
      clearTimer -= dt;
      if (clearTimer <= 0) {
        stage++;
        wave();
      }
    }
  }
}

function label(text, x, y, color = '#eff4fc', size = 16, align = 'center') {
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px monospace`;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}

function draw() {
  // Background
  ctx.fillStyle = '#010207';
  ctx.fillRect(0, 0, W, H);

  // Subtle radial vignette flash on capture
  if (flash > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 320);
    g.addColorStop(0, `rgba(80, 230, 255, ${flash * 0.25})`);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.save();
  if (shake) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  // Richer starfield
  for (const s of stars) {
    const a = 0.35 + Math.sin(s.tw) * 0.35 + (s.s > 1.4 ? 0.2 : 0);
    ctx.globalAlpha = clamp(a, 0.15, 1);
    ctx.fillStyle = s.color;
    const sz = s.s > 1.5 ? 2.2 : s.s > 1 ? 1.5 : 1;
    ctx.fillRect(s.x, s.y, sz, sz);
    if (s.s > 1.6) {
      ctx.globalAlpha = a * 0.4;
      ctx.fillRect(s.x - 1, s.y, sz + 2, 1);
    }
  }
  ctx.globalAlpha = 1;

  // HUD
  label('1UP', 56, 25, '#ef565e', 15);
  label(String(score).padStart(6, '0'), 56, 47);
  label('HIGH SCORE', 240, 25, '#ef565e', 15);
  label(String(best).padStart(6, '0'), 240, 47);
  label(`STAGE ${stage}`, 422, 25, '#f9cc69', 14);
  label(bonus ? 'BONUS' : 'READY', 422, 46, bonus ? '#70edeb' : '#94a3b8', 12);

  if (state === 'title') {
    for (let i = 0; i < 24; i++)
      sprite(ctx, i < 8 ? 'boss' : i < 16 ? 'butterfly' : 'bee', 92 + (i % 8) * 42, 110 + Math.floor(i / 8) * 38, 2.7);
    sprite(ctx, 'ship', 240, 575, 3);
  } else {
    // Enemies + tractor beam
    for (const e of foes) {
      if (['gone', 'waiting'].includes(e.mode)) continue;
      if (e.mode === 'tractor' && e.t > 1.5 && e.t < 4.7) {
        ctx.fillStyle = `rgba(55, 224, 211, ${0.12 + Math.sin(clock * 22) * 0.04})`;
        ctx.beginPath();
        ctx.moveTo(e.x - 8, e.y + 10);
        ctx.lineTo(e.x - 58, 600);
        ctx.lineTo(e.x + 58, 600);
        ctx.lineTo(e.x + 8, e.y + 10);
        ctx.fill();
        ctx.strokeStyle = '#4dc4d0aa';
        ctx.lineWidth = 1.5;
        for (let y = e.y + 18 + (clock * 70) % 22; y < 600; y += 22) {
          ctx.beginPath();
          ctx.moveTo(e.x - (y - e.y) * 0.18, y);
          ctx.lineTo(e.x + (y - e.y) * 0.18, y);
          ctx.stroke();
        }
        ctx.lineWidth = 1;
      }
      sprite(ctx, e.type, e.x, e.y, 3, e.angle, e.type === 'boss' && e.hp === 1);
      if (e.carry) sprite(ctx, 'ship', e.x, e.y - 30, 2.7, Math.PI);
    }

    // Player (normal / dual / being captured)
    if (player) {
      if (player.captAnim > 0) {
        // Rising captured ship with trail
        const alpha = clamp(player.captAnim * 1.4, 0.3, 1);
        ctx.globalAlpha = alpha;
        for (let i = 0; i < 4; i++) {
          ctx.globalAlpha = alpha * (0.25 - i * 0.05);
          sprite(ctx, 'ship', player.x, player.captY + i * 14, 2.6 - i * 0.15, Math.sin(clock * 10) * 0.15);
        }
        ctx.globalAlpha = alpha;
        sprite(ctx, 'ship', player.x, player.captY, 3, Math.sin(clock * 9) * 0.2);
        ctx.globalAlpha = 1;
      } else if (player.dead <= 0 && (player.inv <= 0 || Math.floor(clock * 12) % 2 === 0)) {
        for (const dx of player.dual ? [-14, 14] : [0])
          sprite(ctx, 'ship', player.x + dx, player.y, 3);
      }
    }

    // Shot trails + shots
    for (const s of shots) {
      for (const tr of s.trail) {
        ctx.globalAlpha = tr.t * 6;
        ctx.fillStyle = '#fff8b0';
        ctx.fillRect(tr.x - 1.5, tr.y, 3, 6);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#faf2a0';
      ctx.fillRect(s.x - 2, s.y - 9, 4, 13);
      // bright tip
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(s.x - 1, s.y - 11, 2, 4);
    }
    ctx.fillStyle = '#fa7a88';
    bullets.forEach(b => {
      ctx.fillRect(b.x - 2, b.y - 4, 4, 9);
      ctx.fillStyle = '#ffb0b8';
      ctx.fillRect(b.x - 1, b.y - 5, 2, 3);
      ctx.fillStyle = '#fa7a88';
    });
  }

  // Particles
  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.t * 2.2);
    ctx.fillStyle = p.color;
    const sz = p.s || 3;
    ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
  }
  ctx.globalAlpha = 1;

  // Lives + level
  for (let i = 0; i < Math.min(6, Math.max(0, lives - 1)); i++)
    sprite(ctx, 'ship', 22 + i * 25, 621, 1.8);
  if (lives > 7) label(`+${lives - 7}`, 185, 626, '#fff', 12);
  label(`LEVEL ${String(stage).padStart(2, '0')}`, W - 18, 626, '#f7cc62', 12, 'right');

  if (bannerTime > 0 && state === 'play') {
    const big = banner.length > 22;
    label(banner, 240, 385, '#70edeb', big ? 15 : 20);
  }
  ctx.restore();
}

function pause() {
  if (state === 'play') {
    state = 'paused';
    msg.textContent = 'PAUSED\n잠시 쉬어도 괜찮습니다.';
    start.textContent = '계속하기 ↗';
    overlay.hidden = false;
    keys.clear();
    document.querySelector('#pause').textContent = '계속하기';
  } else if (state === 'paused') {
    state = 'play';
    overlay.hidden = true;
    document.querySelector('#pause').textContent = '일시정지';
  }
}
function toggleSound() {
  muted = !muted;
  document.querySelector('#sound').textContent = `사운드 ${muted ? 'OFF' : 'ON'}`;
  document.querySelector('#sound').setAttribute('aria-pressed', String(!muted));
  if (!muted) sound();
}

start.onclick = () => state === 'paused' ? pause() : begin();
document.querySelector('#pause').onclick = pause;
document.querySelector('#sound').onclick = toggleSound;

const turboButton = document.querySelector('#turbo'),
      touchNav = document.querySelector('.touch'),
      stick = document.querySelector('#joystick'),
      knob = document.querySelector('#stick-knob');

function syncControls() {
  turboButton.textContent = `TURBO ${turbo ? 'ON' : 'OFF'}`;
  turboButton.setAttribute('aria-pressed', String(turbo));
  touchNav.classList.toggle('stick-mode', touchMode === 'stick');
  touchNav.classList.toggle('buttons-mode', touchMode === 'buttons');
  document.querySelector('#mode-stick').setAttribute('aria-pressed', String(touchMode === 'stick'));
  document.querySelector('#mode-buttons').setAttribute('aria-pressed', String(touchMode === 'buttons'));
}
function setMode(mode) {
  touchMode = mode;
  stickAxis = 0;
  knob.style.transform = 'translateX(0px)';
  keys.delete('ArrowLeft');
  keys.delete('ArrowRight');
  try { localStorage.setItem('galaga-touch-mode', mode) } catch {}
  syncControls();
}
turboButton.onclick = () => {
  turbo = !turbo;
  try { localStorage.setItem('galaga-turbo', turbo ? '1' : '0') } catch {}
  syncControls();
  sound(turbo ? 1050 : 420, .12, 'square', .8);
};
document.querySelector('#mode-stick').onclick = () => setMode('stick');
document.querySelector('#mode-buttons').onclick = () => setMode('buttons');
syncControls();

// High-sensitivity joystick – reaches full axis quickly
let stickPointer = null;
function moveStick(e) {
  if (stickPointer !== e.pointerId) return;
  const r = stick.getBoundingClientRect(),
        center = r.left + r.width / 2,
        limit = (r.width - 52) / 2;
  // Amplify so small finger movement hits ±1 faster (more responsive)
  const raw = (e.clientX - center) / limit;
  stickAxis = clamp(raw * 1.75, -1, 1); // 1.75× sensitivity
  const visual = clamp(raw, -1, 1); // visual knob still within track
  knob.style.transform = `translateX(${visual * limit}px)`;
}
stick.addEventListener('pointerdown', e => {
  e.preventDefault();
  stickPointer = e.pointerId;
  stick.setPointerCapture(e.pointerId);
  moveStick(e);
});
stick.addEventListener('pointermove', moveStick);
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
  stick.addEventListener(event, e => {
    if (stickPointer === e.pointerId) {
      stickPointer = null;
      stickAxis = 0;
      knob.style.transform = 'translateX(0px)';
    }
  });

window.addEventListener('keydown', e => {
  if (['Space', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.code)) e.preventDefault();
  if (e.repeat) { keys.add(e.code); return; }
  if (e.code === 'Enter' && (state === 'title' || state === 'over')) begin();
  else if (e.code === 'KeyP' || e.code === 'Escape') pause();
  else if (e.code === 'KeyM') toggleSound();
  keys.add(e.code);
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => {
  keys.clear();
  stickAxis = 0;
  knob.style.transform = 'translateX(0px)';
  if (state === 'play') pause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'play') pause();
});

for (const [id, key] of [['left', 'ArrowLeft'], ['right', 'ArrowRight'], ['fire', 'Space']]) {
  const b = document.querySelector('#' + id);
  b.addEventListener('pointerdown', e => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    keys.add(key);
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
    b.addEventListener(event, () => keys.delete(key));
}

let drag = false;
canvas.addEventListener('pointerdown', e => {
  if (state !== 'play') return;
  drag = true;
  canvas.setPointerCapture(e.pointerId);
  move(e);
  keys.add('Space');
});
function move(e) {
  if (!drag || !player || player.captAnim > 0) return;
  const r = canvas.getBoundingClientRect();
  player.x = clamp((e.clientX - r.left) / r.width * W, player.dual ? 30 : 16, player.dual ? W - 30 : W - 16);
}
canvas.addEventListener('pointermove', move);
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
  canvas.addEventListener(event, () => { drag = false; keys.delete('Space'); });

let last = 0;
function frame(t) {
  const dt = Math.min((t - last) / 1000 || 0, .04);
  last = t;
  if (state !== 'paused') update(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
