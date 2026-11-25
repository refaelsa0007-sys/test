// Checks the dialogue graph: no dead ends, no dangling links, only whitelisted actions, every speaker known.
const fs = require('fs'); const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../src/40_story_data.js'), 'utf8');
const { SPEAKERS, DIALOGUE, SLIDES, LORE } = new Function(src + '; return { SPEAKERS, DIALOGUE, SLIDES, LORE };')();
const ACTS = new Set(['advance', 'startFinal', 'endingA', 'endingB']);
let errors = 0; const err = m => { console.log('ERROR', m); errors++; };
const linked = new Set();
for (const [id, n] of Object.entries(DIALOGUE)) {
  if (!SPEAKERS[n.who]) err(`${id}: unknown speaker ${n.who}`);
  if (!n.text || !n.text.trim()) err(`${id}: empty text`);
  const outs = (n.next ? 1 : 0) + (n.choices ? 1 : 0) + (n.end ? 1 : 0);
  if (outs !== 1) err(`${id}: needs exactly one of next/choices/end (has ${outs})`);
  if (n.next) { if (!DIALOGUE[n.next]) err(`${id}: next -> missing ${n.next}`); linked.add(n.next); }
  for (const c of n.choices || []) {
    if (!c.next && !c.end) err(`${id}: choice "${c.t}" is a dead end`);
    if (c.next) { if (!DIALOGUE[c.next]) err(`${id}: choice -> missing ${c.next}`); linked.add(c.next); }
    if (c.act && !ACTS.has(c.act)) err(`${id}: act ${c.act} not whitelisted`);
  }
}
for (const [k, s] of Object.entries(SLIDES)) for (const sl of s) if (!sl.img || !sl.text) err(`slides ${k}: missing img/text`);
const entry = Object.keys(DIALOGUE).filter(id => !linked.has(id));
console.log(`${Object.keys(DIALOGUE).length} nodes, ${entry.length} entry points: ${entry.join(', ')}`);
console.log(`${Object.values(SLIDES).reduce((a, s) => a + s.length, 0)} slides, ${LORE.length} lore stones`);
console.log(errors ? `${errors} error(s)` : 'dialogue graph OK');
process.exit(errors ? 1 : 0);
