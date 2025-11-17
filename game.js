// Top-Down Shooter with Procedural Waves and 30s Boss
// Arrow keys move, mouse aims, click/Space shoots, R restarts.

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // Fit to device pixel ratio for crisp rendering
  function fit() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const maxW = Math.min(window.innerWidth, 1100);
    const maxH = Math.min(window.innerHeight, 800);
    const baseW = 960, baseH = 540;
    // keep aspect 16:9
    let w = baseW, h = baseH;
    if (maxW / maxH < w / h) { w = maxW; h = Math.round(maxW * (baseH/baseW)); }
    else { h = maxH; w = Math.round(maxH * (baseW/baseH)); }
    canvas.style.width = w+'px'; canvas.style.height = h+'px';
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    VW = w; VH = h;
  }
  let VW = canvas.width, VH = canvas.height;
  fit(); addEventListener('resize', fit);

  // UI
  const elScore = document.getElementById('score');
  const elTime = document.getElementById('time');
  const elHP = document.getElementById('hp');
  const elWave = document.getElementById('wave');
  const elBoss = document.getElementById('boss');
  document.getElementById('startBtn').addEventListener('click', start);

  // State
  const S = {
    started: false,
    over: false,
    time: 0,
    dt: 0,
    score: 0,
    wave: 1,
    rngSeed: 12345,
    bossActive: false,
    nextBossAt: 30, // seconds
  };

  // RNG (LCG) for reproducible procedural waves
  function rand() {
    // LCG constants
    S.rngSeed = (1664525 * S.rngSeed + 1013904223) >>> 0;
    return (S.rngSeed & 0xffffff) / 0x1000000;
  }
  function randRange(a,b){ return a + rand()*(b-a); }

  // Input
  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false };
  addEventListener('keydown', e => {
    if (['KeyW','KeyA','KeyS','KeyD','Space','KeyR'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if (!S.started && (e.code === 'Space' || e.code === 'Enter')) start();
    if (S.over && (e.code === 'Space' || e.code === 'KeyR' || e.code === 'Enter')) start();
  });
  addEventListener('keyup', e => keys.delete(e.code));
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const dprScaleX = VW / rect.width;
    const dprScaleY = VH / rect.height;
    mouse.x = (e.clientX - rect.left) * dprScaleX;
    mouse.y = (e.clientY - rect.top) * dprScaleY;
  });
  canvas.addEventListener('mousedown', () => mouse.down = true);
  addEventListener('mouseup', () => mouse.down = false);

  // Entities
  const player = {
    x: 0, y: 0, r: 14,
    speed: 260, hp: 100, fireCD: 0, fireRate: 0.14,
  };
  const bullets = []; // {x,y,vx,vy,r,life,from:'p'|'e',damage}
  const enemies = []; // {x,y,r,hp,speed,type,timer,dir}
  const particles = []; // simple hit sparks/fx

  // Boss object when active
  let boss = null; // {x,y,r,hp,maxHP,phase,timer,angle,spin}

  function start() {
    S.started = true; S.over = false;
    S.time = 0; S.score = 0; S.wave = 1;
    S.rngSeed = (Math.random()*1e9)|0;
    S.bossActive = false; S.nextBossAt = 30;
    bullets.length = 0; enemies.length = 0; particles.length = 0;
    boss = null;
    player.x = VW/2; player.y = VH/2; player.hp = 100;
    player.fireCD = 0;
    updateHUD();
  }

  // Helpers
  function aimAngle(ax, ay, bx, by){ return Math.atan2(by - ay, bx - ax); }

  function spawnEnemy() {
    // Types: 'chaser', 'shooter', 'tank'
    const tPick = rand();
    const t = tPick < 0.55 ? 'chaser' : (tPick < 0.85 ? 'shooter' : 'tank');
    const edge = rand();
    let x, y;
    if (edge < 0.25) { x = -20; y = randRange(20, VH-20); }
    else if (edge < 0.5) { x = VW+20; y = randRange(20, VH-20); }
    else if (edge < 0.75) { x = randRange(20, VW-20); y = -20; }
    else { x = randRange(20, VW-20); y = VH+20; }

    const diffScale = 1 + Math.min(2.5, (S.time/60)); // difficulty over time
    if (t === 'chaser') {
      enemies.push({x,y,r:12,hp:20*diffScale,speed: 90+randRange(-20,40)*diffScale,type:'chaser',timer:0,dir:0});
    } else if (t === 'shooter') {
      enemies.push({x,y,r:14,hp:28*diffScale,speed: 60+randRange(-10,20),type:'shooter',timer: randRange(0,1),dir:0});
    } else {
      enemies.push({x,y,r:16,hp:60*diffScale,speed: 40+randRange(-5,10),type:'tank',timer:0,dir:0});
    }
  }

  function spawnBoss() {
    const diff = 1 + (S.time/60);
    boss = {
      x: VW/2, y: -80, r: 44,
      hp: 1200 * diff, maxHP: 1200 * diff,
      phase: 1, timer: 0, angle: 0, spin: 0.8
    };
    S.bossActive = true;
  }

  function shootBullet(x,y,ang,speed,from,damage,r=4,life=2.2) {
    bullets.push({
      x,y,
      vx: Math.cos(ang)*speed,
      vy: Math.sin(ang)*speed,
      r, life, from, damage
    });
  }

  // Loop
  let last = performance.now();
  function loop(t) {
    requestAnimationFrame(loop);
    S.dt = Math.min(0.03, (t - last)/1000 || 0.016);
    last = t;
    if (!S.started) { draw(); return; }
    step();
    draw();
  }

  function step() {
    S.time += S.dt;

    // Movement
    let mvx = 0, mvy = 0;
    if (keys.has('KeyA')) mvx -= 1;
    if (keys.has('KeyD')) mvx += 1;
    if (keys.has('KeyW')) mvy -= 1;
    if (keys.has('KeyS')) mvy += 1;
    const len = Math.hypot(mvx,mvy) || 1;
    mvx /= len; mvy /= len;

    player.x += mvx * player.speed * S.dt;
    player.y += mvy * player.speed * S.dt;
    // bounds
    player.x = Math.max(20, Math.min(VW-20, player.x));
    player.y = Math.max(20, Math.min(VH-20, player.y));

    // Shooting
    player.fireCD -= S.dt;
    const shooting = mouse.down || keys.has('Space');
    if (shooting && player.fireCD <= 0) {
      player.fireCD = player.fireRate;
      const ang = aimAngle(player.x, player.y, mouse.x, mouse.y);
      shootBullet(player.x, player.y, ang, 540, 'p', 18, 4, 1.2);
      // slight recoil particles
      spawnSpark(player.x - Math.cos(ang)*10, player.y - Math.sin(ang)*10, ang+Math.PI, '#7ef0ff');
    }

    // Procedural wave control
    // Base spawn rate scales up with time, random jitter per second
    const baseRate = 1.2 + Math.min(2.2, S.time/25); // enemies/sec
    if (!S.bossActive) {
      waveSpawner.update(baseRate);
    }

    // Boss cycle every 30s
    if (S.time >= S.nextBossAt && !S.bossActive) {
      spawnBoss();
    }

    // Enemies AI
    for (const e of enemies) {
      e.timer += S.dt;
      if (e.type === 'chaser' || e.type === 'tank') {
        const ang = aimAngle(e.x, e.y, player.x, player.y);
        const sp = e.type === 'chaser' ? e.speed : e.speed * 0.8;
        e.x += Math.cos(ang) * sp * S.dt;
        e.y += Math.sin(ang) * sp * S.dt;
      } else if (e.type === 'shooter') {
        // strafe around player and shoot bursts
        const ang = aimAngle(e.x, e.y, player.x, player.y);
        const perp = ang + Math.PI/2;
        e.x += Math.cos(ang) * 40 * S.dt + Math.cos(perp) * 60 * Math.sin(e.timer*1.7) * S.dt;
        e.y += Math.sin(ang) * 40 * S.dt + Math.sin(perp) * 60 * Math.sin(e.timer*1.7) * S.dt;
        if (e.timer > 0.9) {
          e.timer = 0;
          // burst 3
          for (let i=-1;i<=1;i++){
            shootBullet(e.x, e.y, ang + i*0.09, 320, 'e', 9, 4, 3.0);
          }
        }
      }
    }

    // Boss logic
    if (boss) {
      boss.timer += S.dt;
      // Move in on spawn, then hover with slow drift
      if (boss.y < VH*0.28) boss.y += 60 * S.dt;
      else {
        boss.x += Math.sin(boss.timer*0.7) * 40 * S.dt;
        boss.y += Math.cos(boss.timer*0.9) * 20 * S.dt;
      }
      boss.angle += boss.spin * S.dt;

      // Phase patterns
      if (boss.phase === 1) {
        // Spiral bullets
        if ((boss.timer % 0.12) < S.dt) {
          const n = 8;
          for (let i=0;i<n;i++){
            const ang = boss.angle + i * (Math.PI*2/n);
            shootBullet(boss.x, boss.y, ang, 240, 'e', 10, 5, 4.0);
          }
        }
        if (boss.hp < boss.maxHP * 0.66) { boss.phase = 2; boss.timer = 0; }
      } else if (boss.phase === 2) {
        // Rings + adds
        if ((boss.timer % 1.1) < S.dt) {
          for (let i=0;i<12;i++){
            const ang = i * (Math.PI*2/12);
            shootBullet(boss.x, boss.y, ang, 200, 'e', 10, 5, 5.0);
          }
          // summon adds
          for (let i=0;i<3;i++) spawnEnemy();
        }
        if (boss.hp < boss.maxHP * 0.33) { boss.phase = 3; boss.timer = 0; }
      } else {
        // Aimed barrages
        if ((boss.timer % 0.6) < S.dt) {
          const ang = aimAngle(boss.x, boss.y, player.x, player.y);
          for (let i=-2;i<=2;i++){
            shootBullet(boss.x, boss.y, ang + i*0.06, 320, 'e', 12, 5, 4.5);
          }
        }
      }
      // Boss death
      if (boss.hp <= 0) {
        // clear bullets nearby and reward
        S.score += 300;
        S.bossActive = false;
        S.nextBossAt = Math.floor(S.time) + 30; // next scheduled 30s from now
        for (let i=0;i<80;i++) spawnSpark(boss.x, boss.y, randRange(0,Math.PI*2), '#ffef7e');
        boss = null;
        S.wave += 1;
      }
    }

    // Bullets update and lifetime
    for (let i=bullets.length-1;i>=0;i--) {
      const b = bullets[i];
      b.life -= S.dt;
      b.x += b.vx * S.dt;
      b.y += b.vy * S.dt;
      if (b.life <= 0 || b.x < -50 || b.x > VW+50 || b.y < -50 || b.y > VH+50) {
        bullets.splice(i,1);
      }
    }

    // Collisions
    // Player bullets vs enemies
    for (let i=enemies.length-1;i>=0;i--) {
      const e = enemies[i];
      for (let j=bullets.length-1;j>=0;j--) {
        const b = bullets[j];
        if (b.from !== 'p') continue;
        const dx = e.x - b.x, dy = e.y - b.y;
        if (dx*dx + dy*dy < (e.r + b.r)*(e.r + b.r)) {
          e.hp -= b.damage; bullets.splice(j,1);
          spawnSpark(b.x, b.y, Math.atan2(dy,dx)+Math.PI, '#ff9a7e');
          if (e.hp <= 0) {
            S.score += e.type === 'tank' ? 25 : (e.type === 'shooter' ? 18 : 12);
            for (let k=0;k<8;k++) spawnSpark(e.x, e.y, randRange(0,Math.PI*2), '#ff7ea8');
            enemies.splice(i,1);
          }
          break;
        }
      }
    }
    // Player bullets vs boss
    if (boss) {
      for (let j=bullets.length-1;j>=0;j--) {
        const b = bullets[j];
        if (b.from !== 'p') continue;
        const dx = boss.x - b.x, dy = boss.y - b.y;
        if (dx*dx + dy*dy < (boss.r + b.r)*(boss.r + b.r)) {
          boss.hp -= b.damage; bullets.splice(j,1);
          spawnSpark(b.x, b.y, Math.atan2(dy,dx)+Math.PI, '#ffd27e');
        }
      }
    }
    // Enemy bullets/enemies vs player
    // bullets
    for (let j=bullets.length-1;j>=0;j--) {
      const b = bullets[j];
      if (b.from !== 'e') continue;
      const dx = player.x - b.x, dy = player.y - b.y;
      if (dx*dx + dy*dy < (player.r + b.r)*(player.r + b.r)) {
        player.hp -= b.damage; bullets.splice(j,1);
        spawnSpark(b.x, b.y, Math.atan2(dy,dx)+Math.PI, '#ff5e7e');
      }
    }
    // enemies touch
    for (let i=enemies.length-1;i>=0;i--) {
      const e = enemies[i];
      const dx = player.x - e.x, dy = player.y - e.y;
      if (dx*dx + dy*dy < (player.r + e.r)*(player.r + e.r)) {
        player.hp -= e.type === 'tank' ? 20 : 12;
        // knockback enemy
        const ang = Math.atan2(dy,dx);
        e.x -= Math.cos(ang)*30; e.y -= Math.sin(ang)*30;
        spawnSpark(e.x, e.y, ang+Math.PI, '#ff5e7e');
      }
    }
    // boss touch
    if (boss) {
      const dx = player.x - boss.x, dy = player.y - boss.y;
      if (dx*dx + dy*dy < (player.r + boss.r)*(player.r + boss.r)) {
        player.hp -= 30 * S.dt;
      }
    }

    // Particles
    for (let i=particles.length-1;i>=0;i--) {
      const p = particles[i];
      p.life -= S.dt;
      p.x += Math.cos(p.ang)*p.spd * S.dt;
      p.y += Math.sin(p.ang)*p.spd * S.dt;
      if (p.life <= 0) particles.splice(i,1);
    }

    // Game over
    if (player.hp <= 0 && !S.over) {
      S.over = true; S.started = false;
    }

    updateHUD();
  }

  // Procedural spawner object
  const waveSpawner = {
    acc: 0,
    update(ratePerSec) {
      // Poisson-like spawn: accumulate and spawn when threshold passes 1
      this.acc += ratePerSec * S.dt * (0.7 + rand()*0.6);
      while (this.acc >= 1) {
        this.acc -= 1;
        spawnEnemy();
      }
      // Increase wave count periodically
      if ((Math.floor(S.time/20) + 1) > S.wave && !S.bossActive) {
        S.wave += 1;
      }
    }
  };

  function spawnSpark(x,y,ang,color) {
    particles.push({x,y,ang,spd: randRange(140,260), life: randRange(0.2,0.6), color});
  }

  function drawBG() {
    // Subtle grid parallax
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    const step = 40;
    for (let x=0;x<VW;x+=step){
      ctx.beginPath();
      ctx.moveTo(x,0); ctx.lineTo(x,VH); ctx.stroke();
    }
    for (let y=0;y<VH;y+=step){
      ctx.beginPath();
      ctx.moveTo(0,y); ctx.lineTo(VW,y); ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayer() {
    ctx.save();
    const ang = aimAngle(player.x, player.y, mouse.x, mouse.y);
    ctx.translate(player.x, player.y);
    ctx.rotate(ang);
    // glow
    ctx.shadowColor = '#7ef0ff';
    ctx.shadowBlur = 14;
    // body
    ctx.fillStyle = '#97ff9a';
    ctx.beginPath();
    ctx.moveTo(18,0);
    ctx.lineTo(-12,-10);
    ctx.lineTo(-6,0);
    ctx.lineTo(-12,10);
    ctx.closePath();
    ctx.fill();
    // inner
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-4,0,2,0,Math.PI*2);
    ctx.fill();
    ctx.restore();

    // hp ring
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r+8, 0, Math.PI*2);
    ctx.stroke();
    ctx.strokeStyle = '#7ef0ff';
    const pct = Math.max(0, player.hp/100);
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r+8, -Math.PI/2, -Math.PI/2 + pct*2*Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  function drawEnemies() {
    for (const e of enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.fillStyle = e.type === 'tank' ? '#d26eff' : (e.type === 'shooter' ? '#ffb36e' : '#ff5e7e');
      ctx.beginPath();
      ctx.arc(0,0,e.r,0,Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawBoss() {
    if (!boss) return;
    ctx.save();
    ctx.translate(boss.x, boss.y);
    ctx.rotate(boss.angle * 0.6);
    // body
    ctx.fillStyle = '#7ea7ff';
    ctx.beginPath();
    ctx.arc(0,0,boss.r,0,Math.PI*2);
    ctx.fill();
    // spokes
    ctx.strokeStyle = '#c1d3ff';
    ctx.lineWidth = 4;
    for (let i=0;i<6;i++){
      const a = boss.angle + i * (Math.PI*2/6);
      ctx.beginPath();
      ctx.moveTo(0,0);
      ctx.lineTo(Math.cos(a)*(boss.r+10), Math.sin(a)*(boss.r+10));
      ctx.stroke();
    }
    // hp bar
    const w = 360, h = 10;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(VW/2 - w/2, 20, w, h);
    ctx.fillStyle = '#7ef0ff';
    const pct = Math.max(0,boss.hp/boss.maxHP);
    ctx.fillRect(VW/2 - w/2, 20, w*pct, h);
    ctx.restore();
  }

  function drawBullets() {
    for (const b of bullets) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.fillStyle = b.from === 'p' ? '#7ef0ff' : '#ffef7e';
      ctx.beginPath();
      ctx.arc(0,0,b.r,0,Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life*1.8);
      ctx.fillStyle = p.color || '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawOverlay() {
    if (!S.started && !S.over) {
      banner('Top-Down Shooter', 'Arrow keys move • Mouse aims • Click/Space shoots • Press Start');
    } else if (S.over) {
      banner('Game Over', `Score ${Math.floor(S.score)} — Press R/Space to Restart`);
    }
  }
  function banner(title, sub) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, VH*0.3 - 60, VW, 130);
    ctx.fillStyle = '#fff';
    ctx.font = '700 40px system-ui, Segoe UI, Arial';
    ctx.textAlign = 'center';
    ctx.fillText(title, VW/2, VH*0.3);
    ctx.font = '600 18px system-ui, Segoe UI, Arial';
    ctx.fillText(sub, VW/2, VH*0.3 + 36);
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0,0,VW,VH);
    drawBG();
    drawEnemies();
    drawBoss();
    drawBullets();
    drawPlayer();
    drawParticles();
    drawOverlay();
  }

  function updateHUD() {
    elScore.textContent = Math.floor(S.score);
    elTime.textContent = S.time.toFixed(1);
    elHP.textContent = Math.max(0, Math.floor(player.hp));
    elWave.textContent = S.wave;
    elBoss.textContent = boss ? `HP ${Math.ceil(boss.hp)}` : '—';
  }

  // Restart with R
  addEventListener('keydown', e => { if (e.code === 'KeyR') start(); });

  requestAnimationFrame(loop);
})();

