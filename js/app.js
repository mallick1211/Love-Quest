/* =========================================================
   LOVE QUEST — App Logic
   ========================================================= */

const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));

const state = {
  current: 'screen-intro',
  name: '',
  completed: new Set(),
  quizAnswers: [],
  soundOn: false,
};

const TOTAL_LEVELS = 5;
// Names she can type for Level 1 — edit these in assets/config.json (no need to touch this file).
// These stay as the fallback defaults if config.json is missing or can't be loaded.
let ALLOWED_NAMES = ['pichu','chuhuu','pie','chuhu','chuu','piee'];
let LEVEL1_HINT = '💡 hint: starts with "p" or "s"...';

function applyConfig(cfg){
  if(!cfg) return;
  if(Array.isArray(cfg.allowedNames) && cfg.allowedNames.length){
    ALLOWED_NAMES = cfg.allowedNames.map(n => String(n).trim().toLowerCase()).filter(Boolean);
  }
  if(cfg.level1Hint) LEVEL1_HINT = cfg.level1Hint;
}

function loadConfig(){
  // Note: this uses fetch, so the site must be served over http(s)
  // (e.g. `python3 -m http.server`). Opened directly via file:// the
  // browser may block it — in that case the defaults above are used.
  return fetch('assets/config.json', { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null)
    .then(applyConfig)
    .catch(() => {/* keep defaults */});
}

const QUIZ_QUESTIONS = [
  "If our love had a smell, what would it be?",
  "Where in the world would you run away with me tomorrow?",
  "The one little thing about me that makes you smile?",
  "Our song, in three words?",
  "What's one promise you want from me, forever?",
];

/* ============== Level Instructions ============== */
const INSTRUCTIONS = {
  1: {
    title: 'Word Whisper',
    body: `
      <p>A secret-name quiz — say it the way only I say it ♥</p>
      <ul>
        <li>Type the special name I call you in the box</li>
        <li>You have <strong>3 hints</strong> — your heart knows the answer</li>
        <li>Press <strong>Tell me</strong> or hit Enter to submit</li>
      </ul>
    `
  },
  2: {
    title: 'Memory Match',
    body: `
      <p>A flip-card matching game — every pair you find unlocks a memory of us ✿</p>
      <ul>
        <li>Tap any card to flip it and reveal its symbol</li>
        <li>Tap a second card — if symbols match, they stay flipped</li>
        <li>If they don't match, both flip back. Remember where they were!</li>
        <li>Find all <strong>8 pairs</strong> to win</li>
        <li>Try to finish in the fewest <strong>moves</strong> possible</li>
      </ul>
    `
  },
  3: {
    title: 'Photo Puzzle',
    body: `
      <p>A scrambled picture of us — drag every piece to its right spot ✿</p>
      <ul>
        <li><strong>Drag</strong> any piece around with your mouse or finger</li>
        <li>When you drop a piece <strong>near its correct spot</strong>, it will snap into place</li>
        <li>Snapped pieces get a soft <strong>green glow</strong> and lock</li>
        <li>Use the <strong>target preview</strong> on the side as your reference</li>
        <li>Tap <strong>↻ shuffle</strong> if you want to start over</li>
      </ul>
    `
  },
  4: {
    title: 'Heart Rain',
    body: `
      <p>Catch the love falling from the sky — fill my heart all the way ♥</p>
      <ul>
        <li>Tap <strong>pink hearts</strong> — each one fills my heart</li>
        <li><strong>Avoid</strong> the dark ✗ hearts — they don't count</li>
        <li>You have <strong>35 seconds</strong> to catch <strong>15 hearts</strong></li>
        <li>The hearts fall slowly and are nice and big — easy to tap ✿</li>
      </ul>
    `
  },
  5: {
    title: 'Constellation of Love',
    body: `
      <p>Connect the glowing stars in order to draw the shape of us ✦</p>
      <ul>
        <li>Tap the star marked <strong>①</strong> first — it glows gold</li>
        <li>Follow the numbers <strong>in order</strong>, one star at a time</li>
        <li>A shining line draws between each pair of stars</li>
        <li>Complete every star to reveal our <strong>heart constellation</strong> ♥</li>
        <li>Tap <strong>↻ restart</strong> any time to begin again</li>
      </ul>
    `
  }
};

let pendingLevel = null;

function showInstructions(level){
  const data = INSTRUCTIONS[level];
  if(!data) return;
  pendingLevel = level;
  $('#instrTag').textContent = `Level ${level}`;
  $('#instrTitle').textContent = data.title;
  $('#instrBody').innerHTML = data.body;
  $('#instrOverlay').classList.add('show');
}
function hideInstructions(){
  $('#instrOverlay').classList.remove('show');
  if(pendingLevel){
    const lvl = pendingLevel;
    pendingLevel = null;
    setTimeout(()=> goTo('screen-l'+lvl), 250);
  }
}
document.addEventListener('DOMContentLoaded', () => {
  const btn = $('#btnInstrStart');
  if(btn) btn.addEventListener('click', hideInstructions);
});

const LOVE_LETTER = `My dearest [NAME],

I made all of this — the path, the games, the silly puzzles — for one reason. To say what I sometimes forget to say out loud.

You are my favorite chapter of every day. The quiet ones, the loud ones, the ones where I forget my keys and you laugh at me anyway.

Thank you for being mine.
I love you. Forever and a day. ✿`;

/* ============== Sound (Howler) ============== */
let bgm = null;
const sfx = {};

function initAudio(){
  try{
    bgm = new Howl({
      src: ['assets/sounds/bgm.mp3'],
      loop: true,
      volume: 0.3,
      html5: true,
    });
    sfx.click   = new Howl({ src:['assets/sounds/click.mp3'],   volume:0.4 });
    sfx.correct = new Howl({ src:['assets/sounds/correct.mp3'], volume:0.5 });
    sfx.wrong   = new Howl({ src:['assets/sounds/wrong.mp3'],   volume:0.3 });
    sfx.sparkle = new Howl({ src:['assets/sounds/sparkle.mp3'], volume:0.5 });
    sfx.reveal  = new Howl({ src:['assets/sounds/reveal.mp3'],  volume:0.6 });
    sfx.flip    = new Howl({ src:['assets/sounds/click.mp3'],   volume:0.3 });
  }catch(e){ console.warn('Audio init failed', e); }
}

// Web Audio API — built-in cool sounds (no MP3 needed)
let audioCtx;
function getCtx(){
  if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// Single tone with envelope
function _tone(freq, dur, type='sine', vol=0.15, when=0, attack=0.005, decay=null){
  if(!state.soundOn) return;
  try{
    const ctx = getCtx();
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }catch(e){}
}

// Frequency-swept tone (for swoosh/glide)
function _glide(f1, f2, dur, type='sine', vol=0.15, when=0){
  if(!state.soundOn) return;
  try{
    const ctx = getCtx();
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f1, t0);
    o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }catch(e){}
}

// Noise burst (for soft "tap" sounds)
function _noiseTap(dur=0.08, vol=0.06){
  if(!state.soundOn) return;
  try{
    const ctx = getCtx();
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<bufferSize;i++){
      data[i] = (Math.random()*2 - 1) * (1 - i/bufferSize);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2200;
    filter.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(filter); filter.connect(g); g.connect(ctx.destination);
    src.start();
  }catch(e){}
}

// === SFX library — all synthesized ===
const synthSfx = {
  click: () => {
    _noiseTap(0.04, 0.05);
    _tone(900, 0.05, 'sine', 0.08);
  },
  flip: () => {
    _glide(700, 400, 0.12, 'sine', 0.1);
  },
  sparkle: () => {
    // Magical twinkle — 3 fast bell tones rising
    _tone(1200, 0.18, 'sine', 0.10, 0,   0.002);
    _tone(1800, 0.18, 'sine', 0.08, 0.05, 0.002);
    _tone(2400, 0.20, 'sine', 0.06, 0.10, 0.002);
    _tone(2000, 0.15, 'triangle', 0.04, 0.15, 0.005);
  },
  correct: () => {
    // Major arpeggio — feels rewarding
    // C5 - E5 - G5 - C6
    _tone(523, 0.14, 'sine', 0.13, 0);
    _tone(659, 0.14, 'sine', 0.13, 0.1);
    _tone(784, 0.16, 'sine', 0.13, 0.2);
    _tone(1047, 0.32, 'sine', 0.15, 0.3, 0.005);
    // Soft harmonic
    _tone(1568, 0.32, 'sine', 0.06, 0.32, 0.01);
  },
  wrong: () => {
    // Soft "no-no" descending
    _glide(440, 220, 0.22, 'triangle', 0.10);
    _tone(220, 0.15, 'triangle', 0.06, 0.18);
  },
  reveal: () => {
    // Big magical reveal — ascending sweep + bell stack
    _glide(150, 800, 0.5, 'sine', 0.12, 0);
    _tone(523, 0.6, 'sine', 0.10, 0.3, 0.02);   // C
    _tone(659, 0.6, 'sine', 0.10, 0.35, 0.02);  // E
    _tone(784, 0.6, 'sine', 0.10, 0.4, 0.02);   // G
    _tone(1047, 0.7, 'sine', 0.10, 0.5, 0.02);  // C high
    _tone(1568, 0.7, 'sine', 0.05, 0.6, 0.02);  // G high
  },
  heartCatch: () => {
    // Quick pop with a sweet little bell
    _noiseTap(0.04, 0.05);
    _tone(1400, 0.12, 'sine', 0.12, 0, 0.003);
    _tone(2100, 0.10, 'sine', 0.07, 0.02, 0.003);
  },
  heartMiss: () => {
    // Soft thud
    _tone(200, 0.10, 'sine', 0.08);
    _noiseTap(0.06, 0.04);
  },
  levelUnlock: () => {
    // Door-opening "ding"
    _tone(659, 0.15, 'sine', 0.10, 0);
    _tone(880, 0.18, 'sine', 0.10, 0.08);
    _tone(1175, 0.30, 'sine', 0.10, 0.16, 0.005);
  },
  typewriter: () => {
    _noiseTap(0.02, 0.03);
  },
};

function playSfx(name){
  if(!state.soundOn) return;
  // Prefer file-based sound if loaded successfully
  if(sfx[name] && sfx[name].state && sfx[name].state() === 'loaded'){
    sfx[name].play();
    return;
  }
  // Fall back to synthesized version
  if(synthSfx[name]) synthSfx[name]();
}

function enableSound(){
  if(state.soundOn) return;
  state.soundOn = true;
  $('#soundToggle').classList.remove('muted');
  if(bgm && bgm.state() === 'loaded') bgm.play();
}
function disableSound(){
  state.soundOn = false;
  $('#soundToggle').classList.add('muted');
  if(bgm) bgm.pause();
}

$('#soundToggle').addEventListener('click', () => {
  if(state.soundOn) disableSound(); else enableSound();
});

// Auto-enable on first interaction
function firstInteract(){
  if(!state.soundOn) enableSound();
  window.removeEventListener('click', firstInteract);
  window.removeEventListener('touchstart', firstInteract);
}
window.addEventListener('click', firstInteract);
window.addEventListener('touchstart', firstInteract);

/* ============== Particles ============== */
function spawnParticle(){
  const wrap = $('#particles');
  const d = document.createElement('div');
  const cls = Math.random() < .3 ? ' warm' : (Math.random() < .3 ? ' rose' : '');
  d.className = 'dot' + cls;
  d.style.left = Math.random()*100 + '%';
  d.style.animationDuration = (8 + Math.random()*12) + 's';
  wrap.appendChild(d);
  setTimeout(()=>d.remove(), 22000);
}
function startParticles(){
  for(let i=0;i<8;i++) setTimeout(spawnParticle, i*400);
  setInterval(spawnParticle, 600);
}

/* ============== LocalStorage ============== */
function save(){
  try{
    localStorage.setItem('lq_state', JSON.stringify({
      name: state.name,
      completed: [...state.completed],
      quizAnswers: state.quizAnswers,
    }));
  }catch(e){}
}
function load(){
  try{
    const raw = localStorage.getItem('lq_state');
    if(!raw) return;
    const obj = JSON.parse(raw);
    state.name = obj.name || '';
    state.completed = new Set(obj.completed || []);
    state.quizAnswers = obj.quizAnswers || [];
  }catch(e){}
}

/* ============== Screen transitions (GSAP) ============== */
function goTo(id){
  if(state.current === id) return;
  playSfx('click');
  const cur = $('#'+state.current);
  const next = $('#'+id);
  if(!next) return;

  gsap.to(cur, {
    opacity: 0,
    duration: 0.5,
    ease: 'power2.in',
    onComplete: () => {
      cur.classList.remove('active');
      gsap.set(cur, { opacity: 1 });
      next.classList.add('active');
      gsap.fromTo(next, { opacity: 0 }, { opacity: 1, duration: 0.7, ease: 'power2.out' });
      // Animate content in
      const items = $$('.kicker, .display, .display-md, .lede, .cta, .input-row, .hint-text, .micro, .quiz-card', next);
      gsap.fromTo(items, 
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7, stagger: 0.08, ease: 'power3.out', delay: 0.1 }
      );
      state.current = id;
      window.scrollTo(0,0);

      // Hook into specific screens
      if(id === 'screen-map') onEnterMap();
      if(id === 'screen-l2') initMemory();
      if(id === 'screen-l3') initPuzzle();
      if(id === 'screen-l5') initConstellation();
      if(id === 'screen-surprise') triggerSurprise();
    }
  });
}

/* ============== Intro → Name → Map ============== */
$('#btnIntroStart').addEventListener('click', () => {
  // Big intro animation before transition
  gsap.to('#screen-intro .intro-wrap', {
    scale: 1.05, opacity: 0.7, duration: 0.4, ease: 'power2.in',
    onComplete: () => goTo('screen-name')
  });
});

$('#btnNameNext').addEventListener('click', submitName);
$('#userName').addEventListener('keypress', e => { if(e.key === 'Enter') submitName(); });
function submitName(){
  const v = $('#userName').value.trim();
  if(!v){ $('#userName').focus(); return; }
  state.name = v;
  save();
  $('#nameDisplay').textContent = v;
  goTo('screen-map');
}

/* ============== Map ============== */
function updateMapState(){
  $$('.stone').forEach(s => {
    const lvl = parseInt(s.dataset.level);
    s.classList.remove('locked','unlocked','completed');
    if(state.completed.has(lvl)){
      s.classList.add('completed');
    } else if(lvl === 1 || state.completed.has(lvl-1)){
      s.classList.add('unlocked');
    } else {
      s.classList.add('locked');
    }
  });
  $('#progressCount').textContent = state.completed.size;
  // Update path progress (stroke-dashoffset)
  const progressPath = $('#progressPath');
  const ratio = state.completed.size / TOTAL_LEVELS;
  gsap.to(progressPath, {
    strokeDashoffset: 1500 * (1 - ratio),
    duration: 1.2, ease: 'power2.inOut'
  });
  // Enable surprise button only when all 5 done
  $('#btnSurprise').disabled = state.completed.size < TOTAL_LEVELS;
}
function onEnterMap(){
  updateMapState();
  // Animate stones in
  gsap.fromTo('.stone', 
    { scale: 0, opacity: 0 },
    { scale: 1, opacity: 1, duration: 0.6, stagger: 0.12, ease: 'back.out(1.7)', delay: 0.4 }
  );
  startMapDecor();
  moveBunnyToProgress();
}

// Bunny stops along the path matching her current level
const BUNNY_POSITIONS = [
  { x: '10%', y: '80%' },  // start (level 1 not done)
  { x: '28%', y: '53%' },  // after level 1 -> at level 2 stone
  { x: '50%', y: '37%' },  // after level 2
  { x: '72%', y: '47%' },  // after level 3
  { x: '90%', y: '20%' },  // after level 4
  { x: '95%', y: '12%' },  // all done — past the last stone
];
function moveBunnyToProgress(){
  const b = $('#mapBunny');
  if(!b) return;
  const pos = BUNNY_POSITIONS[state.completed.size] || BUNNY_POSITIONS[0];
  // Smooth hop transition
  setTimeout(()=>{
    b.style.setProperty('--x', pos.x);
    b.style.setProperty('--y', pos.y);
  }, 600);
}

// Map decorative creatures + petals
let decorIntervals = [];
function startMapDecor(){
  stopMapDecor();
  const wrap = $('#mapDecor');
  if(!wrap) return;
  wrap.innerHTML = '';

  // Floating butterflies/birds
  decorIntervals.push(setInterval(() => {
    if(state.current !== 'screen-map') return;
    const c = document.createElement('div');
    c.className = 'deco-creature';
    c.textContent = ['🦋','🐦','🌸','✿'][Math.floor(Math.random()*4)];
    c.style.top = (15 + Math.random()*55) + '%';
    c.style.animationDuration = (14 + Math.random()*10) + 's';
    c.style.fontSize = (18 + Math.random()*14) + 'px';
    wrap.appendChild(c);
    setTimeout(() => c.remove(), 26000);
  }, 4500));

  // Falling petals
  decorIntervals.push(setInterval(() => {
    if(state.current !== 'screen-map') return;
    const p = document.createElement('div');
    p.className = 'deco-petal';
    p.style.left = Math.random()*100 + '%';
    p.style.animationDuration = (9 + Math.random()*7) + 's';
    p.style.transform = `scale(${.6 + Math.random()*.9})`;
    wrap.appendChild(p);
    setTimeout(() => p.remove(), 17000);
  }, 800));

  // Initial burst
  for(let i = 0; i < 5; i++){
    setTimeout(() => {
      const p = document.createElement('div');
      p.className = 'deco-petal';
      p.style.left = Math.random()*100 + '%';
      p.style.animationDuration = (9 + Math.random()*7) + 's';
      wrap.appendChild(p);
      setTimeout(() => p.remove(), 17000);
    }, i * 300);
  }
}
function stopMapDecor(){
  decorIntervals.forEach(clearInterval);
  decorIntervals = [];
}

$$('.stone').forEach(s => {
  s.addEventListener('click', () => {
    if(s.classList.contains('locked')){
      playSfx('wrong');
      gsap.fromTo(s, { x: 0 }, { x: 6, duration: 0.06, repeat: 5, yoyo: true, ease: 'power1.inOut', onComplete: () => gsap.set(s, {x:0}) });
      return;
    }
    const lvl = parseInt(s.dataset.level);
    // Show instructions modal first
    showInstructions(lvl);
  });
});

$('#btnSurprise').addEventListener('click', () => {
  if(state.completed.size >= TOTAL_LEVELS){
    playSfx('reveal');
    goTo('screen-surprise');
  }
});

document.addEventListener('click', e => {
  const back = e.target.closest('[data-back]');
  if(back) goTo(back.dataset.back);
});

function completeLevel(n){
  state.completed.add(n);
  save();
  setTimeout(() => {
    goTo('screen-map');
    setTimeout(() => {
      // Celebration on map
      celebrateLevel(n);
    }, 800);
  }, 1400);
}

function celebrateLevel(n){
  const stone = $(`.stone[data-level="${n}"]`);
  if(!stone) return;
  // Burst confetti from stone position
  const rect = stone.getBoundingClientRect();
  if(window.confetti){
    confetti({
      particleCount: 80,
      spread: 80,
      origin: { x: (rect.left+rect.width/2)/window.innerWidth, y: (rect.top+rect.height/2)/window.innerHeight },
      colors: ['#ffd29c','#ff9ec4','#c8a8e8','#ff5a8a','#fbf6ef'],
      scalar: 0.95,
      ticks: 120,
    });
  }
  playSfx('levelUnlock');
}

/* =========================================================
   LEVEL 1 — Word Whisper
   ========================================================= */
let l1Tries = 0;
$('#btnL1Submit').addEventListener('click', l1Check);
$('#l1Answer').addEventListener('keypress', e => { if(e.key === 'Enter') l1Check(); });

function l1Check(){
  const v = ($('#l1Answer').value || '').trim().toLowerCase().replace(/[^a-z]/g,'');
  const err = $('#l1Error');
  if(!v){ err.textContent = 'whisper something for me ♥'; return; }
  const ok = ALLOWED_NAMES.some(a => v === a || v.includes(a));
  if(ok){
    playSfx('correct');
    err.style.color = '#a7f3d0';
    err.textContent = '✓ yes that\'s you ♥';
    gsap.fromTo('#l1Answer', { scale: 1 }, { scale: 1.05, duration: 0.3, yoyo: true, repeat: 1, ease: 'power2.inOut' });
    completeLevel(1);
    $('#l1Answer').value = '';
    l1Tries = 0;
  } else {
    l1Tries++;
    playSfx('wrong');
    err.style.color = '#ff9ec4';
    if(l1Tries >= 3){
      err.textContent = LEVEL1_HINT;
    } else {
      err.textContent = `try again (${3-l1Tries} ${3-l1Tries === 1 ? 'try' : 'tries'} left)`;
    }
    gsap.fromTo('#l1Answer', { x: 0 }, { x: 8, duration: 0.06, repeat: 5, yoyo: true, ease: 'power1.inOut', onComplete: () => gsap.set('#l1Answer', {x:0}) });
  }
}

/* =========================================================
   LEVEL 2 — Memory Match
   ========================================================= */
const MEMORY_SYMBOLS = ['♥','✿','★','☾','✦','♡','❀','✧'];
let memoryDeck = [];
let memoryFlipped = [];
let memoryMatched = 0;
let memoryMoves = 0;
let memoryTimer = 0;
let memoryInterval = null;
let memoryLock = false;

function initMemory(){
  // Reset
  memoryMatched = 0;
  memoryMoves = 0;
  memoryTimer = 0;
  memoryFlipped = [];
  memoryLock = false;
  clearInterval(memoryInterval);
  $('#l2Moves').textContent = '0';
  $('#l2Pairs').textContent = '0';
  $('#l2Time').textContent = '0:00';

  // Build deck (8 pairs = 16 cards)
  memoryDeck = [...MEMORY_SYMBOLS, ...MEMORY_SYMBOLS].sort(() => Math.random() - .5);

  const grid = $('#memoryGrid');
  grid.innerHTML = '';
  memoryDeck.forEach((sym, idx) => {
    const card = document.createElement('div');
    card.className = 'mcard';
    card.dataset.idx = idx;
    card.dataset.sym = sym;
    card.innerHTML = `
      <div class="mcard-face mcard-back"></div>
      <div class="mcard-face mcard-front">${sym}</div>
    `;
    card.addEventListener('click', () => flipCard(card));
    grid.appendChild(card);
  });

  // Animate cards in (clearProps so flip transform isn't overridden)
  gsap.from('.mcard',
    { scale: 0, opacity: 0, duration: 0.5, stagger: { each: 0.04, from: 'random' }, ease: 'back.out(1.5)',
      clearProps: 'all' }
  );

  // Start timer
  memoryInterval = setInterval(() => {
    memoryTimer++;
    const m = Math.floor(memoryTimer/60), s = memoryTimer%60;
    $('#l2Time').textContent = `${m}:${s.toString().padStart(2,'0')}`;
  }, 1000);
}

function flipCard(card){
  if(memoryLock) return;
  if(card.classList.contains('flipped') || card.classList.contains('matched')) return;
  card.classList.add('flipped');
  playSfx('flip');
  memoryFlipped.push(card);

  if(memoryFlipped.length === 2){
    memoryMoves++;
    $('#l2Moves').textContent = memoryMoves;
    memoryLock = true;
    const [a,b] = memoryFlipped;
    if(a.dataset.sym === b.dataset.sym){
      // Match
      setTimeout(() => {
        a.classList.add('matched');
        b.classList.add('matched');
        memoryFlipped = [];
        memoryLock = false;
        memoryMatched++;
        $('#l2Pairs').textContent = memoryMatched;
        playSfx('sparkle');
        if(memoryMatched === 8){
          clearInterval(memoryInterval);
          playSfx('correct');
          setTimeout(() => completeLevel(2), 800);
        }
      }, 400);
    } else {
      setTimeout(() => {
        a.classList.remove('flipped');
        b.classList.remove('flipped');
        memoryFlipped = [];
        memoryLock = false;
      }, 900);
    }
  }
}

/* =========================================================
   LEVEL 3 — SVG Jigsaw Puzzle (real tabs & notches)
   ========================================================= */
const PUZZLE_N = 3;                   // grid size (3x3)
const PUZZLE_VIEW = 600;              // viewBox size
const PUZZLE_CELL = 160;              // visual cell size in viewBox units
const PUZZLE_TAB  = 30;               // tab/notch size
const PUZZLE_AREA = PUZZLE_CELL * PUZZLE_N;  // 480
const PUZZLE_OFFSET = (PUZZLE_VIEW - PUZZLE_AREA) / 2;  // 60 — board margin
const SNAP_DIST = 36;

let puzzleImage = null;
let puzzleEdges = [];   // [r][c] = { top, right, bottom, left }
let puzzlePieces = [];  // [{ row, col, x, y, correctX, correctY, placed, el }]
let dragPiece = null;
let dragOffset = { x:0, y:0 };
let puzzleSvg = null;

function loadPuzzleImage(){
  return new Promise((resolve) => {
    if(puzzleImage){ resolve(puzzleImage); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { puzzleImage = img; resolve(img); };
    img.onerror = () => {
      const fb = new Image();
      fb.onload = () => { puzzleImage = fb; resolve(fb); };
      fb.src = makePuzzleDataURL();
    };
    img.src = 'assets/images/puzzle/puzzle.png';
  });
}

/**
 * Build a jigsaw piece outline path.
 * Each side is either flat (0), tab outward (+1), or notch inward (-1).
 * Returns an SVG `d` attribute string starting at (0,0).
 */
function jigsawPath(edges){
  const s = PUZZLE_CELL;
  const t = PUZZLE_TAB;
  // Bezier helper for a tab/notch in the middle of a side.
  // Each side is 3 segments: edge to 35%, tab/notch curve, 65% to edge.
  let d = `M 0 0 `;

  // ---- TOP ----
  d += `L ${s*0.35} 0 `;
  if(edges.top !== 0){
    const sign = -edges.top; // +1 tab = pokes UP (out of cell = negative y)
    // Bezier arch
    d += `C ${s*0.30} ${t*sign*0.6}, ${s*0.25} ${t*sign*1.4}, ${s*0.4} ${t*sign*1.4} `;
    d += `C ${s*0.45} ${t*sign*1.5}, ${s*0.55} ${t*sign*1.5}, ${s*0.6} ${t*sign*1.4} `;
    d += `C ${s*0.75} ${t*sign*1.4}, ${s*0.70} ${t*sign*0.6}, ${s*0.65} 0 `;
  } else {
    d += `L ${s*0.65} 0 `;
  }
  d += `L ${s} 0 `;

  // ---- RIGHT ----
  d += `L ${s} ${s*0.35} `;
  if(edges.right !== 0){
    const sign = edges.right; // +1 tab pokes RIGHT (+x)
    d += `C ${s + t*sign*0.6} ${s*0.30}, ${s + t*sign*1.4} ${s*0.25}, ${s + t*sign*1.4} ${s*0.4} `;
    d += `C ${s + t*sign*1.5} ${s*0.45}, ${s + t*sign*1.5} ${s*0.55}, ${s + t*sign*1.4} ${s*0.6} `;
    d += `C ${s + t*sign*1.4} ${s*0.75}, ${s + t*sign*0.6} ${s*0.70}, ${s} ${s*0.65} `;
  } else {
    d += `L ${s} ${s*0.65} `;
  }
  d += `L ${s} ${s} `;

  // ---- BOTTOM ----
  d += `L ${s*0.65} ${s} `;
  if(edges.bottom !== 0){
    const sign = edges.bottom; // +1 tab pokes DOWN (+y)
    d += `C ${s*0.70} ${s + t*sign*0.6}, ${s*0.75} ${s + t*sign*1.4}, ${s*0.6} ${s + t*sign*1.4} `;
    d += `C ${s*0.55} ${s + t*sign*1.5}, ${s*0.45} ${s + t*sign*1.5}, ${s*0.4} ${s + t*sign*1.4} `;
    d += `C ${s*0.25} ${s + t*sign*1.4}, ${s*0.30} ${s + t*sign*0.6}, ${s*0.35} ${s} `;
  } else {
    d += `L ${s*0.35} ${s} `;
  }
  d += `L 0 ${s} `;

  // ---- LEFT ----
  d += `L 0 ${s*0.65} `;
  if(edges.left !== 0){
    const sign = -edges.left; // +1 tab pokes LEFT (-x)
    d += `C ${t*sign*0.6} ${s*0.70}, ${t*sign*1.4} ${s*0.75}, ${t*sign*1.4} ${s*0.6} `;
    d += `C ${t*sign*1.5} ${s*0.55}, ${t*sign*1.5} ${s*0.45}, ${t*sign*1.4} ${s*0.4} `;
    d += `C ${t*sign*1.4} ${s*0.25}, ${t*sign*0.6} ${s*0.30}, 0 ${s*0.35} `;
  } else {
    d += `L 0 ${s*0.35} `;
  }
  d += `Z`;
  return d;
}

async function initPuzzle(){
  puzzleSvg = $('#puzzleSvg');
  puzzleSvg.innerHTML = '';
  $('#l3Solved').textContent = '0';

  const img = await loadPuzzleImage();

  // === Build edge configuration ===
  // Adjacent pieces must have OPPOSITE tabs (one pokes out, other dents in).
  puzzleEdges = [];
  for(let r=0; r<PUZZLE_N; r++){
    puzzleEdges[r] = [];
    for(let c=0; c<PUZZLE_N; c++){
      const top    = (r === 0) ? 0 : -puzzleEdges[r-1][c].bottom;
      const left   = (c === 0) ? 0 : -puzzleEdges[r][c-1].right;
      const right  = (c === PUZZLE_N-1) ? 0 : (Math.random() < 0.5 ? 1 : -1);
      const bottom = (r === PUZZLE_N-1) ? 0 : (Math.random() < 0.5 ? 1 : -1);
      puzzleEdges[r][c] = { top, right, bottom, left };
    }
  }

  // === SVG defs: one clipPath + one image-pattern per piece ===
  const NS = 'http://www.w3.org/2000/svg';
  const defs = document.createElementNS(NS, 'defs');

  // Build a single big <image> reference we'll reuse via pattern
  // We use 1 image per piece via patterns so each can show the correct slice.

  for(let r=0; r<PUZZLE_N; r++){
    for(let c=0; c<PUZZLE_N; c++){
      const pid = `p${r}${c}`;

      // Pattern for this piece: shows the correct slice of the image,
      // scaled so the piece's local (0,0)-(s,s) area aligns with the image slice.
      const pattern = document.createElementNS(NS, 'pattern');
      pattern.setAttribute('id', `pat-${pid}`);
      pattern.setAttribute('patternUnits', 'userSpaceOnUse');
      pattern.setAttribute('x', `-${c * PUZZLE_CELL}`);
      pattern.setAttribute('y', `-${r * PUZZLE_CELL}`);
      pattern.setAttribute('width', `${PUZZLE_AREA}`);
      pattern.setAttribute('height', `${PUZZLE_AREA}`);

      const im = document.createElementNS(NS, 'image');
      im.setAttribute('href', img.src);
      im.setAttribute('x', '0'); im.setAttribute('y', '0');
      im.setAttribute('width', `${PUZZLE_AREA}`);
      im.setAttribute('height', `${PUZZLE_AREA}`);
      im.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      pattern.appendChild(im);
      defs.appendChild(pattern);
    }
  }
  puzzleSvg.appendChild(defs);

  // === Draw the empty slot outlines on the board ===
  for(let r=0; r<PUZZLE_N; r++){
    for(let c=0; c<PUZZLE_N; c++){
      const slot = document.createElementNS(NS, 'path');
      slot.setAttribute('class', 'jslot');
      slot.setAttribute('d', jigsawPath(puzzleEdges[r][c]));
      slot.setAttribute('transform',
        `translate(${PUZZLE_OFFSET + c*PUZZLE_CELL}, ${PUZZLE_OFFSET + r*PUZZLE_CELL})`);
      puzzleSvg.appendChild(slot);
    }
  }

  // === Build pieces, scattered around the board ===
  puzzlePieces = [];
  // Generate scatter positions OUTSIDE the board area but inside viewBox
  const slots = [];
  const margin = 8;
  // Left side scatter
  for(let i=0;i<3;i++) slots.push({ x: margin, y: PUZZLE_OFFSET + i*PUZZLE_CELL });
  // Right side scatter (account for tab overhang)
  for(let i=0;i<3;i++) slots.push({ x: PUZZLE_OFFSET + PUZZLE_AREA + 12, y: PUZZLE_OFFSET + i*PUZZLE_CELL });
  // Top
  for(let i=0;i<2;i++) slots.push({ x: PUZZLE_OFFSET + 30 + i*180, y: 8 });
  // Bottom
  for(let i=0;i<2;i++) slots.push({ x: PUZZLE_OFFSET + 30 + i*180, y: PUZZLE_OFFSET + PUZZLE_AREA + 8 });
  // Shuffle scatter positions
  for(let i=slots.length-1;i>0;i--){
    const j = Math.floor(Math.random() * (i+1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }

  let scatterIdx = 0;
  const orderedRC = [];
  for(let r=0; r<PUZZLE_N; r++)
    for(let c=0; c<PUZZLE_N; c++)
      orderedRC.push({ r, c });
  // Shuffle which piece goes to which scatter slot
  for(let i=orderedRC.length-1;i>0;i--){
    const j = Math.floor(Math.random() * (i+1));
    [orderedRC[i], orderedRC[j]] = [orderedRC[j], orderedRC[i]];
  }

  orderedRC.forEach(({ r, c }) => {
    const correctX = PUZZLE_OFFSET + c * PUZZLE_CELL;
    const correctY = PUZZLE_OFFSET + r * PUZZLE_CELL;
    const start = slots[scatterIdx % slots.length];
    scatterIdx++;

    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'jpiece');
    g.setAttribute('transform', `translate(${start.x}, ${start.y})`);
    g.dataset.r = r; g.dataset.c = c;
    g.dataset.correctX = correctX;
    g.dataset.correctY = correctY;

    // Filled with the pattern (the image slice for this piece)
    const fill = document.createElementNS(NS, 'path');
    fill.setAttribute('d', jigsawPath(puzzleEdges[r][c]));
    fill.setAttribute('fill', `url(#pat-p${r}${c})`);
    g.appendChild(fill);

    // Outline on top
    const stroke = document.createElementNS(NS, 'path');
    stroke.setAttribute('class', 'piece-outline');
    stroke.setAttribute('d', jigsawPath(puzzleEdges[r][c]));
    g.appendChild(stroke);

    g.addEventListener('mousedown', (e) => startDrag(e, g));
    g.addEventListener('touchstart', (e) => startDrag(e, g), { passive:false });

    puzzleSvg.appendChild(g);
    puzzlePieces.push({ row: r, col: c, x: start.x, y: start.y, correctX, correctY, placed: false, el: g });
  });

  // Window-level move/end (capture once)
  if(!puzzleSvg._dragHooked){
    puzzleSvg._dragHooked = true;
    window.addEventListener('mousemove', moveDrag);
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchmove', moveDrag, { passive:false });
    window.addEventListener('touchend', endDrag);
  }
}

function svgPoint(clientX, clientY){
  const rect = puzzleSvg.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width)  * PUZZLE_VIEW;
  const y = ((clientY - rect.top)  / rect.height) * PUZZLE_VIEW;
  return { x, y };
}

function startDrag(e, g){
  if(g.classList.contains('locked')) return;
  e.preventDefault();
  const t = e.touches ? e.touches[0] : e;
  const pt = svgPoint(t.clientX, t.clientY);
  const piece = puzzlePieces.find(p => p.el === g);
  if(!piece) return;
  dragPiece = piece;
  dragOffset.x = pt.x - piece.x;
  dragOffset.y = pt.y - piece.y;
  g.classList.add('dragging');
  // Bring to front: re-append
  puzzleSvg.appendChild(g);
  playSfx('flip');
}

function moveDrag(e){
  if(!dragPiece) return;
  e.preventDefault();
  const t = e.touches ? e.touches[0] : e;
  const pt = svgPoint(t.clientX, t.clientY);
  dragPiece.x = pt.x - dragOffset.x;
  dragPiece.y = pt.y - dragOffset.y;
  dragPiece.el.setAttribute('transform', `translate(${dragPiece.x}, ${dragPiece.y})`);
}

function endDrag(){
  if(!dragPiece) return;
  dragPiece.el.classList.remove('dragging');
  const dx = dragPiece.x - dragPiece.correctX;
  const dy = dragPiece.y - dragPiece.correctY;
  const dist = Math.hypot(dx, dy);
  if(dist < SNAP_DIST){
    // Snap into place
    dragPiece.x = dragPiece.correctX;
    dragPiece.y = dragPiece.correctY;
    dragPiece.el.setAttribute('transform', `translate(${dragPiece.x}, ${dragPiece.y})`);
    if(!dragPiece.placed){
      dragPiece.placed = true;
      dragPiece.el.classList.add('locked');
      playSfx('sparkle');
      const solved = puzzlePieces.filter(p => p.placed).length;
      $('#l3Solved').textContent = solved;
      if(solved >= 9){
        playSfx('correct');
        if(window.confetti){
          const r = puzzleSvg.getBoundingClientRect();
          confetti({
            particleCount: 80,
            spread: 70,
            origin: {
              x: (r.left + r.width/2) / window.innerWidth,
              y: (r.top + r.height/2) / window.innerHeight
            },
            colors: ['#ffd29c','#ff9ec4','#c8a8e8'],
          });
        }
        setTimeout(() => completeLevel(3), 1200);
      }
    }
  }
  dragPiece = null;
}

const _l3Reset = $('#l3Reset');
if(_l3Reset){
  _l3Reset.addEventListener('click', () => { playSfx('click'); initPuzzle(); });
}

/* =========================================================
   LEVEL 4 — Heart Rain (BIG, easy to click)
   ========================================================= */
const RAIN_TARGET = 15;     // fewer to get (was 20)
const RAIN_TIME = 35;       // more time (was 30)
let rainScore = 0;
let rainMiss = 0;
let rainTime = RAIN_TIME;
let rainSpawn = null;
let rainCountdown = null;
let rainActive = false;

$('#btnL4Start').addEventListener('click', startRain);

function startRain(){
  rainScore = 0; rainMiss = 0; rainTime = RAIN_TIME;
  rainActive = true;
  $('#l4Score').textContent = '0';
  $('#l4Miss').textContent = '0';
  $('#l4Timer').textContent = RAIN_TIME;
  $('#btnL4Start').style.display = 'none';
  $('#rainZone').classList.add('active');
  updateHeartFill(0);

  // Update HUD target text
  const headerEl = document.querySelector('#screen-l4 .display-md');
  if(headerEl) headerEl.innerHTML = `Catch enough love<br/>to fill my heart`;

  // Spawn first burst right away so she can start clicking
  for(let i=0; i<3; i++) setTimeout(spawnFalling, i*150);

  rainSpawn = setInterval(spawnFalling, 700);
  rainCountdown = setInterval(() => {
    rainTime--;
    $('#l4Timer').textContent = rainTime;
    if(rainTime <= 0) endRain();
  }, 1000);
}

function spawnFalling(){
  if(!rainActive) return;
  const zone = $('#rainZone');
  // Only 12% chance for bad hearts (was 20%) — feels nicer
  const isBad = Math.random() < 0.12;
  const h = document.createElement('button');
  h.className = 'fheart ' + (isBad ? 'bad' : 'good');
  h.textContent = isBad ? '✗' : '♥';
  // Random size variation for visual interest — but all are large
  const sizeClass = Math.random() < 0.3 ? 'huge' : (Math.random() < 0.5 ? 'big' : 'medium');
  h.classList.add(sizeClass);
  // Keep away from screen edges so they're always reachable
  h.style.left = (8 + Math.random()*82) + '%';
  // SLOWER fall — much easier to click
  h.style.animationDuration = (5 + Math.random()*2.5) + 's';
  // Small horizontal drift for fun
  const drift = (Math.random() - 0.5) * 60;
  h.style.setProperty('--drift', drift + 'px');

  h.addEventListener('pointerdown', e => {
    e.stopPropagation();
    if(!rainActive) return;
    if(isBad){
      h.classList.add('popped');
      playSfx('heartMiss');
      rainMiss++;
      $('#l4Miss').textContent = rainMiss;
      // Shake the miss counter
      gsap.fromTo('#l4Miss', { x: 0 }, { x: 6, duration: 0.05, repeat: 3, yoyo: true });
    } else {
      h.classList.add('popped');
      playSfx('heartCatch');
      rainScore++;
      $('#l4Score').textContent = rainScore;
      updateHeartFill(rainScore / RAIN_TARGET);
      // Burst tiny hearts on click position
      burstMiniHearts(e.clientX, e.clientY);
      if(rainScore >= RAIN_TARGET) endRain(true);
    }
  }, { once: true });

  zone.appendChild(h);
  // Auto remove after animation
  setTimeout(() => { if(h.parentNode) h.remove(); }, 8000);
}

function burstMiniHearts(x, y){
  for(let i=0;i<6;i++){
    const m = document.createElement('div');
    m.className = 'mini-burst';
    m.textContent = '♥';
    m.style.left = x + 'px';
    m.style.top = y + 'px';
    const ang = (Math.PI*2 * i / 6) + (Math.random()-0.5);
    const dist = 30 + Math.random()*40;
    m.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
    m.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
    document.body.appendChild(m);
    setTimeout(() => m.remove(), 700);
  }
}

function updateHeartFill(ratio){
  ratio = Math.min(1, Math.max(0, ratio));
  const rect = $('#heartFillRect');
  const h = 180 * ratio;
  gsap.to(rect, {
    attr: { height: h, y: 180 - h },
    duration: 0.6,
    ease: 'power2.out',
  });
  // Pulse the heart when score increases
  gsap.fromTo('.big-heart-tracker svg',
    { scale: 1 },
    { scale: 1.08, duration: 0.15, yoyo: true, repeat: 1, ease: 'power2.inOut' });
}

function endRain(won){
  rainActive = false;
  clearInterval(rainSpawn);
  clearInterval(rainCountdown);
  $('#rainZone').classList.remove('active');
  setTimeout(() => { $('#rainZone').innerHTML = ''; }, 1000);

  if(won || rainScore >= RAIN_TARGET){
    playSfx('correct');
    completeLevel(4);
  } else {
    $('#btnL4Start').style.display = '';
    $('#btnL4Start').textContent = `Try again (${rainScore} ♥)`;
  }
}

/* =========================================================
   LEVEL 5 — Constellation of Love (connect the stars)
   ========================================================= */
const CONSTEL_NS = 'http://www.w3.org/2000/svg';
const CONSTEL_N = 12;                 // number of stars
let constelPoints = [];               // mapped {x,y}
let constelNext = 0;                  // index of next star to tap
let constelDone = false;

function buildHeartPoints(){
  const pts = [];
  const cx = 220, cy = 210, s = 11;
  for(let i = 0; i < CONSTEL_N; i++){
    // start at the top dip and go clockwise so the draw order looks natural
    const t = -Math.PI/2 - (i / CONSTEL_N) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13*Math.cos(t) - 5*Math.cos(2*t) - 2*Math.cos(3*t) - Math.cos(4*t);
    pts.push({ x: cx + x * s, y: cy - y * s });
  }
  return pts;
}

function initConstellation(){
  const svg = $('#constellationSvg');
  if(!svg) return;
  svg.innerHTML = '';
  constelPoints = buildHeartPoints();
  constelNext = 0;
  constelDone = false;
  $('#constellationStage').classList.remove('complete');
  $('#l5Total').textContent = CONSTEL_N;
  $('#l5Count').textContent = '0';
  $('#l5Hint').textContent = 'tap star ① to begin ✦';

  // --- defs: gradient + glow + heart fill ---
  const defs = document.createElementNS(CONSTEL_NS, 'defs');
  defs.innerHTML = `
    <linearGradient id="constelGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffd29c"/>
      <stop offset="0.5" stop-color="#ff9ec4"/>
      <stop offset="1" stop-color="#c8a8e8"/>
    </linearGradient>
    <filter id="starGlow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="3" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`;
  svg.appendChild(defs);

  // --- heart fill (hidden until complete) ---
  const fillPath = constelPoints.map((p,i) => (i===0?'M':'L') + p.x + ' ' + p.y).join(' ') + ' Z';
  const heartFill = document.createElementNS(CONSTEL_NS, 'path');
  heartFill.setAttribute('id', 'constelHeartFill');
  heartFill.setAttribute('d', fillPath);
  heartFill.setAttribute('fill', 'url(#constelGrad)');
  heartFill.setAttribute('opacity', '0');
  svg.appendChild(heartFill);

  // --- faint guide outline so she can see the shape ---
  const guide = document.createElementNS(CONSTEL_NS, 'path');
  guide.setAttribute('class', 'cline-guide');
  guide.setAttribute('d', fillPath);
  svg.appendChild(guide);

  // group that holds the drawn (glowing) segments
  const drawGroup = document.createElementNS(CONSTEL_NS, 'g');
  drawGroup.setAttribute('id', 'constelDrawn');
  svg.appendChild(drawGroup);

  // --- stars ---
  constelPoints.forEach((p, i) => {
    const g = document.createElementNS(CONSTEL_NS, 'g');
    g.setAttribute('class', 'cstar' + (i === 0 ? ' next' : ''));
    g.dataset.i = i;
    g.setAttribute('transform', `translate(${p.x},${p.y})`);
    g.innerHTML = `
      <circle class="star-hit" r="24"/>
      <circle class="star-ring" r="11"/>
      <circle class="star-core" r="5"/>
      <text class="star-label" y="-17">${i+1}</text>`;
    g.addEventListener('pointerdown', (e) => { e.preventDefault(); tapStar(i); });
    svg.appendChild(g);
  });

  // gentle entrance (opacity only — the <g> already carries a translate transform)
  gsap.fromTo('.cstar',
    { opacity: 0 },
    { opacity: 1, duration: 0.5, stagger: 0.05, ease: 'power2.out' });
}

function tapStar(i){
  if(constelDone) return;
  const stars = $$('.cstar');
  const star = stars[i];
  if(i !== constelNext){
    // wrong order — nudge
    playSfx('wrong');
    star.classList.add('wrong');
    setTimeout(() => star.classList.remove('wrong'), 420);
    return;
  }

  // correct
  playSfx('sparkle');
  star.classList.remove('next');
  star.classList.add('done');

  // draw line from previous star to this one
  if(i > 0) drawConstelLine(constelPoints[i-1], constelPoints[i]);

  constelNext++;
  $('#l5Count').textContent = constelNext;

  if(constelNext < CONSTEL_N){
    stars[constelNext].classList.add('next');
    $('#l5Hint').textContent = `beautiful — now tap star ${numCircle(constelNext+1)}`;
  } else {
    // close the loop and finish
    drawConstelLine(constelPoints[CONSTEL_N-1], constelPoints[0]);
    finishConstellation();
  }
}

function drawConstelLine(a, b){
  const line = document.createElementNS(CONSTEL_NS, 'line');
  line.setAttribute('class', 'cline-draw');
  line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
  line.setAttribute('x2', a.x); line.setAttribute('y2', a.y);
  $('#constelDrawn').appendChild(line);
  gsap.to(line, { attr: { x2: b.x, y2: b.y }, duration: 0.35, ease: 'power2.out' });
}

const CIRCLED = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫'];
function numCircle(n){ return CIRCLED[n-1] || n; }

function finishConstellation(){
  constelDone = true;
  $('#l5Hint').textContent = 'our constellation is complete ♥';
  $('#constellationStage').classList.add('complete');
  playSfx('reveal');
  if(window.confetti){
    const r = $('#constellationSvg').getBoundingClientRect();
    confetti({
      particleCount: 110, spread: 90,
      origin: { x: (r.left + r.width/2)/window.innerWidth, y: (r.top + r.height/2)/window.innerHeight },
      colors: ['#ffd29c','#ff9ec4','#c8a8e8','#ff5a8a','#fbf6ef'],
    });
  }
  setTimeout(() => completeLevel(5), 1500);
}

const _l5Reset = $('#l5Reset');
if(_l5Reset){
  _l5Reset.addEventListener('click', () => { playSfx('click'); initConstellation(); });
}

/* =========================================================
   SURPRISE — parchment letter + photo gallery
   ========================================================= */
const LETTER_SIGN = 'Forever & a day,\nyours ♥';

const GALLERY = [
  { src: 'assets/images/memories/memory-1.JPG',  caption: 'where it all began ✿' },
  { src: 'assets/images/memories/memory-2.JPG',  caption: 'just us ♥' },
  { src: 'assets/images/memories/memory-3.jpeg', caption: 'that laugh of yours' },
  { src: 'assets/images/memories/memory-4.jpeg', caption: 'my favorite view' },
  { src: 'assets/images/memories/memory-5.jpeg', caption: 'every little moment' },
  { src: 'assets/images/memories/memory-6.jpeg', caption: 'forever to go ✦' },
];

let surpriseTimers = [];
function clearSurpriseTimers(){
  surpriseTimers.forEach(t => clearInterval(t) || clearTimeout(t));
  surpriseTimers = [];
}

function showSurpriseStage(which){
  const letter = $('#stageLetter');
  const photos = $('#stagePhotos');
  if(which === 'photos'){
    letter.hidden = true;
    photos.hidden = false;
    initGallery();
    gsap.fromTo('#stagePhotos > *', { y: 28, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.7, stagger: 0.1, ease: 'power3.out' });
  } else {
    photos.hidden = true;
    letter.hidden = false;
    gsap.fromTo('#stageLetter > *', { y: 20, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.6, stagger: 0.08, ease: 'power3.out' });
  }
}

/* floating sparks */
function startSparks(){
  const wrap = $('#surpriseSparks');
  if(!wrap) return;
  wrap.innerHTML = '';
  const spawn = () => {
    if(state.current !== 'screen-surprise'){ return; }
    const s = document.createElement('div');
    s.className = 'spark';
    s.style.left = Math.random()*100 + '%';
    s.style.bottom = '-10px';
    s.style.animationDuration = (5 + Math.random()*5) + 's';
    s.style.opacity = (0.4 + Math.random()*0.6).toFixed(2);
    wrap.appendChild(s);
    setTimeout(() => s.remove(), 10000);
  };
  for(let i=0;i<10;i++) setTimeout(spawn, i*200);
  surpriseTimers.push(setInterval(spawn, 450));
}

function triggerSurprise(){
  clearSurpriseTimers();
  showSurpriseStage('letter');
  $('#surpriseHello').textContent = `For you, ${state.name || 'love'}`;
  startSparks();

  // celebratory confetti burst
  setTimeout(() => {
    if(!window.confetti) return;
    const fire = (particleRatio, opts) => {
      confetti({
        origin: { y: 0.7 },
        colors: ['#ffd29c','#ff9ec4','#c8a8e8','#ff5a8a','#fbf6ef'],
        ...opts,
        particleCount: Math.floor(200 * particleRatio),
      });
    };
    fire(0.25, { spread: 26, startVelocity: 55 });
    fire(0.2,  { spread: 60 });
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
    fire(0.1,  { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
    fire(0.1,  { spread: 120, startVelocity: 45 });
  }, 400);

  // unroll the scroll, pop the wax seal
  const parch = $('#parchment');
  parch.classList.remove('rolling');
  void parch.offsetWidth;           // restart animation
  parch.classList.add('rolling');
  const seal = $('#waxSeal');
  seal.classList.remove('pop');
  surpriseTimers.push(setTimeout(() => seal.classList.add('pop'), 700));

  // typewriter letter (starts after the scroll opens)
  const text = LOVE_LETTER.replace('[NAME]', state.name || 'love');
  const el = $('#letterText');
  const sign = $('#letterSign');
  el.textContent = '';
  el.classList.remove('done');
  sign.classList.remove('show');
  sign.textContent = LETTER_SIGN;
  let i = 0;
  const type = () => {
    if(state.current !== 'screen-surprise') return;
    if(i <= text.length){
      el.textContent = text.slice(0,i);
      const ch = text[i-1];
      i++;
      if(state.soundOn && i % 2 === 0) playSfx('typewriter');
      const delay = ch === '\n' ? 100 : (ch === '.' || ch === ',' ? 50 : 16);
      surpriseTimers.push(setTimeout(type, delay));
    } else {
      el.classList.add('done');
      sign.classList.add('show');
    }
  };
  surpriseTimers.push(setTimeout(type, 1500));
}

/* ===== Gallery ===== */
let galIdx = 0;
let galAuto = null;
function initGallery(){
  galIdx = 0;
  renderGallery(0, false);
  // dots
  const dots = $('#galleryDots');
  dots.innerHTML = '';
  GALLERY.forEach((_, i) => {
    const d = document.createElement('div');
    d.className = 'gdot' + (i === 0 ? ' active' : '');
    d.addEventListener('click', () => goGallery(i));
    dots.appendChild(d);
  });
  // auto-advance
  clearInterval(galAuto);
  galAuto = setInterval(() => {
    if(state.current !== 'screen-surprise' || $('#stagePhotos').hidden){ clearInterval(galAuto); return; }
    goGallery((galIdx + 1) % GALLERY.length);
  }, 1000);
}

function renderGallery(i, animate=true){
  const item = GALLERY[i];
  const img = $('#galleryImg');
  const frame = $('#galleryFrame');
  img.onerror = () => { img.onerror = null; img.src = makePlaceholderDataURL(i+1, `MEMORY · 0${i+1}`); };
  img.src = item.src;
  $('#galleryCaption').textContent = item.caption;
  $$('#galleryDots .gdot').forEach((d, k) => d.classList.toggle('active', k === i));
  if(animate){
    frame.classList.remove('swap');
    void frame.offsetWidth;
    frame.classList.add('swap');
    playSfx('flip');
  }
}

function goGallery(i){
  galIdx = (i + GALLERY.length) % GALLERY.length;
  renderGallery(galIdx, true);
  // reset auto timer so manual nav feels responsive
  clearInterval(galAuto);
  galAuto = setInterval(() => {
    if(state.current !== 'screen-surprise' || $('#stagePhotos').hidden){ clearInterval(galAuto); return; }
    goGallery((galIdx + 1) % GALLERY.length);
  }, 4200);
}

$('#btnSeeMemories').addEventListener('click', () => { playSfx('sparkle'); showSurpriseStage('photos'); });
$('#btnBackToLetter').addEventListener('click', () => { playSfx('click'); showSurpriseStage('letter'); });
$('#galPrev').addEventListener('click', () => goGallery(galIdx - 1));
$('#galNext').addEventListener('click', () => goGallery(galIdx + 1));

$('#btnReplay').addEventListener('click', () => {
  clearSurpriseTimers();
  clearInterval(galAuto);
  state.completed.clear();
  state.quizAnswers = [];
  save();
  updateMapState();
  goTo('screen-intro');
});

/* ============== Init ============== */
load();
loadConfig();
initAudio();
startParticles();

/* ---------- Image fallback (auto-show placeholder if photo missing) ---------- */
function makePlaceholderDataURL(idx, label){
  const palettes = [
    ['#9b6ba8','#ffd2dc','#ffd29c'],
    ['#8c8cc8','#dcc8f0','#ff9ec4'],
    ['#b482aa','#ffd2dc','#c8a8e8'],
    ['#9694b4','#dcd2e6','#ff5a8a'],
    ['#b48cc8','#ffdce6','#ffd29c'],
    ['#a078b4','#f0c8e6','#ff9ec4'],
  ];
  const p = palettes[(idx-1) % palettes.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
    <defs>
      <linearGradient id="g${idx}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${p[0]}"/>
        <stop offset="0.6" stop-color="${p[1]}"/>
        <stop offset="1" stop-color="${p[2]}"/>
      </linearGradient>
      <radialGradient id="b${idx}" cx="0.5" cy="0.6" r="0.6">
        <stop offset="0" stop-color="rgba(255,255,255,0.4)"/>
        <stop offset="1" stop-color="rgba(255,255,255,0)"/>
      </radialGradient>
    </defs>
    <rect width="400" height="400" fill="url(#g${idx})"/>
    <circle cx="200" cy="240" r="180" fill="url(#b${idx})"/>
    <!-- Two stylized heads -->
    <circle cx="155" cy="180" r="34" fill="rgba(255,255,255,0.85)"/>
    <circle cx="245" cy="180" r="34" fill="rgba(255,255,255,0.85)"/>
    <!-- Bodies -->
    <path d="M 110 220 L 200 220 L 215 360 L 95 360 Z" fill="rgba(255,255,255,0.7)"/>
    <path d="M 200 220 L 290 220 L 305 360 L 185 360 Z" fill="rgba(255,255,255,0.7)"/>
    <!-- Heart between them -->
    <path d="M 200 250 C 200 240, 180 230, 175 245 C 170 230, 150 240, 155 255 C 160 270, 200 290, 200 290 C 200 290, 240 270, 245 255 C 250 240, 230 230, 225 245 C 220 230, 200 240, 200 250 Z" fill="#ff5a8a" opacity="0.9"/>
    <!-- Label -->
    <text x="20" y="32" font-family="Inter,sans-serif" font-size="11" font-weight="600" letter-spacing="2" fill="rgba(255,255,255,0.9)">${label}</text>
    <text x="20" y="385" font-family="Inter,sans-serif" font-size="10" fill="rgba(255,255,255,0.7)">replace with your photo</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function makePuzzleDataURL(){
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">
    <defs>
      <linearGradient id="pg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#9b7fc7"/>
        <stop offset="0.4" stop-color="#ff9ec4"/>
        <stop offset="1" stop-color="#ffd29c"/>
      </linearGradient>
    </defs>
    <rect width="600" height="600" fill="url(#pg)"/>
    <circle cx="300" cy="380" r="280" fill="rgba(255,255,255,0.2)"/>
    <!-- Two heads -->
    <circle cx="220" cy="240" r="50" fill="rgba(255,255,255,0.92)"/>
    <circle cx="380" cy="240" r="50" fill="rgba(255,255,255,0.92)"/>
    <!-- Bodies -->
    <path d="M 150 300 L 300 300 L 320 560 L 130 560 Z" fill="rgba(255,255,255,0.78)"/>
    <path d="M 300 300 L 450 300 L 470 560 L 280 560 Z" fill="rgba(255,255,255,0.78)"/>
    <!-- Big heart -->
    <path d="M 300 350 C 300 335, 270 320, 260 340 C 250 320, 220 335, 230 360 C 245 395, 300 430, 300 430 C 300 430, 355 395, 370 360 C 380 335, 350 320, 340 340 C 330 320, 300 335, 300 350 Z" fill="#ff5a8a"/>
    <text x="30" y="50" font-family="Inter,sans-serif" font-size="14" font-weight="700" letter-spacing="3" fill="rgba(255,255,255,0.95)">PUZZLE · YOU &amp; ME</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function installImageFallbacks(){
  // Memory orbit photos
  $$('.orbit-photo img').forEach((img, i) => {
    const idx = i + 1;
    img.addEventListener('error', () => {
      img.src = makePlaceholderDataURL(idx, `MEMORY · 0${idx}`);
    });
    // Trigger error if currently broken (cached failure)
    if(img.complete && img.naturalWidth === 0){
      img.src = makePlaceholderDataURL(idx, `MEMORY · 0${idx}`);
    }
  });
  // Puzzle peek image
  const peek = $('#puzzlePeekImg img');
  if(peek){
    peek.addEventListener('error', () => { peek.src = makePuzzleDataURL(); });
    if(peek.complete && peek.naturalWidth === 0){ peek.src = makePuzzleDataURL(); }
  }
  // Puzzle tiles use background-image; test it with a hidden Image()
  const testImg = new Image();
  testImg.onerror = () => {
    const fallbackBg = `url("${makePuzzleDataURL()}")`;
    document.documentElement.style.setProperty('--puzzle-img', fallbackBg);
    // Override CSS for .pp
    const tag = document.createElement('style');
    tag.textContent = `.pp{background-image:${fallbackBg} !important;}`;
    document.head.appendChild(tag);
  };
  testImg.src = 'assets/images/puzzle/puzzle.png';
}

if(state.name){
  $('#userName').value = state.name;
  $('#nameDisplay').textContent = state.name;
}
$('#soundToggle').classList.add('muted'); // start muted, auto-enables on first tap

// Animate initial screen content
window.addEventListener('load', () => {
  gsap.fromTo('.intro-wrap > *', 
    { y: 30, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.8, stagger: 0.12, ease: 'power3.out' }
  );
  installImageFallbacks();
});
