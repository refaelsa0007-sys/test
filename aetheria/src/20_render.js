
// ================= RENDERER / SCENE =================
const container = $('game');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!PHOTO });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.75;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // soft by default since r182
container.appendChild(renderer.domElement);
const canvas = renderer.domElement; canvas.tabIndex = 0;

// ---- global height fog with sun in-scattering (replaces three's fog chunks for every built-in material)
// scene.fog is a THREE.Fog whose near = density and far = height falloff.
THREE.ShaderChunk.fog_pars_fragment = `
#ifdef USE_FOG
  uniform vec3 fogColor; varying float vFogDepth; uniform float fogNear; uniform float fogFar;
#endif`;
THREE.ShaderChunk.fog_fragment = `
#ifdef USE_FOG
  vec3 fogCol = fogColor; float fogFactor;
  #if defined( STANDARD ) || defined( PHONG ) || defined( LAMBERT ) || defined( TOON )
    vec3 fogRel = transpose( mat3( viewMatrix ) ) * ( - vViewPosition );
    float fogDist = length( fogRel ); vec3 fogRd = fogRel / max( fogDist, 1e-3 );
    float fogRy = abs( fogRd.y ) < 1e-3 ? 1e-3 : fogRd.y;
    float fogAmt = ( fogNear / fogFar ) * exp( - cameraPosition.y * fogFar ) * ( 1.0 - exp( - fogDist * fogRy * fogFar ) ) / fogRy;
    fogFactor = 1.0 - exp( - max( fogAmt, 0.0 ) );
    #if NUM_DIR_LIGHTS > 0
      float fogSun = pow( max( dot( normalize( - vViewPosition ), directionalLights[ 0 ].direction ), 0.0 ), 14.0 );
      fogCol = fogColor + directionalLights[ 0 ].color * 0.045 * fogSun;
    #endif
  #else
    fogFactor = 1.0 - exp( - fogNear * vFogDepth * 0.9 );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, clamp( fogFactor, 0.0, 1.0 ) );
#endif`;
// same model for hand-written shaders
const GLSL_FOG = `
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uFogFalloff; uniform vec3 uSunDir; uniform vec3 uSunColor;
vec3 applyFog(vec3 col, vec3 wpos, float k){
  vec3 rel = wpos - cameraPosition; float d = length(rel); vec3 rd = rel / max(d, 1e-3);
  float ry = abs(rd.y) < 1e-3 ? 1e-3 : rd.y;
  float amt = (uFogDensity / uFogFalloff) * exp(-cameraPosition.y * uFogFalloff) * (1.0 - exp(-d * ry * uFogFalloff)) / ry;
  float f = 1.0 - exp(-max(amt * k, 0.0));
  float s = pow(max(dot(rd, uSunDir), 0.0), 14.0);
  return mix(col, uFogColor + uSunColor * 0.045 * s, clamp(f, 0.0, 1.0));
}`;
const GLSL_NOISE = `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x), f.y); }
vec2 hfUv(vec2 p){ return ((p + uWorld*0.5)/uWorld*(uN-1.0) + 0.5)/uN; }
`;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.2, 9000);
scene.fog = new THREE.Fog(0xa8c4e0, 0.0022, 0.011);
const timeU = { value: 0 };
const fogU = { uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.0022 }, uFogFalloff: { value: 0.011 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() } };
const lightU = { uAmb: { value: new THREE.Color(0.3, 0.35, 0.4) }, uNight: { value: 0 }, uSunLight: { value: new THREE.Color(1, 1, 1) } };
const hfU = { uHeight: { value: null }, uWorld: { value: WORLD }, uN: { value: N } };

// ---- sky with built-in clouds, plus a sky-only scene for image-based lighting and fog colour sampling
const sky = new Sky(); sky.scale.setScalar(6000); scene.add(sky);
const skyU = sky.material.uniforms;
skyU.mieCoefficient.value = 0.0035; skyU.mieDirectionalG.value = 0.78;
skyU.cloudCoverage.value = 0.42; skyU.cloudDensity.value = 0.55; skyU.cloudElevation.value = 0.55; skyU.cloudScale.value = 0.00018; skyU.cloudSpeed.value = 0.00003;
const envScene = new THREE.Scene(); const envSky = new Sky(); envSky.scale.setScalar(1000); envScene.add(envSky);
// three's Sky outputs roughly 3x the radiance our lights are calibrated for; scale it so sky, fog and IBL sit with the scene
const SKY_GAIN = { value: 0.36 };
envSky.material.uniforms.showSunDisc.value = 0; // the directional light already is the sun; keep it out of image-based lighting
for (const s of [sky, envSky]) { s.material.uniforms.skyGain = SKY_GAIN; s.material.fragmentShader = 'uniform float skyGain;\n' + s.material.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * skyGain, 1.0 );'); s.material.needsUpdate = true; }
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;
const sampleRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
const sampleCam = new THREE.PerspectiveCamera(12, 1, 0.1, 5000);
const sampleBuf = new Uint16Array(4 * 4 * 4);
function sampleSky(dir, out) { // average linear colour of the sky looking along dir
  sampleCam.position.set(0, 0, 0); sampleCam.lookAt(dir); sampleCam.updateMatrixWorld();
  const prev = renderer.getRenderTarget(); renderer.setRenderTarget(sampleRT); renderer.render(envScene, sampleCam); renderer.setRenderTarget(prev);
  renderer.readRenderTargetPixels(sampleRT, 0, 0, 4, 4, sampleBuf);
  let r = 0, g = 0, b = 0; const fh = THREE.DataUtils.fromHalfFloat;
  for (let i = 0; i < 16; i++) { r += fh(sampleBuf[i * 4]); g += fh(sampleBuf[i * 4 + 1]); b += fh(sampleBuf[i * 4 + 2]); }
  return out.setRGB(r / 16, g / 16, b / 16);
}

const sun = new THREE.DirectionalLight(0xfff1dd, 3.4);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera; sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 800;
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.45;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x5a6b3a, 0.35); scene.add(hemi);
scene.environmentIntensity = 1.5;

const starGeo = new THREE.BufferGeometry(); { const a = new Float32Array(3000 * 3); for (let i = 0; i < 3000; i++) { const u = Math.random(), th = Math.random() * Math.PI * 2, r = 2600; const q = Math.sqrt(1 - u * u); a.set([Math.cos(th) * q * r, u * r, Math.sin(th) * q * r], i * 3); } starGeo.setAttribute('position', new THREE.BufferAttribute(a, 3)); }
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
const stars = new THREE.Points(starGeo, starMat); stars.frustumCulled = false; scene.add(stars);
const moon = new THREE.Mesh(new THREE.SphereGeometry(55, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.4, 2.8), fog: false, transparent: true }));
scene.add(moon);

// ================= POST =================
const rtA = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: isTouch ? 0 : 4 });
const composer = new EffectComposer(renderer, rtA);
composer.addPass(new RenderPass(scene, camera));
// screen-space god rays: radial blur of bright pixels toward the sun (HDR, before bloom)
const godrays = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uStrength: { value: 0 }, uAspect: { value: 1 }, uTint: { value: new THREE.Color(1, 0.9, 0.75) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uStrength; uniform float uAspect; uniform vec3 uTint; varying vec2 vUv;
    void main(){ vec3 base = texture2D(tDiffuse, vUv).rgb;
      if (uStrength <= 0.001) { gl_FragColor = vec4(base, 1.0); return; }
      vec2 delta = (vUv - uSun) * (0.92 / 48.0); vec2 uv = vUv; float decay = 1.0; vec3 acc = vec3(0.0);
      float jitter = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
      uv -= delta * jitter;
      for (int i = 0; i < 48; i++) { uv -= delta; if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break; vec3 s = texture2D(tDiffuse, uv).rgb; acc += min(max(s - 1.8, 0.0), vec3(1.2)) * decay; decay *= 0.955; }
      float fall = 1.0 - smoothstep(0.0, 1.1, length((vUv - uSun) * vec2(uAspect, 1.0)));
      gl_FragColor = vec4(base + acc / 48.0 * uStrength * fall * uTint, 1.0); }`
});
composer.addPass(godrays);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.42, 0.45, 1.1);
composer.addPass(bloom);
composer.addPass(new OutputPass());
// colour grade + vignette + feedback flashes + film grain (display-referred, after tone mapping)
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uHurt: { value: 0 }, uFlash: { value: 0 }, uTime: { value: 0 }, uSat: { value: 1.12 }, uContrast: { value: 0.18 }, uSplit: { value: 1 }, uVoid: { value: 0 }, uVig: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uHurt; uniform float uFlash; uniform float uTime; uniform float uSat; uniform float uContrast; uniform float uSplit; uniform float uVoid; uniform float uVig; varying vec2 vUv;
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c += mix(vec3(-0.012, 0.0, 0.028), vec3(0.03, 0.014, -0.022), smoothstep(0.15, 0.85, l)) * uSplit;
      c = mix(vec3(l), c, uSat);
      c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
      c = mix(c, vec3(l * 0.7, l * 0.45, l * 1.05), uVoid * 0.35);
      vec2 d = vUv - 0.5; float v = 1.0 - smoothstep(0.32, 1.05, length(d) * 1.3);
      c *= mix(1.0, mix(0.58, 1.0, v), uVig);
      c = mix(c, vec3(0.65, 0.02, 0.04), uHurt * (1.0 - v) * 0.85);
      c += vec3(1.0, 0.9, 0.7) * uFlash;
      c += (fract(sin(dot(vUv * 1000.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.018;
      gl_FragColor = vec4(c, 1.0); }`
});
composer.addPass(grade);
// painterly pass (Kuwahara filter), only for the offline story illustrations
const painterly = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uR: { value: 4 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uR; varying vec2 vUv;
    void main(){ vec2 px = 1.0 / uRes; vec3 m[4]; vec3 s[4];
      for (int k = 0; k < 4; k++) { m[k] = vec3(0.0); s[k] = vec3(0.0); }
      const int R = 5; float n = float((R + 1) * (R + 1));
      for (int j = -R; j <= 0; j++) for (int i = -R; i <= 0; i++) { vec3 c = texture2D(tDiffuse, vUv + vec2(i, j) * px).rgb; m[0] += c; s[0] += c * c; }
      for (int j = -R; j <= 0; j++) for (int i = 0; i <= R; i++) { vec3 c = texture2D(tDiffuse, vUv + vec2(i, j) * px).rgb; m[1] += c; s[1] += c * c; }
      for (int j = 0; j <= R; j++) for (int i = 0; i <= R; i++) { vec3 c = texture2D(tDiffuse, vUv + vec2(i, j) * px).rgb; m[2] += c; s[2] += c * c; }
      for (int j = 0; j <= R; j++) for (int i = -R; i <= 0; i++) { vec3 c = texture2D(tDiffuse, vUv + vec2(i, j) * px).rgb; m[3] += c; s[3] += c * c; }
      float best = 1e9; vec3 outc = vec3(0.0);
      for (int k = 0; k < 4; k++) { vec3 mu = m[k] / n; vec3 var = abs(s[k] / n - mu * mu); float sv = var.r + var.g + var.b; if (sv < best) { best = sv; outc = mu; } }
      float paper = fract(sin(dot(floor(vUv * uRes / 2.0), vec2(12.9898, 78.233))) * 43758.5453) * 0.03;
      gl_FragColor = vec4(outc * (0.985 + paper), 1.0); }`
});
painterly.enabled = !!PHOTO;
composer.addPass(painterly);

// ================= QUALITY =================
// ultra: big shadow map, half-res reflections, god rays, dense grass. low: everything expensive off.
const QUALITY = {
  ultra: { label: 'אולטרה', pr: 1.5, msaa: 4, shadow: 4096, refl: 0.5, rays: true, grass: 1.0 },
  high: { label: 'גבוהה', pr: 1.25, msaa: 4, shadow: 2048, refl: 0.33, rays: true, grass: 0.65 },
  low: { label: 'רגילה', pr: 1, msaa: 0, shadow: 1024, refl: 0, rays: false, grass: 0.3 },
};
const QORDER = ['ultra', 'high', 'low'];
let quality = PHOTO ? 'ultra' : isTouch ? 'low' : 'high';
let grassMesh = null, water = null;
function Q_() { return QUALITY[quality]; }
function applyQuality() {
  const q = Q_();
  const pr = Math.min(devicePixelRatio, q.pr); renderer.setPixelRatio(pr); composer.setPixelRatio(pr);
  if (composer.renderTarget1.samples !== q.msaa) { composer.renderTarget1.samples = q.msaa; composer.renderTarget2.samples = q.msaa; composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); }
  if (grassMesh) grassMesh.geometry.instanceCount = Math.floor(GRASS_MAX * q.grass);
  if (sun.shadow.mapSize.x !== q.shadow) { sun.shadow.mapSize.set(q.shadow, q.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  if (water) water.userData.setQuality(q.refl);
  $('qualState').textContent = q.label;
  onResize();
}
function onResize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h); composer.setSize(w, h);
  const db = renderer.getDrawingBufferSize(new THREE.Vector2());
  const s = db.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  for (const ps of particleSystems) ps.mat.uniforms.uScale.value = s;
  painterly.uniforms.uRes.value.set(db.x, db.y); godrays.uniforms.uAspect.value = w / h;
  if (water) water.userData.resize();
}
addEventListener('resize', onResize);

// ================= PROCEDURAL SURFACE TEXTURES =================
// Five tileable layers (grass, rock, sand, dirt, snow): a detail multiplier centred on 0.5 plus a normal map.
const TEX = 256, LAYERS = 5;
function hashI(i, j, s) { let n = (i * 374761393 + j * 668265263 + s * 1442695041) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n >>> 0) / 4294967296; }
function tnoise(x, y, per, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const w = v => ((v % per) + per) % per;
  const a = hashI(w(xi), w(yi), s), b = hashI(w(xi + 1), w(yi), s), c = hashI(w(xi), w(yi + 1), s), d = hashI(w(xi + 1), w(yi + 1), s);
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function tfbm(u, v, base, oct, s) { let a = 0.5, f = base, sum = 0, nrm = 0; for (let o = 0; o < oct; o++) { sum += a * tnoise(u * f, v * f, f, s + o * 17); nrm += a; a *= 0.5; f *= 2; } return sum / nrm; }
function voronoi(u, v, cells, s) {
  const x = u * cells, y = v * cells, xi = Math.floor(x), yi = Math.floor(y); let d1 = 9, d2 = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const cx = xi + i, cy = yi + j; const wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells; const px = cx + hashI(wx, wy, s), py = cy + hashI(wx, wy, s + 9); const d = Math.hypot(px - x, py - y); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return [d1, d2];
}
let layerAlb, layerNor;
function buildSurfaceTextures() {
  const alb = new Uint8Array(TEX * TEX * 4 * LAYERS), nor = new Uint8Array(TEX * TEX * 4 * LAYERS);
  const hgt = new Float32Array(TEX * TEX);
  const strength = [1.2, 3.2, 1.6, 2.6, 0.8];
  for (let L = 0; L < LAYERS; L++) {
    const off = L * TEX * TEX * 4;
    for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
      const u = x / TEX, v = y / TEX; let h, r, g, b;
      if (L === 0) { // grass: fine blades over clumps
        const fine = tfbm(u, v, 48, 3, 1), clump = tfbm(u, v, 6, 3, 2), streak = tnoise(u * 96, v * 12, 96, 3);
        h = fine * 0.55 + clump * 0.25 + streak * 0.2;
        const k = 0.72 + h * 0.6; r = k * (0.95 + clump * 0.12); g = k * 1.04; b = k * (0.9 - clump * 0.1);
      } else if (L === 1) { // rock: ridged cracks + strata
        const base = tfbm(u, v, 4, 5, 10), rid = 1 - Math.abs(2 * tfbm(u, v, 8, 4, 11) - 1), strata = Math.sin((v * 12 + base * 2.5) * Math.PI * 2) * 0.5 + 0.5;
        h = base * 0.5 + Math.pow(rid, 4) * 0.35 + strata * 0.15;
        const k = 0.6 + h * 0.8 - Math.pow(rid, 12) * 0.35; r = k * 1.03; g = k; b = k * 0.95;
      } else if (L === 2) { // sand: wind ripples + grain
        const warp = tfbm(u, v, 3, 3, 20); const rip = Math.sin((u * 18 + v * 4 + warp * 3) * Math.PI * 2) * 0.5 + 0.5; const grain = hashI(x, y, 21);
        h = rip * 0.65 + warp * 0.2 + grain * 0.15;
        const k = 0.82 + h * 0.3 + (grain - 0.5) * 0.12; r = k * 1.03; g = k; b = k * 0.94;
      } else if (L === 3) { // dirt: pebbles
        const [d1, d2] = voronoi(u, v, 10, 30); const peb = 1 - smooth(0.0, 0.55, d1); const edge = smooth(0.0, 0.1, d2 - d1); const grain = tfbm(u, v, 48, 3, 31);
        h = peb * edge * 0.45 + grain * 0.55;
        const tint = hashI(Math.floor(u * 10), Math.floor(v * 10), 32); const k = 0.82 + h * 0.32; r = k * (1.0 + tint * 0.1); g = k * 0.97; b = k * (0.92 - tint * 0.06);
      } else { // snow: soft drifts + sparkle
        const soft = tfbm(u, v, 5, 4, 40); const sp = hashI(x, y, 41) > 0.996 ? 0.35 : 0;
        h = soft; const k = 0.93 + soft * 0.12 + sp; r = k * 0.98; g = k; b = k * 1.03;
      }
      hgt[y * TEX + x] = h;
      const o = off + (y * TEX + x) * 4;
      alb[o] = clamp(r * 0.5, 0, 1) * 255; alb[o + 1] = clamp(g * 0.5, 0, 1) * 255; alb[o + 2] = clamp(b * 0.5, 0, 1) * 255; alb[o + 3] = 255;
    }
    for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
      const hx = hgt[y * TEX + ((x + 1) % TEX)] - hgt[y * TEX + ((x - 1 + TEX) % TEX)];
      const hy = hgt[((y + 1) % TEX) * TEX + x] - hgt[((y - 1 + TEX) % TEX) * TEX + x];
      let nx = -hx * strength[L], ny = -hy * strength[L], nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const o = off + (y * TEX + x) * 4; nor[o] = (nx * 0.5 + 0.5) * 255; nor[o + 1] = (ny * 0.5 + 0.5) * 255; nor[o + 2] = (nz * 0.5 + 0.5) * 255; nor[o + 3] = 255;
    }
  }
  const mk = data => { const t = new THREE.DataArrayTexture(data, TEX, TEX, LAYERS); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true; return t; };
  layerAlb = mk(alb); layerNor = mk(nor); // both linear: the albedo layer is a detail multiplier, not a colour
}

// ================= TERRAIN =================
let heightTex, terrainMesh;
function terrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uAlb = { value: layerAlb }; sh.uniforms.uNor = { value: layerNor };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 splat; attribute float aoBake; varying vec4 vSplat; varying float vAO; varying vec3 vWPos; varying vec3 vWNorm;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSplat = splat; vAO = aoBake; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNorm = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform highp sampler2DArray uAlb; uniform highp sampler2DArray uNor;
        varying vec4 vSplat; varying float vAO; varying vec3 vWPos; varying vec3 vWNorm;
        vec3 triW(vec3 n){ vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z); }
        vec3 nrm(vec2 uv, float l){ return texture(uNor, vec3(uv, l)).xyz * 2.0 - 1.0; }
        vec3 alb(vec2 uv, float l){ return texture(uAlb, vec3(uv, l)).rgb; }`)
      .replace('#include <map_fragment>', `
        vec4 W = vSplat; float wg = clamp(1.0 - W.x - W.y - W.z - W.w, 0.0, 1.0);
        vec2 uvA = vWPos.xz * 0.3; vec2 uvB = vWPos.xz * 0.067 + 0.37;
        vec3 gN = normalize(vWNorm); vec3 tw = triW(gN);
        float camD = length(vWPos - cameraPosition); float farK = smoothstep(90.0, 300.0, camD);
        vec3 dG = mix(alb(uvA, 0.0), alb(uvB, 0.0), 0.45);
        vec3 dR = alb(vWPos.zy * 0.18, 1.0) * tw.x + alb(vWPos.xz * 0.18, 1.0) * tw.y + alb(vWPos.xy * 0.18, 1.0) * tw.z;
        vec3 dS = mix(alb(uvA * 0.8, 2.0), alb(uvB, 2.0), 0.35);
        vec3 dD = mix(alb(uvA, 3.0), alb(uvB, 3.0), 0.3);
        vec3 dN = mix(alb(uvA * 0.6, 4.0), alb(uvB, 4.0), 0.5);
        vec3 detail = (dG * wg + dR * W.x + dS * W.y + dD * W.z + dN * W.w) * 2.0;
        float wet = (1.0 - smoothstep(0.15, 1.3, vWPos.y)) * W.y;
        diffuseColor.rgb *= mix(detail, vec3(1.0), farK * 0.85) * mix(1.0, vAO, 0.45) * mix(1.0, 0.68, wet);`)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = mix(0.95, 0.82, W.x); roughnessFactor = mix(roughnessFactor, 0.5, W.w); roughnessFactor = mix(roughnessFactor, 0.3, wet);`)
      .replace('#include <normal_fragment_maps>', `
        vec3 tT = nrm(uvA, 0.0) * wg + nrm(uvA * 0.8, 2.0) * W.y + nrm(uvA, 3.0) * W.z + nrm(uvA * 0.6, 4.0) * W.w;
        vec3 nTop = normalize(vec3(tT.x + gN.x, gN.y, tT.y + gN.z));
        vec3 rx = nrm(vWPos.zy * 0.18, 1.0), ry = nrm(vWPos.xz * 0.18, 1.0), rz = nrm(vWPos.xy * 0.18, 1.0);
        vec3 nRock = normalize(vec3(rx.xy + gN.zy, gN.x).zyx * tw.x + vec3(ry.xy + gN.xz, gN.y).xzy * tw.y + vec3(rz.xy + gN.xy, gN.z) * tw.z);
        vec3 nW = normalize(mix(nTop, nRock, clamp(W.x, 0.0, 1.0)));
        nW = normalize(mix(nW, gN, farK));
        normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);`)
      .replace('#include <aomap_fragment>', `reflectedLight.indirectDiffuse *= vAO; reflectedLight.indirectSpecular *= vAO;`);
  };
  return mat;
}
function buildTerrain() {
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, SEG, SEG); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position; const cnt = pos.count;
  const cols = new Float32Array(cnt * 3), spl = new Float32Array(cnt * 4), ao = new Float32Array(cnt); const tmp = new THREE.Color();
  for (let v = 0; v < cnt; v++) {
    const x = pos.getX(v), z = pos.getZ(v);
    const i = Math.round((x + HALF) / CELL), j = Math.round((z + HALF) / CELL), k = j * N + i;
    pos.setY(v, H[k]);
    tmp.setRGB(COLR[k * 3], COLR[k * 3 + 1], COLR[k * 3 + 2], THREE.SRGBColorSpace);
    cols[v * 3] = tmp.r; cols[v * 3 + 1] = tmp.g; cols[v * 3 + 2] = tmp.b;
    for (let c = 0; c < 4; c++) spl[v * 4 + c] = SPLAT[k * 4 + c];
    ao[v] = AO[k];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.setAttribute('splat', new THREE.BufferAttribute(spl, 4));
  geo.setAttribute('aoBake', new THREE.BufferAttribute(ao, 1));
  geo.computeVertexNormals();
  terrainMesh = new THREE.Mesh(geo, terrainMaterial()); terrainMesh.receiveShadow = true; terrainMesh.castShadow = true;
  scene.add(terrainMesh);
  const hd = new Uint16Array(N * N * 4); const toH = THREE.DataUtils.toHalfFloat;
  for (let k = 0; k < N * N; k++) { hd[k * 4] = toH(H[k]); hd[k * 4 + 1] = toH(GRASS[k]); hd[k * 4 + 2] = toH(FOREST[k]); hd[k * 4 + 3] = toH(AO[k]); }
  heightTex = new THREE.DataTexture(hd, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter; heightTex.needsUpdate = true;
  hfU.uHeight.value = heightTex;
}

// ================= WATER (planar reflections) =================
function buildWater() {
  const geo = new THREE.PlaneGeometry(7000, 7000, 200, 200);
  const refl = new Reflector(geo, { textureWidth: 512, textureHeight: 512, clipBias: 0.003, multisample: 0 });
  const rt = refl.getRenderTarget(); const texMatrix = refl.material.uniforms.textureMatrix.value;
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uTime: timeU, uDeep: { value: new THREE.Color(0x0a3550) }, uShallow: { value: new THREE.Color(0x2fb3b0) }, uSkyTop: { value: new THREE.Color(0.25, 0.45, 0.8) }, uSkyHorizon: { value: new THREE.Color(0.7, 0.8, 0.95) },
      tReflect: { value: rt.texture }, textureMatrix: { value: texMatrix }, uReflAmt: { value: 1 }, ...fogU, ...lightU, ...hfU },
    vertexShader: `uniform float uTime; uniform mat4 textureMatrix; varying vec3 vWorld; varying vec4 vRefl;
      void main(){ vRefl = textureMatrix * vec4(position, 1.0); vec4 wp = modelMatrix * vec4(position, 1.0);
        wp.y += sin(wp.x * 0.05 + uTime * 0.8) * 0.1 + sin(wp.z * 0.07 + uTime * 1.1) * 0.08;
        vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSkyTop; uniform vec3 uSkyHorizon; uniform float uNight;
      uniform sampler2D tReflect; uniform float uReflAmt; uniform sampler2D uHeight; uniform float uWorld; uniform float uN;
      varying vec3 vWorld; varying vec4 vRefl;
      ${GLSL_FOG}
      ${GLSL_NOISE}
      vec2 gN(vec2 p){ float e = 0.15; return vec2(vnoise(p + vec2(e, 0.0)) - vnoise(p - vec2(e, 0.0)), vnoise(p + vec2(0.0, e)) - vnoise(p - vec2(0.0, e))) / (2.0 * e); }
      void main(){
        vec2 p = vWorld.xz; float dist = length(cameraPosition - vWorld);
        vec2 g = gN(p * 0.12 + vec2(uTime * 0.22, uTime * 0.15)) * 0.55 + gN(p * 0.37 - vec2(uTime * 0.3, -uTime * 0.21)) * 0.3 + gN(p * 1.1 + vec2(uTime * 0.55, uTime * 0.45)) * 0.15;
        vec3 Nn = normalize(vec3(-g.x * 0.5, 1.0, -g.y * 0.5));
        Nn = normalize(mix(Nn, vec3(0.0, 1.0, 0.0), clamp(dist / 900.0, 0.0, 0.8)));
        vec3 V = normalize(cameraPosition - vWorld);
        vec2 uv = hfUv(p); float terr = -40.0;
        if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) terr = texture2D(uHeight, uv).r;
        float depth = max(0.0, vWorld.y - terr);
        float fres = pow(1.0 - max(dot(Nn, V), 0.0), 4.0) * 0.82 + 0.05;
        vec3 R = reflect(-V, Nn);
        vec3 skyc = mix(uSkyHorizon, uSkyTop, clamp(R.y * 1.6, 0.0, 1.0));
        vec4 ru = vRefl; ru.xy += Nn.xz * 0.55 * ru.w * 0.045;
        vec3 refl = texture2DProj(tReflect, ru).rgb;
        vec3 reflc = mix(skyc, refl, uReflAmt * 0.92);
        vec3 wcol = mix(uShallow, uDeep, 1.0 - exp(-depth * 0.22));
        float sunUp = clamp(uSunDir.y * 4.0, 0.0, 1.0);
        wcol *= (0.25 + 0.75 * sunUp) * (1.0 - uNight * 0.6);
        vec3 col = mix(wcol, reflc, fres);
        float rs = max(dot(R, normalize(uSunDir)), 0.0);
        col += uSunColor * (pow(rs, 300.0) * 2.4 + pow(rs, 30.0) * 0.06) * sunUp;
        float fn = vnoise(p * 0.7 + uTime * 0.35) * 0.5 + vnoise(p * 2.1 - uTime * 0.5) * 0.5;
        float foam = (1.0 - smoothstep(0.0, 1.4, depth)) * smoothstep(0.42, 0.8, fn + 0.35 * sin(depth * 5.0 - uTime * 2.2));
        col = mix(col, vec3(0.95, 0.98, 1.0) * (0.35 + 0.65 * sunUp), foam * 0.8);
        float alpha = clamp(0.55 + depth * 0.28 + fres * 0.4 + foam, 0.0, 0.98);
        col = applyFog(col, vWorld, 1.0);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  refl.material.dispose(); refl.material = mat;
  refl.rotation.x = -Math.PI / 2; refl.renderOrder = 2;
  // keep the mirror pass cheap: hide grass, particles, cloud cards and the player beam while it renders
  const baseBefore = refl.onBeforeRender; let reflScale = 0.5, frameN = 0;
  refl.onBeforeRender = function (r, s, c) {
    if (reflScale <= 0) return;
    if (quality === 'high' && (frameN++ & 1)) return; // half rate on high
    const hidden = [grassMesh, clouds, ...particleSystems.map(p => p.points)].filter(o => o && o.visible);
    hidden.forEach(o => o.visible = false);
    baseBefore.call(this, r, s, c);
    hidden.forEach(o => o.visible = true);
  };
  refl.userData.resize = () => { if (reflScale <= 0) return; const db = renderer.getDrawingBufferSize(new THREE.Vector2()); rt.setSize(Math.max(64, Math.floor(db.x * reflScale)), Math.max(64, Math.floor(db.y * reflScale))); };
  refl.userData.setQuality = s => { reflScale = s; mat.uniforms.uReflAmt.value = s > 0 ? 1 : 0; refl.userData.resize(); };
  water = refl; scene.add(refl);
}

// ================= GRASS =================
const GRASS_MAX = 110000, GRASS_R = 44;
function buildGrass() {
  const geo = new THREE.InstancedBufferGeometry();
  const w = 0.07;
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, -w * 0.8, 0.33, 0, w * 0.8, 0.33, 0, -w * 0.5, 0.66, 0, w * 0.5, 0.66, 0, 0, 1, 0], 3));
  geo.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6]);
  const off = new Float32Array(GRASS_MAX * 2), rnd = new Float32Array(GRASS_MAX * 3);
  for (let i = 0; i < GRASS_MAX; i++) { off[i * 2] = Math.random() * GRASS_R * 2; off[i * 2 + 1] = Math.random() * GRASS_R * 2; rnd[i * 3] = Math.random(); rnd[i * 3 + 1] = Math.random(); rnd[i * 3 + 2] = Math.random(); }
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 2));
  geo.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd, 3));
  geo.instanceCount = GRASS_MAX;
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uTime: timeU, uPlayer: { value: new THREE.Vector2() }, uPush: { value: new THREE.Vector2() }, uR: { value: GRASS_R }, ...hfU, ...fogU, ...lightU },
    vertexShader: `attribute vec2 aOffset; attribute vec3 aRnd;
      uniform float uTime; uniform vec2 uPlayer; uniform vec2 uPush; uniform float uR; uniform sampler2D uHeight; uniform float uWorld; uniform float uN;
      uniform vec3 uSunDir; uniform vec3 uSunLight; uniform vec3 uAmb;
      varying vec3 vColor; varying vec3 vWorld; varying float vTip;
      vec2 hfUv(vec2 p){ return ((p + uWorld*0.5)/uWorld*(uN-1.0) + 0.5)/uN; }
      void main(){
        vec2 rel = mod(aOffset - uPlayer + uR, 2.0 * uR) - uR;
        vec2 wp = uPlayer + rel;
        vec4 t = texture2D(uHeight, hfUv(wp));
        float d = length(rel);
        float fade = 1.0 - smoothstep(uR * 0.55, uR * 0.97, d);
        float s = (0.45 + aRnd.x * 0.75) * t.g * fade;
        vec3 pos = position; float hg = pos.y;
        pos.y *= s * 1.2;
        float ang = aRnd.y * 6.2831; float c = cos(ang), sn = sin(ang);
        pos.xz = vec2(pos.x * c - pos.z * sn, pos.x * sn + pos.z * c);
        float gust = sin(uTime * 0.6 + wp.x * 0.02 + wp.y * 0.015) * 0.5 + 0.5;
        float wind = sin(uTime * 1.7 + wp.x * 0.11 + wp.y * 0.08) * (0.35 + gust * 0.45) + sin(uTime * 2.9 + wp.x * 0.33 + aRnd.z * 6.0) * 0.2;
        vec2 bend = vec2(0.55, 0.3) * wind * hg * hg * s;
        vec2 away = wp - uPush; float pd = length(away);
        bend += (away / (pd + 0.001)) * (1.0 - smoothstep(0.0, 1.5, pd)) * hg * 0.8 * s;
        pos.xz += bend; pos.y -= length(bend) * 0.35 * hg;
        vec3 world = vec3(wp.x + pos.x, t.r + pos.y - 0.05, wp.y + pos.z);
        vec3 base = mix(vec3(0.05, 0.14, 0.03), vec3(0.03, 0.08, 0.02), t.b);
        vec3 tip = mix(vec3(0.36, 0.58, 0.12), vec3(0.15, 0.33, 0.08), t.b) * (0.8 + 0.45 * aRnd.z) * mix(vec3(1.0), vec3(1.18, 1.05, 0.7), gust * 0.35);
        vec3 col = mix(base, tip, hg);
        if (aRnd.z > 0.982 && hg > 0.9) { float f = fract(aRnd.y * 13.0); col = f < 0.33 ? vec3(1.0, 0.35, 0.6) : (f < 0.66 ? vec3(1.0, 0.85, 0.25) : vec3(0.9, 0.9, 1.0)); }
        float sunUp = clamp(uSunDir.y * 3.0, 0.0, 1.0);
        float ao = mix(0.55, 1.0, hg) * t.a;
        vColor = col * (uAmb * 1.5 * ao + uSunLight * sunUp * (0.6 + 0.4 * hg) * 0.7);
        vTip = hg; vWorld = world;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        if (s < 0.02) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: `varying vec3 vColor; varying vec3 vWorld; varying float vTip;
      ${GLSL_FOG}
      void main(){
        vec3 V = normalize(cameraPosition - vWorld);
        float trans = pow(max(dot(-V, uSunDir), 0.0), 4.0) * vTip * 0.6; // light through the blades when facing the sun
        vec3 c = vColor + uSunColor * trans * vec3(0.35, 0.5, 0.12) * 0.25;
        gl_FragColor = vec4(applyFog(c, vWorld, 1.0), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  grassMesh = new THREE.Mesh(geo, mat); grassMesh.frustumCulled = false; scene.add(grassMesh);
}

// ================= CLOUD CARDS (visible from altitude) =================
let clouds;
function buildClouds() {
  const COUNT = 420;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const ap = new Float32Array(COUNT * 3), as = new Float32Array(COUNT * 2), ar = new Float32Array(COUNT);
  let i = 0;
  while (i < COUNT) {
    const cx = rand(-1100, 1100), cz = rand(-1100, 1100), cy = rand(185, 230);
    const puffs = 6 + Math.floor(Math.random() * 10);
    for (let k = 0; k < puffs && i < COUNT; k++, i++) { ap.set([cx + rand(-60, 60), cy + rand(-8, 14), cz + rand(-35, 35)], i * 3); const s = rand(45, 95); as.set([s, s * rand(0.6, 0.85)], i * 2); ar[i] = Math.random(); }
  }
  geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(ap, 3));
  geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(as, 2));
  geo.setAttribute('aRnd', new THREE.InstancedBufferAttribute(ar, 1));
  geo.instanceCount = COUNT;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: timeU, uTop: { value: new THREE.Color(1, 1, 1) }, uBottom: { value: new THREE.Color(0.6, 0.65, 0.75) }, ...fogU, uFade: { value: 0 } },
    vertexShader: `attribute vec3 aPos; attribute vec2 aScale; attribute float aRnd; uniform float uTime;
      varying vec2 vUv; varying float vR; varying vec3 vWorld; varying float vNear;
      void main(){ vec3 c = aPos; c.x = mod(c.x + uTime * 3.0 + 1200.0, 2400.0) - 1200.0;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 wp = c + right * position.x * aScale.x + up * position.y * aScale.y;
        vUv = uv; vR = aRnd; vWorld = wp; vec4 mv = viewMatrix * vec4(wp, 1.0); vNear = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uTop; uniform vec3 uBottom; uniform float uFade; varying vec2 vUv; varying float vR; varying vec3 vWorld; varying float vNear;
      ${GLSL_FOG}
      float h2(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main(){ vec2 q = vUv * 2.0 - 1.0; float r = length(q);
        float n = vn(vUv * 3.0 + vR * 17.0) * 0.6 + vn(vUv * 7.0 + vR * 5.0) * 0.4;
        float a = 1.0 - smoothstep(0.25, 1.0, r + (n - 0.5) * 0.55);
        if (a < 0.01) discard;
        vec3 col = mix(uBottom, uTop, smoothstep(-0.6, 0.8, q.y + (n - 0.5) * 0.4));
        col = applyFog(col, vWorld, 0.35);
        gl_FragColor = vec4(col, a * 0.85 * uFade * smoothstep(20.0, 60.0, vNear));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  clouds = new THREE.Mesh(geo, mat); clouds.frustumCulled = false; clouds.renderOrder = 3; scene.add(clouds);
}

// ================= GEOMETRY / MATERIAL HELPERS =================
function paint(g, hex) { const c = new THREE.Color(hex); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
// vertical gradient: darker at the bottom (fake occlusion), lighter at the top
function paintGrad(g, hexLo, hexHi, y0, y1) { const lo = new THREE.Color(hexLo), hi = new THREE.Color(hexHi), c = new THREE.Color(); const p = g.attributes.position; const a = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { c.copy(lo).lerp(hi, smooth(y0, y1, p.getY(i))); a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
const merge = parts => mergeGeometries(parts.map(g => g.index ? g.toNonIndexed() : g));
function std(hex, o = {}) { return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8, ...o }); }
function addMesh(parent, geo, mat, x = 0, y = 0, z = 0, cast = true) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; }
const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });

const colliders = [];
const treeGrid = new Map(); const TG = 8;
function addTreeCol(x, z, r) { const key = Math.floor(x / TG) + ',' + Math.floor(z / TG); let a = treeGrid.get(key); if (!a) treeGrid.set(key, a = []); a.push(x, z, r); }
function resolveCollisions(pos, rad) {
  const cx = Math.floor(pos.x / TG), cz = Math.floor(pos.z / TG);
  for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) { const a = treeGrid.get((cx + ox) + ',' + (cz + oz)); if (!a) continue; for (let i = 0; i < a.length; i += 3) pushOut(pos, a[i], a[i + 1], a[i + 2] + rad); }
  for (const c of colliders) pushOut(pos, c.x, c.z, c.r + rad);
}
function pushOut(pos, x, z, r) { const dx = pos.x - x, dz = pos.z - z; const d2 = dx * dx + dz * dz; if (d2 < r * r && d2 > 1e-6) { const d = Math.sqrt(d2); pos.x = x + dx / d * r; pos.z = z + dz / d * r; } }

// ================= VEGETATION =================
function swayMaterial(opts) {
  const m = new THREE.MeshStandardMaterial(opts);
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = timeU;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      float sw = max(0.0, position.y - 2.0) * 0.04;
      vec4 ip = instanceMatrix[3];
      float gust = sin(uTime * 0.6 + ip.x * 0.02 + ip.z * 0.015) * 0.5 + 0.5;
      transformed.x += sin(uTime * 1.3 + ip.x * 0.05 + ip.z * 0.07) * sw * (0.6 + gust);
      transformed.z += cos(uTime * 1.1 + ip.x * 0.06) * sw * 0.6;
      #endif`);
  };
  return m;
}
let motherTree = null;
function buildVegetation() {
  const pine = merge([
    paintGrad(new THREE.CylinderGeometry(0.22, 0.36, 2.4, 7).translate(0, 1.2, 0), 0x3a2516, 0x6a4a30, 0, 2.4),
    paintGrad(new THREE.ConeGeometry(2.8, 3.4, 8).translate(0, 3.0, 0), 0x1d3d27, 0x2f6040, 1.3, 4.7),
    paintGrad(new THREE.ConeGeometry(2.15, 3.0, 8).translate(0, 4.6, 0), 0x21452c, 0x3a7448, 3.1, 6.1),
    paintGrad(new THREE.ConeGeometry(1.5, 2.6, 8).translate(0, 6.0, 0), 0x274f33, 0x45844f, 4.7, 7.3),
    paintGrad(new THREE.ConeGeometry(0.8, 2.0, 7).translate(0, 7.3, 0), 0x2f5a39, 0x55965c, 6.3, 8.3),
  ]);
  const round = merge([
    paintGrad(new THREE.CylinderGeometry(0.25, 0.42, 3.2, 7).translate(0, 1.6, 0), 0x3d2a1a, 0x6a4a30, 0, 3.2),
    paintGrad(new THREE.IcosahedronGeometry(2.5, 1).translate(0, 4.6, 0), 0x2f5a22, 0x74b04e, 2.4, 7),
    paintGrad(new THREE.IcosahedronGeometry(1.7, 1).translate(1.2, 5.6, 0.6), 0x3a6a2a, 0x80bd55, 4, 7.3),
    paintGrad(new THREE.IcosahedronGeometry(1.5, 1).translate(-1.1, 5.2, -0.7), 0x30602a, 0x6ea648, 3.8, 6.8),
    paintGrad(new THREE.IcosahedronGeometry(1.2, 1).translate(0.2, 6.6, -0.4), 0x4a7a32, 0x8cc760, 5.5, 7.8),
  ]);
  const mat = swayMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
  const pines = [], rounds = [];
  let tries = 0;
  while (tries++ < 46000 && (pines.length < 4600 || rounds.length < 2200)) {
    const x = rand(-HALF + 20, HALF - 20), z = rand(-HALF + 20, HALF - 20);
    const h = getHeight(x, z); if (h < 2.2 || h > 92) continue;
    if (slopeAtXZ(x, z) > 0.75) continue;
    if (pathDist(x, z) < 6) continue;
    if (dist2(x, z, P.village) < 72 || dist2(x, z, P.shrine) < 34 || dist2(x, z, P.ruins) < 58 || dist2(x, z, P.camp) < 16 || dist2(x, z, P.forestHeart) < 20 || dist2(x, z, P.coast) < 40) continue;
    const f = forestness(x, z);
    const dens = f * 0.95 + 0.06 + smooth(40, 80, h) * 0.25;
    if (Math.random() > dens) continue;
    const s = rand(0.75, 1.5);
    const pineChance = h > 40 ? 0.95 : f > 0.6 ? 0.7 : 0.35;
    if (Math.random() < pineChance) { if (pines.length < 4600) pines.push([x, h, z, s]); }
    else if (rounds.length < 2200) rounds.push([x, h, z, s]);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sv = new THREE.Vector3(), col = new THREE.Color();
  function inst(geo, list, kind) {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((t, i) => {
      e.set(rand(-0.06, 0.06), rand(0, Math.PI * 2), rand(-0.06, 0.06)); q.setFromEuler(e);
      v.set(t[0], t[1] - 0.2, t[2]); sv.set(t[3], t[3] * rand(0.9, 1.15), t[3]);
      m4.compose(v, q, sv); im.setMatrixAt(i, m4);
      const ao = 0.75 + gridAO(t[0], t[2]) * 0.3;
      if (kind === 'round') {
        const r = Math.random(); const nearMagic = dist2(t[0], t[2], P.village) < 180 || dist2(t[0], t[2], P.shrine) < 160;
        if (nearMagic && r < 0.16) col.setRGB(1.9, 0.85, 1.25); else if (r < 0.2) col.setRGB(1.75, 1.0, 0.35); else col.setRGB(rand(0.85, 1.1), rand(0.9, 1.1), rand(0.85, 1.05));
      } else col.setRGB(rand(0.8, 1.05), rand(0.85, 1.1), rand(0.85, 1.05));
      col.multiplyScalar(ao); im.setColorAt(i, col);
      addTreeCol(t[0], t[2], 0.45 * t[3]);
    });
    im.castShadow = true; im.receiveShadow = true; scene.add(im);
  }
  inst(pine, pines, 'pine'); inst(round, rounds, 'round');

  // rocks
  const rg = new THREE.DodecahedronGeometry(1, 1); const rp = rg.attributes.position;
  for (let i = 0; i < rp.count; i++) { const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i); const k = 1 + noise2(x * 2.1 + z, y * 2.3 - z) * 0.22; rp.setXYZ(i, x * k, y * k * 0.75, z * k); }
  rg.computeVertexNormals(); paintGrad(rg, 0x5e5a56, 0xa39d96, -0.6, 0.7);
  const rmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });
  const rocks = []; tries = 0;
  while (rocks.length < 700 && tries++ < 9000) {
    const x = rand(-HALF + 30, HALF - 30), z = rand(-HALF + 30, HALF - 30); const h = getHeight(x, z);
    if (h < 0.5 || pathDist(x, z) < 5 || dist2(x, z, P.village) < 60 || dist2(x, z, P.camp) < 14) continue;
    if (Math.random() > 0.25 + smooth(30, 80, h) * 0.6) continue; rocks.push([x, h, z, rand(0.6, 3.2)]);
  }
  const rim = new THREE.InstancedMesh(rg, rmat, rocks.length);
  rocks.forEach((t, i) => { e.set(rand(0, 3), rand(0, 6.3), rand(0, 3)); q.setFromEuler(e); v.set(t[0], t[1] + t[3] * 0.2, t[2]); sv.set(t[3] * rand(0.8, 1.4), t[3], t[3] * rand(0.8, 1.3)); m4.compose(v, q, sv); rim.setMatrixAt(i, m4); col.setRGB(rand(0.85, 1.1), rand(0.85, 1.05), rand(0.85, 1.0)); rim.setColorAt(i, col); if (t[3] > 1.2) addTreeCol(t[0], t[2], t[3] * 0.9); });
  rim.castShadow = true; rim.receiveShadow = true; scene.add(rim);

  // the Mother Tree at the forest heart: corrupted violet until the pack leader is freed
  { const F = P.forestHeart, y = getHeight(F.x, F.z); const g = new THREE.Group(); g.position.set(F.x, y, F.z);
    const bark = std(0x3b2a20, { flatShading: true, roughness: 0.95 });
    addMesh(g, new THREE.CylinderGeometry(1.6, 2.8, 14, 9).translate(0, 7, 0), bark);
    for (let i = 0; i < 6; i++) { const r = addMesh(g, new THREE.CylinderGeometry(0.4, 0.9, 5, 6), bark, Math.cos(i) * 2.2, 0.8, Math.sin(i) * 2.2); r.rotation.set(Math.sin(i) * 0.9, 0, Math.cos(i) * 0.9); }
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4a2a6a, emissive: 0x7a3cff, emissiveIntensity: 0.6, flatShading: true, roughness: 0.8 });
    for (let i = 0; i < 7; i++) addMesh(g, new THREE.IcosahedronGeometry(rand(3.5, 5.5), 1), leafMat, rand(-5, 5), rand(14, 19), rand(-5, 5));
    scene.add(g); colliders.push({ x: F.x, z: F.z, r: 3 }); motherTree = { group: g, leafMat };
  }
}
function gridAO(x, z) { const i = clamp(Math.round((x + HALF) / CELL), 0, SEG), j = clamp(Math.round((z + HALF) / CELL), 0, SEG); return AO[j * N + i]; }

// ================= BEAMS =================
function beamMaterial(color, alpha = 0.55) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: timeU, uAlpha: { value: alpha } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uAlpha; varying vec2 vUv;
      void main(){ float a = pow(1.0 - vUv.y, 1.6); float fl = 0.8 + 0.2 * sin(uTime * 3.0 + vUv.y * 40.0); gl_FragColor = vec4(uColor * 1.6, a * uAlpha * fl); }`
  });
}
function makeBeam(x, y, z, color, h = 420, r = 1.6) {
  const g = new THREE.Group();
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20, 1, true).translate(0, h / 2, 0), beamMaterial(color, 0.6));
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(r * 3.2, r * 3.2, h * 0.6, 20, 1, true).translate(0, h * 0.3, 0), beamMaterial(color, 0.18));
  inner.userData.a = 0.6; outer.userData.a = 0.18;
  g.add(inner, outer); g.position.set(x, y, z); scene.add(g); return g;
}

// ================= LANDMARKS =================
const windowMat = new THREE.MeshStandardMaterial({ color: 0x2a1c10, emissive: 0xffb45a, emissiveIntensity: 0.4 });
const lanternMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.4, 0.6) });
let windmillBlades, shrineCrystal, shrineRing, shrineBeam, ruinsCrystals = [], fires = [];
const npcs = [], loreStones = [];
function addFire(x, z, intensity = 30) {
  const y = getHeight(x, z); const stone = std(0x8a847c, { flatShading: true }), wood = std(0x5e3d24);
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; addMesh(scene, new THREE.DodecahedronGeometry(0.42, 0), stone, x + Math.cos(a) * 1.5, y + 0.2, z + Math.sin(a) * 1.5); }
  for (let i = 0; i < 4; i++) { const l = addMesh(scene, new THREE.CylinderGeometry(0.14, 0.14, 2.1, 6), wood, x, y + 0.3, z); l.rotation.z = Math.PI / 2; l.rotation.y = i * Math.PI / 4; }
  const light = new THREE.PointLight(0xff9a4a, intensity, 30, 1.6); light.position.set(x, y + 1.8, z); scene.add(light);
  colliders.push({ x, z, r: 1.7 }); fires.push({ pos: new THREE.Vector3(x, y, z), light, base: intensity });
}
function buildVillage() {
  const V = P.village;
  const wallMats = [std(0xcfc0a0), std(0xc2ad88), std(0xd2c8b4)];
  const roofMats = [std(0xa4462f, { roughness: 0.7 }), std(0x4a5878, { roughness: 0.7 }), std(0x7a3b52, { roughness: 0.7 })];
  const wood = std(0x5e3d24), stone = std(0x9a948a, { flatShading: true });
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3; if (Math.abs(((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI * 1.5) < 0.3) continue;
    const r = 34 + (i % 2) * 6; const x = V.x + Math.cos(a) * r, z = V.z + Math.sin(a) * r; const y = getHeight(x, z);
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = Math.atan2(V.x - x, V.z - z);
    const s = rand(0.9, 1.25); g.scale.setScalar(s);
    addMesh(g, new THREE.BoxGeometry(6, 0.8, 5.4), stone, 0, 0.2, 0);
    addMesh(g, new THREE.BoxGeometry(5.6, 3.8, 5), wallMats[i % 3], 0, 2.5, 0);
    const roof = addMesh(g, new THREE.ConeGeometry(4.9, 3.2, 4), roofMats[i % 3], 0, 6.0, 0); roof.rotation.y = Math.PI / 4; roof.scale.set(1.12, 1, 1.02);
    addMesh(g, new THREE.BoxGeometry(1.3, 2.2, 0.15), wood, 0, 1.6, 2.53);
    addMesh(g, new THREE.BoxGeometry(1, 0.9, 0.12), windowMat, -1.7, 2.8, 2.53, false);
    addMesh(g, new THREE.BoxGeometry(1, 0.9, 0.12), windowMat, 1.7, 2.8, 2.53, false);
    addMesh(g, new THREE.BoxGeometry(0.12, 0.9, 1), windowMat, 2.83, 2.8, 0, false);
    addMesh(g, new THREE.BoxGeometry(0.9, 2.4, 0.9), stone, 1.6, 6.6, -1.2);
    for (const cx of [-2.8, 2.8]) for (const cz of [-2.5, 2.5]) addMesh(g, new THREE.BoxGeometry(0.3, 3.9, 0.3), wood, cx, 2.5, cz);
    addMesh(g, new THREE.BoxGeometry(5.8, 0.25, 0.3), wood, 0, 4.35, 2.55);
    scene.add(g); colliders.push({ x, z, r: 4.3 * s });
  }
  { const x = V.x - 52, z = V.z + 34, y = getHeight(x, z); const g = new THREE.Group(); g.position.set(x, y, z);
    addMesh(g, new THREE.CylinderGeometry(2.2, 3.4, 12, 8).translate(0, 6, 0), std(0xe6dccb));
    addMesh(g, new THREE.ConeGeometry(3, 3, 8).translate(0, 13.5, 0), std(0x8a3a2a));
    windmillBlades = new THREE.Group(); windmillBlades.position.set(0, 11, 3.1);
    for (let i = 0; i < 4; i++) { const b = new THREE.Group(); b.rotation.z = i * Math.PI / 2; addMesh(b, new THREE.BoxGeometry(0.3, 8, 0.2).translate(0, 4.2, 0), wood); addMesh(b, new THREE.BoxGeometry(1.6, 6, 0.08).translate(1, 5, 0), std(0xf3ecdc)); windmillBlades.add(b); }
    g.add(windmillBlades); g.rotation.y = 0.6; scene.add(g); colliders.push({ x, z, r: 3.8 }); }
  addFire(V.x, V.z, 30);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.2; const x = V.x + Math.cos(a) * 19, z = V.z + Math.sin(a) * 19, y = getHeight(x, z);
    addMesh(scene, new THREE.CylinderGeometry(0.12, 0.16, 3.6, 6), wood, x, y + 1.8, z);
    addMesh(scene, new THREE.BoxGeometry(0.5, 0.6, 0.5), lanternMat, x, y + 3.7, z, false); colliders.push({ x, z, r: 0.4 }); }
  { const x = V.x - 12, z = V.z - 9, y = getHeight(x, z); const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = 0.7;
    addMesh(g, new THREE.BoxGeometry(4, 1.1, 1.6).translate(0, 0.55, 0), wood);
    for (const sx of [-1.9, 1.9]) addMesh(g, new THREE.CylinderGeometry(0.1, 0.1, 3.2, 6).translate(sx, 1.6, -0.6), wood);
    addMesh(g, new THREE.BoxGeometry(4.6, 0.12, 2.6).translate(0, 3.1, 0), std(0xc8463a));
    for (let k = 0; k < 5; k++) addMesh(g, new THREE.SphereGeometry(0.22, 10, 8), glow(k % 2 ? 2.4 : 0.6, k % 2 ? 0.3 : 1.6, k % 2 ? 0.4 : 2.4), -1.5 + k * 0.75, 1.35, 0, false);
    scene.add(g); colliders.push({ x, z, r: 2.4 }); }
  // Miren's chronicle bench
  { const x = V.x + 9, z = V.z + 7, y = getHeight(x, z); const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = -0.8;
    addMesh(g, new THREE.BoxGeometry(2.4, 0.15, 0.8).translate(0, 0.75, 0), wood);
    for (const sx of [-1, 1]) addMesh(g, new THREE.BoxGeometry(0.15, 0.75, 0.7).translate(sx, 0.37, 0), wood);
    addMesh(g, new THREE.BoxGeometry(0.7, 0.12, 0.5).translate(0.5, 0.88, 0), std(0x6b2d2d)); scene.add(g); }
}
function npcFigure(o) { // o: robe, hair, skin, hood, staff, bow, hat
  const g = new THREE.Group();
  addMesh(g, new THREE.ConeGeometry(0.72, 2.0, 12).translate(0, 1.0, 0), std(o.robe));
  addMesh(g, new THREE.SphereGeometry(0.42, 14, 10).translate(0, 1.6, 0), std(o.robe));
  addMesh(g, new THREE.CylinderGeometry(0.45, 0.5, 0.12, 12).translate(0, 1.2, 0), std(o.belt || 0x4a3426));
  addMesh(g, new THREE.SphereGeometry(0.29, 16, 12).translate(0, 2.25, 0), std(o.skin || 0xe0b08a));
  if (o.hood) addMesh(g, new THREE.SphereGeometry(0.36, 14, 10, 0, Math.PI * 2, 0, 1.75).translate(0, 2.28, -0.04), std(o.hood));
  else addMesh(g, new THREE.SphereGeometry(0.31, 14, 10, 0, Math.PI * 2, 0, 1.4).translate(0, 2.32, -0.03), std(o.hair || 0x2c1f14));
  for (const s of [-1, 1]) addMesh(g, new THREE.CapsuleGeometry(0.1, 0.6, 4, 8).translate(s * 0.5, 1.45, 0.05), std(o.robe));
  if (o.staff) { addMesh(g, new THREE.CylinderGeometry(0.05, 0.06, 2.8, 6).translate(0.6, 1.4, 0.2), std(0x5e3d24)); addMesh(g, new THREE.OctahedronGeometry(0.22), glow(...o.staff), 0.6, 2.9, 0.2, false); }
  if (o.bow) { const b = addMesh(g, new THREE.TorusGeometry(0.7, 0.04, 6, 16, Math.PI), std(0x6a4a2a), 0, 1.6, -0.45); b.rotation.z = Math.PI / 2; }
  if (o.hat) addMesh(g, new THREE.CylinderGeometry(0.5, 0.5, 0.12, 12).translate(0, 2.55, 0), std(0x6b4a2a));
  return g;
}
function addNPC(id, name, x, z, figure, faceTo) {
  const y = getHeight(x, z); const g = figure; g.position.set(x, y, z);
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.28).scale(0.7, 1.3, 0.7), glow(3.2, 2.2, 0.5)); marker.position.y = 3.3; g.add(marker);
  const ft = faceTo || P.village; g.rotation.y = Math.atan2(ft.x - x, ft.z - z);
  scene.add(g); const col = { x, z, r: 0.8 }; colliders.push(col);
  const npc = { id, name, group: g, marker, pos: new THREE.Vector3(x, y, z), col, visible: true };
  npcs.push(npc); return npc;
}
function setNPCVisible(id, v) { const n = npcs.find(n => n.id === id); if (!n) return; n.visible = v; n.group.visible = v; n.col.r = v ? 0.8 : 0; }
function buildPeople() {
  const V = P.village;
  addNPC('miren', 'הזקנה מירן', V.x + 8, V.z + 4, npcFigure({ robe: 0x3b4f8a, hair: 0xe8e2d0, staff: [0.6, 2.2, 3.0] }), { x: V.x, z: V.z + 20 });
  addNPC('toma', 'תומא הסוחר', V.x - 13.5, V.z - 6.5, npcFigure({ robe: 0x8a5a2b, hair: 0x2c1f14, hat: true }), { x: V.x, z: V.z + 20 });
  addNPC('noa', 'נועה הציידת', P.camp.x + 3, P.camp.z + 3, npcFigure({ robe: 0x2f5a34, hood: 0x274a2b, skin: 0xd9a57c, bow: true, belt: 0x5a3a20 }), P.village);
  addNPC('eitan', 'איתן', P.camp.x - 3, P.camp.z + 2.5, npcFigure({ robe: 0x6b6a4a, hair: 0x5a3a1a, skin: 0xd9a57c }), P.village);
  addNPC('chronicle', 'הכרוניקה של מירן', V.x + 9, V.z + 7, new THREE.Group(), P.village);
  setNPCVisible('eitan', false); setNPCVisible('chronicle', false);
}
function buildShrine() {
  const S = P.shrine, y = getHeight(S.x, S.z); const g = new THREE.Group(); g.position.set(S.x, y, S.z);
  const marble = std(0xb4bac4, { roughness: 0.5, metalness: 0.05 }), dark = std(0x4a5468);
  addMesh(g, new THREE.CylinderGeometry(11, 12, 1, 12).translate(0, 0.5, 0), marble);
  addMesh(g, new THREE.CylinderGeometry(8.5, 9.5, 1, 12).translate(0, 1.5, 0), marble);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const px = Math.cos(a) * 7.5, pz = Math.sin(a) * 7.5;
    addMesh(g, new THREE.CylinderGeometry(0.55, 0.65, 8, 12).translate(px, 6, pz), marble);
    addMesh(g, new THREE.BoxGeometry(1.6, 0.5, 1.6).translate(px, 10.2, pz), dark);
    addMesh(g, new THREE.OctahedronGeometry(0.35), glow(0.5, 2.4, 3.4), px, 10.9, pz, false);
    colliders.push({ x: S.x + px, z: S.z + pz, r: 0.9 }); }
  shrineCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(2.2, 0), new THREE.MeshPhysicalMaterial({ color: 0x9ff0ff, emissive: 0x35c8ff, emissiveIntensity: 2.6, roughness: 0.08, metalness: 0.1, clearcoat: 1, iridescence: 0.7, flatShading: true }));
  shrineCrystal.scale.set(1, 1.8, 1); shrineCrystal.position.y = 8; g.add(shrineCrystal);
  shrineRing = new THREE.Mesh(new THREE.TorusGeometry(4, 0.08, 8, 64), glow(0.8, 2.6, 3.4)); shrineRing.position.y = 8; shrineRing.rotation.x = Math.PI / 2; g.add(shrineRing);
  const cl = new THREE.PointLight(0x55d8ff, 40, 45, 1.4); cl.position.set(0, 8, 0); g.add(cl); shrineCrystal.userData.light = cl;
  scene.add(g); shrineBeam = makeBeam(S.x, y + 8, S.z, 0x55d8ff, 480, 1.4);
}
function buildRuins() {
  const R = P.ruins, y = getHeight(R.x, R.z); const g = new THREE.Group(); g.position.set(R.x, y, R.z);
  const st = std(0x6e6876, { flatShading: true, roughness: 0.95 });
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; const r = 27; const px = Math.cos(a) * r, pz = Math.sin(a) * r; const h = rand(3, 13);
    if (i % 5 === 3) { const p = addMesh(g, new THREE.CylinderGeometry(1, 1.1, 10, 8), st, px, 1, pz); p.rotation.z = Math.PI / 2; p.rotation.y = a; continue; }
    addMesh(g, new THREE.CylinderGeometry(1, 1.15, h, 8).translate(px, h / 2, pz), st); colliders.push({ x: R.x + px, z: R.z + pz, r: 1.4 }); }
  addMesh(g, new THREE.CylinderGeometry(9, 10, 1.2, 10).translate(0, 0.6, 0), st);
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; const c = addMesh(g, new THREE.ConeGeometry(0.8, rand(4, 8), 5), new THREE.MeshStandardMaterial({ color: 0x7c3cff, emissive: 0x9a4dff, emissiveIntensity: 2.2, flatShading: true }), Math.cos(a) * 12, 2, Math.sin(a) * 12, false); c.rotation.set(rand(-0.4, 0.4), 0, rand(-0.4, 0.4)); ruinsCrystals.push(c); }
  for (const sx of [-5, 5]) { addMesh(g, new THREE.BoxGeometry(1.6, 11, 1.6).translate(sx, 5.5, 34), st); colliders.push({ x: R.x + sx, z: R.z + 34, r: 1.3 }); }
  addMesh(g, new THREE.BoxGeometry(13, 1.6, 2).translate(0, 11.5, 34), st);
  scene.add(g); makeBeam(R.x, y + 1, R.z, 0xa060ff, 520, 1.8);
}
function buildCamp() {
  const C = P.camp, y = getHeight(C.x, C.z);
  const cloth = std(0x8a7a52, { side: THREE.DoubleSide, roughness: 0.95 }), wood = std(0x5e3d24);
  for (const [dx, dz, r] of [[-6, -4, 0.4], [5, -6, -0.6]]) { const t = addMesh(scene, new THREE.ConeGeometry(2.6, 3.2, 4, 1, true), cloth, C.x + dx, getHeight(C.x + dx, C.z + dz) + 1.6, C.z + dz); t.rotation.y = r; colliders.push({ x: C.x + dx, z: C.z + dz, r: 2.2 }); }
  addFire(C.x, C.z, 24);
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.5; const l = addMesh(scene, new THREE.CylinderGeometry(0.3, 0.3, 2.2, 7), wood, C.x + Math.cos(a) * 3.4, y + 0.3, C.z + Math.sin(a) * 3.4); l.rotation.z = Math.PI / 2; l.rotation.y = a + Math.PI / 2; }
  const rack = new THREE.Group(); rack.position.set(C.x + 7, y, C.z + 1);
  for (const sx of [-1, 1]) addMesh(rack, new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6).translate(sx, 1.1, 0), wood);
  addMesh(rack, new THREE.BoxGeometry(2.4, 0.1, 0.1).translate(0, 1.9, 0), wood);
  for (let k = 0; k < 3; k++) addMesh(rack, new THREE.BoxGeometry(0.5, 0.9, 0.06).translate(-0.7 + k * 0.7, 1.3, 0.05), std(0x6b4a3a)); // drying pelts
  scene.add(rack);
}
function buildLoreStones() {
  const stoneMat = std(0x3b3f4a, { flatShading: true, roughness: 0.9 });
  for (const L of LORE) {
    const p = landNear(L.at, 1.5); const y = getHeight(p.x, p.z);
    const g = new THREE.Group(); g.position.set(p.x, y, p.z); g.rotation.y = rand(0, 6.28);
    addMesh(g, new THREE.CylinderGeometry(0.55, 0.85, 3.4, 5).translate(0, 1.7, 0), stoneMat);
    const runeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.2, 3.4) });
    for (let k = 0; k < 4; k++) addMesh(g, new THREE.BoxGeometry(0.34, 0.07, 0.04), runeMat, 0, 0.9 + k * 0.55, 0.62, false).rotation.z = (k % 2 ? 0.4 : -0.4);
    addMesh(g, new THREE.BoxGeometry(0.05, 2.0, 0.04), runeMat, 0, 1.8, 0.63, false);
    scene.add(g); colliders.push({ x: p.x, z: p.z, r: 0.9 });
    loreStones.push({ id: L.id, data: L, group: g, runeMat, pos: new THREE.Vector3(p.x, y, p.z), found: false });
  }
}
