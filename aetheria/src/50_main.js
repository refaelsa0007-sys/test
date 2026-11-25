
// ================= CAMERA STATE =================
const cam = { yaw: 0, pitch: 0.32, dist: 9.5, pos: new THREE.Vector3(), look: new THREE.Vector3(), shake: 0, shakeT: 0, cut: false };
const drone = { active: false, x: 0, z: 0, alt: 340, yaw: 0 };
let titleMode = true, titleT = 0;
let state = 'loading', paused = false;
const canAct = () => state === 'play' && !player.dead && !cinemaActive() && !paused && !drone.active && !journalOpen;

// ================= PLAYER UPDATE =================
const keys = {}; const moveInput = { x: 0, z: 0, len: 0 };
let jumpQueued = false, realTime = 0;
const touchState = { joy: { x: 0, y: 0 }, attackHeld: false };
function updatePlayer(dt) {
  const p = player;
  if (p.dead) { hero.root.rotation.z = damp(hero.root.rotation.z, 1.4, 4, dt); return; }
  hero.root.rotation.z = 0;
  for (const k in p.cds) p.cds[k] = Math.max(0, p.cds[k] - dt);
  p.iframes = Math.max(0, p.iframes - dt); p.dashCd = Math.max(0, p.dashCd - dt); p.comboWindow -= dt;
  const free = canAct();
  let ix = 0, iz = 0;
  if (free) { if (keys.KeyW || keys.ArrowUp) iz += 1; if (keys.KeyS || keys.ArrowDown) iz -= 1; if (keys.KeyA) ix -= 1; if (keys.KeyD) ix += 1; ix += touchState.joy.x; iz += touchState.joy.y; }
  const len = Math.min(1, Math.hypot(ix, iz)); if (Math.hypot(ix, iz) > 1) { const l = Math.hypot(ix, iz); ix /= l; iz /= l; }
  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
  const mx = -sy * iz + cy * ix, mz = -cy * iz - sy * ix;
  moveInput.x = mx; moveInput.z = mz; moveInput.len = len;
  const moving = len > 0.1;
  const sprinting = (keys.ShiftLeft || keys.ShiftRight || len > 0.95 && isTouch) && moving && p.st > 1 && p.atkTimer <= 0;
  let speed = (sprinting ? 13.5 : 8) * (isTouch ? Math.max(len, 0.4) : 1);
  if (p.atkTimer > 0) speed *= 0.3;
  if (sprinting) p.st = Math.max(0, p.st - 20 * dt); else if (p.dashT <= 0) p.st = Math.min(p.maxSt, p.st + 20 * dt);
  if (p.dashT > 0) {
    p.dashT -= dt; p.vel.x = p.dashDir.x * 30; p.vel.z = p.dashDir.y * 30;
    for (let i = 0; i < 4; i++) fx.emit(p.pos.x + rand(-0.4, 0.4), p.pos.y + rand(0.3, 1.9), p.pos.z + rand(-0.4, 0.4), 0, 0.5, 0, 0.4, 1.8, 3.0, rand(0.3, 0.55), 0.35, { drag: 2 });
  } else { const l = moving ? 14 : 10; p.vel.x = damp(p.vel.x, mx * speed, l, dt); p.vel.z = damp(p.vel.z, mz * speed, l, dt); }
  if (moving && p.atkTimer <= 0 && p.dashT <= 0) p.facing = lerpAngle(p.facing, Math.atan2(mx, mz), 1 - Math.exp(-12 * dt));
  const np = { x: p.pos.x + p.vel.x * dt, z: p.pos.z + p.vel.z * dt };
  if (getHeight(np.x, np.z) < -1.6) { if (getHeight(np.x, p.pos.z) >= -1.6) np.z = p.pos.z; else if (getHeight(p.pos.x, np.z) >= -1.6) np.x = p.pos.x; else { np.x = p.pos.x; np.z = p.pos.z; } }
  resolveCollisions(np, 0.5);
  p.pos.x = np.x; p.pos.z = np.z;
  const gh = getHeight(p.pos.x, p.pos.z);
  if (jumpQueued && p.onGround && free) { p.vy = 9.5; p.onGround = false; }
  jumpQueued = false;
  p.vy -= 26 * dt; p.pos.y += p.vy * dt;
  if (p.pos.y <= gh) { if (!p.onGround && p.vy < -11) { p.pop = 1; dust.burst(p.pos.x, gh + 0.2, p.pos.z, 12, 4, [0.55, 0.5, 0.42], 0.8, 0.8, { drag: 3, s1: 1.6 }); AudioSys.play('step'); } p.pos.y = gh; p.vy = 0; p.onGround = true; }
  else if (p.onGround && p.vy <= 0 && p.pos.y - gh < 0.8) { p.pos.y = gh; p.vy = 0; }
  else p.onGround = false;
  if (p.atkTimer > 0) {
    p.atkTimer -= dt; const el = p.atkTotal - p.atkTimer;
    if (!p.hitDone && el >= p.atkTotal * 0.32) { p.hitDone = true; doMeleeHit(); }
    if (p.atkTimer <= 0) { p.atkTimer = 0; if (p.atkQueued) { p.atkQueued = false; startSwing(); } }
  }
  if (touchState.attackHeld && p.atkTimer <= 0) tryAttack();
  if (realTime - p.lastHurt > 6) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.03 * dt);
  p.mp = Math.min(p.maxMp, p.mp + (6 + p.lvl) * dt);
  const sp = Math.hypot(p.vel.x, p.vel.z);
  if (p.onGround && sp > 2) {
    p.stepT -= dt * sp / 8;
    if (p.stepT <= 0) { p.stepT = 0.32; if (gh < 0.1) fx.burst(p.pos.x, 0.1, p.pos.z, 8, 3, [1.2, 1.4, 1.6], 0.3, 0.5, { up: 1, g: 9 }); else if (sprinting) dust.burst(p.pos.x, gh + 0.15, p.pos.z, 4, 1.5, [0.55, 0.5, 0.42], 0.6, 0.7, { drag: 2, s1: 1.2 }); }
  }
  animateHero(dt, sp, sprinting);
}
function animateHero(dt, sp, sprinting) {
  const p = player, h = hero;
  h.root.position.copy(p.pos);
  const lp = popValue(p, dt); h.root.scale.set(1 + 0.12 * lp, 1 - 0.16 * lp, 1 + 0.12 * lp);
  let face = p.facing;
  const atkK = p.atkTimer > 0 ? 1 - p.atkTimer / p.atkTotal : 0;
  if (p.combo === 2 && p.atkTimer > 0) face += smooth(0.15, 0.7, atkK) * Math.PI * 2;
  h.root.rotation.y = face;
  // lying on the sand at the start of the story; stands up as `lying` eases to 0
  if (p.lying > 0) { h.root.rotation.x = -1.45 * p.lying; h.root.position.y += 0.25 * p.lying; }
  else h.root.rotation.x = 0;
  p.walkPhase += dt * sp * 1.25;
  const amp = Math.min(1, sp / 8) * (p.onGround ? 1 : 0.2);
  const s = Math.sin(p.walkPhase);
  if (p.onGround) { h.legL.rotation.x = s * 0.85 * amp; h.legR.rotation.x = -s * 0.85 * amp; }
  else { h.legL.rotation.x = damp(h.legL.rotation.x, -0.7, 10, dt); h.legR.rotation.x = damp(h.legR.rotation.x, 0.35, 10, dt); }
  h.body.position.y = 0.95 + Math.abs(Math.cos(p.walkPhase)) * 0.07 * amp + Math.sin(realTime * 2) * 0.01;
  h.body.rotation.x = damp(h.body.rotation.x, p.dashT > 0 ? 0.5 : sprinting ? 0.22 : 0.04 * amp, 10, dt);
  let armRX = s * 0.6 * amp, bodyY = 0, armRZ = 0;
  if (p.atkTimer > 0) {
    if (p.combo === 2) { armRX = -1.55; armRZ = 0.9; }
    else { const dir = p.combo === 0 ? 1 : -1; armRX = -1.55; const sweep = atkK < 0.3 ? lerp(0, 1, atkK / 0.3) : lerp(1, -1, smooth(0.3, 0.6, atkK)); bodyY = sweep * 1.1 * dir; armRZ = -sweep * 0.5 * dir; }
  }
  h.armR.rotation.x = damp(h.armR.rotation.x, armRX, 28, dt); h.armR.rotation.z = damp(h.armR.rotation.z, armRZ, 28, dt);
  h.body.rotation.y = damp(h.body.rotation.y, bodyY, 30, dt);
  const castL = h.armL.userData.cast || 0; h.armL.userData.cast = Math.max(0, castL - dt);
  h.armL.rotation.x = damp(h.armL.rotation.x, castL > 0 ? -1.6 : -s * 0.6 * amp, 20, dt);
  h.armL.rotation.z = damp(h.armL.rotation.z, castL > 0 ? -0.3 : 0, 20, dt);
  animateCape(dt, sp);
  if (p.atkTimer > 0 && atkK > 0.2 && atkK < 0.75) { const c = bladeInfo[p.blade].color; const wp = h.sword.localToWorld(new THREE.Vector3(0, -1.1, 0)); fx.emit(wp.x, wp.y, wp.z, 0, 0, 0, c[0], c[1], c[2], 0.35, 0.25, { drag: 1 }); }
  if (p.iframes > 0 && p.dashT <= 0) h.root.visible = Math.floor(realTime * 30) % 2 === 0 || p.iframes < 0.1; else h.root.visible = true;
}

// ================= PROJECTILE / LOOT UPDATE =================
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i]; pr.life -= dt; pr.mesh.position.addScaledVector(pr.vel, dt);
    const pp = pr.mesh.position;
    for (let k = 0; k < 3; k++) fx.emit(pp.x + rand(-0.15, 0.15), pp.y + rand(-0.15, 0.15), pp.z + rand(-0.15, 0.15), rand(-1, 1), rand(0, 1.5), rand(-1, 1), 4, rand(1.2, 2), 0.35, rand(0.3, 0.6), rand(0.25, 0.45), { drag: 2 });
    let hit = pr.life <= 0 || pp.y < getHeight(pp.x, pp.z) + 0.2;
    if (!hit) for (const e of enemies) { if (e.dead || e.friendly) continue; const ey = e.pos.y + enemyAimY(e); if (Math.hypot(pp.x - e.pos.x, pp.z - e.pos.z) < e.def.radius + 0.5 && Math.abs(pp.y - ey) < (e.type === 'boss' ? 7 : 3)) { hit = true; break; } }
    if (hit) { explodeFire(pp.clone()); scene.remove(pr.mesh); pr.light.userData.follow = null; projectiles.splice(i, 1); }
  }
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i]; m.t += dt; const k = Math.min(1, m.t / m.dur);
    m.mesh.position.lerpVectors(m.start, m.end, k * k); m.mesh.rotation.x += dt * 5; m.mesh.rotation.y += dt * 3;
    const pp = m.mesh.position;
    for (let n = 0; n < 10; n++) fx.emit(pp.x + rand(-1, 1), pp.y + rand(-1, 1), pp.z + rand(-1, 1), rand(-2, 2), rand(-1, 2), rand(-2, 2), 5, rand(1.2, 2.4), 0.3, rand(0.8, 1.6), rand(0.4, 0.8), { drag: 1.5 });
    if (Math.random() < 0.5) dust.emit(pp.x, pp.y, pp.z, 0, 0, 0, 0.18, 0.15, 0.15, 2.5, 1.6, { s1: 5, drag: 1 });
    if (k >= 1) { meteorImpact(m.end); scene.remove(m.mesh); meteors.splice(i, 1); }
  }
}
function updateLoot(dt) {
  for (let i = loot.length - 1; i >= 0; i--) {
    const l = loot[i]; l.t += dt; const m = l.mesh; m.rotation.y += dt * 4;
    const gh = getHeight(m.position.x, m.position.z) + 0.35;
    const dx = player.pos.x - m.position.x, dy = player.pos.y + 1 - m.position.y, dz = player.pos.z - m.position.z, d = Math.hypot(dx, dy, dz);
    if (l.t > 0.6 && d < 9 && !player.dead) { const sp = 6 + (9 - d) * 3 + l.t * 4; m.position.x += dx / d * sp * dt; m.position.y += dy / d * sp * dt; m.position.z += dz / d * sp * dt; }
    else { l.vel.y -= 22 * dt; m.position.addScaledVector(l.vel, dt); l.vel.x *= Math.exp(-2 * dt); l.vel.z *= Math.exp(-2 * dt); if (m.position.y < gh) { m.position.y = gh; l.vel.y = Math.abs(l.vel.y) * 0.35; } }
    if (Math.random() < 0.15) fx.emit(m.position.x, m.position.y, m.position.z, 0, 0.6, 0, 3, l.type === 'gold' ? 2.2 : 0.4, 0.5, 0.2, 0.5);
    if (d < 1.3 && l.t > 0.6) { if (l.type === 'gold') addGold(l.value); else { player.potions++; toast('מצאת שיקוי ריפוי'); AudioSys.play('coin'); } scene.remove(m); loot.splice(i, 1); }
    else if (l.t > 60) { scene.remove(m); loot.splice(i, 1); }
  }
}

// ================= DAY / NIGHT =================
const sunDir = new THREE.Vector3(); let lastEnvElev = -9, envTimer = 0, dayTime = 0.27;
const cMoon = new THREE.Color(0.5, 0.6, 0.95), cSun = new THREE.Color(1, 0.95, 0.86), cSunset = new THREE.Color(1, 0.55, 0.3);
const fogTarget = new THREE.Color(0.5, 0.65, 0.9), fogNow = new THREE.Color(0.5, 0.65, 0.9), tmpC = new THREE.Color(), _lightDir = new THREE.Vector3(), _sv = new THREE.Vector3();
let nightF = 0, fogDens = 0.0022; dayTime = 0.31;
function updateDayNight(dt, instant) {
  const ang = (dayTime - 0.25) * Math.PI * 2; const el0 = Math.sin(ang);
  if (!PHOTO) dayTime = (dayTime + dt / 600 * (el0 < -0.1 ? 2.6 : 1)) % 1;
  const elev = el0 * 1.2; const az = dayTime * Math.PI * 2 + 0.6;
  sunDir.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev)).normalize();
  const day = smooth(-0.08, 0.2, sunDir.y), sunset = smooth(0.45, 0.05, Math.abs(sunDir.y)) * smooth(-0.2, 0.0, sunDir.y);
  nightF = 1 - smooth(-0.15, 0.05, sunDir.y);
  skyU.sunPosition.value.copy(sunDir); skyU.turbidity.value = lerp(3, 5.5, sunset); skyU.rayleigh.value = lerp(1.1, 2.4, sunset) * (1 - nightF * 0.6);
  skyU.time.value = realTime;
  const lightDir = sunDir.y > -0.02 ? sunDir : _lightDir.copy(sunDir).negate();
  tmpC.copy(cSun).lerp(cSunset, sunset);
  if (sunDir.y > -0.02) { sun.color.copy(tmpC); sun.intensity = 3.4 * smooth(-0.02, 0.15, sunDir.y); } else { sun.color.copy(cMoon); sun.intensity = 0.55 * smooth(0.02, 0.2, -sunDir.y); }
  const center = drone.active ? _sv.set(drone.x, 0, drone.z) : (titleMode ? cam.look : player.pos);
  const ext = drone.active ? 240 : 90; sc.left = sc.bottom = -ext; sc.right = sc.top = ext; sc.updateProjectionMatrix();
  // snap the shadow camera to whole texels so shadows don't shimmer while walking
  sun.position.copy(center).addScaledVector(lightDir, 350); sun.target.position.copy(center);
  sun.updateMatrixWorld(); sun.target.updateMatrixWorld(); sc.position.set(0, 0, 0);
  { const texel = (ext * 2) / sun.shadow.mapSize.x; const m = new THREE.Matrix4().lookAt(sun.position, sun.target.position, new THREE.Vector3(0, 1, 0)); const inv = m.clone().invert();
    const lc = center.clone().applyMatrix4(inv); lc.x = Math.round(lc.x / texel) * texel; lc.y = Math.round(lc.y / texel) * texel; const snapped = lc.applyMatrix4(m);
    const off = snapped.sub(center); sun.position.add(off); sun.target.position.add(off); }
  hemi.intensity = lerp(0.08, 0.35, day); hemi.color.setRGB(lerp(0.25, 0.74, day), lerp(0.3, 0.85, day), lerp(0.55, 1.0, day));
  // fog colour comes from the sky itself (sampled when the environment map refreshes), so the horizon has no seam
  const k = instant ? 1 : 1 - Math.exp(-1.5 * dt); fogNow.lerp(fogTarget, k);
  scene.fog.color.copy(fogNow); fogU.uFogColor.value.copy(fogNow);
  const fd = drone.active ? 0.0009 : 0.0022; fogDens = instant ? fd : damp(fogDens, fd, 2, dt);
  scene.fog.near = fogDens; scene.fog.far = 0.011; fogU.uFogDensity.value = fogDens; fogU.uFogFalloff.value = 0.011;
  fogU.uSunDir.value.copy(lightDir); fogU.uSunColor.value.copy(sun.color).multiplyScalar(sun.intensity);
  lightU.uSunLight.value.copy(sun.color).multiplyScalar(sunDir.y > 0 ? 1 : 0.25 * smooth(0.02, 0.2, -sunDir.y)); lightU.uNight.value = nightF;
  lightU.uAmb.value.setRGB(lerp(0.05, 0.28, day), lerp(0.07, 0.34, day), lerp(0.14, 0.42, day));
  water.material.uniforms.uSkyTop.value.setRGB(lerp(0.01, 0.2, day), lerp(0.02, 0.38, day), lerp(0.06, 0.75, day));
  water.material.uniforms.uSkyHorizon.value.copy(fogNow);
  if (clouds) { const cu = clouds.material.uniforms; cu.uTop.value.setRGB(lerp(0.08, 1.15, day), lerp(0.1, 1.1, day), lerp(0.18, 1.05, day)).lerp(new THREE.Color(1.3, 0.8, 0.6), sunset * 0.7); cu.uBottom.value.setRGB(lerp(0.04, 0.55, day), lerp(0.05, 0.6, day), lerp(0.1, 0.72, day)).lerp(new THREE.Color(0.8, 0.45, 0.45), sunset * 0.6); cu.uFade.value = smooth(90, 200, camera.position.y); }
  starMat.opacity = nightF * 0.95; stars.position.copy(camera.position);
  moon.position.copy(camera.position).addScaledVector(sunDir, -2300); moon.material.opacity = nightF;
  windowMat.emissiveIntensity = lerp(0.35, 3.2, nightF);
  renderer.toneMappingExposure = lerp(0.75, 1.05, nightF);
  // god rays follow the sun on screen
  _sv.copy(camera.position).addScaledVector(sunDir, 3000).project(camera);
  const onScreen = _sv.z < 1 && Math.abs(_sv.x) < 1.05 && Math.abs(_sv.y) < 1.05;
  godrays.uniforms.uSun.value.set(_sv.x * 0.5 + 0.5, _sv.y * 0.5 + 0.5);
  godrays.uniforms.uStrength.value = Q_().rays && onScreen && sunDir.y > -0.02 ? 0.55 * smooth(-0.02, 0.1, sunDir.y) * (1 - smooth(0.75, 1.05, Math.max(Math.abs(_sv.x), Math.abs(_sv.y)))) : 0;
  godrays.uniforms.uTint.value.copy(tmpC);
  envTimer -= dt;
  if ((Math.abs(sunDir.y - lastEnvElev) > 0.035 && envTimer <= 0) || instant) {
    lastEnvElev = sunDir.y; envTimer = 2;
    for (const kk of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG', 'cloudCoverage', 'cloudDensity', 'cloudElevation', 'cloudScale']) envSky.material.uniforms[kk].value = skyU[kk].value;
    envSky.material.uniforms.sunPosition.value.copy(sunDir.y > -0.3 ? sunDir : _sv.set(sunDir.x, -0.3, sunDir.z));
    const old = envRT; envRT = pmrem.fromScene(envScene, 0.04, 0.1, 3000); scene.environment = envRT.texture; if (old) old.dispose();
    // horizon colour looking away from the sun, a little above the horizon
    const away = _sv.set(-sunDir.x, 0.04, -sunDir.z).normalize();
    sampleSky(away, fogTarget); const side = sampleSky(new THREE.Vector3(sunDir.z, 0.04, -sunDir.x).normalize(), tmpC); fogTarget.lerp(side, 0.5);
    fogTarget.r = Math.max(fogTarget.r, 0.012); fogTarget.g = Math.max(fogTarget.g, 0.016); fogTarget.b = Math.max(fogTarget.b, 0.03);
  }
}

// ================= CAMERA UPDATE =================
const lookTmp = new THREE.Vector3(), posTmp = new THREE.Vector3();
function updateCamera(dt) {
  if (PHOTO) { camera.position.copy(cam.pos); camera.lookAt(cam.look); return; }
  if (cinema.active) updateCinema(dt);
  else if (titleMode) {
    titleT += dt * 0.04; const a = titleT + 2.2; const r = 170;
    const tl = new THREE.Vector3(P.village.x + 40, 14, P.village.z - 40);
    const tp = new THREE.Vector3(tl.x + Math.cos(a) * r, 70 + Math.sin(titleT * 2) * 10, tl.z + Math.sin(a) * r);
    const gh = getHeight(tp.x, tp.z); if (tp.y < gh + 18) tp.y = gh + 18;
    cam.pos.copy(tp); cam.look.copy(tl);
  } else if (drone.active) {
    let ix = 0, iz = 0; if (keys.KeyW || keys.ArrowUp) iz += 1; if (keys.KeyS || keys.ArrowDown) iz -= 1; if (keys.KeyA || keys.ArrowLeft) ix -= 1; if (keys.KeyD || keys.ArrowRight) ix += 1;
    ix += touchState.joy.x; iz += touchState.joy.y;
    const sp = (keys.ShiftLeft || keys.ShiftRight ? 520 : 200) * (drone.alt / 340) * dt;
    const sy = Math.sin(drone.yaw), cy = Math.cos(drone.yaw);
    drone.x = clamp(drone.x + (-sy * iz + cy * ix) * sp, -HALF, HALF); drone.z = clamp(drone.z + (-cy * iz - sy * ix) * sp, -HALF, HALF);
    const tl = new THREE.Vector3(drone.x, 10, drone.z);
    const tp = new THREE.Vector3(drone.x + sy * drone.alt * 0.72, drone.alt, drone.z + cy * drone.alt * 0.72);
    cam.pos.x = damp(cam.pos.x, tp.x, 2.2, dt); cam.pos.y = damp(cam.pos.y, tp.y, 1.6, dt); cam.pos.z = damp(cam.pos.z, tp.z, 2.2, dt);
    cam.look.lerp(tl, 1 - Math.exp(-3 * dt));
    $('altTxt').textContent = Math.round(cam.pos.y - getHeight(drone.x, drone.z));
  } else {
    const t = player.pos; const tl = lookTmp.set(t.x, t.y + 1.8, t.z);
    const cp = Math.cos(cam.pitch), spp = Math.sin(cam.pitch);
    const tp = posTmp.set(tl.x + Math.sin(cam.yaw) * cp * cam.dist, tl.y + spp * cam.dist, tl.z + Math.cos(cam.yaw) * cp * cam.dist);
    for (let i = 1; i <= 12; i++) { const f = i / 12; const x = lerp(tl.x, tp.x, f), z = lerp(tl.z, tp.z, f); if (getHeight(x, z) + 0.7 > lerp(tl.y, tp.y, f)) { const k = Math.max(0.18, (i - 1) / 12); tp.set(lerp(tl.x, tp.x, k), lerp(tl.y, tp.y, k), lerp(tl.z, tp.z, k)); break; } }
    const gh = getHeight(tp.x, tp.z); if (tp.y < gh + 0.8) tp.y = gh + 0.8;
    if (cam.cut) { cam.cut = false; cam.pos.copy(tp); cam.look.copy(tl); }
    if (cam.pos.distanceTo(tp) > 60) { cam.pos.x = damp(cam.pos.x, tp.x, 2.4, dt); cam.pos.y = damp(cam.pos.y, tp.y, 2.4, dt); cam.pos.z = damp(cam.pos.z, tp.z, 2.4, dt); cam.look.lerp(tl, 1 - Math.exp(-3 * dt)); }
    else { cam.pos.lerp(tp, 1 - Math.exp(-14 * dt)); cam.look.lerp(tl, 1 - Math.exp(-18 * dt)); }
  }
  camera.position.copy(cam.pos); camera.lookAt(cam.look);
  if (cam.shake > 0) { cam.shakeT += dt * 30; const s = cam.shake * cam.shake; camera.translateX(0.55 * s * Math.sin(cam.shakeT * 1.7)); camera.translateY(0.4 * s * Math.sin(cam.shakeT * 2.3)); camera.rotateZ(0.035 * s * Math.sin(cam.shakeT * 1.1)); cam.shake = Math.max(0, cam.shake - dt * 1.3); }
}

// ================= WORLD ANIM / AMBIENCE =================
let moteT = 0, questBeam;
function updateWorld(dt, t) {
  timeU.value = t;
  if (windmillBlades) windmillBlades.rotation.z += dt * 0.6;
  if (shrineCrystal) { shrineCrystal.rotation.y += dt * 0.6; shrineCrystal.position.y = 8 + Math.sin(t * 1.3) * 0.5; shrineRing.rotation.z += dt * 0.8; shrineRing.position.y = shrineCrystal.position.y; const voidT = Q.index >= 11 && Q.index <= 12 ? 1 : 0; shrineCrystal.material.emissive.setHex(voidT ? 0x8a3cff : 0x35c8ff); shrineCrystal.userData.light.color.setHex(voidT ? 0x9a4dff : 0x55d8ff); shrineCrystal.userData.light.intensity = (voidT ? 12 : 0) + nightF * 34; }
  ruinsCrystals.forEach((c, i) => { c.material.emissiveIntensity = (story.flags.terosFreed ? 0.6 : 2) + Math.sin(t * 2 + i) * 0.8; });
  const q = QUESTS[Q.index];
  for (const n of npcs) { const has = q.type === 'talk' && q.npc === n.id; n.marker.visible = n.visible && (has || n.id === 'toma'); if (n.marker.material) n.marker.material.color.setRGB(has ? 3.2 : 1.2, has ? 2.2 : 2.6, has ? 0.5 : 1.0); n.marker.position.y = 3.3 + Math.sin(t * 3) * 0.15; n.marker.rotation.y += dt * 2; }
  for (const f of fires) { f.light.intensity = (f.base * 0.75 + Math.sin(t * 13 + f.pos.x) * 4 + Math.sin(t * 7.3) * 3) * (0.5 + nightF); if (Math.random() < 0.7) fx.emit(f.pos.x + rand(-0.5, 0.5), f.pos.y + 0.4, f.pos.z + rand(-0.5, 0.5), rand(-0.3, 0.3), rand(2, 3.5), rand(-0.3, 0.3), 4, rand(1.2, 2), 0.3, rand(0.4, 0.8), rand(0.5, 1), { drag: 1, s1: 0.05 }); }
  if (shrineCrystal && Math.random() < 0.5) { const S = P.shrine, y = getHeight(S.x, S.z); const a = Math.random() * 6.28; const vc = Q.index >= 11 && Q.index <= 12; fx.emit(S.x + Math.cos(a) * 6, y + 2, S.z + Math.sin(a) * 6, -Math.cos(a) * 1.2, rand(1.5, 3), -Math.sin(a) * 1.2, vc ? 2.2 : 0.6, vc ? 0.5 : 2.4, vc ? 4 : 3.5, 0.3, 2.5, { drag: 0.2 }); }
  if (Math.random() < 0.4) { const R = P.ruins, y = getHeight(R.x, R.z); const a = Math.random() * 6.28, r = rand(3, 20); fx.emit(R.x + Math.cos(a) * r, y + 0.5, R.z + Math.sin(a) * r, 0, rand(1, 3), 0, story.flags.terosFreed ? 3 : 2, story.flags.terosFreed ? 2.2 : 0.6, story.flags.terosFreed ? 0.6 : 3.6, 0.3, 2.5, { drag: 0.3 }); }
  for (const s of loreStones) if (Math.random() < 0.08) fx.emit(s.pos.x + rand(-0.6, 0.6), s.pos.y + rand(1, 3.5), s.pos.z + rand(-0.6, 0.6), 0, rand(0.3, 0.9), 0, s.found ? 3 : 0.6, s.found ? 2.2 : 2.2, s.found ? 0.6 : 3.4, 0.18, 2, { drag: 0.2 });
  if (motherTree && Math.random() < 0.3) { const F = P.forestHeart, y = getHeight(F.x, F.z); const healed = story.flags.eitanSaved; fx.emit(F.x + rand(-8, 8), y + rand(10, 18), F.z + rand(-8, 8), rand(-0.3, 0.3), rand(-1, -0.3), rand(-0.3, 0.3), healed ? 3 : 1.6, healed ? 2.4 : 0.5, healed ? 0.7 : 3, 0.25, 4, { drag: 0.1 }); }
  moteT -= dt;
  if (moteT <= 0 && !drone.active) {
    moteT = nightF > 0.5 ? 0.03 : 0.08;
    const c = titleMode ? cam.look : player.pos; const a = Math.random() * 6.28, r = rand(3, 30); const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r; const y = getHeight(x, z) + rand(0.5, 3.5);
    if (y > 0.5) { if (nightF > 0.4) fx.emit(x, y, z, rand(-0.5, 0.5), rand(-0.2, 0.4), rand(-0.5, 0.5), 2.2, 3.2, 0.6, 0.22, rand(2.5, 4.5), { drag: 0.1, s1: 0.2 }); else fx.emit(x, y, z, rand(-0.4, 0.4), rand(0.1, 0.5), rand(-0.4, 0.4), 1.4, 1.3, 1.0, 0.12, rand(3, 5), { drag: 0.1, s1: 0.12 }); }
  }
  if (grassMesh) {
    const gc = titleMode ? _sv.set(cam.look.x + (cam.pos.x - cam.look.x) * 0.55, 0, cam.look.z + (cam.pos.z - cam.look.z) * 0.55) : (cinema.active || PHOTO ? _sv.set(cam.pos.x + (cam.look.x - cam.pos.x) * 0.5, 0, cam.pos.z + (cam.look.z - cam.pos.z) * 0.5) : player.pos);
    grassMesh.material.uniforms.uPlayer.value.set(gc.x, gc.z); grassMesh.material.uniforms.uPush.value.set(player.pos.x, player.pos.z);
    grassMesh.visible = !drone.active;
  }
  const qt = questTarget();
  if (qt && questBeam && !PHOTO) { questBeam.visible = true; questBeam.position.set(qt.x, getHeight(qt.x, qt.z), qt.z); const kk = drone.active ? 1 : smooth(12, 70, Math.hypot(qt.x - player.pos.x, qt.z - player.pos.z)); questBeam.children.forEach(m => m.material.uniforms.uAlpha.value = m.userData.a * kk); } else if (questBeam) questBeam.visible = false;
  hero.aura.material.opacity = drone.active ? 0.9 : 0; hero.pBeam.visible = drone.active; hero.pBeam.position.copy(player.pos);
}

// ================= MINIMAP =================
const mmBase = document.createElement('canvas'); mmBase.width = N; mmBase.height = N;
function buildMinimapBase() {
  const ctx = mmBase.getContext('2d'); const img = ctx.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, o = k * 4, h = H[k];
    let r = COLR[k * 3], g = COLR[k * 3 + 1], b = COLR[k * 3 + 2];
    const shade = (0.7 + clamp(h / 140, 0, 1) * 0.35) * (0.6 + AO[k] * 0.4); r *= shade; g *= shade; b *= shade;
    if (h < 0) { const dd = clamp(-h / 20, 0, 1); r = lerp(0.25, 0.05, dd); g = lerp(0.62, 0.22, dd); b = lerp(0.72, 0.4, dd); }
    img.data[o] = r * 255; img.data[o + 1] = g * 255; img.data[o + 2] = b * 255; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
const mmCtx = $('minimap').getContext('2d');
function drawMinimap() {
  const c = mmCtx, W = 336, R = W / 2; const view = drone.active ? 420 : 130; const s = R / view;
  const cx = drone.active ? drone.x : player.pos.x, cz = drone.active ? drone.z : player.pos.z;
  c.save(); c.clearRect(0, 0, W, W); c.beginPath(); c.arc(R, R, R, 0, Math.PI * 2); c.clip();
  c.fillStyle = '#0d3550'; c.fillRect(0, 0, W, W);
  c.drawImage(mmBase, R - (cx + HALF) * s, R - (cz + HALF) * s, WORLD * s, WORLD * s);
  const toM = (x, z) => [R + (x - cx) * s, R + (z - cz) * s];
  for (const e of enemies) { if (e.dead || e.friendly) continue; const [x, y] = toM(e.pos.x, e.pos.z); if (Math.hypot(x - R, y - R) > R) continue; c.fillStyle = e.def.boss ? '#c77dff' : e.state === 'chase' || e.state === 'windup' ? '#ff4d5e' : '#ff9aa4'; c.beginPath(); c.arc(x, y, e.def.boss ? 7 : 3.4, 0, Math.PI * 2); c.fill(); }
  for (const n of npcs) { if (!n.visible) continue; const [x, y] = toM(n.pos.x, n.pos.z); c.fillStyle = '#ffe08a'; c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill(); }
  for (const st of loreStones) { const [x, y] = toM(st.pos.x, st.pos.z); c.fillStyle = st.found ? '#f2c46d' : '#72dcff'; c.fillRect(x - 3, y - 3, 6, 6); }
  const qt = questTarget();
  if (qt) { let [x, y] = toM(qt.x, qt.z); const dx = x - R, dy = y - R, d = Math.hypot(dx, dy); if (d > R - 14) { x = R + dx / d * (R - 14); y = R + dy / d * (R - 14); } c.save(); c.translate(x, y); c.rotate(Math.PI / 4); c.fillStyle = '#f2c46d'; c.strokeStyle = '#1b1406'; c.lineWidth = 3; c.fillRect(-8, -8, 16, 16); c.strokeRect(-8, -8, 16, 16); c.restore(); }
  { const [x, y] = toM(player.pos.x, player.pos.z); c.save(); c.translate(x, y); c.rotate(-player.facing + Math.PI); c.fillStyle = '#72dcff'; c.strokeStyle = '#06101f'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, -13); c.lineTo(9, 9); c.lineTo(0, 4); c.lineTo(-9, 9); c.closePath(); c.stroke(); c.fill(); c.restore(); }
  if (!drone.active) { c.save(); c.translate(R, R); c.rotate(-cam.yaw); c.fillStyle = 'rgba(114,220,255,0.10)'; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); c.closePath(); c.fill(); c.restore(); }
  c.restore();
  c.fillStyle = '#f2c46d'; c.font = '700 22px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('N', R, 26);
}

// ================= HUD =================
const SLOTS = [
  { id: 'atk', key: 'LMB', name: 'חרב', icon: '<path d="M19 3l2 2-11 11-3 1 1-3z" fill="none" stroke="#e8f4ff" stroke-width="1.8" stroke-linejoin="round"/><path d="M6 14l4 4M4 20l3-3" stroke="#f2c46d" stroke-width="2" stroke-linecap="round"/>' },
  { id: 'fire', key: 'RMB', name: 'כדור אש', icon: '<path d="M12 3c1 4 6 6 6 11a6 6 0 01-12 0c0-3 2-4 3-6 0 2 1 3 2 3 0-3 0-5 1-8z" fill="#ff8a3d" stroke="#ffd27a" stroke-width="1.2"/>' },
  { id: 'nova', key: 'E', name: 'נובה', icon: '<circle cx="12" cy="12" r="3" fill="#9cc8ff"/><circle cx="12" cy="12" r="7" fill="none" stroke="#72dcff" stroke-width="1.6"/><circle cx="12" cy="12" r="10" fill="none" stroke="#b48cff" stroke-width="1.2" stroke-dasharray="2 2"/>' },
  { id: 'meteor', key: 'R', name: 'מטאור', icon: '<circle cx="15" cy="15" r="4.5" fill="#ff7a3d" stroke="#ffd27a" stroke-width="1.2"/><path d="M4 4l7 7M7 3l6 6M3 7l6 6" stroke="#ffb36b" stroke-width="1.6" stroke-linecap="round"/>' },
  { id: 'dash', key: 'Q', name: 'זינוק', icon: '<path d="M5 12h10M11 6l6 6-6 6" fill="none" stroke="#72dcff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 8h4M3 16h4" stroke="#72dcff" stroke-width="1.4" stroke-linecap="round" opacity=".6"/>' },
  { id: 'potion', key: 'H', name: 'שיקוי', icon: '<path d="M10 3h4v4l4 6a5 5 0 01-4 8h-4a5 5 0 01-4-8l4-6z" fill="#e8475c" stroke="#ffb3bd" stroke-width="1.2"/>' },
];
const slotEls = {};
function buildSkillbar() {
  const wrap = $('skills');
  for (const s of SLOTS) {
    const el = document.createElement('div'); el.className = 'slot';
    el.innerHTML = `<span class="key">${s.key}</span><svg viewBox="0 0 24 24">${s.icon}</svg><span class="nm">${s.name}</span><div class="cd"></div>${s.id === 'potion' ? '<span class="cnt"></span>' : ''}${(s.id === 'nova' || s.id === 'meteor') ? '<div class="lock" hidden></div>' : ''}`;
    wrap.appendChild(el); slotEls[s.id] = el;
  }
}
const REGIONS = [['כפר אלדור', P.village, 75], ['מקדש הבדולח', P.shrine, 45], ['חורבות הצפון', P.ruins, 70], ['מחנה הציידים', P.camp, 30], ['עץ האם', P.forestHeart, 40], ['אגם הירח', P.lake, 95], ['יער הצללים', P.forest, 150], ['אחו הזהב', P.meadow, 110], ['רגלי ההרים', P.foothills, 70], ['גבעות המזרח', P.hills, 110]];
function regionAt(x, z) { for (const [n, p, r] of REGIONS) if (dist2(x, z, p) < r) return n; const h = getHeight(x, z); if (h > 55) return 'הרי השן'; if (h < 3) return 'חוף הצדפים'; return 'ערבות אתריה'; }
let lastRegion = '';
const POIS = [['כפר אלדור', P.village, 'מסחר ומשימות'], ['מקדש הבדולח', P.shrine, 'מקור האור'], ['חורבות הצפון', P.ruins, 'שער הריק'], ['יער הצללים', P.forest, 'זאבי צל'], ['מחנה הציידים', P.camp, 'נועה'], ['אגם הירח', P.lake, ''], ['אחו הזהב', P.meadow, 'רפשים'], ['רגלי ההרים', P.foothills, 'גולמי סלע'], ['חוף הצדפים', P.coast, '']];
const poiEls = POIS.map(([n, , s]) => { const el = document.createElement('div'); el.className = 'poi'; el.innerHTML = `${n}${s ? `<small>${s}</small>` : ''}`; el.hidden = true; $('labels').appendChild(el); return el; });
function setBar(id, v, max, txtId) { $(id).style.width = (clamp(v / max, 0, 1) * 100).toFixed(1) + '%'; if (txtId) $(txtId).textContent = `${Math.ceil(v)} / ${max}`; }
let hudT = 0;
function updateHUD(dt) {
  const p = player;
  setBar('hpBar', p.hp, p.maxHp, 'hpTxt'); setBar('mpBar', p.mp, p.maxMp, 'mpTxt'); setBar('stBar', p.st, p.maxSt); setBar('xpBar', p.xp, xpToNext(p.lvl));
  $('lvl').textContent = p.lvl; $('goldTxt').textContent = `${p.gold} זהב`;
  const cdP = (id, cur, max) => slotEls[id].querySelector('.cd').style.setProperty('--p', (max > 0 ? cur / max * 100 : 0) + '%');
  cdP('atk', p.atkTimer, p.atkTotal || 1); cdP('fire', p.cds.fire, SK.fire.cd); cdP('nova', p.cds.nova, SK.nova.cd); cdP('meteor', p.cds.meteor, SK.meteor.cd); cdP('dash', p.dashCd, 0.55);
  for (const id of ['fire', 'nova', 'meteor']) { slotEls[id].classList.toggle('nomana', p.mp < SK[id].mp); slotEls[id].classList.toggle('ready', p.cds[id] <= 0 && p.mp >= SK[id].mp && p.lvl >= SK[id].lvl); }
  for (const id of ['nova', 'meteor']) { const l = slotEls[id].querySelector('.lock'); l.hidden = p.lvl >= SK[id].lvl; l.textContent = `רמה ${SK[id].lvl}`; }
  slotEls.potion.querySelector('.cnt').textContent = p.potions;
  if (activeBoss) $('bossHp').style.width = (Math.max(0, activeBoss.hp) / activeBoss.maxHp * 100) + '%';
  hudT -= dt; if (hudT > 0) return; hudT = 0.15;
  const q = QUESTS[Q.index]; const ch = QUEST_CHAPTER[Q.index];
  $('qChapter').textContent = ch <= 7 ? `פרק ${HEB_NUM[ch]} · ${CHAPTERS[ch - 1].name}` : 'אחרי הסיפור';
  $('qTitle').textContent = q.title; $('qDesc').textContent = q.desc;
  $('qProg').textContent = q.type === 'kill' ? `${Q.prog} / ${q.need}` : q.type === 'talk' ? 'לחץ F ליד הדמות' : q.type === 'reach' ? 'עקוב אחר עמוד האור' : `${loreStones.filter(s => s.found).length}/6 אבני זיכרון`;
  const qt = questTarget(); $('qDist').textContent = qt ? `${Math.round(Math.hypot(qt.x - p.pos.x, qt.z - p.pos.z))} מ'` : '';
  const reg = regionAt(p.pos.x, p.pos.z); if (reg !== lastRegion) { $('region').textContent = reg; if (lastRegion && !cinemaActive()) banner(reg, ''); lastRegion = reg; }
  const hrs = dayTime * 24; $('clock').textContent = `${String(Math.floor(hrs)).padStart(2, '0')}:${String(Math.floor((hrs % 1) * 60)).padStart(2, '0')} · ${nightF > 0.5 ? 'לילה' : 'יום'}`;
  const it = nearInteractable(); const pr = $('prompt');
  if (it && canAct()) { pr.hidden = false; pr.innerHTML = '<kbd>F</kbd>'; pr.appendChild(document.createTextNode(it.label)); } else pr.hidden = true;
}
function updateLabels() {
  POIS.forEach(([, p], i) => {
    const el = poiEls[i]; if (!drone.active) { el.hidden = true; return; }
    _v.set(p.x, getHeight(p.x, p.z) + 25, p.z).project(camera);
    if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) { el.hidden = true; return; }
    el.hidden = false; el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * innerWidth}px,${(-_v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-100%)`;
  });
}

// ================= SAVE =================
const SAVE_KEY = 'aetheria-save-v2';
function serialize() { return { v: 2, lvl: player.lvl, xp: player.xp, gold: player.gold, potions: player.potions, blade: player.blade, bonusHp: player.bonusHp, quest: Q.index, qprog: Q.prog, x: player.pos.x, z: player.pos.z, day: dayTime, flags: story.flags, lore: story.lore }; }
function saveGame() { if (PHOTO || state !== 'play') return; try { localStorage.setItem(SAVE_KEY, JSON.stringify(serialize())); } catch (e) { } }
function loadSave() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function applySave(s) {
  if (!s) return;
  player.lvl = s.lvl || 1; player.xp = s.xp || 0; player.gold = s.gold || 0; player.potions = s.potions ?? 2; player.bonusHp = s.bonusHp || 0;
  recalcStats(); player.hp = player.maxHp; player.mp = player.maxMp; setBlade(clamp(s.blade || 0, 0, 3));
  Q.index = clamp(s.quest || 0, 0, QUESTS.length - 1); Q.prog = s.qprog || 0;
  story.flags = s.flags || {}; story.lore = s.lore || {};
  for (const st of loreStones) if (story.lore[st.id]) { st.found = true; st.runeMat.color.setRGB(3.4, 2.4, 0.7); }
  // a save taken mid-boss restarts that fight cleanly
  if (QUESTS[Q.index].kind === 'miren') Q.index = 11;
  if (QUESTS[Q.index].start === 'spawnAlpha') runStart('spawnAlpha');
  if (story.flags.terosFreed && teros) { scene.remove(teros.root); enemies.splice(enemies.indexOf(teros), 1); teros = null; }
  if (Number.isFinite(s.x) && Number.isFinite(s.z) && getHeight(s.x, s.z) > -1) player.pos.set(s.x, getHeight(s.x, s.z), s.z);
  if (Number.isFinite(s.day)) dayTime = s.day;
  applyWorldState();
}

// ================= INPUT =================
let locked = false, noLock = isTouch, wantUnlock = false, dragging = false, dragMoved = 0, lockGesture = false;
function lockFailed() {
  if (locked) return;
  if (lockGesture) { noLock = true; paused = false; $('pause').hidden = true; }
  else if (state === 'play' && !cinemaActive() && !player.dead && !journalOpen) { paused = true; $('pause').hidden = false; }
}
function requestLock(gesture = false) { if (noLock || state !== 'play' || PHOTO) return; lockGesture = gesture; try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(lockFailed); } catch (e) { lockFailed(); } }
function releaseLock() { if (document.pointerLockElement) { wantUnlock = true; document.exitPointerLock(); } }
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked && state === 'play' && !cinemaActive() && !wantUnlock && !player.dead && !journalOpen) { paused = true; $('pause').hidden = false; }
  wantUnlock = false;
});
document.addEventListener('pointerlockerror', lockFailed);
function toggleDrone() {
  if (state !== 'play' || cinemaActive() || player.dead || journalOpen) return;
  drone.active = !drone.active;
  if (drone.active) { drone.x = player.pos.x; drone.z = player.pos.z; drone.yaw = cam.yaw; drone.alt = 340; }
  AudioSys.play('drone');
  $('droneHud').hidden = !drone.active; $('btnDrone').classList.toggle('on', drone.active); $('quest').hidden = drone.active; $('skills').hidden = drone.active; $('cross').hidden = drone.active;
}
addEventListener('keydown', e => {
  if (state !== 'play') return;
  if (slidesState) { if (['Space', 'Enter', 'ArrowLeft', 'ArrowRight'].includes(e.code)) { e.preventDefault(); slidesState.next(); } if (e.code === 'Escape') slidesState.finish(); return; }
  if (dialogOpen) { e.preventDefault(); if (['Space', 'Enter', 'KeyF'].includes(e.code)) advanceDialogue(); const d = parseInt(e.key, 10); if (d >= 1 && d <= 4 && dlgState?.node?.choices && !dlgState.typer) pickChoice(d - 1); return; }
  if (journalOpen) { if (e.code === 'KeyJ' || e.code === 'Escape') closeJournal(); return; }
  if (cinema.active) return;
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys[e.code] = true; if (e.repeat) return;
  switch (e.code) {
    case 'KeyV': toggleDrone(); break;
    case 'KeyF': interact(); break;
    case 'KeyQ': doDash(); break;
    case 'KeyE': case 'Digit2': castNova(); break;
    case 'KeyR': case 'Digit3': castMeteor(); break;
    case 'Digit1': castFire(); break;
    case 'KeyH': case 'Digit4': drinkPotion(); break;
    case 'KeyJ': openJournal(); break;
    case 'Space': jumpQueued = true; break;
    case 'Escape': if (noLock) { paused = !paused; $('pause').hidden = !paused; } break;
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  if (state !== 'play' || isTouch || cinemaActive()) return; canvas.focus();
  if (!locked && !noLock) { requestLock(true); return; }
  if (e.button === 0) { if (noLock) { dragging = true; dragMoved = 0; } else tryAttack(); }
  if (e.button === 2) castFire();
});
addEventListener('mouseup', e => { if (e.button === 0 && dragging) { dragging = false; if (dragMoved < 6 && !drone.active) tryAttack(); } });
addEventListener('mousemove', e => { if (state !== 'play') return; if (locked || dragging) { if (dragging) dragMoved += Math.abs(e.movementX) + Math.abs(e.movementY); rotateView(e.movementX, e.movementY); } });
function rotateView(dx, dy) { if (cinemaActive()) return; if (drone.active) { drone.yaw -= dx * 0.003; return; } cam.yaw -= dx * 0.0026; cam.pitch = clamp(cam.pitch + dy * 0.0022, -0.25, 1.15); }
canvas.addEventListener('wheel', e => { e.preventDefault(); if (drone.active) drone.alt = clamp(drone.alt * (1 + Math.sign(e.deltaY) * 0.1), 90, 800); else cam.dist = clamp(cam.dist * (1 + Math.sign(e.deltaY) * 0.1), 4, 18); }, { passive: false });
function setupTouch() {
  $('touch').hidden = false;
  const joy = $('joy'), knob = $('joyKnob'); let jid = null, jc = null, lookId = null, lookLast = [0, 0];
  joy.addEventListener('touchstart', e => { const t = e.changedTouches[0]; jid = t.identifier; const r = joy.getBoundingClientRect(); jc = [r.left + r.width / 2, r.top + r.height / 2]; e.preventDefault(); }, { passive: false });
  addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === jid) { let dx = t.clientX - jc[0], dy = t.clientY - jc[1]; const d = Math.hypot(dx, dy), m = 55; if (d > m) { dx = dx / d * m; dy = dy / d * m; } knob.style.transform = `translate(${dx}px,${dy}px)`; touchState.joy.x = dx / m; touchState.joy.y = -dy / m; }
      if (t.identifier === lookId) { rotateView((t.clientX - lookLast[0]) * 1.6, (t.clientY - lookLast[1]) * 1.6); lookLast = [t.clientX, t.clientY]; }
    }
  }, { passive: false });
  const endT = e => { for (const t of e.changedTouches) { if (t.identifier === jid) { jid = null; knob.style.transform = ''; touchState.joy.x = touchState.joy.y = 0; } if (t.identifier === lookId) lookId = null; } };
  addEventListener('touchend', endT); addEventListener('touchcancel', endT);
  canvas.addEventListener('touchstart', e => { const t = e.changedTouches[0]; if (lookId == null) { lookId = t.identifier; lookLast = [t.clientX, t.clientY]; } e.preventDefault(); }, { passive: false });
  document.querySelectorAll('.tb').forEach(b => {
    b.addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation(); AudioSys.init();
      if (dialogOpen) { advanceDialogue(); return; }
      ({ attack: () => { touchState.attackHeld = true; tryAttack(); }, fire: castFire, nova: castNova, meteor: castMeteor, dash: doDash, potion: drinkPotion, jump: () => { jumpQueued = true; }, interact, drone: toggleDrone })[b.dataset.act]?.();
    }, { passive: false });
    b.addEventListener('touchend', () => { if (b.dataset.act === 'attack') touchState.attackHeld = false; });
  });
}

// ================= START =================
async function startGame(fromSave) {
  AudioSys.init();
  if (fromSave) applySave(loadSave()); else { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } }
  player.pos.y = getHeight(player.pos.x, player.pos.z);
  $('title').hidden = true; titleMode = false; state = 'play'; cam.cut = true;
  if (isTouch) setupTouch();
  lastRegion = regionAt(player.pos.x, player.pos.z); $('region').textContent = lastRegion;
  setInterval(() => { if (state === 'play' && !player.dead && !cinemaActive()) saveGame(); }, 10000);
  if (fromSave) { $('hud').hidden = false; requestLock(true); setTimeout(() => showChapter(Math.min(7, QUEST_CHAPTER[Q.index])), 400); return; }
  // new game: prologue illustrations, then wake on the beach
  player.lying = 1; player.facing = Math.PI; cam.yaw = 0;
  await runSeq([
    { slides: 'prologue', title: 'פרולוג' },
    { fn: () => { $('hud').hidden = false; dayTime = 0.3; lastEnvElev = -9; } },
    { cine: [
      { dur: 4.5, from: () => player.pos.clone().add(new THREE.Vector3(14, 22, -10)), to: () => player.pos.clone().add(new THREE.Vector3(3, 3.2, 4)), look: () => player.pos.clone().add(new THREE.Vector3(0, 0.5, 0)) },
      { dur: 2.2, from: () => player.pos.clone().add(new THREE.Vector3(3, 3.2, 4)), to: () => player.pos.clone().add(new THREE.Vector3(1.5, 2.4, 6)), look: () => player.pos.clone().add(new THREE.Vector3(0, 1.4, 0)) },
    ] },
    { talk: 'wake_1' },
    { chapter: 1 },
  ]);
  cam.yaw = 0; cam.cut = true;
}
$('btnNew').onclick = () => startGame(false);
$('btnCont').onclick = () => startGame(true);
$('btnResume').onclick = () => { paused = false; $('pause').hidden = true; requestLock(true); };
$('btnDrone').onclick = () => toggleDrone();
$('btnJournal').onclick = () => openJournal();
$('btnSound').onclick = () => { AudioSys.init(); AudioSys.toggle(); };
$('btnQuality').onclick = () => { quality = QORDER[(QORDER.indexOf(quality) + 1) % QORDER.length]; autoQ.done = true; applyQuality(); };

// automatic quality step-down: measure the first seconds of play, drop a level if frames run long
const autoQ = { t: 0, n: 0, sum: 0, done: !!PHOTO };
function autoQuality(raw) {
  if (autoQ.done || state !== 'play' || cinemaActive()) return;
  autoQ.t += raw; if (autoQ.t < 2) return; autoQ.n++; autoQ.sum += raw;
  if (autoQ.n >= 150) { const avg = autoQ.sum / autoQ.n * 1000; autoQ.n = 0; autoQ.sum = 0;
    if (avg > 30 && quality !== 'low') { quality = QORDER[QORDER.indexOf(quality) + 1]; applyQuality(); toast(`הגרפיקה הותאמה למחשב שלך: ${Q_().label}`); } else autoQ.done = true; }
}

// ================= MAIN LOOP =================
const timer = new THREE.Timer(); timer.connect(document);
function frame(ts) {
  timer.update(ts); const raw = clamp(timer.getDelta(), 0, 0.05); realTime += raw;
  let dt = raw * timeScale; if (hitstop > 0) { hitstop -= raw; dt *= 0.06; }
  const frozen = state !== 'play' || paused || drone.active || journalOpen || slidesState || dialogOpen || (seqBusy && !cinema.active);
  if (!paused) updateDayNight(raw);
  if (state === 'play' && !paused) {
    if (player.lying > 0 && !cinemaActive()) player.lying = Math.max(0, player.lying - raw * 1.2);
    if (!frozen && !cinema.active) { updatePlayer(dt); updateEnemies(dt); updateEnemyShots(dt); updateProjectiles(dt); updateLoot(dt); updateSpawns(dt); checkReach(); }
    else { animateHero(raw, 0, false); updateEnemies(0); }
  }
  if (!paused) { fx.update(frozen ? raw : dt); dust.update(dt); updateRings(dt); updateSlashes(dt); updateLights(dt); }
  updateWorld(raw, realTime);
  updateCamera(raw);
  if (state === 'play') { updateHUD(raw); drawMinimap(); updateLabels(); autoQuality(raw); }
  updateDnums(raw);
  hurtV = Math.max(0, hurtV - raw * 1.6); flashV = Math.max(0, flashV - raw * 1.5);
  grade.uniforms.uHurt.value = hurtV + (state === 'play' && player.hp / player.maxHp < 0.3 ? 0.25 + Math.sin(realTime * 5) * 0.1 : 0);
  grade.uniforms.uFlash.value = flashV; grade.uniforms.uTime.value = realTime % 100;
  grade.uniforms.uVoid.value = damp(grade.uniforms.uVoid.value, Q.index >= 11 && Q.index <= 12 && dist2(player.pos.x, player.pos.z, P.shrine) < 60 ? 1 : 0, 1.5, raw);
  composer.render();
}
function checkReach() {
  const q = QUESTS[Q.index]; if (q.type !== 'reach' || seqBusy) return;
  const t = q.target(); if (Math.hypot(t.x - player.pos.x, t.z - player.pos.z) < q.radius) completeQuest();
}

// ================= PHOTO MODE (offline story illustrations) =================
const photoProps = [];
function photoClear() { for (const o of photoProps) scene.remove(o); photoProps.length = 0; }
function photoProp(o) { scene.add(o); photoProps.push(o); return o; }
function keeperFigure(robe) { return npcFigure({ robe, hood: robe, skin: 0xe0b08a, staff: [3, 2.4, 1.0] }); }
async function renderShot(name) {
  photoClear(); for (const s of enemyShots) scene.remove(s.mesh); enemyShots.length = 0;
  for (const e of enemies) e.root.visible = false; for (const n of npcs) n.group.visible = false; hero.root.visible = true; player.lying = 0;
  const at = (p, dx, dy, dz) => new THREE.Vector3(p.x + dx, getHeight(p.x, p.z) + dy, p.z + dz);
  const placeHero = (x, z, face) => { player.pos.set(x, getHeight(x, z), z); player.facing = face; };
  let warm = 1.2, emit = null;
  grade.uniforms.uVoid.value = 0; grade.uniforms.uSat.value = 1.15; grade.uniforms.uContrast.value = 0.2;
  const S = P.shrine, R = P.ruins, F = P.forestHeart, C = P.coast, V = P.village;
  if (name === 'prologue_heart') { dayTime = 0.96; placeHero(S.x + 30, S.z + 30, 0); hero.root.visible = false; cam.pos.copy(at(S, -24, 5, 20)); cam.look.copy(at(S, 0, 10, 0)); }
  else if (name === 'prologue_keepers') { dayTime = 0.735; hero.root.visible = false; teros && (teros.root.visible = true, teros.pos.set(R.x, getHeight(R.x, R.z), R.z), teros.face = 0, teros.root.position.copy(teros.pos), teros.root.rotation.y = 0);
    for (let i = 0; i < 7; i++) { const a = Math.PI * 0.15 + i / 6 * Math.PI * 0.7; const k = photoProp(keeperFigure([0xe8e2d0, 0xc9b6ff, 0x9fd8ff, 0xf2c46d, 0x9fe39a, 0xffb36b, 0xffffff][i])); const x = R.x + Math.cos(a) * 14, z = R.z + 14 + Math.sin(a) * 6; k.position.set(x, getHeight(x, z), z); k.rotation.y = Math.atan2(R.x - x, R.z - z); }
    cam.pos.copy(at(R, 10, 9, 52)); cam.look.copy(at(R, 0, 7, 0)); }
  else if (name === 'prologue_star') { dayTime = 0.0; hero.root.visible = false; cam.pos.copy(at(V, -20, 14, 30)); cam.look.set(60, 170, -500);
    const m = photoProp(new THREE.Mesh(meteorGeo, meteorMat)); m.position.set(140, 260, -420); m.scale.setScalar(5);
    emit = () => { for (let i = 0; i < 40; i++) { const k = Math.random(); fx.emit(140 - k * 260, 260 + k * 150, -420 + k * 90, 0, 0, 0, 5, 2.2, 0.6, 4 + (1 - k) * 8, 3, { drag: 0, s1: 1 }); } }; }
  else if (name === 'prologue_shore') { dayTime = 0.29; placeHero(C.x, C.z, Math.PI * 0.6); player.lying = 1; const sd = new THREE.Vector3(Math.cos(0.29 * 6.283 + 0.6), 0, Math.sin(0.29 * 6.283 + 0.6)); const side = new THREE.Vector3(-sd.z, 0, sd.x); cam.pos.copy(player.pos.clone().addScaledVector(side, 5).addScaledVector(sd, 2.5).add(new THREE.Vector3(0, 2.4, 0))); cam.look.copy(player.pos.clone().addScaledVector(side, -6).add(new THREE.Vector3(0, 0.6, 0))); }
  else if (name === 'vision') { dayTime = 0.33; placeHero(S.x - 4, S.z + 13, Math.PI); grade.uniforms.uSat.value = 1.3;
    const t = golemModel(true, [3.6, 2.6, 0.7]); t.root.scale.setScalar(2.3); t.body.position.y = -0.9; t.body.rotation.x = 0.35; t.root.position.copy(at(S, 6, 1.5, 4)); t.root.rotation.y = -0.6; photoProp(t.root);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const k = photoProp(keeperFigure([0xe8e2d0, 0xc9b6ff, 0x9fd8ff, 0xf2c46d, 0x9fe39a, 0xffb36b][i])); const x = S.x + Math.cos(a) * 5, z = S.z + Math.sin(a) * 5; k.position.set(x, getHeight(x, z) + 2, z); k.rotation.y = Math.atan2(S.x - x, S.z - z); }
    cam.pos.copy(at(S, -16, 7, 26)); cam.look.copy(at(S, 0, 6, 0)); emit = () => { for (let i = 0; i < 2; i++) fx.emit(S.x + rand(-14, 14), getHeight(S.x, S.z) + rand(2, 16), S.z + rand(-14, 14), 0, rand(0.3, 1), 0, 1.6, 1.3, 0.6, 0.25, 4, { drag: 0.2 }); }; }
  else if (name === 'eitan') { dayTime = 0.738; placeHero(F.x + 9, F.z + 14, Math.PI * 1.15); story.flags.eitanSaved = false; applyWorldState();
    const e = photoProp(npcFigure({ robe: 0x6b6a4a, hair: 0x5a3a1a, skin: 0xd9a57c })); e.position.copy(at(F, 6, 0.3, 10)); e.rotation.set(-1.45, 0.4, 0);
    flashLight(F.x + 6, getHeight(F.x, F.z) + 2.5, F.z + 10, 0xffd890, 60, 26, 999);
    cam.pos.copy(at(F, 15, 3.2, 13)); cam.look.copy(at(F, 6, 1.4, 10));
    emit = () => { for (let i = 0; i < 5; i++) { const a = Math.random() * 6.28, r = Math.random() * 2.5; fx.emit(F.x + 6 + Math.cos(a) * r, getHeight(F.x, F.z) + rand(0.3, 3.5), F.z + 10 + Math.sin(a) * r, 0, rand(0.5, 2), 0, 2.6, 2.1, 1.0, rand(0.15, 0.35), 3, { drag: 0.5 }); } }; }
  else if (name === 'teros') { dayTime = 0.275; story.flags.terosFreed = true; if (!npcs.find(n => n.id === 'teros')) spawnFriendlyTeros(); const tn = npcs.find(n => n.id === 'teros'); tn.group.visible = true;
    placeHero(R.x - 2, R.z + 15, Math.PI); cam.pos.copy(at(R, -9, 2.5, 26)); cam.look.copy(at(R, 0, 6, 4)); }
  else if (name === 'miren') { dayTime = 0.93; grade.uniforms.uVoid.value = 0.6; placeHero(S.x - 2, S.z + 19, Math.PI); Q.index = 11;
    flashLight(S.x, getHeight(S.x, S.z) + 9, S.z + 8, 0xb070ff, 70, 30, 999);
    const m = mirenModel(); m.root.position.copy(at(S, 0, 4.5, 7)); m.root.rotation.y = 0.3; m.armR.rotation.x = -2.4; m.armL.rotation.x = -1.8; photoProp(m.root);
    cam.pos.copy(at(S, -5, 3.2, 27)); cam.look.copy(at(S, 0, 7, 4));
    emit = () => { for (let i = 0; i < 6; i++) { const a = Math.random() * 6.28, r = rand(2, 10); fx.emit(S.x + Math.cos(a) * r, getHeight(S.x, S.z) + rand(2, 16), S.z + Math.sin(a) * r, 0, rand(0.5, 2), 0, 1.8, 0.4, 3.2, rand(0.2, 0.45), 3, { drag: 0.3 }); } }; }
  else if (name === 'ending_a') { dayTime = 0.292; hero.root.visible = false; Q.index = 13; cam.pos.copy(at(V, -170, 160, 210)); cam.look.copy(at(V, 120, 0, -60)); clouds.material.uniforms.uFade.value = 1; }
  else if (name === 'ending_b') { dayTime = 0.97; Q.index = 13; placeHero(S.x, S.z, 0.4); player.pos.y = getHeight(S.x, S.z) + 6.9; shrineCrystal.material.transparent = true; shrineCrystal.material.opacity = 0.42; shrineCrystal.material.depthWrite = false; const ca = Math.PI / 6; cam.pos.copy(at(S, Math.cos(ca) * 13, 8.5, Math.sin(ca) * 13)); cam.look.copy(at(S, 0, 8, 0)); }
  lastEnvElev = -9; updateDayNight(0.016, true); updateDayNight(0.016, true);
  animateHero(0.016, 0, false); if (player.lying) { hero.root.rotation.x = -1.45; }
  updateWorld(0.016, 10); if (name === 'ending_a') clouds.material.uniforms.uFade.value = 1;
  fogNow.copy(fogTarget); scene.fog.color.copy(fogNow); fogU.uFogColor.value.copy(fogNow);
  for (let i = 0; i < 40; i++) { if (emit) emit(); updateWorld(0.05, 10 + i * 0.05); fx.update(0.05); }
  shrineCrystal.material.emissiveIntensity = nightF > 0.5 ? 3.2 : 1.6;
  updateCamera(0); grade.uniforms.uVig.value = 1.25;
  for (let i = 0; i < 3; i++) composer.render();
  return renderer.domElement.toDataURL('image/jpeg', 0.9);
}

// ================= BOOT =================
const step = (txt, pct) => new Promise(r => { $('loadStep').textContent = txt; $('loadBar').firstChild.style.width = pct + '%'; setTimeout(r, 16); });
async function boot(data) {
  await step('מרים הרים וחוצב קניונים', 8); buildGrid();
  { let c = null; for (let r = 0; r < 160 && !c; r += 3) for (let a = 0; a < 24; a++) { const x = 18 + Math.cos(a / 24 * 6.283) * r, z = 452 + Math.sin(a / 24 * 6.283) * r, h = getHeight(x, z); if (h > 0.55 && h < 1.5 && slopeAtXZ(x, z) < 0.25 && getHeight(x, z - 12) > 1.2) { c = { x, z }; break; } }
    c = c || landNear({ x: 18, z: 452 }, 1.0); P.coast.x = c.x; P.coast.z = c.z; player.pos.set(c.x, getHeight(c.x, c.z), c.z); }
  await step('צובע סלע, חול ושלג', 30); buildSurfaceTextures();
  await step('ממלא אגמים ומגדל דשא', 45); buildTerrain(); buildWater(); buildGrass(); buildClouds();
  await step('שותל יערות', 60); buildVegetation();
  await step('בונה את כפר אלדור ואת המקדש', 74); buildVillage(); buildShrine(); buildRuins(); buildCamp(); buildLoreStones(); buildPeople();
  await step('מעיר את היצורים', 86);
  fx = new Particles(isTouch ? 6000 : 12000, THREE.AdditiveBlending); dust = new Particles(2500, THREE.NormalBlending);
  buildHero(); questBeam = makeBeam(0, 0, 0, 0xffc86a, 300, 0.9);
  buildMinimapBase(); buildSkillbar(); spawnAll(); applyWorldState();
  if (data && data.save) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(data.save)); } catch (e) { } }
  if (loadSave()) $('btnCont').hidden = false;
  await step('מדליק את השמש', 96);
  applyQuality(); updateDayNight(0.016, true);
  cam.pos.set(300, 120, 300); cam.look.set(0, 0, 0);
  $('loading').hidden = true;
  if (PHOTO) { state = 'photo'; titleMode = false; window.__renderShot = renderShot; window.__dbg = { shrineBeam, shrineCrystal, shrineRing, photoProps, particleSystems, fxLights, terrainMesh, godrays, bloom, grade, painterly, scene, fogU, sun, hemi, renderer, composer, fogTarget, fogNow, skyU, sampleSky, sunDir, THREE }; window.__PHOTO_READY = true; renderer.setAnimationLoop(null); return; }
  if (window.__AETHERIA_TEST) window.__T = { player, Q, QUESTS, story, enemies, npcs, loreStones, P, onKill, damageEnemy, getHeight, state: () => ({ q: Q.index, prog: Q.prog, title: QUESTS[Q.index].title, dlg: dialogOpen, slides: !!slidesState, cine: cinema.active, seq: seqBusy, blade: player.blade, lvl: player.lvl, flags: { ...story.flags }, boss: activeBoss && activeBoss.type, hp: Math.round(player.hp) }),
    tp: (x, z) => { player.pos.set(x, getHeight(x, z), z); cam.cut = true; }, openJournal, renderJournal, setTab: t => { journalTab = t; renderJournal(); } };
  $('title').hidden = false; state = 'title';
  renderer.setAnimationLoop(frame);
  window.claude?.hot?.snapshot?.(() => ({ save: serialize() }));
}
function start(data) { setTimeout(() => { boot(data || {}).catch(err => { console.error(err); $('loading').innerHTML = 'משהו השתבש בבניית העולם<small>' + String(err && err.message || err) + '</small>'; }); }, 30); }
window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
