
// ================= PARTICLES =================
const particleSystems = [];
class Particles {
  constructor(max, blending) {
    this.max = max; this.i = 0; this.alive = false;
    const f = n => new Float32Array(n);
    this.pos = f(max * 3); this.col = f(max * 3); this.size = f(max); this.alpha = f(max);
    this.vel = f(max * 3); this.life = f(max); this.maxLife = f(max); this.s0 = f(max); this.s1 = f(max); this.grav = f(max); this.drag = f(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('aColor', this.aCol); g.setAttribute('aSize', this.aSize); g.setAttribute('aAlpha', this.aAlpha);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending,
      uniforms: { uScale: { value: innerHeight } },
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float uScale; varying vec3 vC; varying float vA;
        void main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(aSize * uScale / max(-mv.z, 0.1), 512.0); gl_Position = projectionMatrix * mv; if (aAlpha <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; float a = 1.0 - smoothstep(0.0, 1.0, r); a *= a; if (a < 0.01) discard; gl_FragColor = vec4(vC, a * vA); }`
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 4; scene.add(this.points);
    particleSystems.push(this);
  }
  emit(x, y, z, vx, vy, vz, r, g, b, size, life, o = {}) {
    const i = this.i; this.i = (i + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.s0[i] = size; this.s1[i] = o.s1 ?? size * 0.15; this.life[i] = this.maxLife[i] = life; this.grav[i] = o.g ?? 0; this.drag[i] = o.drag ?? 1.5;
    this.size[i] = size; this.alpha[i] = 0.001;
  }
  burst(x, y, z, n, speed, color, size, life, o = {}) {
    for (let k = 0; k < n; k++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, q = Math.sqrt(1 - u * u);
      const vx = Math.cos(th) * q, vy = o.up != null ? Math.abs(u) * o.up + (o.upBias || 0) : u, vz = Math.sin(th) * q;
      const sp = speed * (0.35 + Math.random() * 0.65), j = 0.8 + Math.random() * 0.4;
      this.emit(x, y, z, vx * sp, vy * sp, vz * sp, color[0] * j, color[1] * j, color[2] * j, size * (0.6 + Math.random() * 0.7), life * (0.6 + Math.random() * 0.6), o);
    }
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt; any = true;
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      const t = 1 - this.life[i] / this.maxLife[i], dr = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.vel[i * 3] *= dr; this.vel[i * 3 + 1] *= dr; this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = lerp(this.s0[i], this.s1[i], t);
      this.alpha[i] = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
    }
    if (any || this.alive) { this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = true; }
    this.alive = any;
  }
}
let fx, dust;

// ================= RING / DECAL FX =================
const ringGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
const rings = [];
function spawnRing(x, z, o) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: !!o.depthTest, blending: o.normal ? THREE.NormalBlending : THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(...o.color) }, uAlpha: { value: 1 }, uProg: { value: 0 }, uMode: { value: o.mode || 0 }, uTime: timeU },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uAlpha; uniform float uProg; uniform float uMode; uniform float uTime; varying vec2 vUv;
      void main(){ float r = length(vUv * 2.0 - 1.0); if (r > 1.0) discard; float a;
        if (uMode < 0.5) { a = smoothstep(0.7, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r)) + smoothstep(0.5, 1.0, r) * 0.25; }
        else if (uMode < 1.5) { float edge = smoothstep(0.9, 0.98, r) * (1.0 - smoothstep(0.98, 1.0, r)); float fill = step(r, uProg) * 0.35 + 0.12; a = edge * 1.2 + fill * (0.6 + 0.4 * sin(uTime * 14.0)); }
        else { a = (1.0 - smoothstep(0.2, 1.0, r)) * 0.85; }
        gl_FragColor = vec4(uColor, a * uAlpha); }`
  });
  const m = new THREE.Mesh(ringGeo, mat); m.renderOrder = 6;
  const y = (o.y != null ? o.y : getHeight(x, z)) + 0.35; m.position.set(x, y, z); m.scale.setScalar(o.r0 ?? 0.1); scene.add(m);
  const r = { mesh: m, mat, t: 0, dur: o.dur, r0: o.r0 ?? 0.1, r1: o.r1, mode: o.mode || 0, follow: o.follow };
  rings.push(r); return r;
}
function updateRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt; const k = clamp(r.t / r.dur, 0, 1);
    if (r.mode === 0) { r.mesh.scale.setScalar(lerp(r.r0, r.r1, 1 - Math.pow(1 - k, 3))); r.mat.uniforms.uAlpha.value = 1 - k; }
    else if (r.mode === 1) { r.mesh.scale.setScalar(r.r1); r.mat.uniforms.uProg.value = k; if (r.follow) { r.mesh.position.set(r.follow.x, getHeight(r.follow.x, r.follow.z) + 0.4, r.follow.z); } }
    else { r.mesh.scale.setScalar(r.r1); r.mat.uniforms.uAlpha.value = 1 - k; }
    if (r.t >= r.dur) { scene.remove(r.mesh); r.mat.dispose(); rings.splice(i, 1); }
  }
}

const slashGeoA = new THREE.RingGeometry(1.0, 3.3, 40, 1, -1.35, 2.7);
const slashGeoSpin = new THREE.RingGeometry(1.0, 4.4, 64, 1, 0, Math.PI * 2);
const slashes = [];
function spawnSlash(pos, facing, combo, color) {
  const spin = combo === 2;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: color.clone() }, uProg: { value: 0 }, uFade: { value: 1 }, uStart: { value: spin ? 0 : -1.35 }, uLen: { value: spin ? Math.PI * 2 : 2.7 }, uOuter: { value: spin ? 4.4 : 3.3 } },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uProg; uniform float uFade; uniform float uStart; uniform float uLen; uniform float uOuter; varying vec2 vP;
      void main(){ float ang = atan(vP.y, vP.x); float a01 = uLen > 6.0 ? fract((ang - uStart) / 6.2831853) : (ang - uStart) / uLen;
        float behind = uProg - a01; if (behind < 0.0) discard;
        float trail = exp(-behind * 3.5);
        float r = (length(vP) - 1.0) / (uOuter - 1.0);
        float rad = smoothstep(0.0, 0.45, r) * (1.0 - smoothstep(0.82, 1.0, r));
        float edge = smoothstep(0.65, 0.92, r);
        gl_FragColor = vec4(uColor * (0.8 + edge * 2.2), trail * rad * uFade); }`
  });
  const outer = new THREE.Group(); outer.position.set(pos.x, pos.y + 1.25, pos.z); outer.rotation.y = facing;
  const tilt = new THREE.Group(); tilt.rotation.z = spin ? 0 : (combo === 0 ? 0.25 : -0.3); if (combo === 1) tilt.scale.x = -1;
  const mid = new THREE.Group(); mid.rotation.y = -Math.PI / 2;
  const mesh = new THREE.Mesh(spin ? slashGeoSpin : slashGeoA, mat); mesh.rotation.x = -Math.PI / 2;
  mid.add(mesh); tilt.add(mid); outer.add(tilt); scene.add(outer);
  slashes.push({ obj: outer, mat, t: 0, dur: spin ? 0.42 : 0.3, spin });
}
function updateSlashes(dt) {
  for (let i = slashes.length - 1; i >= 0; i--) {
    const s = slashes[i]; s.t += dt; const k = s.t / s.dur;
    s.mat.uniforms.uProg.value = Math.min(1.4, k * (s.spin ? 2.2 : 2.8));
    s.mat.uniforms.uFade.value = 1 - smooth(0.35, 1, k);
    if (s.t >= s.dur) { scene.remove(s.obj); s.mat.dispose(); slashes.splice(i, 1); }
  }
}
const fxLights = [];
for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffffff, 0, 30, 1.8); l.userData = { t: 0, dur: 1, i0: 0 }; scene.add(l); fxLights.push(l); }
function flashLight(x, y, z, color, intensity, dist, dur) {
  let l = fxLights[0]; for (const c of fxLights) if (c.intensity < l.intensity) l = c;
  l.position.set(x, y, z); l.color.set(color); l.distance = dist; l.intensity = intensity; l.userData = { t: 0, dur, i0: intensity, follow: null }; return l;
}
function updateLights(dt) { for (const l of fxLights) { const u = l.userData; if (u.i0 <= 0) continue; u.t += dt; if (u.follow) l.position.copy(u.follow); l.intensity = u.i0 * Math.max(0, 1 - u.t / u.dur); if (u.t >= u.dur) { u.i0 = 0; l.intensity = 0; } } }

// ================= AUDIO =================
const AudioSys = {
  ctx: null, master: null, enabled: true,
  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const c = this.ctx; this.master = c.createGain(); this.master.gain.value = 0.55; this.master.connect(c.destination);
    this.nb = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = this.nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.delay = c.createDelay(); this.delay.delayTime.value = 0.38; const fb = c.createGain(); fb.gain.value = 0.35; const wet = c.createGain(); wet.gain.value = 0.3;
    this.delay.connect(fb).connect(this.delay); this.delay.connect(wet).connect(this.master);
    this.startMusic();
  },
  noise(dur, f0, f1, type, q, vol, when = 0) { const c = this.ctx, t = c.currentTime + when; const s = c.createBufferSource(); s.buffer = this.nb; const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur); const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); s.connect(f).connect(g).connect(this.master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05); },
  tone(type, f0, f1, dur, vol, when = 0, toDelay = false) { const c = this.ctx, t = c.currentTime + when; const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); o.connect(g).connect(this.master); if (toDelay) g.connect(this.delay); o.start(t); o.stop(t + dur + 0.05); },
  play(n) {
    if (!this.ctx || !this.enabled) return;
    switch (n) {
      case 'swing': this.noise(0.18, 700, 3200, 'bandpass', 1.4, 0.35); break;
      case 'hit': this.tone('sine', 160, 50, 0.14, 0.5); this.noise(0.06, 3000, 900, 'highpass', 0.7, 0.25); break;
      case 'crit': this.tone('square', 900, 1800, 0.08, 0.08); this.tone('sine', 180, 45, 0.2, 0.6); this.noise(0.1, 4000, 1000, 'highpass', 0.7, 0.3); break;
      case 'fire': this.noise(0.35, 400, 1800, 'bandpass', 0.8, 0.3); this.tone('sawtooth', 220, 440, 0.2, 0.05); break;
      case 'boom': this.noise(0.6, 1200, 80, 'lowpass', 0.8, 0.6); this.tone('sine', 90, 30, 0.5, 0.5); break;
      case 'meteor': this.noise(1.3, 2400, 60, 'lowpass', 0.6, 0.8); this.tone('sine', 70, 22, 1.1, 0.8); this.tone('sawtooth', 120, 30, 0.6, 0.12); break;
      case 'nova': this.tone('sine', 300, 1200, 0.35, 0.18, 0, true); this.noise(0.5, 6000, 500, 'bandpass', 0.6, 0.25); break;
      case 'dash': this.noise(0.22, 2500, 500, 'bandpass', 1, 0.3); break;
      case 'hurt': this.tone('square', 240, 90, 0.18, 0.12); this.noise(0.12, 1500, 300, 'lowpass', 1, 0.3); break;
      case 'coin': this.tone('sine', 1320, 1760, 0.09, 0.12); this.tone('sine', 1760, 2200, 0.12, 0.08, 0.06); break;
      case 'level': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone('triangle', f, f, 0.6, 0.15, i * 0.09, true)); break;
      case 'quest': [392, 523, 659, 784].forEach((f, i) => this.tone('triangle', f, f * 1.001, 0.7, 0.12, i * 0.12, true)); break;
      case 'story': [330, 440, 554, 659].forEach((f, i) => this.tone('sine', f, f, 1.6, 0.07, i * 0.22, true)); break;
      case 'roar': this.tone('sawtooth', 110, 45, 1.2, 0.25); this.noise(1.2, 600, 100, 'lowpass', 2, 0.5); break;
      case 'howl': this.tone('sawtooth', 300, 620, 0.6, 0.12, 0, true); this.tone('sawtooth', 620, 380, 1.0, 0.12, 0.6, true); break;
      case 'void': this.tone('sine', 520, 180, 0.4, 0.12, 0, true); this.noise(0.3, 900, 3000, 'bandpass', 3, 0.15); break;
      case 'tele': this.tone('sine', 1200, 200, 0.5, 0.15, 0, true); this.noise(0.5, 4000, 300, 'bandpass', 2, 0.2); break;
      case 'purify': [523, 784, 1047, 1568].forEach((f, i) => this.tone('sine', f, f, 2.2, 0.08, i * 0.15, true)); this.noise(2, 8000, 2000, 'highpass', 0.5, 0.06); break;
      case 'step': this.noise(0.05, 800, 300, 'lowpass', 1, 0.05); break;
      case 'drone': this.tone('sine', 220, 880, 0.6, 0.1, 0, true); this.noise(0.8, 300, 2000, 'bandpass', 2, 0.12); break;
      case 'page': this.noise(0.25, 3000, 6000, 'bandpass', 1.5, 0.08); break;
    }
  },
  startMusic() {
    const c = this.ctx; const mg = c.createGain(); mg.gain.value = 0.045; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.connect(mg); mg.connect(this.master); mg.connect(this.delay);
    this.musicGain = mg; this.lp = lp;
    const sets = { calm: [[220, 261.6, 329.6, 110], [174.6, 220, 261.6, 87.3], [261.6, 329.6, 392, 130.8], [196, 246.9, 293.7, 98]], dark: [[207.7, 246.9, 311.1, 103.8], [185, 220, 277.2, 92.5], [164.8, 207.7, 246.9, 82.4], [196, 233.1, 293.7, 98]] };
    let idx = 0;
    const play = () => {
      if (!this.ctx) return; const t = c.currentTime; const ch = sets[this.mood || 'calm'][idx++ % 4];
      ch.forEach((f, i) => { for (const det of [-5, 5]) { const o = c.createOscillator(); o.type = i === 3 ? 'triangle' : 'sawtooth'; o.frequency.value = f; o.detune.value = det; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(i === 3 ? 0.5 : 0.22, t + 2.2); g.gain.linearRampToValueAtTime(0.0001, t + 8.4); o.connect(g).connect(lp); o.start(t); o.stop(t + 8.6); } });
      if (Math.random() < 0.8) [0, 1, 2].forEach(k => { const f = ch[Math.floor(Math.random() * 3)] * 2; this.tone('sine', f, f, 1.6, 0.03, 1 + k * 1.7 + Math.random(), true); });
    };
    play(); this.musicTimer = setInterval(play, 6500);
  },
  setMood(m) { this.mood = m; },
  toggle() { this.enabled = !this.enabled; if (this.master) this.master.gain.value = this.enabled ? 0.55 : 0; $('soundState').textContent = this.enabled ? 'פועל' : 'כבוי'; }
};

// ================= HERO =================
const hero = {};
const bladeInfo = [
  { name: 'להב פלדה', color: [1.6, 1.9, 2.4], mult: 1 },
  { name: 'להב התכלת', color: [0.5, 2.6, 4.0], mult: 1.35 },
  { name: 'להב השמש', color: [4.2, 2.4, 0.5], mult: 1.8 },
  { name: 'להב השחר', color: [4.4, 3.4, 2.4], mult: 2.4 },
];
function buildHero() {
  const root = new THREE.Group();
  const armor = new THREE.MeshStandardMaterial({ color: 0xa6b8d4, metalness: 0.85, roughness: 0.28 });
  const darkArmor = new THREE.MeshStandardMaterial({ color: 0x3a4a66, metalness: 0.7, roughness: 0.35 });
  const cloth = std(0x8f1f30, { roughness: 0.85 }), leather = std(0x4a3426, { roughness: 0.75 }), skin = std(0xe0b08a, { roughness: 0.6 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe6b450, metalness: 1, roughness: 0.25 }), hair = std(0x2a1a12, { roughness: 0.7 });
  const runeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...bladeInfo[0].color) });
  const body = new THREE.Group(); body.position.y = 0.95; root.add(body);
  addMesh(body, new THREE.CapsuleGeometry(0.29, 0.4, 6, 14).translate(0, 0.5, 0), darkArmor);
  const chest = addMesh(body, new THREE.SphereGeometry(0.33, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62).translate(0, 0.58, 0.02), armor); chest.scale.set(1, 0.95, 0.85);
  addMesh(body, new THREE.CylinderGeometry(0.33, 0.35, 0.1, 14).translate(0, 0.2, 0), leather);
  addMesh(body, new THREE.BoxGeometry(0.14, 0.1, 0.05).translate(0, 0.2, 0.33), gold);
  const tabard = addMesh(body, new THREE.PlaneGeometry(0.34, 0.6).translate(0, -0.14, 0.31), std(0x8f1f30, { side: THREE.DoubleSide })); tabard.rotation.x = 0.06;
  addMesh(body, new THREE.ConeGeometry(0.4, 0.5, 14, 1, true).translate(0, 0.04, 0), cloth);
  for (let k = 0; k < 3; k++) addMesh(body, new THREE.BoxGeometry(0.035, 0.16 - k * 0.03, 0.02), runeMat, 0, 0.66 - k * 0.12, 0.31, false);
  const head = new THREE.Group(); head.position.y = 1.12; body.add(head);
  addMesh(head, new THREE.SphereGeometry(0.22, 18, 14), skin, 0, 0, 0);
  addMesh(head, new THREE.SphereGeometry(0.235, 18, 14, 0, Math.PI * 2, 0, 1.5), hair, 0, 0.035, -0.02);
  addMesh(head, new THREE.ConeGeometry(0.12, 0.32, 8).rotateX(-2.4).translate(0, -0.02, -0.22), hair);
  addMesh(head, new THREE.TorusGeometry(0.225, 0.018, 6, 24).rotateX(Math.PI / 2).translate(0, 0.07, 0), gold);
  for (const s of [-1, 1]) addMesh(head, new THREE.BoxGeometry(0.05, 0.035, 0.02), std(0x111111), s * 0.08, 0.02, 0.205, false);
  for (const s of [-1, 1]) { addMesh(body, new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), armor, s * 0.38, 0.86, 0); addMesh(body, new THREE.TorusGeometry(0.2, 0.02, 6, 20).rotateX(Math.PI / 2), gold, s * 0.38, 0.86, 0); }
  // cloak: animated per vertex every frame
  const capeGeo = new THREE.PlaneGeometry(0.72, 1.2, 2, 8).translate(0, -0.6, 0);
  const cape = new THREE.Mesh(capeGeo, std(0x8f1f30, { side: THREE.DoubleSide, roughness: 0.9 })); cape.position.set(0, 0.88, -0.27); cape.castShadow = true; body.add(cape);
  cape.userData.base = capeGeo.attributes.position.array.slice();
  const mkArm = s => { const a = new THREE.Group(); a.position.set(s * 0.42, 0.82, 0);
    addMesh(a, new THREE.CapsuleGeometry(0.095, 0.26, 4, 8).translate(0, -0.2, 0), cloth);
    addMesh(a, new THREE.CylinderGeometry(0.105, 0.095, 0.26, 10).translate(0, -0.48, 0), armor);
    addMesh(a, new THREE.SphereGeometry(0.1, 10, 8), leather, 0, -0.66, 0); body.add(a); return a; };
  const armR = mkArm(-1), armL = mkArm(1);
  const sword = new THREE.Group(); sword.position.set(0, -0.68, 0); armR.add(sword);
  addMesh(sword, new THREE.CylinderGeometry(0.035, 0.035, 0.28, 8), leather, 0, 0, 0);
  addMesh(sword, new THREE.SphereGeometry(0.05, 10, 8), runeMat, 0, 0.16, 0, false);
  addMesh(sword, new THREE.BoxGeometry(0.4, 0.05, 0.08), gold, 0, -0.15, 0);
  const bladeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...bladeInfo[0].color) });
  addMesh(sword, new THREE.BoxGeometry(0.075, 1.2, 0.022).translate(0, -0.78, 0), new THREE.MeshStandardMaterial({ color: 0xdfe8f5, metalness: 1, roughness: 0.15 }));
  addMesh(sword, new THREE.BoxGeometry(0.1, 1.15, 0.012).translate(0, -0.8, 0), bladeMat, 0, 0, 0, false);
  addMesh(sword, new THREE.ConeGeometry(0.06, 0.2, 4).rotateX(Math.PI).translate(0, -1.48, 0), bladeMat, 0, 0, 0);
  const shield = new THREE.Group(); shield.position.set(0.12, -0.42, 0.05); armL.add(shield);
  const sh = addMesh(shield, new THREE.CylinderGeometry(0.36, 0.36, 0.06, 6).rotateZ(Math.PI / 2), std(0x2f4570, { metalness: 0.6, roughness: 0.35 })); sh.scale.set(1, 1.25, 1);
  addMesh(shield, new THREE.TorusGeometry(0.34, 0.025, 6, 6).rotateY(Math.PI / 2), gold).scale.set(1, 1.25, 1);
  addMesh(shield, new THREE.OctahedronGeometry(0.1), runeMat, 0.05, 0, 0, false);
  const mkLeg = s => { const l = new THREE.Group(); l.position.set(s * 0.15, 0.95, 0);
    addMesh(l, new THREE.CapsuleGeometry(0.12, 0.38, 4, 8).translate(0, -0.3, 0), leather);
    addMesh(l, new THREE.CylinderGeometry(0.13, 0.12, 0.34, 10).translate(0, -0.7, 0), darkArmor);
    addMesh(l, new THREE.BoxGeometry(0.2, 0.13, 0.33).translate(0, -0.89, 0.05), std(0x2b1d14));
    addMesh(l, new THREE.TorusGeometry(0.13, 0.015, 6, 16).rotateX(Math.PI / 2).translate(0, -0.53, 0), gold); root.add(l); return l; };
  const legR = mkLeg(-1), legL = mkLeg(1);
  const aura = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.5, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.5, 3.5), transparent: true, opacity: 0.0, depthWrite: false })); aura.position.y = 0.15; root.add(aura);
  const pBeam = makeBeam(0, 0, 0, 0x6fdcff, 260, 1.0); pBeam.visible = false;
  scene.add(root);
  Object.assign(hero, { root, body, head, armR, armL, legR, legL, sword, bladeMat, runeMat, cape, aura, pBeam });
}
function setBlade(tier) { player.blade = tier; hero.bladeMat.color.setRGB(...bladeInfo[tier].color); hero.runeMat.color.setRGB(...bladeInfo[tier].color).multiplyScalar(0.8); }
function animateCape(dt, speed) {
  const c = hero.cape, p = c.geometry.attributes.position, base = c.userData.base; const t = realTime;
  for (let i = 0; i < p.count; i++) {
    const bx = base[i * 3], by = base[i * 3 + 1]; const k = -by / 1.2; // 0 at the shoulders, 1 at the hem
    const wave = Math.sin(t * 6 + k * 4 + bx * 3) * 0.05 * k * (0.4 + speed * 0.08);
    p.setXYZ(i, bx * (1 + k * 0.25), by, -k * k * (0.08 + Math.min(1, speed / 13) * 0.5) + wave);
  }
  p.needsUpdate = true; c.geometry.computeVertexNormals();
}

// ================= PLAYER STATE =================
const player = {
  pos: new THREE.Vector3(P.coast.x, 0, P.coast.z), vel: new THREE.Vector3(), vy: 0, onGround: true, facing: Math.PI,
  hp: 120, maxHp: 120, mp: 80, maxMp: 80, st: 100, maxSt: 100, lvl: 1, xp: 0, gold: 0, potions: 2, blade: 0,
  atkTimer: 0, atkTotal: 0, combo: 0, comboWindow: 0, atkQueued: false, hitDone: false,
  dashT: 0, dashCd: 0, dashDir: new THREE.Vector2(), iframes: 0, lastHurt: -99,
  cds: { fire: 0, nova: 0, meteor: 0 }, dead: false, walkPhase: 0, stepT: 0, pop: 0, bonusHp: 0,
};
const SK = { fire: { mp: 12, cd: 0.45, lvl: 1 }, nova: { mp: 28, cd: 6, lvl: 2 }, meteor: { mp: 45, cd: 12, lvl: 3 } };
const xpToNext = l => Math.round(80 * Math.pow(l, 1.55));
const baseDmg = () => 14 + player.lvl * 5;
const ARMOR_K = 100; // ratio formula: dmg * K / (K + armor)
const playerArmor = () => 6 + player.lvl * 5 + (story.flags.charm ? 15 : 0);
const CRIT_CHANCE = 0.1, CRIT_MULT = 1.75;
function rollDmg(base, critChance = CRIT_CHANCE) { const crit = Math.random() < critChance; return [Math.round(base * rand(0.9, 1.1) * (crit ? CRIT_MULT : 1)), crit]; }
function recalcStats() { player.maxHp = 100 + player.lvl * 20 + player.bonusHp; player.maxMp = 70 + player.lvl * 10; }

// ================= ENEMIES =================
const G = {
  slime: new THREE.SphereGeometry(0.85, 28, 18), eye: new THREE.SphereGeometry(0.11, 8, 6),
  box: new THREE.BoxGeometry(1, 1, 1), dode: new THREE.DodecahedronGeometry(1, 0), ico: new THREE.IcosahedronGeometry(1, 0), cone4: new THREE.ConeGeometry(1, 1, 4), sph: new THREE.SphereGeometry(1, 16, 12),
};
const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0a0a12 });
const DEFS = {
  slime: { name: 'רפש', hp: 60, dmg: 11, speed: 3.4, aggro: 17, range: 1.7, atkCd: 1.4, windup: 0.45, xp: 15, gold: [2, 6], radius: 0.85, barY: 2.1, color: [0.5, 2.5, 0.8] },
  wolf: { name: 'זאב צל', hp: 120, dmg: 25, speed: 8.8, aggro: 25, range: 2.3, atkCd: 1.25, windup: 0.38, xp: 32, gold: [4, 10], radius: 0.95, barY: 2.3, color: [1.6, 0.6, 2.6] },
  alpha: { name: 'מנהיג הלהקה', hp: 760, dmg: 32, speed: 9.5, aggro: 40, range: 3.2, atkCd: 1.5, windup: 0.5, xp: 180, gold: [60, 60], radius: 1.7, barY: 0, color: [2.2, 0.8, 3.6], boss: true },
  golem: { name: 'גולם סלע', hp: 300, dmg: 32, speed: 3.1, aggro: 21, range: 3.4, atkCd: 2.3, windup: 0.85, xp: 75, gold: [10, 22], radius: 1.7, barY: 5.6, color: [3.0, 1.2, 0.3] },
  boss: { name: 'תרוס, אדון הגולמים', hp: 3200, dmg: 46, speed: 3.8, aggro: 44, range: 6.2, atkCd: 2.0, windup: 1.0, xp: 900, gold: [300, 300], radius: 3.6, barY: 0, color: [2.2, 0.8, 4.0], boss: true },
  miren: { name: 'מירן, קול הריק', hp: 4200, dmg: 24, speed: 4, aggro: 999, range: 14, atkCd: 2.6, windup: 0.7, xp: 1500, gold: [0, 0], radius: 1.4, barY: 0, color: [2.4, 0.6, 4.2], boss: true },
};
function emat(hex, o = {}) { return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.75, ...o }); }
function golemModel(boss, core) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const mat = emat(boss ? 0x4a4458 : 0x7a7064, { flatShading: true, roughness: 0.95, emissive: boss ? 0x22113a : 0x000000, emissiveIntensity: 0.5 });
  const coreM = glow(...core);
  addMesh(body, G.dode, mat, 0, 2.6, 0).scale.set(1.35, 1.5, 1.1);
  addMesh(body, G.dode, mat, 0, 1.6, 0).scale.set(1, 0.7, 0.9);
  const head = addMesh(body, G.dode, mat, 0, 4.25, 0.15); head.scale.setScalar(0.62);
  addMesh(body, G.ico, coreM, 0, 2.75, 0.95, false).scale.setScalar(0.38);
  for (const s of [-1, 1]) addMesh(body, G.box, coreM, s * 0.22, 4.3, 0.68, false).scale.set(0.15, 0.08, 0.05);
  for (let i = 0; i < 9; i++) { const c = addMesh(body, G.box, coreM, rand(-1, 1), rand(1.8, 3.6), rand(0.6, 1.0), false); c.scale.set(0.05, rand(0.3, 0.7), 0.04); c.rotation.z = rand(-0.8, 0.8); } // glowing cracks
  const mkArm = s => { const a = new THREE.Group(); a.position.set(s * 1.6, 3.4, 0); addMesh(a, G.dode, mat, 0, -0.6, 0).scale.set(0.55, 0.75, 0.55); addMesh(a, G.dode, mat, 0, -1.7, 0.1).scale.set(0.5, 0.7, 0.5); addMesh(a, G.dode, mat, 0, -2.6, 0.15).scale.setScalar(0.62); body.add(a); return a; };
  const armL = mkArm(1), armR = mkArm(-1);
  const legs = []; for (const s of [-1, 1]) { const l = new THREE.Group(); l.position.set(s * 0.65, 1.3, 0); addMesh(l, G.dode, mat, 0, -0.65, 0).scale.set(0.5, 0.7, 0.5); body.add(l); legs.push(l); }
  if (boss) {
    const cm = new THREE.MeshStandardMaterial({ color: 0x8a4dff, emissive: 0x9a55ff, emissiveIntensity: 2.4, flatShading: true });
    for (let i = 0; i < 6; i++) { const c = addMesh(body, G.cone4, cm, rand(-1, 1), 3.2 + rand(0, 0.8), -0.9 - rand(0, 0.3), false); c.scale.set(0.25, rand(1, 1.8), 0.25); c.rotation.set(-0.5 + rand(-0.3, 0.3), 0, rand(-0.5, 0.5)); }
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const c = addMesh(body, G.cone4, cm, Math.cos(a) * 0.45, 4.85, 0.15 + Math.sin(a) * 0.45, false); c.scale.set(0.1, 0.45, 0.1); }
  }
  return { root, body, mats: [mat], armL, armR, legs, head, coreM };
}
function wolfModel(alpha) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const mat = emat(alpha ? 0x1c1630 : 0x2c2540, { flatShading: true, emissive: alpha ? 0x2a0f50 : 0x1a0f2e, emissiveIntensity: 0.5 });
  const mane = emat(alpha ? 0x6a3aa6 : 0x463a66, { flatShading: true, emissive: alpha ? 0x6a2aff : 0x000000, emissiveIntensity: alpha ? 0.8 : 0 });
  addMesh(body, G.box, mat, 0, 1.05, 0).scale.set(0.8, 0.72, 1.7);
  addMesh(body, G.box, mane, 0, 1.25, 0.55).scale.set(0.95, 0.9, 0.8);
  const head = new THREE.Group(); head.position.set(0, 1.35, 1.1); body.add(head);
  addMesh(head, G.box, mat, 0, 0, 0).scale.set(0.58, 0.52, 0.62);
  addMesh(head, G.box, mat, 0, -0.1, 0.42).scale.set(0.34, 0.28, 0.45);
  for (const s of [-1, 1]) { addMesh(head, G.cone4, mane, s * 0.18, 0.4, -0.08).scale.set(0.12, 0.32, 0.12); addMesh(head, G.box, glow(4, 0.4, 0.6), s * 0.15, 0.08, 0.31, false).scale.set(0.09, 0.06, 0.04); }
  const legs = [];
  for (const [lx, lz] of [[-0.3, 0.6], [0.3, 0.6], [-0.3, -0.6], [0.3, -0.6]]) { const l = new THREE.Group(); l.position.set(lx, 0.85, lz); addMesh(l, G.box, mat, 0, -0.42, 0).scale.set(0.18, 0.85, 0.2); body.add(l); legs.push(l); }
  const tail = new THREE.Group(); tail.position.set(0, 1.3, -0.85); addMesh(tail, G.box, mane, 0, 0, -0.4).scale.set(0.16, 0.16, 0.8); tail.rotation.x = 0.5; body.add(tail);
  const spikes = glow(1.8, 0.5, 3.2);
  for (let i = 0; i < 5; i++) addMesh(body, G.cone4, i % 2 ? mane : spikes, 0, 1.55, 0.7 - i * 0.32, false).scale.set(0.1, 0.38, 0.15);
  if (alpha) root.scale.setScalar(1.9);
  return { root, body, mats: [mat], legs, head, tail };
}
function mirenModel() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const robe = emat(0x2a1640, { emissive: 0x3a1060, emissiveIntensity: 0.5, roughness: 0.6, side: THREE.DoubleSide });
  const voidM = glow(2.4, 0.6, 4.6);
  addMesh(body, new THREE.ConeGeometry(0.85, 2.6, 16, 1, true).translate(0, 1.3, 0), robe);
  addMesh(body, new THREE.TorusGeometry(0.84, 0.05, 6, 32).rotateX(Math.PI / 2), voidM, 0, 0.03, 0, false);
  addMesh(body, new THREE.SphereGeometry(0.42, 14, 10).translate(0, 2.2, 0), robe);
  addMesh(body, new THREE.SphereGeometry(0.4, 16, 12, 0, Math.PI * 2, 0, 1.8).translate(0, 2.8, -0.04), robe);
  addMesh(body, new THREE.SphereGeometry(0.27, 14, 10).translate(0, 2.72, 0.06), emat(0x0c0612));
  for (const s of [-1, 1]) addMesh(body, new THREE.SphereGeometry(0.045, 8, 6), voidM, s * 0.09, 2.76, 0.3, false);
  for (let i = 0; i < 7; i++) { const h = addMesh(body, new THREE.ConeGeometry(0.035, 1.3, 4), std(0xe8e2d0), rand(-0.25, 0.25), 2.2, -0.25 - rand(0, 0.1), false); h.rotation.x = 0.2; }
  const armL = new THREE.Group(), armR = new THREE.Group(); armL.position.set(0.5, 2.3, 0); armR.position.set(-0.5, 2.3, 0); body.add(armL, armR);
  for (const a of [armL, armR]) addMesh(a, new THREE.CapsuleGeometry(0.11, 0.7, 4, 8).translate(0, -0.45, 0), robe);
  const staff = new THREE.Group(); staff.position.set(0, -0.9, 0); armR.add(staff);
  addMesh(staff, new THREE.CylinderGeometry(0.04, 0.05, 2.6, 6).translate(0, 0.6, 0), std(0x2a1a2a));
  const orb = addMesh(staff, new THREE.SphereGeometry(0.22, 14, 10), voidM, 0, 1.95, 0, false);
  const orbit = new THREE.Group(); orbit.position.y = 1.6; body.add(orbit);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; addMesh(orbit, new THREE.SphereGeometry(0.14, 10, 8), voidM, Math.cos(a) * 1.6, Math.sin(a * 2) * 0.3, Math.sin(a) * 1.6, false); }
  root.scale.setScalar(1.45);
  return { root, body, mats: [robe], armL, armR, orbit, orb };
}
const BUILD = {
  slime() {
    const hue = [0x5fe36b, 0x3fd9c8, 0xff7fc8, 0x9f7bff][Math.floor(Math.random() * 4)];
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const mat = new THREE.MeshPhysicalMaterial({ color: hue, roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, iridescence: 0.8, iridescenceIOR: 1.35, transparent: true, opacity: 0.86, emissive: hue, emissiveIntensity: 0.3 });
    const m = addMesh(body, G.slime, mat, 0, 0.72, 0); m.scale.set(1, 0.82, 1);
    const coreM = new THREE.MeshBasicMaterial({ color: new THREE.Color(hue).multiplyScalar(2.6) });
    addMesh(body, new THREE.SphereGeometry(0.3, 12, 8), coreM, 0, 0.6, 0, false);
    for (let i = 0; i < 4; i++) addMesh(body, new THREE.SphereGeometry(rand(0.05, 0.1), 8, 6), coreM, rand(-0.4, 0.4), rand(0.4, 1.0), rand(-0.4, 0.4), false);
    for (const s of [-1, 1]) addMesh(body, G.eye, eyeMat, s * 0.27, 0.95, 0.66, false);
    const c = new THREE.Color(hue);
    return { root, body, mats: [mat], tint: [c.r * 3, c.g * 3, c.b * 3] };
  },
  wolf() { return wolfModel(false); },
  alpha() { return wolfModel(true); },
  golem() { return golemModel(false, [4, 1.6, 0.4]); },
  boss() { const b = golemModel(true, [2.4, 0.8, 4.4]); b.root.scale.setScalar(2.3); return b; },
  miren() { return mirenModel(); },
};
const enemies = [];
class Enemy {
  constructor(type, x, z, zone) {
    this.type = type; this.def = DEFS[type]; this.zone = zone;
    Object.assign(this, BUILD[type]());
    if (this.tint) this.def = { ...this.def, color: this.tint };
    this.baseEmissive = this.mats.map(m => ({ c: m.emissive.clone(), i: m.emissiveIntensity }));
    this.pos = new THREE.Vector3(x, getHeight(x, z), z); this.home = { x, z };
    this.hp = this.maxHp = this.def.hp; this.state = 'idle'; this.t = Math.random() * 10; this.cd = 1; this.timer = 0;
    this.kb = new THREE.Vector2(); this.face = Math.random() * Math.PI * 2; this.flash = 0; this.wander = { x, z }; this.wanderT = 0;
    this.dead = false; this.deathT = 0; this.attackCount = 0; this.enraged = false; this.speedNow = 0; this.lunge = 0; this.pop = 0;
    this.baseScale = this.root.scale.x;
    if (this.def.barY) { this.bar = makeBar(); this.bar.position.y = this.def.barY; this.root.add(this.bar); }
    this.root.position.copy(this.pos); scene.add(this.root); enemies.push(this);
  }
}
const barGeoBg = new THREE.PlaneGeometry(1.5, 0.16), barGeoFill = new THREE.PlaneGeometry(1.44, 0.1).translate(0.72, 0, 0);
const barBgMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthTest: false });
function makeBar() {
  const g = new THREE.Group(); const bg = new THREE.Mesh(barGeoBg, barBgMat); bg.renderOrder = 10;
  const fill = new THREE.Mesh(barGeoFill, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.25, 0.25), depthTest: false })); fill.position.set(-0.72, 0, 0.001); fill.renderOrder = 11;
  g.add(bg, fill); g.userData.fill = fill; g.visible = false; return g;
}
const ZONES = [
  { type: 'slime', x: 70, z: 235, r: 75, n: 10 }, { type: 'slime', x: -60, z: 265, r: 50, n: 5 }, { type: 'slime', x: 160, z: 160, r: 45, n: 5 },
  { type: 'wolf', x: -290, z: -30, r: 95, n: 9 }, { type: 'wolf', x: 230, z: -140, r: 60, n: 4 },
  { type: 'golem', x: 85, z: -235, r: 55, n: 5 }, { type: 'golem', x: 265, z: -185, r: 50, n: 2 },
];
function spawnPoint(z) {
  for (let i = 0; i < 30; i++) { const a = Math.random() * Math.PI * 2, r = z.r * Math.sqrt(Math.random()); const x = z.x + Math.cos(a) * r, zz = z.z + Math.sin(a) * r; const h = getHeight(x, zz); if (h > 1.5 && h < 85 && slopeAtXZ(x, zz) < 0.8 && dist2(x, zz, P.village) > 85 && dist2(x, zz, P.camp) > 30) return [x, zz]; }
  return [z.x, z.z];
}
let teros = null, activeBoss = null;
function spawnAll() {
  for (const z of ZONES) { z.alive = 0; z.respawn = []; for (let i = 0; i < z.n; i++) { const [x, zz] = spawnPoint(z); new Enemy(z.type, x, zz, z); z.alive++; } }
  if (!story.flags.terosFreed) { teros = new Enemy('boss', P.ruins.x, P.ruins.z, null); teros.face = 0; }
}

// ================= LOOT / PROJECTILES =================
const loot = [];
const coinGeo = new THREE.OctahedronGeometry(0.22), coinMat = glow(3.4, 2.4, 0.6), potGeo = new THREE.SphereGeometry(0.26, 12, 8), potMat = glow(3.2, 0.4, 0.5);
function dropLoot(pos, type, value) {
  const m = new THREE.Mesh(type === 'gold' ? coinGeo : potGeo, type === 'gold' ? coinMat : potMat); m.position.copy(pos); m.position.y += 1; scene.add(m);
  loot.push({ mesh: m, vel: new THREE.Vector3(rand(-4, 4), rand(5, 8), rand(-4, 4)), type, value, t: 0 });
}
const projectiles = [], enemyShots = [], voidPools = [];
const fbGeo = new THREE.SphereGeometry(0.38, 16, 12), fbMat = glow(5, 2, 0.55);
const orbGeo = new THREE.SphereGeometry(0.42, 14, 10), orbMat = glow(2.6, 0.5, 4.8);
const meteorGeo = new THREE.IcosahedronGeometry(1.5, 1), meteorMat = glow(6, 2.6, 0.7);
const meteors = [];

// ================= HUD HELPERS =================
const dmgLayer = $('dmg'); const dnums = [];
const _v = new THREE.Vector3();
function damageNumber(pos, text, cls) { const el = document.createElement('div'); el.className = 'dn ' + (cls || ''); el.textContent = text; dmgLayer.appendChild(el); dnums.push({ el, pos: pos.clone(), t: 0, dx: rand(-0.6, 0.6) }); }
function updateDnums(dt) {
  for (let i = dnums.length - 1; i >= 0; i--) {
    const d = dnums[i]; d.t += dt; d.pos.y += dt * 1.6; d.pos.x += d.dx * dt;
    _v.copy(d.pos).project(camera);
    if (d.t > 1.1 || _v.z > 1) { d.el.remove(); dnums.splice(i, 1); continue; }
    const x = (_v.x * 0.5 + 0.5) * innerWidth, y = (-_v.y * 0.5 + 0.5) * innerHeight;
    const s = d.t < 0.12 ? 1 + (0.12 - d.t) * 5 : 1;
    d.el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) scale(${s})`; d.el.style.opacity = 1 - smooth(0.6, 1.1, d.t);
  }
}
function toast(text, cls) { const el = document.createElement('div'); el.className = 'toast panel ' + (cls || ''); el.textContent = text; $('toasts').appendChild(el); setTimeout(() => el.remove(), 3800); while ($('toasts').children.length > 5) $('toasts').firstChild.remove(); }
let bannerTimer = 0;
function banner(t1, t2) { $('b1').textContent = t1; $('b2').textContent = t2 || ''; $('banner').classList.add('show'); clearTimeout(bannerTimer); bannerTimer = setTimeout(() => $('banner').classList.remove('show'), 3200); }

// ================= GAME ACTIONS =================
let flashV = 0, hurtV = 0, hitstop = 0, timeScale = 1;
function flashScreen(v) { flashV = Math.max(flashV, v); }
function addGold(n, silent) { player.gold += n; if (!silent) AudioSys.play('coin'); }
function addXp(n) {
  player.xp += n; damageNumber(player.pos.clone().add(new THREE.Vector3(0, 2.6, 0)), `+${n} ניסיון`, 'xp');
  while (player.xp >= xpToNext(player.lvl)) {
    player.xp -= xpToNext(player.lvl); player.lvl++; recalcStats(); player.hp = player.maxHp; player.mp = player.maxMp;
    AudioSys.play('level'); flashScreen(0.3);
    const unlock = player.lvl === SK.nova.lvl ? ' · נפתחה: נובה ארקנית (E)' : player.lvl === SK.meteor.lvl ? ' · נפתח: מטאור (R)' : '';
    banner(`רמה ${player.lvl}!`, `חיים ומאנה מלאים · נזק ושריון עלו${unlock}`);
    for (let i = 0; i < 160; i++) { const a = Math.random() * Math.PI * 2, r = Math.random() * 1.6; fx.emit(player.pos.x + Math.cos(a) * r, player.pos.y + Math.random() * 0.5, player.pos.z + Math.sin(a) * r, 0, rand(4, 14), 0, 3.2, 2.4, 0.8, rand(0.25, 0.6), rand(0.8, 1.6), { drag: 0.6 }); }
    spawnRing(player.pos.x, player.pos.z, { color: [3, 2.2, 0.6], r1: 9, dur: 0.8 });
    flashLight(player.pos.x, player.pos.y + 3, player.pos.z, 0xffd27a, 80, 30, 1.2);
  }
}
function addShake(v) { if (reducedMotion) v *= 0.25; cam.shake = Math.min(1, cam.shake + v); }
function nearestEnemy(pos, maxD, dirX, dirZ, minDot = -2) {
  let best = null, bd = maxD;
  for (const e of enemies) { if (e.dead || !e.root.visible || e.friendly) continue; const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z; const d = Math.hypot(dx, dz); if (d > bd) continue; if (dirX != null && (dx * dirX + dz * dirZ) / (d || 1) < minDot) continue; bd = d; best = e; }
  return best;
}
function camForward() { return [-Math.sin(cam.yaw), -Math.cos(cam.yaw)]; }
function enemyAimY(e) { return e.type === 'boss' ? 5 : e.type === 'golem' ? 2.6 : e.type === 'miren' ? 3.4 + e.hover : e.type === 'alpha' ? 1.8 : 0.9; }

function tryAttack() {
  if (!canAct()) return;
  if (player.atkTimer > 0) { if (player.atkTimer < player.atkTotal * 0.55) player.atkQueued = true; return; }
  startSwing();
}
function startSwing() {
  player.combo = player.comboWindow > 0 ? (player.combo + 1) % 3 : 0;
  player.atkTotal = player.atkTimer = [0.36, 0.36, 0.55][player.combo]; player.hitDone = false; player.comboWindow = 0.95;
  const t = nearestEnemy(player.pos, 6.5); if (t) player.facing = Math.atan2(t.pos.x - player.pos.x, t.pos.z - player.pos.z);
  else if (moveInput.len > 0.1) player.facing = Math.atan2(moveInput.x, moveInput.z);
  AudioSys.play('swing');
}
function doMeleeHit() {
  const p = player, combo = p.combo, spin = combo === 2;
  const range = spin ? 4.8 : 3.7; const fx_ = Math.sin(p.facing), fz_ = Math.cos(p.facing);
  const bc = bladeInfo[p.blade]; const c = new THREE.Color(...bc.color);
  spawnSlash(p.pos, p.facing, combo, c);
  let hits = 0;
  for (const e of enemies) {
    if (e.dead || e.friendly) continue; const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z; const d = Math.hypot(dx, dz) - e.def.radius * 0.7;
    if (d > range) continue; if (!spin && (dx * fx_ + dz * fz_) / (Math.hypot(dx, dz) || 1) < 0.15) continue;
    const [dmg, crit] = rollDmg(baseDmg() * bc.mult * [1, 1.15, 1.75][combo]);
    damageEnemy(e, dmg, spin ? 9 : 6, p.pos, crit); hits++;
  }
  if (hits) { hitstop = Math.max(hitstop, spin ? 0.08 : 0.05); addShake(spin ? 0.3 : 0.18); }
}
function castFire() {
  if (!canAct() || player.cds.fire > 0) return; if (player.mp < SK.fire.mp) return noMana();
  player.mp -= SK.fire.mp; player.cds.fire = SK.fire.cd;
  const [fx0, fz0] = camForward(); const t = nearestEnemy(player.pos, 48, fx0, fz0, 0.55);
  const start = player.pos.clone().add(new THREE.Vector3(Math.sin(player.facing) * 0.8, 1.6, Math.cos(player.facing) * 0.8));
  const dir = t ? t.pos.clone().add(new THREE.Vector3(0, enemyAimY(t), 0)).sub(start).normalize() : new THREE.Vector3(fx0, Math.sin(-cam.pitch + 0.3) * 0.6, fz0).normalize();
  player.facing = Math.atan2(dir.x, dir.z);
  const m = new THREE.Mesh(fbGeo, fbMat); m.position.copy(start); scene.add(m);
  const l = flashLight(start.x, start.y, start.z, 0xff8a3a, 25, 18, 2.2); l.userData.follow = m.position;
  projectiles.push({ mesh: m, vel: dir.multiplyScalar(40), life: 2.0, light: l });
  hero.armL.userData.cast = 0.3; AudioSys.play('fire');
}
function explodeFire(pos) {
  fx.burst(pos.x, pos.y, pos.z, 70, 13, [4, 1.6, 0.4], 0.7, 0.7, { drag: 3 });
  fx.burst(pos.x, pos.y, pos.z, 30, 6, [4, 3, 1.5], 0.4, 0.5, { drag: 2, g: -2 });
  dust.burst(pos.x, pos.y, pos.z, 14, 3, [0.25, 0.22, 0.22], 1.4, 1.4, { drag: 1.5, g: -1.5, s1: 2.5 });
  flashLight(pos.x, pos.y + 1, pos.z, 0xff7a30, 60, 22, 0.45);
  const dmg = 30 + player.lvl * 8;
  for (const e of enemies) { if (e.dead || e.friendly) continue; const ep = e.pos.clone(); ep.y += enemyAimY(e) * 0.6; const d = ep.distanceTo(pos) - e.def.radius; if (d < 3.4) { const [a, c] = rollDmg(dmg); damageEnemy(e, a, 5, pos, c); } }
  AudioSys.play('boom'); addShake(0.12);
}
function castNova() {
  if (!canAct() || player.cds.nova > 0) return; if (player.lvl < SK.nova.lvl) return toast(`נובה ארקנית נפתחת ברמה ${SK.nova.lvl}`); if (player.mp < SK.nova.mp) return noMana();
  player.mp -= SK.nova.mp; player.cds.nova = SK.nova.cd;
  const p = player.pos;
  spawnRing(p.x, p.z, { color: [1.2, 2.2, 4.5], r1: 12, dur: 0.6, y: p.y });
  spawnRing(p.x, p.z, { color: [3, 1.2, 4], r1: 8, dur: 0.45, y: p.y + 0.2 });
  for (let i = 0; i < 220; i++) { const a = Math.random() * Math.PI * 2; const sp = rand(14, 24); fx.emit(p.x, p.y + 1 + rand(-0.3, 0.6), p.z, Math.cos(a) * sp, rand(-1, 3), Math.sin(a) * sp, rand(0.8, 2.4), rand(1.6, 2.4), 4.2, rand(0.3, 0.6), rand(0.4, 0.7), { drag: 4 }); }
  flashLight(p.x, p.y + 2, p.z, 0x7ab8ff, 90, 28, 0.6);
  const dmg = 45 + player.lvl * 9;
  for (const e of enemies) { if (e.dead || e.friendly) continue; const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z) - e.def.radius; if (d < 11) { const [a, c] = rollDmg(dmg); damageEnemy(e, a, 16, p, c); } }
  for (let i = enemyShots.length - 1; i >= 0; i--) { const s = enemyShots[i]; if (s.mesh.position.distanceTo(p) < 11) { fx.burst(s.mesh.position.x, s.mesh.position.y, s.mesh.position.z, 12, 5, [2, 0.6, 4], 0.3, 0.4); scene.remove(s.mesh); enemyShots.splice(i, 1); } } // the nova also clears void orbs
  hitstop = 0.06; addShake(0.45); AudioSys.play('nova'); hero.armL.userData.cast = 0.4;
}
function castMeteor() {
  if (!canAct() || player.cds.meteor > 0) return; if (player.lvl < SK.meteor.lvl) return toast(`מטאור נפתח ברמה ${SK.meteor.lvl}`); if (player.mp < SK.meteor.mp) return noMana();
  player.mp -= SK.meteor.mp; player.cds.meteor = SK.meteor.cd;
  const [fx0, fz0] = camForward(); const t = nearestEnemy(player.pos, 38, fx0, fz0, 0.3);
  const tx = t ? t.pos.x : player.pos.x + fx0 * 15, tz = t ? t.pos.z : player.pos.z + fz0 * 15; const ty = getHeight(tx, tz);
  spawnRing(tx, tz, { color: [3.5, 0.9, 0.2], r1: 9.5, dur: 1.0, mode: 1, depthTest: false });
  const m = new THREE.Mesh(meteorGeo, meteorMat); const start = new THREE.Vector3(tx - 45, ty + 110, tz - 30); m.position.copy(start); scene.add(m);
  const l = flashLight(start.x, start.y, start.z, 0xff7a30, 120, 60, 1.05); l.userData.follow = m.position;
  meteors.push({ mesh: m, start, end: new THREE.Vector3(tx, ty, tz), t: 0, dur: 1.0 });
  hero.armL.userData.cast = 0.6; AudioSys.play('fire');
}
function meteorImpact(p) {
  fx.burst(p.x, p.y + 0.5, p.z, 260, 26, [5, 1.8, 0.35], 1.0, 1.0, { up: 1, upBias: 0.3, drag: 2.2, g: 9 });
  fx.burst(p.x, p.y + 1, p.z, 120, 12, [5, 3.6, 1.6], 1.6, 0.6, { drag: 2.5 });
  for (let i = 0; i < 60; i++) fx.emit(p.x + rand(-4, 4), p.y + 0.3, p.z + rand(-4, 4), rand(-3, 3), rand(6, 16), rand(-3, 3), 4, 1.3, 0.2, rand(0.15, 0.3), rand(1.4, 2.6), { g: 9, drag: 0.4 });
  dust.burst(p.x, p.y + 1, p.z, 50, 10, [0.22, 0.2, 0.2], 4, 2.4, { up: 1, drag: 1.4, g: -1, s1: 7 });
  spawnRing(p.x, p.z, { color: [5, 2, 0.5], r1: 18, dur: 0.7 });
  spawnRing(p.x, p.z, { color: [0.05, 0.03, 0.02], r1: 7, dur: 6, mode: 2, normal: true, depthTest: true });
  flashLight(p.x, p.y + 4, p.z, 0xff8a40, 260, 70, 1.0);
  const dmg = 160 + player.lvl * 26;
  for (const e of enemies) { if (e.dead || e.friendly) continue; const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z) - e.def.radius; if (d < 9.5) { const [a, c] = rollDmg(dmg, 0.15); damageEnemy(e, a, 20, p, c); } }
  hitstop = 0.1; addShake(1.0); flashScreen(0.25); AudioSys.play('meteor');
}
function doDash() {
  if (!canAct() || player.dashCd > 0 || player.st < 22) return;
  player.st -= 22; player.dashCd = 0.55; player.dashT = 0.2; player.iframes = 0.32;
  const d = moveInput.len > 0.1 ? [moveInput.x, moveInput.z] : [Math.sin(player.facing), Math.cos(player.facing)];
  player.dashDir.set(d[0], d[1]).normalize(); player.facing = Math.atan2(d[0], d[1]); AudioSys.play('dash');
}
function drinkPotion() {
  if (!canAct()) return; if (player.potions <= 0) return toast('אין שיקויים. תומא הסוחר מוכר אותם בכפר.'); if (player.hp >= player.maxHp) return toast('החיים שלך מלאים');
  player.potions--; const heal = Math.round(player.maxHp * 0.55); player.hp = Math.min(player.maxHp, player.hp + heal);
  damageNumber(player.pos.clone().add(new THREE.Vector3(0, 2.4, 0)), '+' + heal, 'heal');
  for (let i = 0; i < 60; i++) fx.emit(player.pos.x + rand(-0.8, 0.8), player.pos.y + rand(0, 2), player.pos.z + rand(-0.8, 0.8), 0, rand(1, 4), 0, 0.6, 3.2, 1.0, rand(0.2, 0.4), rand(0.6, 1.2), { drag: 1 });
  AudioSys.play('coin');
}
function noMana() { toast('אין מספיק מאנה'); }

function damageEnemy(e, amount, knock, src, crit) {
  if (e.dead || e.dormant || e.friendly) return;
  e.hp -= amount; e.flash = 0.13; e.pop = 1;
  const dx = e.pos.x - src.x, dz = e.pos.z - src.z, d = Math.hypot(dx, dz) || 1;
  const kres = e.def.boss ? 0.08 : e.type === 'golem' ? 0.35 : 1;
  e.kb.set(dx / d * knock * kres, dz / d * knock * kres);
  const top = e.pos.clone(); top.y += enemyAimY(e) + 1.2;
  damageNumber(top, String(amount), crit ? 'crit' : '');
  fx.burst(e.pos.x, e.pos.y + enemyAimY(e), e.pos.z, crit ? 34 : 18, crit ? 12 : 8, e.def.color, 0.35, 0.45, { drag: 3, g: 6 });
  AudioSys.play(crit ? 'crit' : 'hit');
  e.lastHitT = realTime; if (e.state === 'idle' || e.state === 'return' || e.state === 'alert') { e.state = 'chase'; ensureAlertMark(e); e.alertShow = 0.4; if (e.def.boss) engageBoss(e); }
  if (e.type === 'boss' && !e.enraged && e.hp < e.maxHp * 0.5) enrageTeros(e);
  if (e.type === 'alpha' && !e.enraged && e.hp < e.maxHp * 0.6) alphaHowl(e);
  if (e.type === 'miren' && !e.enraged && e.hp < e.maxHp * 0.5) mirenPhase2(e);
  if (e.hp <= 0) killEnemy(e);
}
function engageBoss(e) { activeBoss = e; $('bossName').textContent = e.def.name; $('bossbar').hidden = false; }
function killEnemy(e) {
  e.dead = true; e.deathT = 0; if (e.bar) e.bar.visible = false; e.hp = 0;
  const big = e.def.boss;
  if (e.type === 'miren') { e.defeated = true; e.state = 'defeated'; e.dead = false; e.friendly = true; $('bossbar').hidden = true; activeBoss = null; addXp(e.def.xp); AudioSys.play('purify'); flashScreen(0.6); timeScale = 0.25; setTimeout(() => timeScale = 1, 1400); onKill('miren', e); return; }
  fx.burst(e.pos.x, e.pos.y + 1, e.pos.z, big ? 400 : 60, big ? 22 : 10, e.def.color, big ? 1.2 : 0.5, 1.0, { drag: 2, g: -1 });
  if (big) { fx.burst(e.pos.x, e.pos.y + 2, e.pos.z, 260, 14, [4, 3.4, 2.2], 0.8, 1.6, { drag: 1.5, g: -2 }); AudioSys.play('purify'); flashScreen(0.5); timeScale = 0.25; setTimeout(() => { timeScale = 1; }, 1400); addShake(1); $('bossbar').hidden = true; activeBoss = null; }
  const [g0, g1] = e.def.gold; const gold = Math.round(rand(g0, g1));
  if (gold > 0) { const coins = Math.min(8, Math.max(1, Math.round(gold / 4))); for (let i = 0; i < coins; i++) dropLoot(e.pos, 'gold', Math.max(1, Math.round(gold / coins))); }
  if (Math.random() < (e.type === 'golem' ? 0.35 : big ? 1 : 0.1)) dropLoot(e.pos, 'potion', 1);
  addXp(e.def.xp);
  if (e.zone) { e.zone.alive--; e.zone.respawn.push(25 + Math.random() * 15); }
  onKill(e.type, e);
}
function enrageTeros(e) {
  e.enraged = true; AudioSys.play('roar'); addShake(0.8); banner('תרוס זועם!', 'הריק בתוכו מזמן שומרים, ומכותיו מהירות יותר');
  e.mats[0].emissive.setHex(0x6a0f20); e.baseEmissive[0] = { c: new THREE.Color(0x6a0f20), i: 0.9 };
  for (let i = 0; i < 2; i++) { const a = Math.random() * Math.PI * 2; const g = new Enemy('golem', e.pos.x + Math.cos(a) * 12, e.pos.z + Math.sin(a) * 12, null); g.state = 'chase'; fx.burst(g.pos.x, g.pos.y + 2, g.pos.z, 80, 10, [2.2, 0.8, 4], 0.6, 0.8); }
}
function alphaHowl(e) {
  e.enraged = true; AudioSys.play('howl'); addShake(0.5); banner('יללת המנהיג', 'הלהקה נענית לקריאה');
  for (let i = 0; i < 2; i++) { const a = Math.random() * Math.PI * 2; const w = new Enemy('wolf', e.pos.x + Math.cos(a) * 10, e.pos.z + Math.sin(a) * 10, null); w.state = 'chase'; fx.burst(w.pos.x, w.pos.y + 1, w.pos.z, 50, 8, [1.6, 0.6, 2.6], 0.5, 0.8); }
}
function hurtPlayer(dmg, src) {
  const p = player; if (p.dead || p.iframes > 0 || cinemaActive()) return;
  dmg = Math.max(1, Math.round(dmg * rand(0.9, 1.1) * ARMOR_K / (ARMOR_K + playerArmor()))); p.hp -= dmg; p.lastHurt = realTime; p.iframes = 0.25;
  hurtV = Math.min(1, hurtV + 0.6); addShake(0.35);
  damageNumber(p.pos.clone().add(new THREE.Vector3(0, 2.3, 0)), '-' + dmg, 'hurt');
  const dx = p.pos.x - src.x, dz = p.pos.z - src.z, d = Math.hypot(dx, dz) || 1; p.vel.x += dx / d * 9; p.vel.z += dz / d * 9;
  fx.burst(p.pos.x, p.pos.y + 1.2, p.pos.z, 20, 7, [3, 0.3, 0.3], 0.3, 0.5, { g: 8, drag: 2 });
  AudioSys.play('hurt');
  if (p.hp <= 0) killPlayer();
}
function respawnPoint() { return Q.index === 0 ? { x: P.coast.x, z: P.coast.z - 6 } : { x: P.village.x, z: P.village.z + 18 }; }
function killPlayer() {
  const p = player; p.dead = true; p.hp = 0; $('death').hidden = false; releaseLock();
  const lost = Math.floor(p.gold * 0.1); p.gold -= lost;
  setTimeout(() => {
    $('fade').style.opacity = 1;
    setTimeout(() => {
      const r = respawnPoint(); p.pos.set(r.x, getHeight(r.x, r.z), r.z); p.vel.set(0, 0, 0); p.hp = p.maxHp; p.mp = p.maxMp; p.dead = false; cam.cut = true; cam.shake = 0;
      for (const e of enemies) if (e.state !== 'idle' && e.type !== 'miren') e.state = 'return';
      if (activeBoss && activeBoss.type !== 'miren') { $('bossbar').hidden = true; activeBoss = null; }
      for (const s of enemyShots) scene.remove(s.mesh); enemyShots.length = 0;
      $('death').hidden = true; $('fade').style.opacity = 0; if (lost) toast(`איבדת ${lost} זהב`); requestLock();
    }, 700);
  }, 2600);
}

// ================= ENEMY AI =================
const MAX_ATTACKERS = 2;
let attackers = 0;
const alertGeo = new THREE.OctahedronGeometry(0.2).scale(0.6, 1.7, 0.6), alertMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.2, 0.3) });
function ensureAlertMark(e) { if (e.alertMark || !e.def.barY) return; e.alertMark = new THREE.Mesh(alertGeo, alertMat); e.alertMark.position.y = e.def.barY + 0.55; e.root.add(e.alertMark); }
function updateEnemies(dt) {
  const p = player;
  attackers = 0; for (const o of enemies) if (!o.dead && !o.def.boss && (o.state === 'windup' || o.state === 'recover')) attackers++;
  for (let idx = enemies.length - 1; idx >= 0; idx--) {
    const e = enemies[idx]; const d = e.def;
    const dxp = p.pos.x - e.pos.x, dzp = p.pos.z - e.pos.z, dist = Math.hypot(dxp, dzp);
    if (e.dead) {
      e.deathT += dt; const k = e.deathT / 0.6; e.root.scale.setScalar(e.baseScale * Math.max(0.001, 1 - k)); e.root.rotation.y += dt * 8;
      if (e.deathT > 0.6) { scene.remove(e.root); enemies.splice(idx, 1); }
      continue;
    }
    if (e.type === 'miren') { updateMiren(e, dt, dist, dxp, dzp); continue; }
    const far = dist > 240 && !drone.active; e.root.visible = !far;
    if (far) continue;
    e.t += dt; e.cd -= dt; e.flash -= dt;
    const targetable = !p.dead && !cinemaActive();
    let mx = 0, mz = 0, spd = 0;
    switch (e.state) {
      case 'idle': {
        e.wanderT -= dt;
        if (e.wanderT <= 0) { e.wanderT = rand(3, 7); const a = Math.random() * Math.PI * 2, r = Math.random() * 14; e.wander = { x: e.home.x + Math.cos(a) * r, z: e.home.z + Math.sin(a) * r }; }
        const wx = e.wander.x - e.pos.x, wz = e.wander.z - e.pos.z, wd = Math.hypot(wx, wz);
        if (wd > 1 && !d.boss) { mx = wx / wd; mz = wz / wd; spd = d.speed * 0.3; }
        if (targetable && dist < d.aggro) {
          if (d.boss) { e.state = 'chase'; AudioSys.play(e.type === 'alpha' ? 'howl' : 'roar'); addShake(0.6); engageBoss(e); if (e.type === 'boss') banner('תרוס, אדון הגולמים', 'שומר השער התעורר, והריק מדבר מתוכו'); }
          else { e.state = 'alert'; e.timer = e.type === 'wolf' ? rand(0.2, 0.32) : rand(0.3, 0.5); ensureAlertMark(e); }
        }
        break;
      }
      case 'alert': { e.timer -= dt; e.face = lerpAngle(e.face, Math.atan2(dxp, dzp), 1 - Math.exp(-10 * dt)); if (e.timer <= 0) { e.state = 'chase'; e.alertShow = 0.5; } break; }
      case 'chase': {
        const hd = Math.hypot(e.pos.x - e.home.x, e.pos.z - e.home.z);
        if (!d.boss && dist > d.aggro * 2.4 && realTime - (e.lastHitT || -99) > 4) { e.state = 'return'; break; }
        if (!targetable || (hd > 100 && e.zone) || (d.boss && dist > 90)) { e.state = 'return'; if (activeBoss === e) { $('bossbar').hidden = true; activeBoss = null; } break; }
        if (!e.zone && !d.boss && dist > 90) { e.state = 'return'; break; }
        e.face = lerpAngle(e.face, Math.atan2(dxp, dzp), 1 - Math.exp(-8 * dt));
        const reach = d.range + d.radius * 0.4;
        if (dist <= reach && e.cd <= 0 && !d.boss && attackers >= MAX_ATTACKERS) {
          const side = (e.home.x > 0 ? 1 : -1); mx = -dzp / dist * side; mz = dxp / dist * side;
          if (dist < reach * 0.9) { mx -= dxp / dist * 0.7; mz -= dzp / dist * 0.7; }
          spd = d.speed * 0.35;
        } else if (dist <= reach && e.cd <= 0) {
          e.state = 'windup'; e.attackCount++; if (!d.boss) attackers++;
          e.special = e.type === 'boss' && e.attackCount % 3 === 0;
          e.timer = e.special ? 1.35 : d.windup * (e.enraged ? 0.7 : 1);
          if (e.special) spawnRing(e.pos.x, e.pos.z, { color: [3.5, 0.5, 2.5], r1: 12, dur: e.timer, mode: 1, follow: e.pos, depthTest: false });
          else if (e.type === 'golem' || e.type === 'boss') spawnRing(e.pos.x + Math.sin(e.face) * reach * 0.7, e.pos.z + Math.cos(e.face) * reach * 0.7, { color: [3.5, 0.6, 0.3], r1: e.type === 'boss' ? 5 : 3, dur: e.timer, mode: 1, depthTest: false });
        } else if (dist > reach * 0.85) { mx = dxp / dist; mz = dzp / dist; spd = d.speed * (e.enraged ? 1.3 : 1); }
        break;
      }
      case 'windup': {
        e.timer -= dt; e.face = lerpAngle(e.face, Math.atan2(dxp, dzp), 1 - Math.exp(-(e.special ? 1 : 4) * dt));
        if ((e.type === 'wolf' || e.type === 'alpha') && e.timer < 0.12 && !e.lunge) e.lunge = e.type === 'alpha' ? 0.24 : 0.18;
        if (e.timer <= 0) { enemyStrike(e, dist); e.state = 'recover'; e.timer = d.boss ? 0.7 : 0.45; e.cd = d.atkCd * (e.enraged ? 0.7 : 1); }
        break;
      }
      case 'recover': e.timer -= dt; if (e.timer <= 0) e.state = 'chase'; break;
      case 'return': {
        const hx = e.home.x - e.pos.x, hz = e.home.z - e.pos.z, hd = Math.hypot(hx, hz);
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.25 * dt);
        if (hd < 3) e.state = 'idle'; else { mx = hx / hd; mz = hz / hd; spd = d.speed * 1.2; }
        break;
      }
    }
    if (e.lunge > 0) { e.lunge -= dt; mx = Math.sin(e.face); mz = Math.cos(e.face); spd = 22; }
    if (e.type === 'slime') { const hop = Math.sin(e.t * 7); spd *= hop > 0 ? 1.7 : 0.15; }
    if (spd > 0 && e.state !== 'windup') e.face = lerpAngle(e.face, Math.atan2(mx, mz), 1 - Math.exp(-6 * dt));
    const nx = e.pos.x + (mx * spd + e.kb.x) * dt, nz = e.pos.z + (mz * spd + e.kb.y) * dt;
    e.kb.multiplyScalar(Math.exp(-7 * dt));
    if (getHeight(nx, nz) > 0.4 || getHeight(nx, nz) > getHeight(e.pos.x, e.pos.z)) { e.pos.x = nx; e.pos.z = nz; }
    for (const o of enemies) { if (o === e || o.dead) continue; const sx = e.pos.x - o.pos.x, sz = e.pos.z - o.pos.z, sd = sx * sx + sz * sz, rr = d.radius + o.def.radius; if (sd < rr * rr && sd > 1e-4) { const k = (rr - Math.sqrt(sd)) * 0.5 / Math.sqrt(sd); e.pos.x += sx * k; e.pos.z += sz * k; } }
    { const sx = e.pos.x - p.pos.x, sz = e.pos.z - p.pos.z, rr = d.radius + 0.5, sd = Math.hypot(sx, sz); if (sd < rr && sd > 0.01) { e.pos.x = p.pos.x + sx / sd * rr; e.pos.z = p.pos.z + sz / sd * rr; } }
    e.pos.y = getHeight(e.pos.x, e.pos.z);
    e.speedNow = spd;
    animateEnemy(e, dt, dist);
  }
}
function enemyStrike(e, dist) {
  const d = e.def, p = player;
  const dxp = p.pos.x - e.pos.x, dzp = p.pos.z - e.pos.z;
  const inFront = (dxp * Math.sin(e.face) + dzp * Math.cos(e.face)) / (dist || 1) > 0.2;
  if (e.special) {
    const air = p.pos.y - getHeight(p.pos.x, p.pos.z) > 1.0;
    fx.burst(e.pos.x, e.pos.y + 0.5, e.pos.z, 200, 22, [2.5, 0.8, 4], 0.8, 0.8, { up: 0.6, drag: 2.5, g: 6 });
    dust.burst(e.pos.x, e.pos.y + 0.5, e.pos.z, 40, 14, [0.3, 0.27, 0.3], 3, 1.8, { drag: 2, s1: 5 });
    spawnRing(e.pos.x, e.pos.z, { color: [3, 0.6, 3], r1: 14, dur: 0.5 }); addShake(0.8); AudioSys.play('meteor');
    if (dist < 12 && !air) hurtPlayer(d.dmg * 1.6, e.pos);
    return;
  }
  if (e.type === 'golem' || e.type === 'boss') {
    const sx = e.pos.x + Math.sin(e.face) * d.range * 0.7, sz = e.pos.z + Math.cos(e.face) * d.range * 0.7, sy = getHeight(sx, sz);
    dust.burst(sx, sy + 0.4, sz, 18, 6, [0.4, 0.36, 0.3], 1.5, 1.2, { drag: 2, s1: 3 }); fx.burst(sx, sy + 0.4, sz, 25, 8, d.color, 0.4, 0.5, { up: 1, g: 10 });
    addShake(e.type === 'boss' ? 0.5 : 0.25); AudioSys.play('boom');
    if (Math.hypot(p.pos.x - sx, p.pos.z - sz) < (e.type === 'boss' ? 5.5 : 3.4)) hurtPlayer(d.dmg, e.pos);
    return;
  }
  if (dist < d.range + d.radius * 0.5 + 0.8 && inFront) hurtPlayer(d.dmg, e.pos);
}
// ---- Miren, Voice of the Void: keeps her distance, volleys of orbs, telegraphed void pools, teleports
function updateMiren(e, dt, dist, dxp, dzp) {
  e.t += dt; e.flash -= dt; e.hover = 1.4 + Math.sin(e.t * 1.6) * 0.35;
  e.orbit.rotation.y += dt * (e.enraged ? 2.6 : 1.4);
  if (e.state === 'defeated') { e.hover = lerp(e.hover, 0.2, 0.5); e.root.position.set(e.pos.x, e.pos.y + 0.2, e.pos.z); e.body.rotation.x = damp(e.body.rotation.x, 0.35, 2, dt); return; }
  if (e.state === 'dormant') { e.root.position.set(e.pos.x, e.pos.y + e.hover + 6, e.pos.z); return; }
  const fight = !player.dead && !cinemaActive();
  e.face = lerpAngle(e.face, Math.atan2(dxp, dzp), 1 - Math.exp(-5 * dt));
  // drift: keep 9-16 m away, orbit slowly around the player
  let mx = 0, mz = 0;
  if (dist < 9) { mx = -dxp / dist; mz = -dzp / dist; } else if (dist > 16) { mx = dxp / dist; mz = dzp / dist; }
  mx += -dzp / (dist || 1) * 0.5; mz += dxp / (dist || 1) * 0.5;
  const nx = e.pos.x + mx * 3.2 * dt, nz = e.pos.z + mz * 3.2 * dt;
  if (dist2(nx, nz, P.shrine) < 30) { e.pos.x = nx; e.pos.z = nz; }
  e.pos.y = getHeight(e.pos.x, e.pos.z);
  e.cd -= dt;
  if (fight) {
    if (dist < 3.5) e.closeT = (e.closeT || 0) + dt; else e.closeT = 0;
    if (e.state === 'idle' && e.closeT > 1.4) { e.state = 'repulse'; e.timer = 0.55; spawnRing(e.pos.x, e.pos.z, { color: [3, 0.5, 4], r1: 6.5, dur: 0.55, mode: 1, follow: e.pos, depthTest: false }); }
    else if (e.state === 'idle' && e.cd <= 0) {
      const pat = e.enraged ? ['volley', 'ring', 'pools', 'teleport', 'volley', 'pools'] : ['volley', 'pools', 'volley', 'teleport'];
      e.attack = pat[e.attackCount++ % pat.length]; e.state = 'windup'; e.timer = e.attack === 'teleport' ? 0.4 : 0.75;
      if (e.attack === 'pools') { e.poolTargets = [[player.pos.x, player.pos.z]]; for (let i = 0; i < (e.enraged ? 4 : 2); i++) { const a = Math.random() * 6.28, r = rand(3, 7); e.poolTargets.push([player.pos.x + Math.cos(a) * r, player.pos.z + Math.sin(a) * r]); } for (const [x, z] of e.poolTargets) { spawnRing(x, z, { color: [3, 0.4, 4.2], r1: 4.5, dur: 1.15, mode: 1, depthTest: false }); voidPools.push({ x, z, t: 1.15 }); } AudioSys.play('void'); }
    }
  }
  if (e.state === 'windup') {
    e.timer -= dt; e.armR.rotation.x = damp(e.armR.rotation.x, -2.4, 10, dt); e.armL.rotation.x = damp(e.armL.rotation.x, -1.6, 10, dt);
    const op = e.orb.getWorldPosition(new THREE.Vector3()); fx.emit(op.x + rand(-0.6, 0.6), op.y + rand(-0.6, 0.6), op.z + rand(-0.6, 0.6), 0, 0, 0, 2.4, 0.6, 4.2, 0.4, 0.4, { drag: 1 });
    if (e.timer <= 0) {
      e.state = 'idle'; e.cd = DEFS.miren.atkCd * (e.enraged ? 0.7 : 1);
      if (e.attack === 'volley') { const n = e.enraged ? 7 : 5; for (let i = 0; i < n; i++) fireOrb(e, Math.atan2(dxp, dzp) + (i - (n - 1) / 2) * 0.22, 15, true); AudioSys.play('void'); }
      else if (e.attack === 'ring') { for (let i = 0; i < 14; i++) fireOrb(e, i / 14 * Math.PI * 2, 11, false); AudioSys.play('void'); }
      else if (e.attack === 'teleport') { mirenTeleport(e); }
    }
  } else if (e.state === 'repulse') {
    e.timer -= dt;
    if (e.timer <= 0) { e.state = 'idle'; e.closeT = 0; fx.burst(e.pos.x, e.pos.y + 1, e.pos.z, 120, 16, [2.4, 0.6, 4.2], 0.6, 0.6, { drag: 3 }); spawnRing(e.pos.x, e.pos.z, { color: [3, 0.6, 4], r1: 8, dur: 0.5 }); addShake(0.4); if (dist < 6.5) { hurtPlayer(20, e.pos); player.vel.x += dxp / dist * 18; player.vel.z += dzp / dist * 18; } }
  } else { e.armR.rotation.x = damp(e.armR.rotation.x, -0.4 + Math.sin(e.t) * 0.1, 4, dt); e.armL.rotation.x = damp(e.armL.rotation.x, -0.3, 4, dt); }
  if (Math.random() < 0.5) fx.emit(e.pos.x + rand(-0.8, 0.8), e.pos.y + e.hover + rand(0, 2.5), e.pos.z + rand(-0.8, 0.8), 0, rand(0.5, 1.5), 0, 1.6, 0.4, 3.2, 0.3, 1.2, { drag: 0.5 });
  e.root.position.set(e.pos.x, e.pos.y + e.hover, e.pos.z); e.root.rotation.y = e.face;
  const k = e.flash > 0 ? 1 : 0; const m = e.mats[0], b = e.baseEmissive[0]; if (k) { m.emissive.setRGB(1, 1, 1); m.emissiveIntensity = 1.2; } else { m.emissive.copy(b.c); m.emissiveIntensity = b.i; }
}
function fireOrb(e, ang, speed, homing) {
  const m = new THREE.Mesh(orbGeo, orbMat); m.position.set(e.pos.x + Math.sin(ang) * 1.5, e.pos.y + e.hover + 2.4, e.pos.z + Math.cos(ang) * 1.5); scene.add(m);
  const v = new THREE.Vector3(Math.sin(ang) * speed, 0, Math.cos(ang) * speed);
  enemyShots.push({ mesh: m, vel: v, life: 4.2, homing, dmg: DEFS.miren.dmg });
}
function mirenTeleport(e) {
  fx.burst(e.pos.x, e.pos.y + 2, e.pos.z, 120, 10, [2.4, 0.6, 4.2], 0.6, 0.8, { drag: 2 }); AudioSys.play('tele');
  const a = Math.random() * Math.PI * 2, r = rand(10, 20); const t = { x: P.shrine.x + Math.cos(a) * r, z: P.shrine.z + Math.sin(a) * r };
  e.pos.set(t.x, getHeight(t.x, t.z), t.z);
  fx.burst(e.pos.x, e.pos.y + 2, e.pos.z, 120, 10, [2.4, 0.6, 4.2], 0.6, 0.8, { drag: 2 });
}
function mirenPhase2(e) {
  e.enraged = true; AudioSys.play('roar'); addShake(0.7); banner('"הריק עונה לי!"', 'מירן קוראת לרסיסי הצל');
  e.mats[0].emissive.setHex(0x7a1080); e.baseEmissive[0] = { c: new THREE.Color(0x7a1080), i: 0.9 };
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; const s = new Enemy('slime', e.pos.x + Math.cos(a) * 8, e.pos.z + Math.sin(a) * 8, null); s.state = 'chase'; s.mats[0].color.setHex(0x8a3cff); s.mats[0].emissive.setHex(0x8a3cff); s.baseEmissive[0].c.setHex(0x8a3cff); fx.burst(s.pos.x, s.pos.y + 1, s.pos.z, 50, 8, [2.4, 0.6, 4.2], 0.5, 0.8); }
}
function updateEnemyShots(dt) {
  for (let i = enemyShots.length - 1; i >= 0; i--) {
    const s = enemyShots[i]; s.life -= dt;
    if (s.homing && s.life > 2.4) { const to = player.pos.clone().add(new THREE.Vector3(0, 1.2, 0)).sub(s.mesh.position); to.y = 0; to.normalize(); const sp = s.vel.length(); s.vel.lerp(to.multiplyScalar(sp), 1 - Math.exp(-0.9 * dt)).setLength(sp); }
    s.mesh.position.addScaledVector(s.vel, dt);
    const gy = getHeight(s.mesh.position.x, s.mesh.position.z); s.mesh.position.y = damp(s.mesh.position.y, gy + 1.3, 2, dt);
    if (Math.random() < 0.6) fx.emit(s.mesh.position.x, s.mesh.position.y, s.mesh.position.z, rand(-0.5, 0.5), rand(-0.5, 0.5), rand(-0.5, 0.5), 2, 0.5, 3.8, 0.45, 0.35, { drag: 2 });
    const hit = s.mesh.position.distanceTo(player.pos.clone().add(new THREE.Vector3(0, 1.1, 0))) < 1.1;
    if (hit && player.iframes <= 0) hurtPlayer(s.dmg, s.mesh.position);
    if (hit || s.life <= 0) { fx.burst(s.mesh.position.x, s.mesh.position.y, s.mesh.position.z, 16, 5, [2.4, 0.6, 4.2], 0.35, 0.4, { drag: 2 }); scene.remove(s.mesh); enemyShots.splice(i, 1); }
  }
  for (let i = voidPools.length - 1; i >= 0; i--) {
    const v = voidPools[i]; v.t -= dt;
    if (v.t <= 0) {
      const y = getHeight(v.x, v.z);
      for (let k = 0; k < 50; k++) { const a = Math.random() * 6.28, r = Math.random() * 4.2; fx.emit(v.x + Math.cos(a) * r, y + 0.2, v.z + Math.sin(a) * r, 0, rand(5, 14), 0, 2.4, 0.5, 4.2, rand(0.4, 0.8), rand(0.5, 0.9), { drag: 1.5 }); }
      if (Math.hypot(player.pos.x - v.x, player.pos.z - v.z) < 4.5) hurtPlayer(34, { x: v.x, z: v.z });
      addShake(0.15); voidPools.splice(i, 1);
    }
  }
}
function animateEnemy(e, dt, dist) {
  e.root.position.copy(e.pos); e.root.rotation.y = e.face;
  const k = e.flash > 0 ? 1 : 0;
  e.mats.forEach((m, i) => { const b = e.baseEmissive[i]; if (k) { m.emissive.setRGB(1, 1, 1); m.emissiveIntensity = 1.4; } else { m.emissive.copy(b.c); m.emissiveIntensity = b.i; } });
  const wind = e.state === 'windup' ? 1 : 0;
  if (e.type === 'slime') {
    const moving = e.speedNow > 0.5; const hop = moving ? Math.max(0, Math.sin(e.t * 7)) : 0.1 + Math.sin(e.t * 3) * 0.05;
    e.body.position.y = hop * 0.8; const sq = wind ? 1 + Math.sin(e.t * 30) * 0.08 : 1;
    e.body.scale.set((1 + (1 - hop) * 0.18) * sq, 0.82 + hop * 0.32 - (wind ? 0.2 : 0), (1 + (1 - hop) * 0.18) * sq);
  } else if (e.type === 'wolf' || e.type === 'alpha') {
    const sp = e.speedNow; const ph = e.t * (sp > 6 ? 16 : 8);
    e.legs.forEach((l, i) => l.rotation.x = Math.sin(ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * Math.min(1, sp / 6) * 0.9);
    e.head.rotation.x = wind ? -0.35 : 0; e.tail.rotation.y = Math.sin(e.t * 6) * 0.4; e.body.rotation.x = wind ? -0.12 : 0;
  } else {
    const sp = e.speedNow; const ph = e.t * 4;
    e.legs.forEach((l, i) => l.rotation.x = Math.sin(ph + i * Math.PI) * Math.min(1, sp / 3) * 0.5);
    const raise = wind ? smooth(0, 1, 1 - e.timer / (e.special ? 1.35 : e.def.windup)) : 0;
    const armX = wind ? -2.6 * raise : e.state === 'recover' ? 0.4 : Math.sin(ph) * 0.3 * Math.min(1, sp / 3);
    e.armL.rotation.x = damp(e.armL.rotation.x, armX, 18, dt); e.armR.rotation.x = damp(e.armR.rotation.x, e.special || e.type === 'golem' ? armX : -armX * 0.3, 18, dt);
    e.body.position.y = Math.abs(Math.sin(ph)) * 0.08;
  }
  const pv = popValue(e, dt);
  if (e.type === 'slime') e.body.scale.multiply(_pop.set(1 + 0.22 * pv, 1 - 0.18 * pv, 1 + 0.22 * pv)); else e.body.scale.set(1 + 0.16 * pv, 1 - 0.12 * pv, 1 + 0.16 * pv);
  if (e.alertMark) { e.alertMark.visible = e.state === 'alert' || e.alertShow > 0; e.alertShow -= dt; e.alertMark.rotation.y += dt * 5; }
  if (e.bar) { const show = e.hp < e.maxHp && dist < 45; e.bar.visible = show; if (show) { e.bar.userData.fill.scale.x = Math.max(0.001, e.hp / e.maxHp); e.bar.quaternion.copy(e.root.quaternion).invert().multiply(camera.quaternion); } }
}
const _pop = new THREE.Vector3();
function popValue(o, dt) { if (!(o.pop > 0)) return 0; o.pop = Math.max(0, o.pop - dt / 0.22); const t = 1 - o.pop; return Math.sin(t * Math.PI * 1.5) * o.pop; }
function updateSpawns(dt) {
  for (const z of ZONES) for (let i = z.respawn.length - 1; i >= 0; i--) {
    z.respawn[i] -= dt;
    if (z.respawn[i] <= 0) { const [x, zz] = spawnPoint(z); if (Math.hypot(x - player.pos.x, zz - player.pos.z) < 45) { z.respawn[i] = 5; continue; } z.respawn.splice(i, 1); new Enemy(z.type, x, zz, z); z.alive++; }
  }
}
