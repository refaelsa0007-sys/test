import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ================= UTILS =================
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));
const lerpAngle = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = mulberry32(20261125);
const rand = (a, b) => a + (b - a) * Math.random();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && !matchMedia('(pointer: fine)').matches);
if (isTouch) document.body.classList.add('touch');
const PHOTO = window.__AETHERIA_PHOTO || null; // set only by the offline art renderer

// ================= NOISE =================
const perm = new Uint8Array(512);
{ const p = new Uint8Array(256); for (let i = 0; i < 256; i++) p[i] = i; for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; }
const GR = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
function noise2(xin, yin) {
  const s = (xin + yin) * F2; const i = Math.floor(xin + s), j = Math.floor(yin + s);
  const t = (i + j) * G2; const x0 = xin - (i - t), y0 = yin - (j - t);
  const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
  const ii = i & 255, jj = j & 255; let n = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0; if (t0 > 0) { const g = GR[perm[ii + perm[jj]] & 7]; t0 *= t0; n += t0 * t0 * (g[0] * x0 + g[1] * y0); }
  let t1 = 0.5 - x1 * x1 - y1 * y1; if (t1 > 0) { const g = GR[perm[ii + i1 + perm[jj + j1]] & 7]; t1 *= t1; n += t1 * t1 * (g[0] * x1 + g[1] * y1); }
  let t2 = 0.5 - x2 * x2 - y2 * y2; if (t2 > 0) { const g = GR[perm[ii + 1 + perm[jj + 1]] & 7]; t2 *= t2; n += t2 * t2 * (g[0] * x2 + g[1] * y2); }
  return 70 * n;
}
function fbm(x, y, o) { let a = 0.5, f = 1, s = 0, n = 0; for (let i = 0; i < o; i++) { s += a * noise2(x * f, y * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }
function ridged(x, y, o) { let a = 0.5, f = 1, s = 0, n = 0; for (let i = 0; i < o; i++) { let v = 1 - Math.abs(noise2(x * f, y * f)); v *= v; s += v * a; n += a; a *= 0.5; f *= 2.1; } return s / n; }

// ================= WORLD LAYOUT =================
const WORLD = 1400, SEG = 280, N = SEG + 1, CELL = WORLD / SEG, HALF = WORLD / 2;
const P = {
  village: { x: 0, z: 90 }, shrine: { x: 320, z: 10 }, forest: { x: -290, z: -30 }, forestHeart: { x: -330, z: -70 }, camp: { x: -175, z: 22 },
  ruins: { x: 30, z: -365 }, lake: { x: -190, z: 195 }, meadow: { x: 70, z: 235 }, hills: { x: 240, z: -150 }, foothills: { x: 80, z: -235 },
  coast: { x: 18, z: 452 },
};
const PATHS = [
  [P.village, { x: 150, z: 70 }, { x: 250, z: 20 }, P.shrine],
  [P.village, { x: -120, z: 60 }, P.camp, { x: -240, z: -10 }, P.forest],
  [P.village, { x: 30, z: -40 }, { x: 70, z: -170 }, { x: 60, z: -260 }, P.ruins],
  [P.village, { x: 40, z: 170 }, P.meadow],
  [P.village, { x: -100, z: 150 }, P.lake],
  [P.village, { x: 30, z: 260 }, { x: 10, z: 360 }, P.coast],
];
function segDist(px, pz, a, b) { const dx = b.x - a.x, dz = b.z - a.z; const t = clamp(((px - a.x) * dx + (pz - a.z) * dz) / (dx * dx + dz * dz), 0, 1); return Math.hypot(px - a.x - dx * t, pz - a.z - dz * t); }
function polyDist(x, z, pl) { let m = 1e9; for (let i = 0; i < pl.length - 1; i++) m = Math.min(m, segDist(x, z, pl[i], pl[i + 1])); return m; }
function pathDist(x, z) { let m = 1e9; for (const pl of PATHS) m = Math.min(m, polyDist(x, z, pl)); return m; }
const dist2 = (x, z, p) => Math.hypot(x - p.x, z - p.z);
function flatten(h, x, z, p, r, target) { const t = 1 - smooth(r, r * 1.8, dist2(x, z, p)); return h + (target - h) * t; }

function rawHeight(x, z) {
  const d = Math.hypot(x * 0.95, z) / 650;
  let h = 7 + fbm(x * 0.0022 + 3.1, z * 0.0022 - 1.7, 5) * 26 + fbm(x * 0.013, z * 0.013, 3) * 3;
  const m = smooth(-110, -420, z) * (1 - smooth(380, 580, Math.abs(x)));
  const canyon = 0.12 + 0.88 * smooth(9, 48, polyDist(x, z, PATHS[2]));
  h += (ridged(x * 0.0042 + 11, z * 0.0042 + 5, 5) * 155 + 24) * m * canyon;
  h += Math.max(0, fbm(x * 0.006 + 40, z * 0.006, 3)) * 46 * smooth(110, 300, x) * (1 - smooth(-60, -260, z) * 0.3);
  h -= 26 * Math.exp(-((x - P.lake.x) ** 2 + (z - P.lake.z) ** 2) / (95 * 95) * 1.4);
  h = h * (1 - smooth(0.74, 0.97, d)) - smooth(0.78, 1.06, d) * 30;
  h = flatten(h, x, z, P.village, 66, 7);
  h = flatten(h, x, z, P.shrine, 30, 24);
  h = flatten(h, x, z, P.ruins, 46, 46);
  h = flatten(h, x, z, P.camp, 14, Math.max(4, h));
  return h;
}

// ================= GRID =================
const H = new Float32Array(N * N), GRASS = new Float32Array(N * N), FOREST = new Float32Array(N * N), PATHM = new Float32Array(N * N);
const COLR = new Float32Array(N * N * 3), SPLAT = new Float32Array(N * N * 4), AO = new Float32Array(N * N);
function forestness(x, z) { return clamp(smooth(190, 50, dist2(x, z, P.forest)) + fbm(x * 0.006 + 70, z * 0.006 - 30, 3) * 0.7 + 0.05, 0, 1); }
function getHeight(x, z) {
  const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL; const i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= SEG || j >= SEG) return -30;
  const tx = fx - i, tz = fz - j, k = j * N + i;
  return lerp(lerp(H[k], H[k + 1], tx), lerp(H[k + N], H[k + N + 1], tx), tz);
}
function slopeAtXZ(x, z) { const e = 2; return Math.hypot(getHeight(x + e, z) - getHeight(x - e, z), getHeight(x, z + e) - getHeight(x, z - e)) / (2 * e); }
function landNear(p, minH = 1.2) { // nudge a point onto dry land
  if (getHeight(p.x, p.z) > minH) return { x: p.x, z: p.z };
  for (let r = 4; r < 120; r += 4) for (let a = 0; a < 16; a++) { const x = p.x + Math.cos(a / 16 * Math.PI * 2) * r, z = p.z + Math.sin(a / 16 * Math.PI * 2) * r; if (getHeight(x, z) > minH) return { x, z }; }
  return { x: p.x, z: p.z };
}

function buildGrid() {
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -HALF + i * CELL, z = -HALF + j * CELL, k = j * N + i;
    H[k] = rawHeight(x, z);
    const pd = pathDist(x, z) + noise2(x * 0.04, z * 0.04) * 2.2;
    PATHM[k] = clamp(1 - (pd - 2.2) / 3, 0, 1);
    FOREST[k] = forestness(x, z);
  }
  // horizon-based ambient occlusion: how much of the sky each vertex sees, scanned in 8 directions
  const dirs = []; for (let a = 0; a < 8; a++) dirs.push([Math.cos(a / 8 * Math.PI * 2), Math.sin(a / 8 * Math.PI * 2)]);
  const steps = [5, 12, 26, 50, 90];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -HALF + i * CELL, z = -HALF + j * CELL, k = j * N + i, h0 = H[k];
    let occ = 0;
    for (const [dx, dz] of dirs) { let mx = 0; for (const s of steps) { const e = (getHeight(x + dx * s, z + dz * s) - h0) / s; if (e > mx) mx = e; } occ += mx / Math.sqrt(1 + mx * mx); }
    AO[k] = clamp(1 - occ / 8 * 1.15, 0.25, 1);
  }
  const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, x = -HALF + i * CELL, z = -HALF + j * CELL, h = H[k];
    const i0 = Math.max(0, i - 1), i1 = Math.min(SEG, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(SEG, j + 1);
    const s = Math.hypot((H[j * N + i1] - H[j * N + i0]) / ((i1 - i0) * CELL), (H[j1 * N + i] - H[j0 * N + i]) / ((j1 - j0) * CELL));
    const n = noise2(x * 0.05, z * 0.05) * 0.5 + 0.5, n2 = fbm(x * 0.008, z * 0.008, 2) * 0.5 + 0.5;
    const f = FOREST[k];
    let c = mix3([0.36, 0.58, 0.2], [0.62, 0.64, 0.26], smooth(0.45, 0.8, n2));
    c = mix3(c, [0.17, 0.34, 0.14], f * 0.75);
    c = mix3(c, [c[0] * 0.88, c[1] * 0.92, c[2] * 0.85], n);
    const vd = dist2(x, z, P.village), sd = dist2(x, z, P.shrine), rd = dist2(x, z, P.ruins);
    const plaza = 1 - smooth(15, 20, vd);
    const shrineFloor = 1 - smooth(9, 13, sd);
    const ruinsT = (1 - smooth(30, 60, rd)) * 0.7;
    const rockT = clamp(smooth(0.6, 0.95, s) + smooth(48, 80, h) * 0.85, 0, 1);
    const snowT = smooth(98, 118, h + n * 12) * (1 - smooth(1.2, 1.8, s));
    const sandT = 1 - smooth(1.0, 2.4, h);
    const dirtT = clamp(PATHM[k] * 0.95 + plaza + ruinsT * 0.6, 0, 1) * (1 - sandT);
    c = mix3(c, [0.62, 0.5, 0.34], PATHM[k] * 0.9);
    c = mix3(c, [0.7, 0.65, 0.58], plaza);
    c = mix3(c, [0.8, 0.82, 0.86], shrineFloor);
    c = mix3(c, h < 0 ? mix3([0.76, 0.69, 0.52], [0.42, 0.39, 0.31], smooth(0, -4, h)) : [0.8, 0.72, 0.54], sandT);
    c = mix3(c, mix3([0.46, 0.43, 0.41], [0.58, 0.55, 0.52], n), rockT);
    c = mix3(c, [0.96, 0.97, 1.0], snowT);
    c = mix3(c, [0.32, 0.28, 0.36], ruinsT);
    COLR[k * 3] = c[0]; COLR[k * 3 + 1] = c[1]; COLR[k * 3 + 2] = c[2];
    // texture weights: rock, sand, dirt, snow (grass = remainder)
    const wr = rockT, ws = sandT * (1 - wr), wsn = snowT, wd = Math.max(dirtT, shrineFloor) * (1 - wr) * (1 - wsn);
    SPLAT[k * 4] = wr; SPLAT[k * 4 + 1] = ws; SPLAT[k * 4 + 2] = wd; SPLAT[k * 4 + 3] = wsn;
    GRASS[k] = (h > 1.8 ? 1 : 0) * (1 - rockT) * (1 - snowT) * (1 - PATHM[k] * 0.95) * (1 - plaza) * smooth(10, 14, sd) * (1 - ruinsT) * smooth(5, 10, dist2(x, z, P.camp)) * (0.55 + 0.45 * smooth(0.3, 0.7, n));
  }
}
