// Malware Defender — OVERDRIVE EDITION [ENGINE v3.0]
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // UI elements
  const elScore = document.getElementById('score'), elTime = document.getElementById('time');
  const elWave = document.getElementById('wave'), elHPFill = document.getElementById('hp-fill');
  const startScreen = document.getElementById('start-screen'), deathScreen = document.getElementById('death-screen');
  const finalScore = document.getElementById('final-score'), finalTime = document.getElementById('final-time');
  
  let VW, VH;
  function fit() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    VW = window.innerWidth; VH = window.innerHeight;
    canvas.width = VW * dpr; canvas.height = VH * dpr;
    canvas.style.width = VW + 'px'; canvas.style.height = VH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fit(); window.addEventListener('resize', fit);

  const S = { 
    started: false, over: false, time: 0, dt: 0, score: 0, wave: 1, 
    killCount: 0, shake: 0, flash: 0, nextBossScore: 1500 
  };

  // OVERDRIVE SPEEDS
  const player = { x: 0, y: 0, r: 16, speed: 380, hp: 100, maxHP: 100, fireCD: 0, fireRate: 0.09 };
  let bullets = [], enemies = [], particles = [], drops = [], bosses = [];

  const COLORS = { neon: '#ff003c', dark: '#0a0102', heal: '#00ffaa', bullet: '#ffffff' };

  // DUAL JOYSTICK LOGIC
  const joyL = { active: false, dx: 0, dy: 0, el: document.getElementById('joystick-left'), st: document.getElementById('stick-left') };
  const joyR = { active: false, dx: 0, dy: 0, el: document.getElementById('joystick-right'), st: document.getElementById('stick-right') };

  function setupJoystick(j) {
    const handle = (e) => {
      const r = j.el.getBoundingClientRect();
      const touch = e.touches ? e.touches[0] : e;
      const cX = r.left + r.width/2, cY = r.top + r.height/2;
      let dx = touch.clientX - cX, dy = touch.clientY - cY;
      const dist = Math.hypot(dx, dy), max = r.width/2;
      if (dist > max) { dx *= max/dist; dy *= max/dist; }
      j.dx = dx/max; j.dy = dy/max;
      j.st.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    j.el.addEventListener('pointerdown', e => { j.active = true; handle(e); j.el.setPointerCapture(e.pointerId); });
    j.el.addEventListener('pointermove', e => { if(j.active) handle(e); });
    j.el.addEventListener('pointerup', e => { j.active = false; j.dx = j.dy = 0; j.st.style.transform = `translate(0,0)`; });
  }
  setupJoystick(joyL); setupJoystick(joyR);

  // VFX: PIXEL EXPLOSIONS
  function spawnParticles(x, y, color, count = 12) {
    for(let i=0; i<count; i++) {
        particles.push({ 
            x, y, 
            vx: (Math.random()-0.5)*15, 
            vy: (Math.random()-0.5)*15, 
            life: 1, 
            size: Math.random()*4+2, 
            color 
        });
    }
  }

  function start() {
    S.started = true; S.over = false; S.score = 0; S.time = 0; S.wave = 1; S.killCount = 0; S.nextBossScore = 1500;
    player.hp = 100; player.x = VW/2; player.y = VH/2;
    bullets = []; enemies = []; particles = []; drops = []; bosses = [];
    startScreen.style.display = 'none'; deathScreen.style.display = 'none';
  }
  document.getElementById('startBtn').onclick = start;
  document.getElementById('retryBtn').onclick = start;

  function step() {
    if (!S.started || S.over) return;
    S.time += S.dt;
    if (S.shake > 0) S.shake *= 0.82;
    if (S.flash > 0) S.flash -= S.dt;

    // Player Movement
    player.x += joyL.dx * player.speed * S.dt;
    player.y += joyL.dy * player.speed * S.dt;
    player.x = Math.max(18, Math.min(VW-18, player.x));
    player.y = Math.max(18, Math.min(VH-18, player.y));

    // Rapid Fire Logic
    player.fireCD -= S.dt;
    if (joyR.active && player.fireCD <= 0) {
        const ang = Math.atan2(joyR.dy, joyR.dx);
        // Laser-speed bullets
        bullets.push({ x: player.x, y: player.y, vx: Math.cos(ang)*950, vy: Math.sin(ang)*950, from: 'p', r: 3.5 });
        player.fireCD = player.fireRate;
        S.shake = 2.5;
    }

    // Aggressive Spawning
    if (enemies.length < 12 + (S.wave * 4) && Math.random() < 0.08) {
        const edge = Math.random();
        let ex, ey;
        if(edge < 0.25) { ex = Math.random()*VW; ey = -40; } 
        else if(edge < 0.5) { ex = Math.random()*VW; ey = VH+40; }
        else if(edge < 0.75) { ex = -40; ey = Math.random()*VH; }
        else { ex = VW+40; ey = Math.random()*VH; }
        
        const type = Math.random();
        if(type > 0.75) enemies.push({ x: ex, y: ey, r: 8, hp: 25, speed: 250, type: 'rusher' }); 
        else enemies.push({ x: ex, y: ey, r: 14, hp: 50 + (S.wave*25), speed: 100, type: 'grunt' });
    }

    // Simultaneous Boss Spawning
    if (S.score >= S.nextBossScore) {
        bosses.push({ 
            x: Math.random() * VW, y: -100, r: 48, 
            hp: 1500 * S.wave, maxHP: 1500 * S.wave, 
            timer: 0, phase: Math.random() * 10 
        });
        S.nextBossScore += 2500;
        S.flash = 0.5; // Warning flash for new boss
        S.wave++;
    }

    // Boss Combat Patterns
    bosses.forEach((b, bi) => {
        b.y = Math.min(b.y + S.dt * 70, 130 + (bi * 45));
        b.x += Math.sin(S.time * 1.5 + b.phase) * 180 * S.dt;
        b.timer += S.dt;
        if (b.timer > 1.0) {
            // High-density spiral burst
            for(let i=0; i<10; i++) {
                const a = (Math.PI*2/10) * i + (S.time * 2);
                bullets.push({ x: b.x, y: b.y, vx: Math.cos(a)*350, vy: Math.sin(a)*350, from: 'e', r: 7 });
            }
            b.timer = 0;
        }
    });

    // Particle Cleanup
    particles.forEach((p, i) => {
        p.x += p.vx; p.y += p.vy; p.life -= S.dt * 3;
        if (p.life <= 0) particles.splice(i, 1);
    });

    // Enemy AI & Collision
    enemies.forEach((e, ei) => {
        const ang = Math.atan2(player.y - e.y, player.x - e.x);
        e.x += Math.cos(ang) * e.speed * S.dt;
        e.y += Math.sin(ang) * e.speed * S.dt;

        bullets.forEach((b, bi) => {
            if (b.from === 'p' && Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
                e.hp -= 40; bullets.splice(bi, 1);
                if (e.hp <= 0) {
                    spawnParticles(e.x, e.y, COLORS.neon, 12);
                    enemies.splice(ei, 1);
                    S.score += 100; S.killCount++;
                    if (S.killCount % 12 === 0) drops.push({x: e.x, y: e.y, type: 'HEAL'});
                }
            }
        });

        if (Math.hypot(e.x - player.x, e.y - player.y) < player.r + e.r) {
            player.hp -= 45 * S.dt; S.flash = 0.25; S.shake = 10;
        }
    });

    // Boss Multi-collision
    bosses.forEach((b, bi) => {
        bullets.forEach((bul, bui) => {
            if(bul.from === 'p' && Math.hypot(b.x - bul.x, b.y - bul.y) < b.r) {
                b.hp -= 40; bullets.splice(bui, 1);
                if(b.hp <= 0) {
                    spawnParticles(b.x, b.y, COLORS.neon, 60);
                    S.score += 1500; bosses.splice(bi, 1);
                    drops.push({x: b.x, y: b.y, type: 'HEAL'});
                }
            }
        });
    });

    // Bullet Management
    bullets.forEach((b, bi) => {
        b.x += b.vx * S.dt; b.y += b.vy * S.dt;
        if (b.x < -120 || b.x > VW+120 || b.y < -120 || b.y > VH+120) bullets.splice(bi, 1);
        if (b.from === 'e' && Math.hypot(b.x - player.x, b.y - player.y) < player.r + b.r) {
            player.hp -= 18; S.flash = 0.4; S.shake = 12; bullets.splice(bi, 1);
        }
    });

    // Healing Logic
    drops.forEach((d, i) => {
        if (Math.hypot(d.x - player.x, d.y - player.y) < player.r + 30) {
            player.hp = Math.min(player.maxHP, player.hp + 45); // Big heal for fast pace
            spawnParticles(d.x, d.y, COLORS.heal, 25);
            drops.splice(i, 1);
        }
    });

    // Death Event
    if (player.hp <= 0 && !S.over) {
        S.over = true;
        deathScreen.style.display = 'flex';
        finalScore.textContent = Math.floor(S.score);
        finalTime.textContent = S.time.toFixed(1);
        window.sendScore?.(localStorage.getItem("playerName"), Math.floor(S.score), (Math.floor(S.score)*3)+7);
    }
  }

  function draw() {
    ctx.fillStyle = COLORS.dark; ctx.fillRect(0, 0, VW, VH);
    ctx.save();
    
    // Screen Shake
    if (S.shake > 0.5) ctx.translate((Math.random()-0.5)*S.shake, (Math.random()-0.5)*S.shake);

    // Dynamic Background Pulse
    ctx.strokeStyle = `rgba(255, 0, 60, ${0.06 + Math.sin(S.time*6)*0.03})`;
    ctx.lineWidth = 1;
    for(let i=0; i<VW; i+=60) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,VH); ctx.stroke(); }
    for(let i=0; i<VH; i+=60) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(VW,i); ctx.stroke(); }

    // Red alert flash
    if (S.flash > 0) {
        ctx.fillStyle = `rgba(255, 0, 60, ${S.flash * 0.4})`;
        ctx.fillRect(0, 0, VW, VH);
    }

    // Render VFX
    particles.forEach(p => {
        ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
    });
    ctx.globalAlpha = 1;

    // Render Pickups
    drops.forEach(d => {
        ctx.fillStyle = COLORS.heal; ctx.font = 'bold 32px Orbitron';
        ctx.shadowBlur = 20; ctx.shadowColor = COLORS.heal;
        ctx.fillText('✚', d.x-16, d.y+16); ctx.shadowBlur = 0;
    });

    // Render Player (Neon Disc)
    ctx.fillStyle = COLORS.neon; ctx.shadowBlur = 25; ctx.shadowColor = COLORS.neon;
    ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;

    // Render Enemies
    enemies.forEach(e => {
        ctx.fillStyle = e.type === 'rusher' ? COLORS.bullet : '#330005';
        ctx.strokeStyle = COLORS.neon; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    });

    // Render Multi-Bosses
    bosses.forEach(b => {
        ctx.fillStyle = '#150002'; ctx.strokeStyle = COLORS.neon; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        // Floating Boss HP
        ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(b.x-55, b.y-b.r-25, 110, 8);
        ctx.fillStyle = COLORS.neon; ctx.fillRect(b.x-55, b.y-b.r-25, 110*(b.hp/b.maxHP), 8);
    });

    // Render Bullets
    bullets.forEach(b => {
        ctx.fillStyle = b.from === 'p' ? COLORS.bullet : COLORS.neon;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill();
    });

    ctx.restore();

    // HUD Synchronization
    elScore.textContent = Math.floor(S.score);
    elWave.textContent = S.wave;
    elTime.textContent = S.time.toFixed(1) + "s";
    elHPFill.style.width = Math.max(0, player.hp) + "%";
    // Change health bar color when critical
    elHPFill.style.background = player.hp < 35 ? '#ff003c' : 'linear-gradient(90deg, #ff003c, #ff4d79)';
  }

  function loop(t) {
    // Lock logic to max 33ms to prevent massive jumps
    S.dt = Math.min(0.033, (t - (S.last||t))/1000); S.last = t;
    step(); draw(); requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
