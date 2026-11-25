// RPG balance table (rpg skill): hits to kill and hits to survive at the level the story puts you at each fight.
// Mirrors src/30_entities.js numbers; fails when a row leaves its band.
const xpTo = l => Math.round(80 * Math.pow(l, 1.55));
const base = l => 14 + l * 5, hp = l => 100 + l * 20, K = 100;
const blade = [1, 1.35, 1.8, 2.4];
const combo = (1 + 1.15 + 1.75) / 3, crit = 1 + 0.1 * 0.75;
// lvl/tier = where the quest chain puts you; charm = Noa's +15 armor after the pack leader
const E = {
  slime: { hp: 60, dmg: 11, lvl: 1, tier: 0, band: [2, 4, 6, 14] },
  wolf: { hp: 120, dmg: 25, lvl: 3, tier: 1, band: [2, 4, 5, 8] },
  alpha: { hp: 760, dmg: 32, lvl: 3, tier: 1, band: [8, 20, 4, 8] },
  golem: { hp: 300, dmg: 32, lvl: 4, tier: 1, charm: 1, band: [3, 6, 4, 9] },
  teros: { hp: 3200, dmg: 46, lvl: 5, tier: 2, charm: 1, band: [25, 60, 4, 8] },
  miren: { hp: 4200, dmg: 24, lvl: 6, tier: 3, charm: 1, band: [25, 60, 8, 16] }, // many small orbs, so more hits survived
};
let fail = 0;
console.log('enemy   lvl tier  playerHP  swing  hitsToKill  hitsToSurvive  xpToNext');
for (const [n, e] of Object.entries(E)) {
  const armor = 6 + e.lvl * 5 + (e.charm ? 15 : 0);
  const dmg = base(e.lvl) * blade[e.tier] * combo * crit, kill = e.hp / dmg, surv = hp(e.lvl) / (e.dmg * K / (K + armor));
  const [a, b, c, d] = e.band, ok = kill >= a && kill <= b && surv >= c && surv <= d; if (!ok) fail++;
  console.log(`${n.padEnd(7)} ${String(e.lvl).padStart(3)} ${String(e.tier).padStart(4)} ${String(hp(e.lvl)).padStart(9)} ${dmg.toFixed(0).padStart(6)} ${kill.toFixed(1).padStart(11)} ${surv.toFixed(1).padStart(14)} ${String(xpTo(e.lvl)).padStart(9)}  ${ok ? 'OK' : 'OUT OF BAND'}`);
}
let xp = 0, lvl = 1; const add = v => { xp += v; while (xp >= xpTo(lvl)) { xp -= xpTo(lvl); lvl++; } };
for (const [s, v] of [['6 slimes + quest', 6 * 15 + 80], ['shrine', 120], ['5 wolves + quest', 5 * 32 + 200], ['pack leader', 180 + 60], ['3 golems + quest', 3 * 75 + 420], ['teros', 900]]) { add(v); console.log(`after ${s.padEnd(18)} -> level ${lvl}`); }
process.exit(fail ? 1 : 0);
