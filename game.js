// Malware Defender — OVERDRIVE EDITION [V3.1 FINAL - MOBILE OPTIMIZED]
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // UI elements
  const elScore = document.getElementById('score'), elTime = document.getElementById('time');
  const elWave = document.getElementById('wave'), elHPFill = document.getElementById('hp-fill');
  const startScreen = document.getElementById('start-screen'), deathScreen = document.getElementById('death-screen');
  const finalScore = document.getElementById('final-score'), finalTime = document.getElementById('final-time');
  const fsBtn = document.getElementById('fsBtn');

  // --- DEVICE SCALING & MOBILE DETECTION ---
  let VW, VH, isMobile;
  function fit() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    VW = window.innerWidth; 
    VH = window.innerHeight;
    isMobile = VW < 768; // Standard tablet/phone breakpoint
    
    canvas.width = VW * dpr; 
    canvas.height = VH * dpr;
    canvas.style.width = VW + 'px'; 
    canvas.style.height = VH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fit(); 
  window.addEventListener('resize', fit);

  // Fullscreen Fix
  fsBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn(`Fullscreen error: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  });

  // --- GAME STATE ---
  const S = { 
    started: false, over: false, time: 0, dt: 0, score: 0, wave: 1, 
    killCount: 0, shake: 0, flash: 0, nextBossScore: 1500 
  };

  const player = { x: 0, y: 0, r: 16, speed: 400, hp: 100, maxHP: 100, fireCD: 0, fireRate: 0.09 };
  let bullets = [], enemies = [], particles = [], drops = [], bosses = [];

  const COLORS = { neon: '#ff003c', dark: '#0a0102', heal: '#00ffaa', bullet: '#ffffff' };

  // --- DUAL JOYSTICK ENGINE ---
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

  function spawnParticles(x, y, color, count = 12) {
    for(let i=0; i<count; i++) {
        particles.push({ x, y, vx: (Math.random()-0.5)*16, vy: (Math.random()-0.5)*16, life: 1, size: Math.random()*5+2, color });
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

  // --- CORE STEP LOGIC ---
  function step() {
    if (!S.started || S.over) return;
    S.time += S.dt;
    if (S.shake > 0) S.shake *= 0.82;
    if (S.flash > 0) S.flash -= S.dt;

    // Player Physics
    player.x += joyL.dx * player.speed * S.dt;
    player.y += joyL.dy * player.speed * S.dt;
    player.x = Math.max(18, Math.min(VW-18, player.x));
    player.y = Math.max(18, Math.min(VH-18, player.y));

    // Shooting
    player.fireCD -= S.dt;
    if (joyR.active && player.fireCD <= 0) {
        const ang = Math.atan2(joyR.dy, joyR.dx);
        bullets.push({ x: player.x, y: player.y, vx: Math.cos(ang)*980, vy: Math.sin(ang)*980, from: 'p', r: 3.5 });
        player.fireCD = player.fireRate;
        S.shake = 2.5;
    }

    // --- MOBILE OPTIMIZED SPAWNING ---
    // Drastically reduce population on mobile to prevent overcrowding
    const maxEnemies = isMobile ? (7 + S.wave) : (15 + (S.wave * 4));
    const spawnChance = isMobile ? 0.04 : 0.09; 

    if (enemies.length < maxEnemies && Math.random() < spawnChance) {
        const edge = Math.random();
        let ex, ey;
        if(edge < 0.25) { ex = Math.random()*VW; ey = -50; } 
        else if(edge < 0.5) { ex = Math.random()*VW; ey = VH+50; }
        else if(edge < 0.75) { ex = -50; ey = Math.random()*VH; }
        else { ex = VW+50; ey = Math.random()*VH; }
        
        if(Math.random() > 0.8) {
            // Rushers: Faster, but fewer HP. Slower on mobile.
            enemies.push({ x: ex, y: ey, r: 8, hp: 20, speed: isMobile ? 220 : 280, type: 'rusher' }); 
        } else {
            // Grunts: Standard enemies.
            enemies.push({ x: ex, y: ey, r: 15, hp: 40 + (S.wave*25), speed: isMobile ? 90 : 110, type: 'grunt' });
        }
    }

    // Boss Manager
    if (S.score >= S.nextBossScore) {
        bosses.push({ x: Math.random()*VW, y: -100, r: 50, hp: 1500 * S.wave, maxHP: 1500 * S.wave, timer: 0, phase: Math.random()*10 });
        S.nextBossScore += 2500;
        S.flash = 0.5;
        S.wave++;
    }

    bosses.forEach((b, bi) => {
        b.y = Math.min(b.y + S.dt * 80, 140 + (bi * 40));
        b.x += Math.sin(S.time * 1.5 + b.phase) * 200 * S.dt;
        b.timer += S.dt;
        
        if (b.timer > 1.2) { 
            // Fewer bullets in the spiral for mobile players
            const bulletCount = isMobile ? 7 : 12;
            for(let i=0; i < bulletCount; i++) {
                const a = (Math.PI*2/bulletCount) * i + (S.time * 2.5);
                bullets.push({ x: b.x, y: b.y, vx: Math.cos(a)*380, vy: Math.sin(a)*380, from: 'e', r: 7.5 });
            }
            b.timer = 0;
        }
    });

    // Particles
    particles.forEach((p, i) => {
        p.x += p.vx; p.y += p.vy; p.life -= S.dt * 3;
        if (p.life <= 0) particles.splice(i, 1);
    });

    // Collision Logic
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
                    if (S.killCount % 10 === 0) drops.push({x: e.x, y: e.y, type: 'HEAL'});
                }
            }
        });

        if (Math.hypot(e.x - player.x, e.y - player.y) < player.r + e.r) {
            player.hp -= 50 * S.dt; S.flash = 0.3; S.shake = 12;
        }
    });

    bosses.forEach((b, bi) => {
        bullets.forEach((bul, bui) => {
            if(bul.from === 'p' && Math.hypot(b.x - bul.x, b.y - bul.y) < b.r) {
                b.hp -= 40; bullets.splice(bui, 1);
                if(b.hp <= 0) {
                    spawnParticles(b.x, b.y, COLORS.neon, 60);
                    S.score += 2000; bosses.splice(bi, 1);
                    drops.push({x: b.x, y: b.y, type: 'HEAL'});
                }
            }
        });
    });

    bullets.forEach((b, bi) => {
        b.x += b.vx * S.dt; b.y += b.vy * S.dt;
        if (b.x < -150 || b.x > VW+150 || b.y < -150 || b.y > VH+150) bullets.splice(bi, 1);
        if (b.from === 'e' && Math.hypot(b.x - player.x, b.y - player.y) < player.r + b.r) {
            player.hp -= 20; S.flash = 0.4; S.shake = 15; bullets.splice(bi, 1);
        }
    });

    drops.forEach((d, i) => {
        if (Math.hypot(d.x - player.x, d.y - player.y) < player.r + 30) {
            player.hp = Math.min(player.maxHP, player.hp + 40);
            spawnParticles(d.x, d.y, COLORS.heal, 25);
            drops.splice(i, 1);
        }
    });

    if (player.hp <= 0 && !S.over) {
        S.over = true;
        deathScreen.style.display = 'flex';
        finalScore.textContent = Math.floor(S.score);
        finalTime.textContent = S.time.toFixed(1);
        window.sendScore?.(localStorage.getItem("playerName"), Math.floor(S.score), (Math.floor(S.score)*3)+7);
    }
  }

  // --- RENDERING ---
  function draw() {
    ctx.fillStyle = COLORS.dark; ctx.fillRect(0, 0, VW, VH);
    ctx.save();
    
    if (S.shake > 0.5) ctx.translate((Math.random()-0.5)*S.shake, (Math.random()-0.5)*S.shake);

    ctx.strokeStyle = `rgba(255, 0, 60, ${0.07 + Math.sin(S.time*6)*0.03})`;
    const gridSize = isMobile ? 40 : 60; // Denser grid for mobile looks better
    for(let i=0; i<VW; i+=gridSize) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,VH); ctx.stroke(); }
    for(let i=0; i<VH; i+=gridSize) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(VW,i); ctx.stroke(); }

    if (S.flash > 0) {
        ctx.fillStyle = `rgba(255, 0, 60, ${S.flash * 0.4})`;
        ctx.fillRect(0, 0, VW, VH);
    }

    particles.forEach(p => {
        ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
    });
    ctx.globalAlpha = 1;

    drops.forEach(d => {
        ctx.fillStyle = COLORS.heal; ctx.font = 'bold 32px Orbitron';
        ctx.shadowBlur = 20; ctx.shadowColor = COLORS.heal;
        ctx.fillText('✚', d.x-16, d.y+16); ctx.shadowBlur = 0;
    });

    // Objects
    ctx.fillStyle = COLORS.neon; ctx.shadowBlur = 25; ctx.shadowColor = COLORS.neon;
    ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;

    enemies.forEach(e => {
        ctx.fillStyle = e.type === 'rusher' ? COLORS.bullet : '#2a0003';
        ctx.strokeStyle = COLORS.neon; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    });

    bosses.forEach(b => {
        ctx.fillStyle = '#100001'; ctx.strokeStyle = COLORS.neon; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(b.x-55, b.y-b.r-25, 110, 8);
        ctx.fillStyle = COLORS.neon; ctx.fillRect(b.x-55, b.y-b.r-25, 110*(b.hp/b.maxHP), 8);
    });

    bullets.forEach(b => {
        ctx.fillStyle = b.from === 'p' ? COLORS.bullet : COLORS.neon;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill();
    });

    ctx.restore();

    elScore.textContent = Math.floor(S.score);
    elWave.textContent = S.wave;
    elTime.textContent = S.time.toFixed(1) + "s";
    elHPFill.style.width = Math.max(0, player.hp) + "%";
  }

  function loop(t) {
    S.dt = Math.min(0.033, (t - (S.last||t))/1000); S.last = t;
    step(); draw(); requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
