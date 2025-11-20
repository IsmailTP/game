// Malware-themed Dual-Joystick Top-Down Shooter
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // device fit
  function fit() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const maxW = Math.min(window.innerWidth, 1100);
    const maxH = Math.min(window.innerHeight, 800);
    const baseW = 960, baseH = 540;
    let w = baseW, h = baseH;
    if (maxW / maxH < w / h) { w = maxW; h = Math.round(maxW * (baseH/baseW)); }
    else { h = maxH; w = Math.round(maxH * (baseW/baseH)); }
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
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
  const startBtn = document.getElementById('startBtn');
  startBtn.addEventListener('click', start);

  
// --------------------------------------
// FULLSCREEN BUTTON HANDLER (MOBILE/PC)
// --------------------------------------
const fsBtn = document.getElementById('fsBtn');

fsBtn.addEventListener('click', () => {
  const elem = document.documentElement;
  if (!document.fullscreenElement) {
    elem.requestFullscreen().catch(err => console.log(err));
  } else {
    document.exitFullscreen();
  }
});

  // state
  const S = { started:false, over:false, time:0, dt:0, score:0, wave:1, rngSeed:12345, bossActive:false, nextBossAt:25 };

  function rand() { S.rngSeed = (1664525 * S.rngSeed + 1013904223) >>> 0; return (S.rngSeed & 0xffffff)/0x1000000; }
  function randRange(a,b){ return a + rand()*(b-a); }

  // input
  const keys = new Set();
  const mouse = { x:0, y:0, down:false };

  addEventListener('keydown', e => {
    if (['KeyW','KeyA','KeyS','KeyD','Space','KeyR'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if (!S.started && (e.code === 'Space' || e.code === 'Enter')) start();
    if (S.over && (e.code === 'Space' || e.code === 'KeyR' || e.code === 'Enter')) start();
  });
  addEventListener('keyup', e => keys.delete(e.code));

  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    const sx = VW / r.width, sy = VH / r.height;
    mouse.x = (e.clientX - r.left) * sx;
    mouse.y = (e.clientY - r.top) * sy;
  });
  canvas.addEventListener('mousedown', () => mouse.down = true);
  addEventListener('mouseup', () => mouse.down = false);

  // Controls: left joystick = move, right joystick = aim+auto-shoot
  let joyLActive = false, joyRActive = false;
  let joyLStartX = 0, joyLStartY = 0, joyRStartX = 0, joyRStartY = 0;
  let joyLDX = 0, joyLDY = 0, joyRDX = 0, joyRDY = 0;

  const joyL = document.getElementById('joystick-left');
  const stickL = document.getElementById('stick-left');
  const joyR = document.getElementById('joystick-right');
  const stickR = document.getElementById('stick-right');

  function setStickLeft(dx, dy){
    if (!stickL) return;
    stickL.style.left = (40 + dx * 30) + 'px';
    stickL.style.top = (40 + dy * 30) + 'px';
  }
  function setStickRight(dx, dy){
    if (!stickR) return;
    stickR.style.left = (40 + dx * 30) + 'px';
    stickR.style.top = (40 + dy * 30) + 'px';
  }

  // Multi-pointer tracking (for canvas aim fallback)
  const activePointers = new Map();
  function updateAimFromPointers(){
    // If right thumb active, we prefer right joystick for aim.
    if (joyRActive) return;
    for (const p of activePointers.values()){
      if (p.target === canvas){
        const r = canvas.getBoundingClientRect();
        const sx = VW / r.width, sy = VH / r.height;
        mouse.x = (p.clientX - r.left) * sx;
        mouse.y = (p.clientY - r.top) * sy;
      }
    }
  }

  // Pointer handlers for canvas (aim by dragging the screen)
  canvas.addEventListener('pointerdown', e => { activePointers.set(e.pointerId, e); updateAimFromPointers(); });
  canvas.addEventListener('pointermove', e => { activePointers.set(e.pointerId, e); updateAimFromPointers(); });
  canvas.addEventListener('pointerup', e => { activePointers.delete(e.pointerId); });
  canvas.addEventListener('pointercancel', e => { activePointers.delete(e.pointerId); });

  // LEFT joystick (move)
  if (joyL && stickL){
    joyL.addEventListener('pointerdown', e => {
      joyLActive = true; activePointers.set(e.pointerId, e);
      const r = joyL.getBoundingClientRect();
      joyLStartX = r.left + r.width/2; joyLStartY = r.top + r.height/2;
      e.preventDefault();
    });
    joyL.addEventListener('pointermove', e => {
      if (!joyLActive) return;
      activePointers.set(e.pointerId, e);
      let dx = e.clientX - joyLStartX; let dy = e.clientY - joyLStartY;
      const dist = Math.hypot(dx,dy); const max = 40;
      if (dist > max){ dx = dx/dist*max; dy = dy/dist*max; }
      joyLDX = dx / max; joyLDY = dy / max;
      setStickLeft(joyLDX, joyLDY);
      e.preventDefault();
    });
    joyL.addEventListener('pointerup', e => {
      joyLActive = false; joyLDX = joyLDY = 0; setStickLeft(0,0); activePointers.delete(e.pointerId);
    });
    joyL.addEventListener('pointercancel', e => {
      joyLActive = false; joyLDX = joyLDY = 0; setStickLeft(0,0); activePointers.delete(e.pointerId);
    });
  }

  // RIGHT joystick (aim + auto-shoot)
  if (joyR && stickR){
    joyR.addEventListener('pointerdown', e => {
      joyRActive = true; activePointers.set(e.pointerId, e);
      const r = joyR.getBoundingClientRect();
      joyRStartX = r.left + r.width/2; joyRStartY = r.top + r.height/2;
      // set initial small aim so immediate fire if desired
      e.preventDefault();
    });

    joyR.addEventListener('pointermove', e => {
      if (!joyRActive) return;
      activePointers.set(e.pointerId, e);
      let dx = e.clientX - joyRStartX; let dy = e.clientY - joyRStartY;
      const dist = Math.hypot(dx,dy); const max = 40;
      if (dist > max){ dx = dx/dist*max; dy = dy/dist*max; }
      joyRDX = dx / max; joyRDY = dy / max;
      setStickRight(joyRDX, joyRDY);

      // map right joystick vector to mouse/aim position (relative to player)
      // larger multiplier gives farther aiming point
      const aimDist = Math.max(80, Math.min(360, dist*5));
      mouse.x = player.x + joyRDX * aimDist;
      mouse.y = player.y + joyRDY * aimDist;

      // auto-shoot while right joystick is held
      mouse.down = (Math.hypot(joyRDX, joyRDY) > 0.05);
      e.preventDefault();
    });

    joyR.addEventListener('pointerup', e => {
      joyRActive = false; joyRDX = joyRDY = 0; setStickRight(0,0);
      mouse.down = false; activePointers.delete(e.pointerId);
    });
    joyR.addEventListener('pointercancel', e => {
      joyRActive = false; joyRDX = joyRDY = 0; setStickRight(0,0);
      mouse.down = false; activePointers.delete(e.pointerId);
    });
  }

  // Entities
  const player = { x:VW/2, y:VH/2, r:14, speed:260, hp:100, fireCD:0, fireRate:0.12 };
  const bullets = [], enemies = [], particles = [];
  let boss = null;

  function start(){
    S.started = true; S.over = false; S.time = 0; S.score = 0; S.wave = 1;
    S.rngSeed = (Math.random()*1e9)|0; S.bossActive = false; S.nextBossAt = 25;
    bullets.length = 0; enemies.length = 0; particles.length = 0; boss = null;
    player.x = VW/2; player.y = VH/2; player.hp = 100; player.fireCD = 0;
    updateHUD();
  }

  function aimAngle(ax,ay,bx,by){ return Math.atan2(by-ay, bx-ax); }
  function spawnEnemy(){
    const t = rand() < 0.45 ? 'trojan' : (rand() < 0.7 ? 'worm' : 'spyware');
    const edge = rand();
    let x,y;
    if (edge < 0.25) { x = -30; y = randRange(30,VH-30); }
    else if (edge < 0.5) { x = VW+30; y = randRange(30,VH-30); }
    else if (edge < 0.75) { x = randRange(30,VW-30); y = -30; }
    else { x = randRange(30,VW-30); y = VH+30; }
    const difficulty = 1 + Math.min(3, S.time/40);
    if (t === 'trojan') enemies.push({x,y,r:14,hp:18*difficulty,speed:110,type:t, timer:0});
    else if (t === 'worm') enemies.push({x,y,r:12,hp:26*difficulty,speed:60,type:t,timer:randRange(0,1)});
    else enemies.push({x,y,r:10,hp:10*difficulty,speed:160,type:t,timer:0});
  }

  function spawnBoss(){
    const d = 1 + S.time/60;
    boss = { x:VW/2, y:-120, r:56, hp:1000*d, maxHP:1000*d, timer:0, phase:1, angle:0 };
    S.bossActive = true;
  }

  function shootBullet(x,y,ang,speed,from,damage,r=4,life=2.2){
    bullets.push({ x,y, vx:Math.cos(ang)*speed, vy:Math.sin(ang)*speed, from, damage, r, life });
  }

  // loop
  let last = performance.now();
  function loop(t){
    requestAnimationFrame(loop);
    S.dt = Math.min(0.03, (t-last)/1000 || 0.016);
    last = t;
    if (!S.started){ draw(); return; }
    step(); draw();
  }

  function step(){
    S.time += S.dt;

    // movement (keyboard + left joystick)
    let mvx = 0, mvy = 0;
    if (keys.has('KeyA')) mvx -= 1;
    if (keys.has('KeyD')) mvx += 1;
    if (keys.has('KeyW')) mvy -= 1;
    if (keys.has('KeyS')) mvy += 1;
    if (joyLActive) { mvx = joyLDX; mvy = joyLDY; }
    const len = Math.hypot(mvx,mvy) || 1; mvx /= len; mvy /= len;
    player.x += mvx * player.speed * S.dt; player.y += mvy * player.speed * S.dt;
    player.x = Math.max(20, Math.min(VW-20, player.x)); player.y = Math.max(20, Math.min(VH-20, player.y));

    // shooting (auto if right joystick held, or keyboard space)
    player.fireCD -= S.dt;
    const shooting = mouse.down || keys.has('Space');
    if (shooting && player.fireCD <= 0){
      player.fireCD = player.fireRate;
      const ang = aimAngle(player.x, player.y, mouse.x, mouse.y);
      shootBullet(player.x, player.y, ang, 560, 'p', 18, 4, 1.2);
      for (let i=0;i<3;i++) particles.push({x:player.x,y:player.y,ang:ang+Math.PI+randRange(-0.2,0.2),spd:randRange(60,140),life:0.16,color:'#7ef0ff'});
    }

    // spawn and waves
    const baseRate = 1.0 + Math.min(2.4, S.time/22);
    if (!S.bossActive) waveSpawner.update(baseRate);
    if (S.time >= S.nextBossAt && !S.bossActive) spawnBoss();

    // enemies
    for (const e of enemies){
      e.timer += S.dt;
      const ang = aimAngle(e.x,e.y, player.x, player.y);
      if (e.type === 'trojan') { e.x += Math.cos(ang) * e.speed * S.dt; e.y += Math.sin(ang) * e.speed * S.dt; }
      else if (e.type === 'worm') {
        const perp = ang + Math.PI/2;
        e.x += Math.cos(ang)*40*S.dt + Math.cos(perp)*40*Math.sin(e.timer*2.0)*S.dt;
        e.y += Math.sin(ang)*40*S.dt + Math.sin(perp)*40*Math.sin(e.timer*2.0)*S.dt;
        if (e.timer > 1.0){ e.timer = 0; shootBullet(e.x,e.y,ang,300,'e',9,4,2.6); }
      } else { e.x += Math.cos(ang)*e.speed*S.dt; e.y += Math.sin(ang)*e.speed*S.dt; }
    }

    // boss behavior (same as earlier)
    if (boss){
      boss.timer += S.dt;
      if (boss.y < VH*0.22) boss.y += 80 * S.dt;
      else { boss.x += Math.sin(boss.timer*0.5)*60*S.dt; boss.angle += 0.9*S.dt; }
      if (boss.phase === 1){
        if ((boss.timer % 0.14) < S.dt){ for (let i=0;i<10;i++) shootBullet(boss.x,boss.y, boss.angle + i*(Math.PI*2/10), 240, 'e', 10, 6, 3.6); }
        if (boss.hp < boss.maxHP*0.66){ boss.phase = 2; boss.timer = 0; }
      } else if (boss.phase === 2){
        if ((boss.timer % 1.0) < S.dt){ for (let i=0;i<14;i++) shootBullet(boss.x,boss.y, i*(Math.PI*2/14), 260, 'e', 11, 6, 4.6); for (let k=0;k<3;k++) spawnEnemy(); }
        if (boss.hp < boss.maxHP*0.33){ boss.phase = 3; boss.timer = 0; }
      } else {
        if ((boss.timer % 0.6) < S.dt){ const a = aimAngle(boss.x,boss.y, player.x, player.y); for (let i=-2;i<=2;i++) shootBullet(boss.x,boss.y, a + i*0.06, 320, 'e', 14, 6, 4.2); }
      }
      if (boss.hp <= 0){ S.score += 400; S.bossActive = false; S.nextBossAt = Math.floor(S.time)+30; for (let i=0;i<80;i++) particles.push({x:boss.x,y:boss.y,ang:randRange(0,Math.PI*2),spd:randRange(80,260),life:randRange(0.4,1.2),color:'#ffef7e'}); boss=null; S.wave+=1; }
    }

    // bullets update
    for (let i=bullets.length-1;i>=0;i--){ const b=bullets[i]; b.life-=S.dt; b.x+=b.vx*S.dt; b.y+=b.vy*S.dt; if (b.life<=0||b.x<-80||b.x>VW+80||b.y<-80||b.y>VH+80) bullets.splice(i,1); }

    // collisions: player bullets -> enemies
    for (let i=enemies.length-1;i>=0;i--){
      const e=enemies[i];
      for (let j=bullets.length-1;j>=0;j--){
        const b=bullets[j]; if (b.from!=='p') continue;
        const dx=e.x-b.x, dy=e.y-b.y;
        if (dx*dx+dy*dy < (e.r+b.r)*(e.r+b.r)){ e.hp-=b.damage; bullets.splice(j,1); for (let k=0;k<6;k++) particles.push({x:e.x,y:e.y,ang:randRange(0,Math.PI*2),spd:randRange(80,220),life:randRange(0.2,0.6),color:'#ff7ea8'}); if (e.hp<=0){ enemies.splice(i,1); S.score += (e.type==='worm'?18:12); } break; }
      }
    }

    // enemy bullets -> player
    for (let j=bullets.length-1;j>=0;j--){ const b=bullets[j]; if (b.from!=='e') continue; const dx=player.x-b.x, dy=player.y-b.y; if (dx*dx+dy*dy < (player.r+b.r)*(player.r+b.r)){ player.hp -= b.damage; bullets.splice(j,1); for (let k=0;k<8;k++) particles.push({x:player.x,y:player.y,ang:randRange(0,Math.PI*2),spd:randRange(80,200),life:0.35,color:'#ff5e7e'}); } }

    // enemy touch damage
    for (let i=enemies.length-1;i>=0;i--){ const e=enemies[i]; const dx=player.x-e.x, dy=player.y-e.y; if (dx*dx+dy*dy < (player.r+e.r)*(player.r+e.r)) player.hp -= (e.type==='trojan'?18:10)*S.dt*3; }

    // boss collision
    if (boss){ const dx=player.x-boss.x, dy=player.y-boss.y; if (dx*dx+dy*dy < (player.r+boss.r)*(player.r+boss.r)) player.hp -= 40 * S.dt; }

    // particles
    for (let i=particles.length-1;i>=0;i--){ const p=particles[i]; p.life-=S.dt; p.x += Math.cos(p.ang)*p.spd*S.dt; p.y += Math.sin(p.ang)*p.spd*S.dt; if (p.life<=0) particles.splice(i,1); }

    // game over
 if (player.hp <= 0 && !S.over){
  S.over = true;
  S.started = false;

  const name = localStorage.getItem("playerName") || "Unknown";
  const score = Math.floor(S.score);

  // Try to send to Firebase (window.sendScore created in index.html)
  if (typeof window.sendScore === 'function'){
    window.sendScore(name, score).then(ok => {
      if (!ok) {
        // fallback to localStorage if Firebase push fails
        const board = JSON.parse(localStorage.getItem("scoreboard") || "[]");
        board.push({ name, score, time: Date.now() });
        board.sort((a,b) => b.score - a.score);
        localStorage.setItem("scoreboard", JSON.stringify(board.slice(0,10)));
      }
    }).catch(() => {
      const board = JSON.parse(localStorage.getItem("scoreboard") || "[]");
      board.push({ name, score, time: Date.now() });
      board.sort((a,b) => b.score - a.score);
      localStorage.setItem("scoreboard", JSON.stringify(board.slice(0,10)));
    });
  } else {
    // no firebase helper available — use localStorage
    const board = JSON.parse(localStorage.getItem("scoreboard") || "[]");
    board.push({ name, score, time: Date.now() });
    board.sort((a,b) => b.score - a.score);
    localStorage.setItem("scoreboard", JSON.stringify(board.slice(0,10)));
  }
}


    updateHUD();
  }

  const waveSpawner = {
    acc:0,
    update(ratePerSec){
      this.acc += ratePerSec * S.dt * (0.6 + rand()*0.8);
      while (this.acc >= 1){ this.acc -= 1; spawnEnemy(); }
      if ((Math.floor(S.time/18)+1) > S.wave && !S.bossActive) S.wave += 1;
    }
  };

  // draw helpers
  function drawBG(){
    ctx.clearRect(0,0,VW,VH);
    ctx.save(); ctx.globalAlpha = 0.08; ctx.strokeStyle = '#7ef0ff'; ctx.lineWidth = 1;
    for (let x=0;x<VW;x+=40){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,VH); ctx.stroke(); }
    for (let y=0;y<VH;y+=40){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(VW,y); ctx.stroke(); }
    ctx.restore();
  }
  function drawEnemies(){
    for (const e of enemies){
      ctx.save(); ctx.translate(e.x,e.y);
      if (e.type==='trojan'){
        ctx.fillStyle = '#ff6b8a'; ctx.beginPath(); ctx.moveTo(0,-e.r); ctx.lineTo(e.r,e.r); ctx.lineTo(-e.r,e.r); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#2c2c3a'; ctx.fillRect(-4,-2,8,6); ctx.fillRect(-2,-8,4,6);
      } else if (e.type==='worm'){
        for (let i=0;i<4;i++){ ctx.fillStyle = i%2? '#ffb36e' : '#ff7ea8'; ctx.beginPath(); ctx.arc(-i*6,0,e.r - i*2,0,Math.PI*2); ctx.fill(); }
      } else {
        ctx.beginPath(); ctx.fillStyle = '#ffd36b'; ctx.arc(0,0,e.r,0,Math.PI*2); ctx.fill();
        ctx.globalAlpha = 0.2; ctx.beginPath(); ctx.fillStyle = '#ffd36b'; ctx.arc(0,0,e.r+8,0,Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }
  function drawBoss(){
    if (!boss) return;
    ctx.save(); ctx.translate(boss.x,boss.y); ctx.rotate(boss.angle);
    ctx.fillStyle = '#b07eff'; ctx.beginPath(); ctx.arc(0,0,boss.r,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#2c2c3a'; ctx.fillRect(-boss.r*0.45, -boss.r*0.05, boss.r*0.9, boss.r*0.35);
    ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(0, -boss.r*0.2, boss.r*0.22, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    const w = Math.min(480, VW-80), h = 10;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(VW/2 - w/2, 16, w, h);
    ctx.fillStyle = '#ffb36e'; ctx.fillRect(VW/2 - w/2, 16, w * Math.max(0, boss.hp / boss.maxHP), h);
  }
  function drawBullets(){ for (const b of bullets){ ctx.save(); ctx.translate(b.x,b.y); ctx.fillStyle = (b.from==='p')? '#7ef0ff' : '#ffef7e'; ctx.beginPath(); ctx.arc(0,0,b.r,0,Math.PI*2); ctx.fill(); ctx.restore(); } }
  function drawParticles(){ for (const p of particles){ ctx.save(); ctx.globalAlpha = Math.max(0, p.life*1.6); ctx.fillStyle = p.color || '#fff'; ctx.beginPath(); ctx.arc(p.x,p.y,2,0,Math.PI*2); ctx.fill(); ctx.restore(); } }

  function drawPlayer(){
    const ang = aimAngle(player.x, player.y, mouse.x, mouse.y);
    ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(ang);
    ctx.shadowColor = '#7ef0ff'; ctx.shadowBlur = 12; ctx.fillStyle = '#97ff9a';
    ctx.beginPath(); ctx.moveTo(18,0); ctx.lineTo(-12,-10); ctx.lineTo(-6,0); ctx.lineTo(-12,10); ctx.closePath(); ctx.fill();
    ctx.restore();
    // HP ring
    ctx.save(); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(player.x, player.y, player.r+8, 0, Math.PI*2); ctx.stroke();
    ctx.strokeStyle = '#7ef0ff'; const pct = Math.max(0, player.hp/100); ctx.beginPath(); ctx.arc(player.x, player.y, player.r+8, -Math.PI/2, -Math.PI/2 + pct*2*Math.PI); ctx.stroke(); ctx.restore();
  }

  function banner(title, sub){
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, VH*0.28 - 60, VW, 140);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '700 40px system-ui, Arial'; ctx.fillText(title, VW/2, VH*0.28);
    ctx.font = '600 16px system-ui, Arial'; ctx.fillText(sub, VW/2, VH*0.28 + 40); ctx.restore();
  }

  function drawOverlay(){ if (!S.started && !S.over) banner('MALWARE DEFENDER', 'Left: Move • Right: Aim & Auto-shoot • Press Start'); else if (S.over) banner('SYSTEM FAILURE', `Score ${Math.floor(S.score)} — Press R / Space to Restart`); }

  function draw(){
    drawBG(); drawEnemies(); drawBoss(); drawBullets(); drawPlayer(); drawParticles(); drawOverlay();
  }

  function updateHUD(){ elScore.textContent = Math.floor(S.score); elTime.textContent = S.time.toFixed(1); elHP.textContent = Math.max(0, Math.floor(player.hp)); elWave.textContent = S.wave; elBoss.textContent = boss ? `HP ${Math.ceil(boss.hp)}` : '—'; }

  addEventListener('keydown', e => { if (e.code === 'KeyR') start(); });

  requestAnimationFrame(loop);
})();
