
// ================= STORY STATE =================
const story = { flags: {}, lore: {} };
const Q = { index: 0, prog: 0 };
const QUESTS = [
  { title: 'ההתעוררות', desc: 'הלך בשביל הצדפים צפונה, אל העשן של כפר אלדור.', type: 'reach', target: () => P.village, radius: 42 },
  { title: 'שומרת הכרוניקות', desc: 'דבר עם הזקנה מירן ליד המדורה בכיכר.', type: 'talk', npc: 'miren', node: 'miren_1' },
  { title: 'מגפת הרפש', desc: 'הבס רפשים באחו הזהב שמדרום לכפר.', type: 'kill', kind: 'slime', need: 6, target: () => P.meadow, reward: { xp: 80, gold: 40 } },
  { title: 'האור שבלהב', desc: 'חזור אל מירן בכפר.', type: 'talk', npc: 'miren', node: 'miren_2a' },
  { title: 'אור הבדולח', desc: 'הלך בשביל הלבן מזרחה, אל מקדש הבדולח.', type: 'reach', target: () => P.shrine, radius: 13, after: 'vision', reward: { xp: 120, gold: 60 } },
  { title: 'הציידת', desc: 'מצא את נועה במחנה הציידים, בקצה יער הצללים.', type: 'talk', npc: 'noa', node: 'noa_1' },
  { title: 'יער הצללים', desc: 'הבס זאבי צל ביער שבמערב.', type: 'kill', kind: 'wolf', need: 5, target: () => P.forest, reward: { xp: 200, gold: 80 } },
  { title: 'מנהיג הלהקה', desc: 'מנהיג הלהקה יצא ממחבואו, ליד עץ האם שבלב היער. עמוד מולו.', type: 'kill', kind: 'alpha', need: 1, target: () => P.forestHeart, start: 'spawnAlpha', after: 'eitan', reward: { xp: 60, gold: 0 } },
  { title: 'שומרי ההר', desc: 'נפץ גולמי סלע ברגלי הרי השן.', type: 'kill', kind: 'golem', need: 3, target: () => P.foothills, reward: { xp: 420, gold: 150 } },
  { title: 'אדון הגולמים', desc: 'עלה בקניון אל חורבות הצפון ועמוד מול תרוס.', type: 'kill', kind: 'boss', need: 1, target: () => P.ruins, after: 'teros', reward: { xp: 0, gold: 0 } },
  { title: 'הכפר השקט', desc: 'מהר אל כפר אלדור. משהו קרה למירן.', type: 'talk', npc: 'toma', node: 'toma_7', start: 'mirenGone' },
  { title: 'לב האור', desc: 'עקוב אחרי מירן אל המקדש. הלילה יורד.', type: 'reach', target: () => P.shrine, radius: 28, start: 'dusk', after: 'confront' },
  { title: 'קול הריק', desc: 'עצור את מירן לפני שתפתח את לב האור עד הסוף.', type: 'kill', kind: 'miren', need: 1, target: () => P.shrine, after: 'ending' },
  { title: 'אתריה חופשית', desc: 'הסיפור הסתיים, אבל העולם פתוח. אבני הזיכרון עדיין מחכות.', type: 'free', target: () => null },
];
const QUEST_CHAPTER = [1, 1, 2, 2, 3, 4, 4, 4, 5, 6, 7, 7, 7, 8];
const JOURNAL_LOG = [
  { at: 1, title: 'חוף הצדפים', text: 'התעוררתי על החוף בלי זיכרון. בידי להב שבור שזוהר כאילו הוא נושם. הלכתי בשביל הצדפים אל כפר אלדור.' },
  { at: 2, title: 'שומרת הכרוניקות', text: 'מירן, שומרת הכרוניקות, זיהתה את הלהב: להב של שומרי האור. היא קראה לי אריאן, על פי החריטה בניצב. היא אמרה דבר מוזר: שלא ראתה להב כזה שלוש מאות שנה.' },
  { at: 4, title: 'מגפת הרפש', text: 'הרפשים באחו הם רסיסי אור מושחתים. כשהבסתי אותם, האור שבתוכם נספג בלהב שלי. מירן שלחה אותי למקדש הבדולח.' },
  { at: 5, title: 'אור הבדולח', text: 'הבדולח החזיר לי את הזיכרון. אני השומר שנכנס אל לב האור לפני שלוש מאות שנה כדי לסגור את השער. הסדק שחרר אותי. והבדולח הזהיר: כוכבים אינם נופלים מעצמם.' },
  { at: 8, title: 'מנהיג הלהקה', text: 'מנהיג הלהקה היה איתן, אחיה של נועה. האור קרע מעליו את הצל. בחושך הוא שמע אישה זקנה שרה לריק, והקול הגיע מכיוון הכפר.' },
  { at: 10, title: 'תרוס', text: 'שחררתי את תרוס מהריק. הוא אמר את מה שלא רציתי לשמוע: הכוכב נקרא, ומי שקראה לו היא השומרת השביעית, זו שבחרה לזכור. מירן.' },
  { at: 12, title: 'הכפר השקט', text: 'מירן נעלמה בלילה עם הרסיס הסגול. תומא ראה אותה הולכת אל המקדש.' },
  { at: 13, title: 'לב האור', text: 'מירן רצתה להחזיר את כל מי שאיבדה. הריק הבטיח לה. עצרתי אותה מול הבדולח.' },
];
const PEOPLE = [
  { at: 2, name: 'הזקנה מירן', text: 'שומרת הכרוניקות של אלדור. זוכרת דברים שאיש אחר אינו זוכר, ולפעמים מדברת עליהם כאילו ראתה אותם בעיניה.' },
  { at: 2, name: 'תומא הסוחר', text: 'מוכר שיקויים ומחדד להבים בכיכר הכפר. אוהב זהב, ואוהב עוד יותר סיפור טוב.' },
  { at: 6, name: 'נועה הציידת', text: 'ציידת במחנה בקצה היער. אחיה איתן נעלם בין העצים לפני עשרה ימים.' },
  { at: 8, name: 'איתן', text: 'אחיה של נועה. הצל הפך אותו למנהיג הלהקה, והאור החזיר אותו. הוא זוכר שיר.' },
  { at: 10, name: 'תרוס, שומר השער', text: 'גולם הסלע שנוצק לשמור על שער החורבות. שלוש מאות שנה עמד במשמרת, עד שהריק מצא דרך לתוך האבן.' },
  { at: 13, name: 'מירן, השומרת השביעית', text: 'היא לא נכנסה לבדולח ולא נפלה בקרב. היא בחרה לזכור, וכל שנה של זיכרון הכבידה עליה עוד קצת.' },
];
function questTarget() { const t = QUESTS[Q.index].target; return t ? t() : null; }
function onKill(type, e) {
  const q = QUESTS[Q.index];
  if (q.type === 'kill' && q.kind === type) { Q.prog++; if (Q.prog >= q.need) completeQuest(); else toast(`${q.title}: ${Q.prog}/${q.need}`); }
}
function completeQuest() {
  const q = QUESTS[Q.index]; const r = q.reward || {};
  if (r.gold || r.xp) { AudioSys.play('quest'); banner('משימה הושלמה', q.title + (r.gold ? ` · +${r.gold} זהב` : '') + (r.xp ? ` · +${r.xp} ניסיון` : '')); }
  if (r.gold) addGold(r.gold, true); if (r.xp) addXp(r.xp);
  if (q.after) runAfter(q.after); else nextQuest();
}
function nextQuest() {
  const prevCh = QUEST_CHAPTER[Q.index];
  Q.index = Math.min(Q.index + 1, QUESTS.length - 1); Q.prog = 0;
  const q = QUESTS[Q.index]; if (q.start) runStart(q.start);
  const ch = QUEST_CHAPTER[Q.index];
  if (ch !== prevCh && ch <= 7) setTimeout(() => showChapter(ch), 600);
  applyWorldState(); saveGame();
}
function runStart(k) {
  if (k === 'spawnAlpha' && !enemies.some(e => e.type === 'alpha' && !e.dead)) { const a = new Enemy('alpha', P.forestHeart.x + 8, P.forestHeart.z + 6, null); a.face = 0.5; banner('מנהיג הלהקה', 'יללה עמוקה עולה מלב היער'); AudioSys.play('howl'); }
  if (k === 'mirenGone') applyWorldState();
  if (k === 'dusk') { if (dayTime < 0.74 && dayTime > 0.2) dayTime = 0.74; AudioSys.setMood('dark'); }
}
// world props that depend on how far the story has gone
function applyWorldState() {
  const i = Q.index, f = story.flags;
  setNPCVisible('miren', i < 10 || f.ending === 'B');
  setNPCVisible('eitan', !!f.eitanSaved);
  setNPCVisible('chronicle', f.ending === 'A');
  if (motherTree) { const healed = !!f.eitanSaved; motherTree.leafMat.color.setHex(healed ? 0x4f8a3a : 0x4a2a6a); motherTree.leafMat.emissive.setHex(healed ? 0xffc860 : 0x7a3cff); motherTree.leafMat.emissiveIntensity = healed ? 0.25 : 0.6; }
  if (f.terosFreed && !npcs.find(n => n.id === 'teros')) spawnFriendlyTeros();
  AudioSys.setMood(i >= 10 && i <= 12 ? 'dark' : 'calm');
}
function spawnFriendlyTeros() {
  const m = golemModel(true, [3.6, 2.6, 0.7]); m.root.scale.setScalar(2.3); m.body.position.y = -0.9; m.body.rotation.x = 0.35;
  m.armL.rotation.x = 0.3; m.armR.rotation.x = 0.3; m.mats[0].emissive.setHex(0x3a2a10);
  const x = P.ruins.x, z = P.ruins.z + 4; m.root.position.set(x, getHeight(x, z), z); m.root.rotation.y = 0; scene.add(m.root);
  const n = { id: 'teros', name: 'תרוס', group: m.root, marker: new THREE.Object3D(), pos: new THREE.Vector3(x, getHeight(x, z), z + 6), col: { x, z, r: 5 }, visible: true };
  colliders.push(n.col); npcs.push(n);
}

// ================= SEQUENCES =================
let seqBusy = false, seqDepth = 0;
const wait = ms => new Promise(r => setTimeout(r, ms));
async function runSeq(steps) {
  seqDepth++; seqBusy = true; releaseLock();
  try {
    for (const s of steps) {
      if (s.slides) await playSlides(s.slides, s.title);
      else if (s.cine) await playCinema(s.cine);
      else if (s.talk) await openDialogue(s.talk);
      else if (s.chapter) await showChapter(s.chapter);
      else if (s.fn) await s.fn();
      else if (s.wait) await wait(s.wait);
    }
  } finally { seqDepth--; seqBusy = seqDepth > 0; if (!seqBusy && state === 'play' && !dialogOpen) requestLock(); }
}
function runAfter(k) {
  if (k === 'vision') runSeq([
    { cine: shotsAround(P.shrine, 10, 26, 8, 4.5, 0.4) },
    { slides: 'vision', title: 'זיכרון' },
    { fn: () => { setBlade(1); AudioSys.play('purify'); flashScreen(0.5); fx.burst(player.pos.x, player.pos.y + 1.5, player.pos.z, 160, 10, bladeInfo[1].color, 0.5, 1.4, { drag: 2 }); toast('הלהב שלם שוב: ' + bladeInfo[1].name, 'gold'); } },
    { talk: 'crystal_1' },
  ]);
  else if (k === 'eitan') runSeq([
    { slides: 'eitan' },
    { fn: () => { story.flags.eitanSaved = true; applyWorldState(); } },
    { talk: 'eitan_1' },
    { fn: () => { story.flags.charm = true; toast('נועה שלחה לך את קמע הציידת: +15 שריון', 'gold'); } },
  ]);
  else if (k === 'teros') runSeq([
    { slides: 'teros' },
    { fn: () => { story.flags.terosFreed = true; applyWorldState(); } },
    { cine: shotsAround({ x: P.ruins.x, z: P.ruins.z + 4 }, 14, 30, 7, 5, 0.6) },
    { talk: 'teros_1' },
    { fn: () => { setBlade(3); AudioSys.play('purify'); flashScreen(0.5); toast('תרוס העניק לך את כוחו: ' + bladeInfo[3].name, 'gold'); } },
  ]);
  else if (k === 'confront') runSeq([
    { slides: 'confront' },
    { fn: () => spawnMiren() },
    { cine: [{ dur: 4.5, from: camAt(P.shrine, 40, 0.2, 14), to: camAt(P.shrine, 22, 0.9, 9), look: () => new THREE.Vector3(P.shrine.x, getHeight(P.shrine.x, P.shrine.z) + 8, P.shrine.z) }] },
    { talk: 'miren_f1' },
  ]);
  else if (k === 'ending') runSeq([
    { wait: 1200 },
    { talk: 'miren_end1' },
  ]);
}
function camAt(c, r, ang, h) { return () => new THREE.Vector3(c.x + Math.cos(ang) * r, getHeight(c.x, c.z) + h, c.z + Math.sin(ang) * r); }
function shotsAround(c, r0, r1, h, dur, a0) {
  const look = () => new THREE.Vector3(c.x, getHeight(c.x, c.z) + 3, c.z);
  return [{ dur, from: camAt(c, r1, a0, h + 6), to: camAt(c, r0, a0 + 0.9, h), look }];
}
function runAction(act) {
  if (act === 'advance') nextQuest();
  else if (act === 'startFinal') { const m = enemies.find(e => e.type === 'miren'); if (m) { m.state = 'idle'; m.cd = 1.5; engageBoss(m); } nextQuest(); }
  else if (act === 'endingA' || act === 'endingB') endGame(act === 'endingA' ? 'A' : 'B');
}
function spawnMiren() {
  if (enemies.some(e => e.type === 'miren')) return;
  const m = new Enemy('miren', P.shrine.x, P.shrine.z - 4, null); m.state = 'dormant'; m.hover = 1.4; m.face = Math.PI;
  setNPCVisible('miren', false);
}
function endGame(which) {
  story.flags.ending = which;
  const m = enemies.find(e => e.type === 'miren');
  runSeq([
    { fn: () => { if (m) { fx.burst(m.pos.x, m.pos.y + 2, m.pos.z, 300, 12, which === 'A' ? [4, 3.4, 2.2] : [0.6, 2.6, 4], 0.7, 1.8, { drag: 1.2, g: -2 }); scene.remove(m.root); enemies.splice(enemies.indexOf(m), 1); } AudioSys.play('purify'); flashScreen(0.7); } },
    { wait: 1200 },
    { slides: which === 'A' ? 'endingA' : 'endingB', title: which === 'A' ? 'השחר' : 'השינה' },
    { fn: () => { nextQuest(); dayTime = 0.28; AudioSys.setMood('calm'); applyWorldState(); } },
    { fn: async () => { $('chapNum').textContent = 'סוף'; $('chapName').textContent = 'תודה ששיחקת בממלכת אתריה'; $('chapter').classList.add('show'); await wait(3800); $('chapter').classList.remove('show'); } },
  ]);
}

// ================= SLIDES (illustrated sequences) =================
let slidesState = null;
function playSlides(key, title) {
  return new Promise(resolve => {
    const list = SLIDES[key]; let i = -1; const img = $('cineImg'), txt = $('cineText');
    $('cine').hidden = false; $('cineTitle').hidden = !title; $('cineTitle').textContent = title || '';
    let typer = null, full = '', shown = 0, t0 = performance.now();
    const next = () => {
      if (typer && shown < full.length) { shown = full.length; txt.textContent = full; return; }
      i++; if (i >= list.length) return finish();
      const s = list[i]; AudioSys.play('page');
      if (img.dataset.src !== s.img) { img.classList.remove('on'); setTimeout(() => { img.style.backgroundImage = `url("${s.img}"), radial-gradient(ellipse at 50% 40%, #2a3354, #05070d)`; img.dataset.src = s.img; img.classList.add('on'); t0 = performance.now(); }, img.dataset.src ? 500 : 0); }
      full = s.text; shown = 0; txt.textContent = '';
      clearInterval(typer); typer = setInterval(() => { shown = Math.min(full.length, shown + 2); txt.textContent = full.slice(0, shown); if (shown >= full.length) { clearInterval(typer); typer = null; } }, 28);
      if (i > 0 || !title) $('cineTitle').hidden = true;
    };
    const finish = () => { clearInterval(typer); $('cine').hidden = true; img.classList.remove('on'); img.dataset.src = ''; slidesState = null; resolve(); };
    const kb = () => { if (!slidesState) return; const k = (performance.now() - t0) / 1000; const s = 1.04 + Math.min(k, 14) * 0.006; img.style.transform = `scale(${s}) translate(${Math.sin(k * 0.1) * 0.8}%, ${-k * 0.08}%)`; requestAnimationFrame(kb); };
    slidesState = { next, finish };
    next(); requestAnimationFrame(kb);
  });
}
$('cine').addEventListener('click', e => { if (e.target.id === 'cineSkip') { slidesState?.finish(); return; } slidesState?.next(); });

// ================= IN-ENGINE CINEMATICS =================
const cinema = { active: false, shots: null, i: 0, t: 0, resolve: null };
function playCinema(shots) { return new Promise(resolve => { cinema.active = true; cinema.shots = shots; cinema.i = 0; cinema.t = 0; cinema.resolve = resolve; document.body.classList.add('cinema'); }); }
function updateCinema(dt) {
  const s = cinema.shots[cinema.i]; cinema.t += dt; const k = smooth(0, 1, cinema.t / s.dur);
  const a = s.from(), b = s.to(); cam.pos.lerpVectors(a, b, k); cam.look.copy(s.look());
  if (cinema.t >= s.dur) { cinema.i++; cinema.t = 0; if (cinema.i >= cinema.shots.length) endCinema(); }
}
function endCinema() { cinema.active = false; document.body.classList.remove('cinema'); cam.cut = true; const r = cinema.resolve; cinema.resolve = null; r && r(); }
const cinemaActive = () => cinema.active || !!slidesState || dialogOpen || seqBusy;

// ================= CHAPTER CARDS =================
const HEB_NUM = ['', 'ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שביעי'];
async function showChapter(n) {
  const c = CHAPTERS[n - 1]; if (!c) return;
  $('chapNum').textContent = 'פרק ' + HEB_NUM[n]; $('chapName').textContent = c.name; $('chapter').classList.add('show'); AudioSys.play('story');
  await wait(3000); $('chapter').classList.remove('show'); await wait(600);
}

// ================= DIALOGUE RUNNER =================
let dialogOpen = false, dlgState = null;
function openDialogue(id, custom) {
  return new Promise(resolve => {
    dialogOpen = true; releaseLock(); $('dialog').hidden = false;
    dlgState = { resolve, typer: null, full: '', shown: 0, node: null };
    showNode(custom ? null : id, custom);
  });
}
function showNode(id, custom) {
  const n = custom || DIALOGUE[id]; if (!n) return closeDialogue();
  const sp = SPEAKERS[n.who] || { name: n.name || '', color: '#f2c46d' };
  dlgState.node = n;
  $('dlgName').textContent = n.name || sp.name; $('dlgName').style.color = sp.color;
  const opts = $('dlgOpts'); opts.innerHTML = ''; $('dlgHint').textContent = '';
  dlgState.full = n.text; dlgState.shown = 0; $('dlgText').textContent = '';
  clearInterval(dlgState.typer);
  dlgState.typer = setInterval(() => { dlgState.shown = Math.min(dlgState.full.length, dlgState.shown + 2); $('dlgText').textContent = dlgState.full.slice(0, dlgState.shown); if (dlgState.shown >= dlgState.full.length) { clearInterval(dlgState.typer); dlgState.typer = null; showChoices(); } }, 22);
}
function showChoices() {
  const n = dlgState.node, opts = $('dlgOpts');
  if (n.choices) {
    n.choices.forEach((c, i) => { const b = document.createElement('button'); b.className = 'opt'; b.type = 'button'; b.innerHTML = `<b>${i + 1}</b><span></span>`; b.querySelector('span').textContent = c.t; b.onclick = () => pickChoice(i); opts.appendChild(b); });
    setTimeout(() => opts.firstChild?.focus(), 20); $('dlgHint').textContent = 'בחר תשובה (1-' + n.choices.length + ')';
  } else $('dlgHint').textContent = n.end ? 'רווח לסיום' : 'רווח להמשך';
}
function pickChoice(i) {
  const c = dlgState.node.choices[i]; if (!c) return; AudioSys.play('page');
  if (c.fn) c.fn();
  if (c.act) runActionAfter = c.act;
  if (c.next) showNode(c.next); else closeDialogue();
}
let runActionAfter = null;
function advanceDialogue() {
  if (!dlgState) return;
  if (dlgState.typer) { clearInterval(dlgState.typer); dlgState.typer = null; dlgState.shown = dlgState.full.length; $('dlgText').textContent = dlgState.full; showChoices(); return; }
  const n = dlgState.node; if (n.choices) return;
  if (n.next) showNode(n.next); else closeDialogue();
}
function closeDialogue() {
  clearInterval(dlgState?.typer); $('dialog').hidden = true; dialogOpen = false;
  const r = dlgState?.resolve; dlgState = null;
  const act = runActionAfter; runActionAfter = null; if (act) runAction(act);
  if (!seqBusy) requestLock(true);
  r && r();
}
$('dialog').addEventListener('click', e => { if (!e.target.closest('.opt')) advanceDialogue(); });

// ================= NPC & LORE INTERACTION =================
function nearInteractable() {
  for (const n of npcs) if (n.visible && n.pos.distanceTo(player.pos) < (n.id === 'teros' ? 9 : 4.5)) return { kind: 'npc', n, label: n.id === 'chronicle' ? 'קרא בכרוניקה' : 'דבר עם ' + n.name };
  for (const s of loreStones) if (s.pos.distanceTo(player.pos) < 4) return { kind: 'lore', s, label: s.found ? 'קרא שוב: ' + s.data.title : 'גע באבן הזיכרון' };
  return null;
}
function interact() {
  if (!canAct()) return; const it = nearInteractable(); if (!it) return;
  if (it.kind === 'lore') return readLore(it.s);
  const n = it.n, q = QUESTS[Q.index], i = Q.index;
  if (q.type === 'talk' && q.npc === n.id) return runSeq([{ talk: q.node }]);
  let node = null;
  if (n.id === 'miren') node = story.flags.ending === 'B' ? null : i === 2 ? 'miren_wait1' : i === 4 ? 'miren_wait2' : i <= 6 ? 'miren_wait3' : 'miren_wait4';
  if (n.id === 'miren' && story.flags.ending === 'B') return runSeq([{ talk: null, fn: () => openDialogue(null, { who: 'miren', text: 'אני כותבת הכל, אריאן. כל שקר, כל שם, כל קבר. שלוש מאות שנה של אמת. זה לוקח זמן.', end: true }) }]);
  if (n.id === 'noa') node = story.flags.eitanSaved ? 'noa_after' : 'noa_wait';
  if (n.id === 'eitan') node = 'eitan_after';
  if (n.id === 'teros') node = 'teros_after';
  if (n.id === 'chronicle') node = 'miren_free';
  if (n.id === 'toma') return openShop();
  if (node) runSeq([{ talk: node }]);
}
function openShop() {
  const costs = [120, 320, 750]; const nextTier = player.blade + 1;
  const choices = [{ t: 'שיקוי ריפוי · 25 זהב', fn: () => { if (player.gold >= 25) { player.gold -= 25; player.potions++; AudioSys.play('coin'); toast('קנית שיקוי ריפוי. יש לך ' + player.potions); } else toast('אין לך מספיק זהב'); } }];
  if (nextTier <= 3 && nextTier !== 3) choices.push({ t: `חידוד ל${bladeInfo[nextTier].name} · ${costs[player.blade]} זהב`, fn: () => { const c = costs[player.blade]; if (player.gold >= c) { player.gold -= c; setBlade(nextTier); AudioSys.play('level'); toast('הלהב שלך זוהר עכשיו: ' + bladeInfo[nextTier].name, 'gold'); } else toast('אין לך מספיק זהב'); } });
  choices.push({ t: 'להתראות', end: true });
  runSeq([{ fn: () => openDialogue(null, { who: 'toma', text: `שיקויים, להבים, סיפורים. יש לך ${player.gold} זהב ו־${player.potions} שיקויים. מה תרצה?`, choices: choices.map(c => ({ ...c, next: c.end ? null : null })) }) }]);
}
function readLore(s) {
  const first = !s.found; s.found = true; story.lore[s.id] = true; s.runeMat.color.setRGB(3.4, 2.4, 0.7);
  const count = loreStones.filter(x => x.found).length;
  if (first) { AudioSys.play('story'); fx.burst(s.pos.x, s.pos.y + 2, s.pos.z, 80, 5, [0.6, 2.4, 3.6], 0.4, 1.4, { drag: 1, g: -2 }); }
  runSeq([{ fn: () => openDialogue(null, { who: 'stone', name: `אבן זיכרון · ${s.data.title} (${count}/${loreStones.length})`, text: s.data.text, end: true }) }, { fn: () => {
    if (first) { addXp(40); if (count === loreStones.length && !story.flags.song) { story.flags.song = true; player.bonusHp += 30; recalcStats(); player.hp = player.maxHp; player.potions += 2; banner('שיר אלורה', 'אספת את כל אבני הזיכרון · +30 חיים מרביים · 2 שיקויים'); AudioSys.play('purify'); } }
    saveGame(); } }]);
}

// ================= JOURNAL =================
let journalOpen = false, journalTab = 'story';
function openJournal() { if (state !== 'play' || dialogOpen || seqBusy) return; journalOpen = true; releaseLock(); renderJournal(); $('journal').hidden = false; AudioSys.play('page'); }
function closeJournal() { journalOpen = false; $('journal').hidden = true; requestLock(true); }
function renderJournal() {
  document.querySelectorAll('#journal .tab').forEach(t => t.classList.toggle('on', t.dataset.tab === journalTab));
  const body = $('jrBody'); body.innerHTML = '';
  const add = (h, p, cls) => { if (h) { const e = document.createElement('h3'); e.textContent = h; body.appendChild(e); } const e = document.createElement('p'); e.textContent = p; if (cls) e.className = cls; body.appendChild(e); };
  if (journalTab === 'story') {
    const q = QUESTS[Q.index]; add('עכשיו: ' + q.title, q.desc);
    const done = JOURNAL_LOG.filter(j => Q.index >= j.at); for (const j of done.reverse()) add(j.title, j.text);
    if (!done.length) add(null, 'הדפים עדיין ריקים. ההרפתקה רק מתחילה.', 'locked');
    $('jrCount').textContent = `פרק ${Math.min(7, QUEST_CHAPTER[Q.index])} מתוך 7`;
  } else if (journalTab === 'lore') {
    for (const s of loreStones) { if (s.found) add(s.data.title, s.data.text); else add('אבן שלא נמצאה', 'אבן זיכרון זוהרת מחכה איפשהו באתריה.', 'locked'); }
    $('jrCount').textContent = `${loreStones.filter(s => s.found).length} מתוך ${loreStones.length} אבנים`;
  } else {
    const met = PEOPLE.filter(pp => Q.index >= pp.at); for (const pp of met) add(pp.name, pp.text);
    if (!met.length) add(null, 'עוד לא פגשת איש.', 'locked');
    $('jrCount').textContent = `${met.length} דמויות`;
  }
}
document.querySelectorAll('#journal .tab').forEach(t => t.onclick = () => { journalTab = t.dataset.tab; renderJournal(); });
$('jrClose').onclick = closeJournal;
