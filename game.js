// Malware Defender — OVERDRIVE EDITION [V3.5 - POWER-UP UPDATE]
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // UI elements
  const elScore = document.getElementById('score'), elTime = document.getElementById('time');
  const elWave = document.getElementById('wave'), elHPFill = document.getElementById('hp-fill');
  const startScreen = document.getElementById('start-screen'), deathScreen = document.getElementById('death-screen');
  const finalScore = document.getElementById('final-score'), finalTime = document.getElementById('final-time');
  const fsBtn = document.getElementById('fsBtn');

  // --- DEVICE SCALING ---
  let VW, VH, isMobile;
  function fit() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    VW = window.innerWidth; VH = window.innerHeight;
    isMobile = VW < 768; 
    canvas.width = VW * dpr; canvas.height = VH * dpr;
    canvas.style.width = VW + 'px'; canvas.style.height = VH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fit(); window.addEventListener('resize', fit);

  fsBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{});
    else document.exitFullscreen();
  });

  // --- GAME STATE ---
  const S = { 
    started: false, over: false, time: 0, dt: 0, score: 0, wave: 1, 
    killCount: 0, shake: 0, flash: 0, nextBossScore: 1500 
  };

  const player = { 
    x: 0, y: 0, r: 16, angle: -Math.PI/2, speed: 400, hp: 100, maxHP: 100, 
    fireCD: 0, fireRate: 0.09,
    // Powerup States
    powerType: 'NORMAL', // NORMAL, SPREAD, RAPID
    powerTimer: 0,
    shieldTimer: 0
  };

  let bullets = [], enemies = [], particles = [], drops = [], bosses = [];
  const COLORS = { 
    neon: '#ff003c', dark: '#0a0102', heal: '#00ffaa', 
    bullet: '#ffffff', spread: '#00ccff', rapid: '#ffcc00', shield: '#aa00ff' 
  };

  // --- CONTROLS ---
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
    player.hp = 100; player.x = VW/2; player.y = VH/2; player.angle = -Math.PI/2;
    player.powerType = 'NORMAL'; player.powerTimer = 0; player.shieldTimer = 0;
    bullets = []; enemies = []; particles = []; drops = []; bosses = [];
    startScreen.style.display = 'none'; deathScreen.style.display = 'none';
  }
  document.getElementById('startBtn').onclick = start;
  document.getElementById('retryBtn').onclick = start;

  const ENEMY_TYPES = {
    adware:     { unlockWave: 1, baseHP: 30,  baseSpeed: 100, score: 50,  r: 14, color: '#ff4d4d', shape: 'circle' },
    spyware:    { unlockWave: 2, baseHP: 20,  baseSpeed: 260, score: 80,  r: 10, color: '#ffaa00', shape: 'triangle' },
    ransomware: { unlockWave: 3, baseHP: 150, baseSpeed: 50,  score: 150, r: 20, color: '#a000ff', shape: 'square' },
    trojan:     { unlockWave: 5, baseHP: 90,  baseSpeed: 180, score: 200, r: 15, color: '#ffffff', shape: 'diamond' }
  };

  // --- CORE STEP ---
  function step() {
    if (!S.started || S.over) return;
    S.time += S.dt;
    if (S.shake > 0) S.shake *= 0.82;
    if (S.flash > 0) S.flash -= S.dt;

    // Power-up Timers
    if (player.powerTimer > 0) player.powerTimer -= S.dt;
    if (player.powerTimer <= 0) player.powerType = 'NORMAL';
    if (player.shieldTimer > 0) player.shieldTimer -= S.dt;

    // Player Move
    player.x += joyL.dx * player.speed * S.dt;
    player.y += joyL.dy * player.speed * S.dt;
    player.x = Math.max(18, Math.min(VW-18, player.x));
    player.y = Math.max(18, Math.min(VH-18, player.y));

    // Player Aim & Shoot
    if (joyR.active) player.angle = Math.atan2(joyR.dy, joyR.dx);
    else if (joyL.active) player.angle = Math.atan2(joyL.dy, joyL.dx);
    
    player.fireCD -= S.dt;
    if (joyR.active && player.fireCD <= 0) {
        const gunDist = 20;
        const bx = player.x + Math.cos(player.angle) * gunDist;
        const by = player.y + Math.sin(player.angle) * gunDist;
        
        let rate = 0.09;
        let color = COLORS.bullet;

        if (player.powerType === 'RAPID') { rate = 0.03; color = COLORS.rapid; }
        if (player.powerType === 'SPREAD') { rate = 0.12; color = COLORS.spread; }

        if (player.powerType === 'SPREAD') {
             // 3 Bullets
             [0, -0.2, 0.2].forEach(offset => {
                bullets.push({ 
                    x: bx, y: by, 
                    vx: Math.cos(player.angle + offset)*980, 
                    vy: Math.sin(player.angle + offset)*980, 
                    from: 'p', r: 4, color: color 
                });
             });
        } else {
             // 1 Bullet
             bullets.push({ 
                x: bx, y: by, 
                vx: Math.cos(player.angle)*980, 
                vy: Math.sin(player.angle)*980, 
                from: 'p', r: 4, color: color 
            });
        }
        
        player.fireCD = rate;
        S.shake = 2.5;
    }

    // Spawning
    const maxEnemies = isMobile ? (6 + S.wave) : (12 + (S.wave * 3));
    const spawnChance = isMobile ? 0.03 : 0.08; 

    if (enemies.length < maxEnemies && Math.random() < spawnChance) {
        const edge = Math.random();
        let ex, ey;
        if(edge < 0.25) { ex = Math.random()*VW; ey = -50; } 
        else if(edge < 0.5) { ex = Math.random()*VW; ey = VH+50; }
        else if(edge < 0.75) { ex = -50; ey = Math.random()*VH; }
        else { ex = VW+50; ey = Math.random()*VH; }

        const availableTypes = Object.entries(ENEMY_TYPES).filter(([k, v]) => S.wave >= v.unlockWave);
        const selection = availableTypes[Math.floor(Math.random() * availableTypes.length)];
        const stats = selection[1];
        const hpMult = 1 + (S.wave * 0.15);
        const spdMult = 1 + (S.wave * 0.05);

        enemies.push({ 
            x: ex, y: ey, type: selection[0], shape: stats.shape, color: stats.color,
            r: stats.r, hp: stats.baseHP * hpMult, maxHP: stats.baseHP * hpMult,
            speed: isMobile ? stats.baseSpeed * 0.8 : stats.baseSpeed * spdMult,
            scoreVal: stats.score
        });
    }

    // Boss
    if (S.score >= S.nextBossScore) {
        bosses.push({ x: Math.random()*VW, y: -100, r: 55, hp: 2000 * S.wave, maxHP: 2000 * S.wave, timer: 0, phase: Math.random()*10 });
        S.nextBossScore += 3000; S.flash = 0.5; S.wave++;
    }

    bosses.forEach((b, bi) => {
        b.y = Math.min(b.y + S.dt * 80, 120 + (bi * 40));
        b.x += Math.sin(S.time * 1.5 + b.phase) * 180 * S.dt;
        b.timer += S.dt;
        if (b.timer > 1.4) { 
            const bulletCount = isMobile ? 8 : 14;
            for(let i=0; i < bulletCount; i++) {
                const a = (Math.PI*2/bulletCount) * i + (S.time * 3);
                bullets.push({ x: b.x, y: b.y, vx: Math.cos(a)*350, vy: Math.sin(a)*350, from: 'e', r: 8 });
            }
            b.timer = 0;
        }
    });

    particles.forEach((p, i) => {
        p.x += p.vx; p.y += p.vy; p.life -= S.dt * 3;
        if (p.life <= 0) particles.splice(i, 1);
    });

    // Collision
    enemies.forEach((e, ei) => {
        const ang = Math.atan2(player.y - e.y, player.x - e.x);
        e.x += Math.cos(ang) * e.speed * S.dt;
        e.y += Math.sin(ang) * e.speed * S.dt;

        bullets.forEach((b, bi) => {
            if (b.from === 'p' && Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
                e.hp -= 40; bullets.splice(bi, 1);
                if (e.hp <= 0) {
                    spawnParticles(e.x, e.y, e.color, 12);
                    enemies.splice(ei, 1);
                    S.score += e.scoreVal; S.killCount++;
                    
                    // DROP SYSTEM (Powerups or Health)
                    if (S.killCount % 12 === 0) {
                        const rand = Math.random();
                        let type = 'HEAL';
                        if (rand > 0.8) type = 'SHIELD';
                        else if (rand > 0.6) type = 'SPREAD';
                        else if (rand > 0.4) type = 'RAPID';
                        drops.push({x: e.x, y: e.y, type: type});
                    }
                }
            }
        });

        const dist = Math.hypot(e.x - player.x, e.y - player.y);
        // Shield collision (Kill enemy instantly)
        if (player.shieldTimer > 0 && dist < player.r + e.r + 10) {
             spawnParticles(e.x, e.y, e.color, 12);
             enemies.splice(ei, 1);
             S.score += e.scoreVal; S.shake = 5;
        } 
        // Normal collision
        else if (dist < player.r + e.r) {
            player.hp -= 40 * S.dt; S.flash = 0.2; S.shake = 10;
        }
    });

    bosses.forEach((b, bi) => {
        bullets.forEach((bul, bui) => {
            if(bul.from === 'p' && Math.hypot(b.x - bul.x, b.y - bul.y) < b.r) {
                b.hp -= 40; bullets.splice(bui, 1);
                if(b.hp <= 0) {
                    spawnParticles(b.x, b.y, COLORS.neon, 80);
                    S.score += 2500; bosses.splice(bi, 1);
                    drops.push({x: b.x, y: b.y, type: 'HEAL'});
                }
            }
        });
    });

    bullets.forEach((b, bi) => {
        b.x += b.vx * S.dt; b.y += b.vy * S.dt;
        if (b.x < -150 || b.x > VW+150 || b.y < -150 || b.y > VH+150) bullets.splice(bi, 1);
        if (b.from === 'e' && Math.hypot(b.x - player.x, b.y - player.y) < player.r + b.r) {
            if (player.shieldTimer <= 0) {
                player.hp -= 20; S.flash = 0.4; S.shake = 15; 
            }
            bullets.splice(bi, 1);
        }
    });

    drops.forEach((d, i) => {
        if (Math.hypot(d.x - player.x, d.y - player.y) < player.r + 30) {
            // Apply Effect
            if (d.type === 'HEAL') {
                player.hp = Math.min(player.maxHP, player.hp + 40);
                spawnParticles(d.x, d.y, COLORS.heal, 25);
            } else if (d.type === 'SPREAD') {
                player.powerType = 'SPREAD'; player.powerTimer = 6;
                spawnParticles(d.x, d.y, COLORS.spread, 25);
            } else if (d.type === 'RAPID') {
                player.powerType = 'RAPID'; player.powerTimer = 6;
                spawnParticles(d.x, d.y, COLORS.rapid, 25);
            } else if (d.type === 'SHIELD') {
                player.shieldTimer = 6;
                spawnParticles(d.x, d.y, COLORS.shield, 25);
            }
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

    // Grid
    ctx.strokeStyle = `rgba(255, 0, 60, ${0.07 + Math.sin(S.time*6)*0.03})`;
    const gridSize = isMobile ? 40 : 60;
    for(let i=0; i<VW; i+=gridSize) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,VH); ctx.stroke(); }
    for(let i=0; i<VH; i+=gridSize) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(VW,i); ctx.stroke(); }

    if (S.flash > 0) { ctx.fillStyle = `rgba(255, 0, 60, ${S.flash * 0.4})`; ctx.fillRect(0, 0, VW, VH); }

    particles.forEach(p => {
        ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
    });
    ctx.globalAlpha = 1;

    // Draw Drops
    drops.forEach(d => {
        let txt = '✚', col = COLORS.heal;
        if(d.type === 'SPREAD') { txt = '⫚'; col = COLORS.spread; } // trident symbol
        if(d.type === 'RAPID') { txt = '⚡'; col = COLORS.rapid; }
        if(d.type === 'SHIELD') { txt = '🛡'; col = COLORS.shield; }

        ctx.fillStyle = col; ctx.font = 'bold 32px Orbitron';
        ctx.shadowBlur = 20; ctx.shadowColor = col;
        ctx.fillText(txt, d.x-16, d.y+16); ctx.shadowBlur = 0;
    });

    // Draw Player
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, -12, 24, 6); ctx.fillRect(0, 6, 24, 6);
    ctx.fillStyle = "#1a1a1a"; ctx.strokeStyle = COLORS.heal; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const ang = (Math.PI/3)*i; ctx.lineTo(Math.cos(ang)*18, Math.sin(ang)*18); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    
    // Cross color changes based on powerup
    let coreColor = COLORS.heal;
    if(player.powerType === 'RAPID') coreColor = COLORS.rapid;
    if(player.powerType === 'SPREAD') coreColor = COLORS.spread;
    ctx.fillStyle = coreColor; 
    ctx.fillRect(-8, -3, 16, 6); ctx.fillRect(-3, -8, 6, 16); 

    // Shield Visual
    if(player.shieldTimer > 0) {
        ctx.strokeStyle = `rgba(170, 0, 255, ${0.5 + Math.sin(S.time*15)*0.5})`;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0,0, 35, 0, Math.PI*2); ctx.stroke();
    } else {
        ctx.rotate(-player.angle + (S.time*2));
        ctx.strokeStyle = `rgba(0, 255, 170, ${0.3 + Math.sin(S.time*10)*0.2})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 1.5); ctx.stroke();
    }
    ctx.restore();

    enemies.forEach(e => {
        ctx.fillStyle = e.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        ctx.beginPath();
        if (e.shape === 'circle') ctx.arc(e.x, e.y, e.r, 0, Math.PI*2);
        else if (e.shape === 'triangle') { const r=e.r; ctx.moveTo(e.x, e.y-r); ctx.lineTo(e.x+r, e.y+r); ctx.lineTo(e.x-r, e.y+r); }
        else if (e.shape === 'square') ctx.rect(e.x-e.r, e.y-e.r, e.r*2, e.r*2);
        else if (e.shape === 'diamond') { const r=e.r; ctx.moveTo(e.x, e.y-r); ctx.lineTo(e.x+r, e.y); ctx.lineTo(e.x, e.y+r); ctx.lineTo(e.x-r, e.y); }
        ctx.fill(); ctx.stroke();
    });

    bosses.forEach(b => {
        ctx.fillStyle = '#100001'; ctx.strokeStyle = COLORS.neon; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = COLORS.neon; 
        ctx.beginPath(); ctx.arc(b.x-20, b.y-10, 8, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(b.x+20, b.y-10, 8, 0, Math.PI*2); ctx.fill();
        ctx.fillRect(b.x-10, b.y+20, 20, 15);
        ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(b.x-55, b.y-b.r-25, 110, 8);
        ctx.fillStyle = COLORS.neon; ctx.fillRect(b.x-55, b.y-b.r-25, 110*(b.hp/b.maxHP), 8);
    });

    bullets.forEach(b => {
        ctx.fillStyle = b.from === 'p' ? (b.color || COLORS.bullet) : COLORS.neon;
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
