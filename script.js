(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const stage = $('#stage'), mascot = $('#mascot'), tilt = $('.tilt');
  const eyeL = $('.eye.l'), eyeR = $('.eye.r');
  const shadow = $('#shadow'), floorEl = $('#floor'), bubble = $('#bubble'), zzz = $('#zzz');
  const moodLabel = $('#moodLabel'), dock = $('#dock'), movesEl = $('#moods');
  const sizeInput = $('#size');

  const BASE_W = 160, BASE_H = 264, EYE_CY = 58; // centro de los ojos desde el tope
  const GRAVITY = 2600;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerpExp = (c, t, rate, dt) => c + (t - c) * (1 - Math.exp(-rate * dt));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  const LABELS = { neutral: 'Normal', happy: 'Feliz', sad: 'Triste', angry: 'Enojado', surprised: 'Sorprendido', wink: 'Guiño', love: 'Enamorado', sleep: 'Dormido', dizzy: 'Mareado' };
  const PRI = { neutral: 0, happy: 1, wink: 1, love: 1, sad: 1, surprised: 2, angry: 2, dizzy: 3, sleep: 4 };
  const PHRASES = {
    happy: ['¡Qué buena deducción! 🎉', '¡Vamos que sí!', 'Cada boleta cuenta 🧾'],
    sad: ['Se me perdió una boleta… 🥲', 'Hoy no cuadró el mes'],
    angry: ['¡Esa boleta no está registrada! 😠', '¡Cuidado con los gastos hormiga!'],
    surprised: ['¿¡Gastaste todo eso!? 😮', '¡Ups! No me lo esperaba'],
    wink: ['Te tengo un dato 😉', 'Psst… eso también se deduce'],
    love: ['¡Me encanta ahorrar! 💙', 'Contigo todo cuadra 💙'],
    sleep: ['zzz… 💤'],
    dizzy: ['Todo me da vueltas 😵‍💫']
  };
  const TIPS = ['¿Ya registraste tu gasto de hoy?', 'Guarda tus boletas, yo no me olvido 🧾', 'Dedúcelo. Así de simple.', 'Escanea y listo 📸', 'Tu alquiler también cuenta 🏠', 'Revisa tus gastos hormiga 🐜'];
  const CLICK_PHRASES = ['¡Hola! 👋', '¡Dedúcelo! 💸', '¡Eso hizo cosquillas!', 'Registrado ✅', '¡Vamos! 🚀', '¿Otra boleta?'];

  const now0 = performance.now();
  const S = {
    w: innerWidth, h: innerHeight, floor: 0,
    x: innerWidth / 2, y: -BASE_H, vx: 0, vy: 0,
    size: 1, gravity: true, chase: false, sound: false,
    dragging: false, grab: { x: 0, y: 0 }, grounded: false,
    mouse: { x: innerWidth / 2, y: innerHeight / 3, speed: 0, t: now0 },
    look: { x: 0, y: 0 }, head: { x: 0, y: 0 }, curio: 0,
    sq: 0, sqv: 0, ang: 0, angv: 0,
    mood: 'neutral', moodUntil: 0,
    sleeping: false, sleepStart: 0, sleepTravel: 0,
    blinks: [], nextBlink: now0 + 1500,
    wander: { x: 0, y: 0 }, wanderNext: 0,
    lastMove: now0, lastInput: now0, nextChat: now0 + 14000, nextHop: now0 + 9000, chaseCd: 0,
    clicks: [], shakes: [], dizzyCd: 0, surpriseCd: 0, intro: true,
    down: null
  };

  /* ───────── Audio ───────── */
  let ac;
  function tone(f0, f1, dur, type = 'sine', vol = 0.07) {
    if (!S.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ac.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (_) { /* sin audio */ }
  }

  /* ───────── Texto ───────── */
  let bubbleTimer;
  function say(text, ms = 2600) {
    const span = bubble.firstElementChild;
    span.textContent = text;
    bubble.classList.remove('show');
    void bubble.offsetWidth;
    bubble.classList.add('show');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.classList.remove('show'), ms);
  }

  /* ───────── Estados de ánimo ───────── */
  function renderMood() {
    mascot.dataset.mood = S.mood;
    moodLabel.textContent = LABELS[S.mood];
    document.querySelectorAll('#moods .chip').forEach(b => b.classList.toggle('active', b.dataset.mood === S.mood));
  }
  function setMood(name, ms = 0, force = false) {
    const now = performance.now();
    if (S.sleeping && name !== 'sleep') return;
    const active = S.mood !== 'neutral' && (S.moodUntil === 0 || S.moodUntil > now);
    if (!force && active && PRI[name] < PRI[S.mood]) return;
    S.mood = name;
    S.moodUntil = ms ? now + ms : 0;
    if (name === 'sleep') { S.sleeping = true; S.sleepStart = now; S.sleepTravel = 0; }
    if (name === 'love') burst('♥', 'heart', 7, faceX(), faceY(), 0.8);
    renderMood();
  }
  function tickMood(now) {
    if (S.moodUntil && now > S.moodUntil) { S.moodUntil = 0; S.mood = 'neutral'; renderMood(); }
  }
  function wake(quiet) {
    if (!S.sleeping) return false;
    S.sleeping = false; S.sleepTravel = 0;
    setMood('surprised', 800, true);
    startBlink();
    if (!quiet) { say('¡Ay! ¿Ya es hora de deducir? 😳'); jump(0.5); }
    return true;
  }

  /* ───────── Parpadeo ───────── */
  function startBlink(double = false) {
    const t = performance.now();
    S.blinks.push(t);
    if (double) S.blinks.push(t + 230);
  }
  function blinkValue(now) {
    let v = 1;
    S.blinks = S.blinks.filter(s => now - s < 140);
    for (const s of S.blinks) {
      const e = (now - s) / 140;
      if (e >= 0) v = Math.min(v, 1 - 0.94 * Math.sin(Math.PI * e));
    }
    return v;
  }

  /* ───────── Partículas ───────── */
  const faceX = () => S.x;
  const faceY = () => S.y - (BASE_H - EYE_CY) * S.size;

  function fx(cls, text, x, y) {
    const el = document.createElement('div');
    el.className = 'fx ' + cls;
    if (text) el.textContent = text;
    el.style.transform = `translate(${x}px,${y}px)`;
    stage.appendChild(el);
    return el;
  }
  function burst(text, cls, n, px, py, power = 1) {
    for (let i = 0; i < n; i++) {
      const el = fx(cls, text, px, py);
      const dx = rand(-110, 110) * power, up = rand(60, 150) * power, fall = rand(40, 120);
      const a = el.animate([
        { transform: `translate(${px}px,${py}px) scale(.5)`, opacity: 1 },
        { transform: `translate(${px + dx * 0.6}px,${py - up}px) scale(1) rotate(${rand(-30, 30)}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${px + dx}px,${py + fall}px) scale(.8)`, opacity: 0 }
      ], { duration: rand(800, 1200), easing: 'ease-out' });
      a.onfinish = () => el.remove();
    }
  }
  function dust(x, y, power) {
    const n = clamp(Math.round(power / 250), 3, 9);
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1;
      const el = fx('dust', '', x, y - 6);
      const dx = dir * rand(30, 90) * (S.size + 0.3);
      const a = el.animate([
        { transform: `translate(${x}px,${y - 6}px) scale(.6)`, opacity: .8 },
        { transform: `translate(${x + dx}px,${y - rand(8, 30)}px) scale(${rand(1.2, 2)})`, opacity: 0 }
      ], { duration: rand(400, 700), easing: 'ease-out' });
      a.onfinish = () => el.remove();
    }
  }
  function ripple(x, y) {
    const el = fx('ripple', '', x, y);
    const a = el.animate([
      { transform: `translate(${x}px,${y}px) scale(.1)`, opacity: .8 },
      { transform: `translate(${x}px,${y}px) scale(1)`, opacity: 0 }
    ], { duration: 550, easing: 'ease-out' });
    a.onfinish = () => el.remove();
  }

  /* ───────── Acciones ───────── */
  function jump(p = 1) {
    if (S.dragging) return;
    S.sq = -0.28; S.sqv = 0;
    setTimeout(() => {
      if (S.dragging) return;
      S.vy = -(S.gravity ? 980 : 560) * p;
      S.grounded = false;
      tone(300, 760, 0.15, 'square', 0.05);
    }, 90);
  }
  function hopTo(tx, ty) {
    if (S.dragging || wake(true)) { /* despierta en silencio y sigue */ }
    S.sq = -0.28; S.sqv = 0;
    say('¡Voy! 🏃', 1400);
    setTimeout(() => {
      if (S.gravity) {
        S.vy = -980;
        S.vx = clamp((tx - S.x) / 0.75, -1400, 1400);
      } else {
        S.vx = (tx - S.x) * 2.2;
        S.vy = (ty + BASE_H * S.size * 0.5 - S.y) * 2.2;
      }
      S.grounded = false;
      tone(300, 760, 0.15, 'square', 0.05);
    }, 90);
  }
  function onLand(impact) {
    S.sq = -clamp(impact * 0.00022, 0.08, 0.42); S.sqv = 0;
    S.angv += rand(-1, 1) * impact * 0.01;
    dust(S.x, S.floor, impact);
    tone(150, 55, 0.18, 'sine', 0.12);
    if (S.intro) { S.intro = false; startBlink(); setMood('happy', 1800, true); say('¡Hola! Soy la mascota de Dedúcelo 👋', 3500); return; }
    if (impact > 1700) { setMood('dizzy', 1500, true); say('¡Auch! 😵'); }
    else if (impact > 700) startBlink();
  }
  function onClick() {
    const now = performance.now();
    S.clicks = S.clicks.filter(t => now - t < 2000); S.clicks.push(now);
    if (S.clicks.length >= 5) {
      S.clicks = [];
      setMood('angry', 2500, true); say('¡Ya, ya! Un poco de calma 😠');
      tone(220, 110, 0.3, 'sawtooth', 0.05);
      return;
    }
    const r = Math.random();
    if (r < 0.4) { setMood('happy', 1500, true); burst('S/', 'coin', 6, faceX(), faceY(), 1); tone(880, 1320, 0.14, 'triangle', 0.08); }
    else if (r < 0.7) { setMood('wink', 1500, true); }
    else if (r < 0.85) { setMood('love', 1800, true); }
    else { setMood('surprised', 900, true); }
    say(pick(CLICK_PHRASES), 1800);
    jump(0.8);
  }
  function reset() {
    wake(true);
    S.x = S.w / 2; S.y = -BASE_H * S.size; S.vx = S.vy = 0;
    S.intro = true; setMood('neutral', 0, true);
  }

  /* ───────── Ojos: objetivo de mirada ───────── */
  function lookTarget(now) {
    if (S.sleeping) return { x: 0, y: 0.5 };
    if (S.dragging) return { x: clamp(S.vx / 1200, -1, 1), y: clamp(-0.35 + S.vy / 2500, -1, 0.6) };
    if (now - S.lastMove > 3500) return S.wander;
    const dx = S.mouse.x - faceX(), dy = S.mouse.y - faceY();
    S.curio = Math.hypot(dx, dy) < 240 ? 1 : 0;
    return { x: Math.tanh(dx / 260), y: Math.tanh(dy / 260) };
  }

  /* ───────── Comportamientos automáticos ───────── */
  function auto(now) {
    if (!S.sleeping && now > S.nextBlink) { startBlink(Math.random() < 0.22); S.nextBlink = now + rand(1800, 5200); }
    if (now - S.lastMove > 3500 && !S.dragging && !S.sleeping && now > S.wanderNext) {
      S.wander = Math.random() < 0.25 ? { x: 0, y: 0 } : { x: rand(-1, 1), y: rand(-0.7, 0.8) };
      S.wanderNext = now + rand(1100, 2800);
      if (Math.random() < 0.3) startBlink();
    }
    if (!S.sleeping && !S.dragging && now - S.lastInput > 30000) { setMood('sleep', 0, true); say('zzz… 💤', 2500); }
    if (!S.sleeping && !S.dragging && now > S.nextChat) { say(pick(TIPS), 3000); S.nextChat = now + rand(16000, 28000); }
    if (!S.sleeping && !S.dragging && !S.chase && S.gravity && S.grounded && now > S.nextHop) {
      jump(0.5); S.nextHop = now + rand(8000, 14000);
    }
  }

  /* ───────── Física ───────── */
  function physics(dt) {
    const W = BASE_W * S.size, H = BASE_H * S.size;
    const minX = W / 2, maxX = S.w - W / 2;

    if (S.dragging) {
      const nx = lerpExp(S.x, S.mouse.x - S.grab.x, 28, dt);
      const ny = lerpExp(S.y, S.mouse.y - S.grab.y, 28, dt);
      S.vx = lerpExp(S.vx, (nx - S.x) / dt, 18, dt);
      S.vy = lerpExp(S.vy, (ny - S.y) / dt, 18, dt);
      S.x = clamp(nx, minX, maxX);
      S.y = clamp(ny, H, S.h);
      S.grounded = false;
      return;
    }

    // seguir con el cuerpo
    if (S.chase && !S.sleeping) {
      S.chaseCd -= dt;
      if (S.gravity) {
        const dx = S.mouse.x - S.x;
        if (S.grounded && S.chaseCd <= 0) {
          if (Math.abs(dx) > 100) { S.vy = -560; S.vx = clamp(dx * 1.6, -420, 420); S.sq = -0.2; S.chaseCd = 0.45; S.grounded = false; tone(400, 600, 0.08, 'square', 0.03); }
          else if (S.mouse.y < faceY() - 200) { S.vy = -1000; S.chaseCd = 1; S.sq = -0.28; S.grounded = false; }
        }
      } else {
        const side = S.mouse.x < S.w / 2 ? 1 : -1;
        const tx = S.mouse.x + side * W * 0.9, ty = S.mouse.y + H * 0.5;
        S.vx = lerpExp(S.vx, (tx - S.x) * 3, 4, dt);
        S.vy = lerpExp(S.vy, (ty - S.y) * 3, 4, dt);
      }
    }

    if (S.gravity) {
      S.vy += GRAVITY * dt;
      S.vx *= Math.exp(-dt * (S.grounded ? 7 : 0.3));
    } else {
      if (!S.chase) { S.vx *= Math.exp(-dt * 1.6); S.vy *= Math.exp(-dt * 1.6); }
    }
    S.x += S.vx * dt; S.y += S.vy * dt;

    if (S.x < minX) { S.x = minX; S.vx = Math.abs(S.vx) * 0.6; S.angv += 30; }
    if (S.x > maxX) { S.x = maxX; S.vx = -Math.abs(S.vx) * 0.6; S.angv -= 30; }
    if (S.y < H) { S.y = H; S.vy = Math.abs(S.vy) * 0.5; }
    if (S.y >= S.floor) {
      const impact = S.vy;
      S.y = S.floor;
      if (S.gravity && impact > 260) {
        onLand(impact);
        S.vy = -impact * 0.28;
        if (S.vy > -120) S.vy = 0;
      } else if (S.gravity) S.vy = 0;
      else if (impact > 100) S.vy = -impact * 0.5;
    }
    S.grounded = S.gravity && S.y >= S.floor - 0.5 && S.vy === 0;
  }

  /* ───────── Render ───────── */
  function render(now, dt) {
    const size = S.size, H = BASE_H * size;
    const t = now / 1000;

    // mirada
    const lt = lookTarget(now);
    S.look.x = lerpExp(S.look.x, lt.x, 14, dt); S.look.y = lerpExp(S.look.y, lt.y, 14, dt);
    S.head.x = lerpExp(S.head.x, lt.x, 5, dt); S.head.y = lerpExp(S.head.y, lt.y, 5, dt);
    const ex = S.look.x > 0 ? S.look.x * 16 : S.look.x * 28;
    const ey = S.look.y > 0 ? S.look.y * 44 : S.look.y * 18;
    const esx = 1 - Math.abs(S.look.x) * 0.12;
    S.curioS = lerpExp(S.curioS || 0, S.curio, 8, dt);
    const esy = 1 + 0.1 * S.curioS;
    const noBlink = S.sleeping || ['happy', 'love', 'dizzy', 'wink'].includes(S.mood);
    const bl = noBlink ? 1 : blinkValue(now);
    const eT = `translate(${ex}px,${ey}px) scale(${esx},${esy * bl})`;
    eyeL.style.transform = eT; eyeR.style.transform = eT;

    // cabeza 3D
    tilt.style.transform = `perspective(700px) rotateY(${S.head.x * 20}deg) rotateX(${-S.head.y * 12}deg)`;

    // resortes: squash & stretch y ángulo
    const airborne = !S.dragging && !S.grounded;
    const sTarget = airborne ? clamp(Math.abs(S.vy) * 0.00014, 0, 0.3) : 0;
    S.sqv += ((sTarget - S.sq) * 260 - S.sqv * 15) * dt; S.sq += S.sqv * dt;
    const aT = clamp(S.vx * 0.018, -20, 20) * (S.dragging || airborne ? 1 : 0.2) + (S.sleeping ? 5 : 0);
    S.angv += ((aT - S.ang) * 140 - S.angv * 10) * dt; S.ang += S.angv * dt;

    // respiración y flotación
    const br = Math.sin(t * (S.sleeping ? 1.4 : 2.4)) * (S.sleeping ? 0.025 : 0.012);
    const bob = !S.gravity && !S.dragging ? Math.sin(t * 2) * 8 : 0;
    const sy = size * (1 + S.sq + br), sx = size * (1 - S.sq * 0.7 - br * 0.6);
    mascot.style.transform = `translate(${S.x - BASE_W / 2}px,${S.y - BASE_H + bob}px) rotate(${S.ang}deg) scale(${sx},${sy})`;

    // sombra
    const air = Math.max(0, S.floor - S.y - bob), k = 1 / (1 + air / 260);
    shadow.style.transform = `translate(${S.x - 90}px,${S.floor - 14}px) scale(${size * k * 1.05},${k})`;
    shadow.style.opacity = 0.35 + 0.65 * k;

    // globo y zzz
    const topY = S.y - H * (1 + S.sq) + bob;
    bubble.style.transform = `translate(${clamp(S.x, 130, S.w - 130)}px,${Math.max(70, topY - 16)}px) translate(-50%,-100%)`;
    zzz.style.transform = `translate(${S.x + 40 * size}px,${topY + 20}px)`;
    zzz.classList.toggle('on', S.sleeping);
  }

  /* ───────── Bucle ───────── */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, Math.max(0.001, (now - last) / 1000));
    last = now;
    tickMood(now); auto(now); physics(dt); render(now, dt);
    requestAnimationFrame(frame);
  }

  /* ───────── Entrada ───────── */
  const onMascot = e => !!e.target.closest('#mascot');

  window.addEventListener('pointermove', e => {
    const now = performance.now();
    const dx = e.clientX - S.mouse.x, dy = e.clientY - S.mouse.y;
    const dtm = Math.max(1, now - S.mouse.t) / 1000;
    S.mouse.speed = Math.hypot(dx, dy) / dtm;
    S.mouse.x = e.clientX; S.mouse.y = e.clientY; S.mouse.t = now;
    S.lastMove = S.lastInput = now;

    if (S.sleeping && now - S.sleepStart > 1200) {
      S.sleepTravel += Math.hypot(dx, dy);
      if (S.sleepTravel > 180) wake();
    }
    if (S.down && !S.down.moved && Math.hypot(e.clientX - S.down.x, e.clientY - S.down.y) > 6) {
      S.down.moved = true; setMood('surprised', 0, true); tone(500, 800, 0.1, 'triangle', 0.05);
    }
    if (S.dragging && S.down && S.down.moved) {
      // detectar sacudidas rápidas
      if (Math.abs(dx) > 8 && Math.sign(dx) !== Math.sign(S.lastDx || 0)) {
        S.shakes = S.shakes.filter(t => now - t < 900); S.shakes.push(now);
        if (S.shakes.length >= 6 && now > S.dizzyCd) {
          S.shakes = []; S.dizzyCd = now + 4000;
          setMood('dizzy', 3000, true); say('¡Mareado! 😵‍💫', 2500);
        }
      }
      if (Math.abs(dx) > 8) S.lastDx = dx;
    } else if (!S.dragging && S.mouse.speed > 3500 && now > S.surpriseCd &&
               Math.hypot(S.mouse.x - faceX(), S.mouse.y - faceY()) < 260) {
      S.surpriseCd = now + 2500; setMood('surprised', 600);
    }
  });

  mascot.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    S.lastInput = performance.now();
    const woke = wake(true);
    mascot.setPointerCapture(e.pointerId);
    S.mouse.x = e.clientX; S.mouse.y = e.clientY;
    S.dragging = true; mascot.classList.add('dragging');
    S.grab = { x: e.clientX - S.x, y: e.clientY - S.y };
    S.vx = S.vy = 0;
    S.down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, woke };
  });
  const release = () => {
    if (!S.dragging) return;
    const d = S.down; S.dragging = false; S.down = null;
    mascot.classList.remove('dragging');
    if (S.y > S.floor) S.y = S.floor;
    if (d && !d.moved && performance.now() - d.t < 500) {
      if (d.woke) { say('¡Ay! Me despertaste 😳'); jump(0.5); } else onClick();
    } else if (d && d.moved) {
      if (Math.hypot(S.vx, S.vy) > 800) setMood('surprised', 900, true); else setMood('neutral', 0, true);
      tone(700, 400, 0.12, 'triangle', 0.05);
    }
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  document.addEventListener('pointerleave', () => { S.lastMove = performance.now() - 3400; });

  // fondo: ondas, parpadeo y salto con doble clic
  stage.addEventListener('pointerdown', e => {
    if (onMascot(e)) return;
    S.lastInput = performance.now();
    wake();
    ripple(e.clientX, e.clientY);
    startBlink();
    tone(600, 900, 0.06, 'sine', 0.04);
  });
  stage.addEventListener('dblclick', e => { if (!onMascot(e)) hopTo(e.clientX, e.clientY); });
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    setSize(S.size - e.deltaY * 0.001);
    S.lastInput = performance.now();
  }, { passive: false });

  function setSize(v) {
    S.size = clamp(v, 0.5, 1.8);
    sizeInput.value = S.size;
    S.x = clamp(S.x, BASE_W * S.size / 2, S.w - BASE_W * S.size / 2);
  }

  /* ───────── Controles ───────── */
  [['happy', 'Feliz'], ['sad', 'Triste'], ['angry', 'Enojado'], ['surprised', 'Sorprendido'], ['wink', 'Guiño'], ['love', 'Amor'], ['sleep', 'Dormir'], ['dizzy', 'Mareado']]
    .forEach(([m, label], i) => {
      const b = document.createElement('button');
      b.className = 'chip'; b.dataset.mood = m; b.innerHTML = `${label} <kbd>${i + 1}</kbd>`;
      b.addEventListener('click', () => triggerMood(m));
      movesEl.appendChild(b);
    });
  function triggerMood(m) {
    S.lastInput = performance.now();
    wake(true);
    setMood(m, m === 'sleep' ? 0 : 3500, true);
    say(pick(PHRASES[m]), m === 'sleep' ? 2000 : 2600);
    tone(500, m === 'sad' || m === 'angry' ? 250 : 900, 0.15, 'triangle', 0.06);
  }

  $('#tChase').addEventListener('change', e => { S.chase = e.target.checked; say(S.chase ? '¡Te sigo! 🏃' : 'Me quedo aquí 🙂', 1600); });
  $('#tGravity').addEventListener('change', e => { S.gravity = e.target.checked; S.grounded = false; say(S.gravity ? 'Gravedad: ¡activada!' : 'Flotando… ☁️', 1600); });
  $('#tSound').addEventListener('change', e => { S.sound = e.target.checked; tone(400, 900, 0.2, 'triangle', 0.08); });
  sizeInput.addEventListener('input', e => setSize(parseFloat(e.target.value)));
  $('#bJump').addEventListener('click', () => { wake(true); jump(); });
  $('#bBlink').addEventListener('click', () => startBlink());
  $('#bReset').addEventListener('click', reset);
  $('#bTheme').addEventListener('click', () => {
    document.body.dataset.theme = document.body.dataset.theme === 'dark' ? 'blue' : 'dark';
  });

  window.addEventListener('keydown', e => {
    S.lastInput = performance.now();
    if (/INPUT|BUTTON/.test(e.target.tagName) && e.code === 'Space') return;
    if (e.code === 'Space') { e.preventDefault(); wake(true); jump(); }
    else if (e.key >= '1' && e.key <= '8') triggerMood(['happy', 'sad', 'angry', 'surprised', 'wink', 'love', 'sleep', 'dizzy'][+e.key - 1]);
    else if (e.key === 'b' || e.key === 'B') startBlink();
    else if (e.key === 'r' || e.key === 'R') reset();
  });

  /* ───────── Tamaño de ventana ───────── */
  function measure() {
    S.w = innerWidth; S.h = innerHeight;
    S.floor = S.h - dock.offsetHeight - (S.w < 640 ? 28 : 40);
    floorEl.style.top = S.floor + 'px';
    S.x = clamp(S.x, BASE_W * S.size / 2, S.w - BASE_W * S.size / 2);
    if (S.y > S.floor) S.y = S.floor;
  }
  window.addEventListener('resize', measure);
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(dock);

  const dockToggle = $('#dockToggle');
  dockToggle.addEventListener('click', () => {
    const c = dock.classList.toggle('collapsed');
    dockToggle.setAttribute('aria-expanded', String(!c));
  });
  // en pantallas pequeñas el panel arranca plegado y la mascota más chica
  if (innerHeight < 520 || innerWidth < 640) dock.classList.add('collapsed');
  S.size = innerHeight < 520 ? 0.55 : innerHeight < 700 ? 0.75 : 1;
  sizeInput.value = S.size;
  measure();
  S.y = -BASE_H;
  renderMood();
  requestAnimationFrame(frame);
})();
