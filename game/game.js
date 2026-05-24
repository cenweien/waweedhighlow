'use strict';

// ── Supabase config — fill these in after creating your project ───────────────
// Get both values from: supabase.com → project → Settings → API
const SUPABASE_URL      = 'https://oohgpdpawbwuottbvwoq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vaGdwZHBhd2J3dW90dGJ2d29xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0Mjg5ODYsImV4cCI6MjA5NTAwNDk4Nn0.tDi0BB5is5ZcoUoBpW6iHMCGO4f_KV3JG3PP5xKF-1E';

// ── Seeded PRNG (mulberry32) ──────────────────────────────────────────────────

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseSeed() {
  const p = new URLSearchParams(location.search).get('seed');
  return p ? parseInt(p, 10) : (Math.random() * 2 ** 31) | 0;
}

// ── Early-game pool ───────────────────────────────────────────────────────────
// For the first EARLY_ROUNDS rounds, candidates are restricted to an
// "interesting pool" — words not in the top-500 common English words, with
// count >= 200.  After EARLY_ROUNDS the post-early pool is used: the same
// interesting words PLUS all custom TRAP_WORDS, freely mixed.

const EARLY_ROUNDS = 5;

// Top ~500 most common English words (dictionary frequency).
// Words in this set are excluded from the early-game pool so the first few
// rounds always feel engaging, not trivially obvious.
const COMMON_WORDS = new Set([
  // Determiners / articles
  'the','a','an','this','that','these','those','each','every','all','both',
  'either','neither','some','any','many','much','more','most','few','less',
  'several','enough','other','another','such','whatever','whichever',

  // Personal pronouns & possessives
  'i','you','he','she','it','we','they','me','him','her','us','them',
  'my','your','his','its','our','their','mine','yours','hers','ours','theirs',
  'myself','yourself','himself','herself','itself','ourselves','themselves',
  'who','whom','whose','which','what','whoever','one',

  // Question words
  'when','where','why','how',

  // Be
  'be','am','is','are','was','were','been','being',
  // Have
  'have','has','had',
  // Do
  'do','does','did','done',
  // Say
  'say','says','said','saying',
  // Go
  'go','goes','went','gone','going',
  // Get
  'get','gets','got','gotten','getting',
  // Make
  'make','makes','made','making',
  // Know
  'know','knows','knew','known','knowing',
  // Think
  'think','thinks','thought','thinking',
  // Take
  'take','takes','took','taken','taking',
  // See
  'see','sees','saw','seen','seeing',
  // Come
  'come','comes','came','coming',
  // Want
  'want','wants','wanted','wanting',
  // Use
  'use','uses','used','using',
  // Find
  'find','finds','found','finding',
  // Give
  'give','gives','gave','given','giving',
  // Tell
  'tell','tells','told','telling',
  // Work
  'work','works','worked','working',
  // Call
  'call','calls','called','calling',
  // Try
  'try','tries','tried','trying',
  // Ask
  'ask','asks','asked','asking',
  // Need
  'need','needs','needed','needing',
  // Feel
  'feel','feels','felt','feeling',
  // Become
  'become','becomes','became','becoming',
  // Leave
  'leave','leaves','left','leaving',
  // Put
  'put','puts','putting',
  // Keep
  'keep','keeps','kept','keeping',
  // Let
  'let','lets','letting',
  // Begin / start
  'begin','begins','began','begun','beginning',
  'start','starts','started','starting',
  // Show
  'show','shows','showed','shown','showing',
  // Hear
  'hear','hears','heard','hearing',
  // Seem
  'seem','seems','seemed','seeming',
  // Turn
  'turn','turns','turned','turning',
  // Move
  'move','moves','moved','moving',
  // Live
  'live','lives','lived','living',
  // Happen
  'happen','happens','happened','happening',
  // Follow
  'follow','follows','followed','following',
  // Stand
  'stand','stands','stood','standing',
  // Lose
  'lose','loses','lost','losing',
  // Pay
  'pay','pays','paid','paying',
  // Meet
  'meet','meets','met','meeting',
  // Run
  'run','runs','ran','running',
  // Hold
  'hold','holds','held','holding',
  // Bring
  'bring','brings','brought','bringing',
  // Write
  'write','writes','wrote','written','writing',
  // Read
  'read','reads','reading',
  // Sit
  'sit','sits','sat','sitting',
  // Lead
  'lead','leads','led','leading',
  // Set
  'set','sets','setting',
  // Look
  'look','looks','looked','looking',
  // Play
  'play','plays','played','playing',
  // Grow
  'grow','grows','grew','grown','growing',
  // Open
  'open','opens','opened','opening',
  // Walk
  'walk','walks','walked','walking',
  // Win
  'win','wins','won','winning',
  // Remember
  'remember','remembers','remembered','remembering',
  // Believe
  'believe','believes','believed','believing',
  // Stay
  'stay','stays','stayed','staying',
  // Fall
  'fall','falls','fell','fallen','falling',
  // Cut
  'cut','cuts','cutting',
  // Stop
  'stop','stops','stopped','stopping',
  // Pass
  'pass','passes','passed','passing',
  // Reach
  'reach','reaches','reached','reaching',
  // Change
  'change','changes','changed','changing',
  // Build
  'build','builds','built','building',
  // Send
  'send','sends','sent','sending',
  // Buy
  'buy','buys','bought','buying',
  // Learn
  'learn','learns','learned','learning',
  // Return
  'return','returns','returned','returning',
  // Talk
  'talk','talks','talked','talking',
  // Speak
  'speak','speaks','spoke','spoken','speaking',
  // Wait
  'wait','waits','waited','waiting',
  // Add
  'add','adds','added','adding',
  // Die
  'die','dies','died','dying',
  // Help
  'help','helps','helped','helping',
  // Break
  'break','breaks','broke','broken','breaking',
  // Carry
  'carry','carries','carried','carrying',
  // Allow
  'allow','allows','allowed','allowing',
  // Pull / push
  'pull','pulls','pulled','pulling',
  'push','pushes','pushed','pushing',
  // Draw
  'draw','draws','drew','drawn','drawing',
  // Choose
  'choose','chooses','chose','chosen','choosing',
  // Create
  'create','creates','created','creating',
  // Spend
  'spend','spends','spent','spending',
  // Close
  'close','closes','closed','closing',
  // Rise
  'rise','rises','rose','risen','rising',
  // Raise
  'raise','raises','raised','raising',
  // Decide
  'decide','decides','decided','deciding',
  // Plan
  'plan','plans','planned','planning',

  // Modals
  'can','could','will','would','shall','should','may','might','must','ought',

  // Prepositions
  'in','on','at','to','of','with','by','from','up','about','into','through',
  'out','over','under','after','before','off','down','around','along',
  'during','until','near','between','among','across','behind','beyond',
  'except','since','toward','towards','within','without','against',
  'despite','inside','outside','per','via','than','as',

  // Conjunctions & connectors
  'and','but','or','nor','so','yet','for','because','while','although',
  'unless','if','then','though','whereas','whether','once','whenever',
  'wherever','however','therefore','thus','otherwise','meanwhile',
  'furthermore','moreover','besides','instead','rather','also','even',

  // Common adjectives
  'new','good','old','great','big','little','right','high','large','small',
  'next','early','young','important','long','hard','different','full',
  'likely','same','possible','national','general','public','private',
  'real','best','free','bad','able','known','recent','natural','various',
  'foreign','short','far','common','top','total','current','basic',
  'modern','final','direct','financial','legal','popular','positive',
  'personal','economic','simple','global','technical','similar',
  'available','particular','major','additional','individual','original',
  'ready','military','effective','historical','traditional','federal',
  'social','special','formal','true','clear','certain','main','specific',
  'international','human','central','whole','present','strong','single',
  'political','civil','local','cultural','last','own','open',
  'white','black','young','small','large','good','bad','high','low',
  'late','early','first','last','next','new','old','big','little',

  // Common adverbs
  'not','also','well','just','so','now','here','there','only','then',
  'too','very','even','back','still','always','often','already','again',
  'soon','never','once','perhaps','quite','rather','almost','completely',
  'usually','probably','clearly','quickly','easily','together',
  'especially','simply','recently','actually','generally','certainly',
  'apparently','suddenly','directly','really','finally','exactly','nearly',
  'specifically','relatively','extremely','highly','particularly',
  'obviously','effectively','largely','previously','normally','frequently',
  'eventually','increasingly','immediately','significantly','equally',
  'typically','entirely','mostly','primarily','approximately','essentially',
  'naturally','properly','fully','literally','seriously','slowly',
  'carefully','commonly','forward','indeed','away','below','above','far',
  'away','ahead','already','instead','sometimes','maybe','else',

  // Common nouns that would have 200+ Discord uses and yet feel too obvious
  'time','year','people','way','day','man','woman','child','world','life',
  'hand','part','place','case','week','company','system','government',
  'country','city','group','problem','fact','area','number','state',
  'work','point','home','water','room','money','night','power','word',
  'thing','kind','side','head','law','war','news','school','book',
  'family','body','situation','matter','office','rate','story','line',
  'idea','level','house','type','party','period','class','sense',
  'air','age','interest','name','end','nature','decision','business',
  'face','service','result','term','figure','order','effect',
  'difference','issue','example','act','cost','price','street',
  'hour','deal','land','energy','education','society','culture',
  'history','market','force','trade','million','region','practice',
  'source','value','impact','response','challenge','effort',
  'opportunity','context','concern','media','data','event',
  'condition','role','element','structure','stage','method','step',
  'character','quality','piece','space','product','measure',
  'network','cause','skill','feature','research','thought','pattern',
  'detail','theory','material','ability','environment','growth','size',
  'rule','control','range','solution','risk','direction','capacity',
  'potential','access','benefit','authority','resource','model',
  'process','policy','management','analysis','function','factor','form',
  'need','program','question','information','reason','development',
  'position','car','field','economy','tax','series','view',
  'production','movement','relationship','son','daughter','boy','girl',
  'back','right','left','front','top','bottom','end','side',

  // Numbers
  'one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','first','second','third','fourth','fifth',
  'hundred','thousand','million','billion',

  // Informal / chat filler
  'ok','okay','yes','no','yeah','nope','yep','hmm','ah','oh','uh','um',
  'im','ur','dont','cant','ill','hes','shes','weve','theyre','youre','ive',
  'isnt','arent','wasnt','werent','wont','wouldnt','couldnt','shouldnt',
  'didnt','doesnt','havent','hasnt','thats','whats','hows',
  'gonna','wanna','gotta','kinda','sorta',
  'lol','lmao','haha','omg','wtf','tbh','imo','idk','ngl','fr','rn','bc','tho',
  'like', // ultra-common chat filler
]);

// ── Trap words ────────────────────────────────────────────────────────────────
//
// Words that surprise players because their frequency is counterintuitive for
// this chat (a name being super common, Discord slang ranking above real words,
// etc.). One trap is injected as the challenger every 5 correct answers.
// Add more here once you've explored the word list.

const TRAP_WORDS = [
  'sherman', 'wts', 'ape', 'op', 'ho', 'ppl', 'kk',
  'cuz', 'gay', 'bruh', 'dude', 'bro',
];

// ── Challenger picking ────────────────────────────────────────────────────────
//
// words[] is sorted by count descending (rank 0 = most frequent).
// Difficulty: as streak grows, maxGap shrinks → challenger is closer in rank
// to the anchor → counts are closer → harder to judge direction.
//
// Matching mix per round:
//   - Every 5th correct answer: inject a trap word as challenger
//   - Otherwise: 80% pure-random gap, 20% same-category gap (if categories exist)

// pool: array of allowed rank indices (early game) — when undefined, full word list is used.
function pickChallengerRank(words, streak, rand, used, anchorRank, trapQueue, pool) {
  const n = pool ? pool.length : words.length;

  // Trap injection every 5 streaks (always pulled from full word list)
  if (streak > 0 && streak % 5 === 0 && trapQueue.length > 0) {
    while (trapQueue.length > 0) {
      const rank = trapQueue.shift();
      if (!used.has(rank) && rank !== anchorRank) {
        used.add(rank);
        return rank;
      }
    }
  }

  const frac   = Math.max(0.05, 0.80 * (1 - Math.min(streak, 25) / 25));
  const maxGap = Math.max(2, Math.floor(n * frac));

  // 20% chance: try to find a challenger that shares a category with the anchor
  const tryCategory = rand() < 0.20 && words[anchorRank].categories.length > 0;

  if (tryCategory) {
    const anchorCats = new Set(words[anchorRank].categories);
    for (let attempt = 0; attempt < 200; attempt++) {
      const rank = pool
        ? pool[Math.floor(rand() * pool.length)]
        : candidateRank(rand, anchorRank, maxGap, n);
      if (rank === undefined || rank === -1 || used.has(rank) || rank === anchorRank) continue;
      if (words[rank].categories.some(c => anchorCats.has(c))) {
        used.add(rank);
        return rank;
      }
    }
  }

  for (let attempt = 0; attempt < 500; attempt++) {
    const rank = pool
      ? pool[Math.floor(rand() * pool.length)]
      : candidateRank(rand, anchorRank, maxGap, n);
    if (rank === undefined || rank === -1 || used.has(rank) || rank === anchorRank) continue;
    used.add(rank);
    return rank;
  }

  // Exhaustion fallback
  const source = pool ?? words.map((_, i) => i);
  for (const rank of source) {
    if (!used.has(rank) && rank !== anchorRank) { used.add(rank); return rank; }
  }
  return (anchorRank + 1) % words.length;
}

function candidateRank(rand, anchorRank, maxGap, n) {
  const gap  = 1 + Math.floor(rand() * maxGap);
  const dir  = rand() < 0.5 ? 1 : -1;
  const rank = anchorRank + dir * gap;
  return rank >= 0 && rank < n ? rank : -1;
}

// ── State ─────────────────────────────────────────────────────────────────────

const gs = {
  words:            [],
  rand:             null,
  seed:             0,
  used:             new Set(),   // all rank indices shown so far
  streak:           0,
  best:             parseInt(localStorage.getItem('waweed_best') ?? '0', 10),
  anchorRank:       0,
  challengerRank:   0,
  // 'guessing' | 'correct' | 'wrong' | 'gameover'
  phase:            'loading',
  trapQueue:        [],
  wrong:            null,        // { anchorRank, challengerRank, playerGuess }
  interestingPool:  [],          // rank indices: not in COMMON_WORDS, count >= 200 (early rounds)
  postEarlyPool:    [],          // interestingPool + trap words (rounds 6+)
};

const anchor     = () => gs.words[gs.anchorRank];
const challenger = () => gs.words[gs.challengerRank];

// ── DOM ───────────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);
const streakEl  = $('streak-count');
const bestEl    = $('best-count');
const cardArea  = $('card-area');
const actionBar = $('action-bar');
const higherBtn = $('higher-btn');
const lowerBtn  = $('lower-btn');
const nextBtn   = $('next-btn');
const overlay        = $('overlay');
const oScore         = $('overlay-score');
const oBest          = $('overlay-best');
const oKiller        = $('overlay-killer');
const submitArea     = $('submit-area');
const playerNameEl   = $('player-name');
const submitBtn      = $('submit-btn');
const submitMsg      = $('submit-msg');
const submitLoading  = $('submit-loading');
const leaderboardEl  = $('leaderboard');
const leaderListEl   = $('leaderboard-list');
const viewFullLbBtn  = $('view-full-lb-btn');
const viewFullLbBtnContainer = $('view-full-lb-btn-container');
const shareBtn       = $('share-btn');
const againBtn       = $('again-btn');
const screenFlash    = $('screen-flash');
const viewLeaderboardHeaderBtn = $('view-leaderboard-header');
const leaderboardModal = $('leaderboard-modal');
const closeLeaderboardModalBtn = $('close-leaderboard-modal');
const closeLbModalBtn = $('close-lb-modal-btn');
const tabAllTime = $('tab-all-time');
const tabSeed = $('tab-seed');
const allTimeLeaderboard = $('all-time-leaderboard');
const seedLeaderboard = $('seed-leaderboard');
const allTimeList = $('all-time-list');
const seedList = $('seed-list');

// ── Audio ─────────────────────────────────────────────────────────────────────

let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch(e) { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTick(progress) {
  const ctx = ensureAudio();
  if (!ctx) return;
  try {
    const len  = Math.floor(ctx.sampleRate * 0.022);
    const buf  = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.25;
    const src    = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain   = ctx.createGain();
    filter.type = 'bandpass';
    filter.frequency.value = 600 + progress * 1400;
    filter.Q.value = 4;
    src.buffer = buf;
    src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    gain.gain.value = 0.13;
    src.start(ctx.currentTime);
  } catch(e) {}
}

function playCorrect() {
  const ctx = ensureAudio();
  if (!ctx) return;
  try {
    [523, 659, 784].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.1;
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.start(t); osc.stop(t + 0.22);
    });
  } catch(e) {}
}

function playWrong() {
  const ctx = ensureAudio();
  if (!ctx) return;
  try {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.52);
    gain.gain.setValueAtTime(0.13, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.56);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.56);
  } catch(e) {}
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  cardArea.innerHTML = '';
  // Cards only get the entering animation when a fresh pair is being shown.
  // On reveal (phase changes to correct/wrong), we rebuild without entering
  // so only the count text animates in via .count-reveal.
  const entering = gs.phase === 'guessing';

  cardArea.append(
    makeAnchorCard(entering),
    Object.assign(document.createElement('div'), { className: 'vs', textContent: 'VS' }),
    makeChallengerCard(entering),
  );
}

function makeAnchorCard(entering) {
  const w    = anchor();
  const card = document.createElement('div');
  card.className = 'card card--anchor' + (entering ? ' entering' : '');

  const wordEl  = document.createElement('div');
  wordEl.className = 'card-word';
  wordEl.textContent = w.word;

  const countEl = document.createElement('div');
  countEl.className = 'card-count';
  countEl.textContent = w.count.toLocaleString() + ' times';

  card.append(wordEl, countEl, makeTags(w.categories ?? []));
  return card;
}

function makeChallengerCard(entering) {
  const w    = challenger();
  const card = document.createElement('div');
  card.className = 'card card--challenger' + (entering ? ' entering' : '');

  const wordEl = document.createElement('div');
  wordEl.className = 'card-word';
  wordEl.textContent = w.word;

  const subEl = document.createElement('div');
  subEl.className = 'card-sub';

  if (gs.phase === 'guessing') {
    subEl.textContent = 'higher or lower?';
  } else {
    subEl.textContent = '0 times'; // count-up starts from here via animateCount()
    subEl.classList.add('count-reveal');
    card.classList.add(gs.phase === 'correct' ? 'correct' : 'wrong');
  }

  card.append(wordEl, subEl, makeTags(w.categories ?? []));
  return card;
}

function makeTags(categories) {
  const el = document.createElement('div');
  el.className = 'card-tags';
  for (const cat of categories) {
    el.appendChild(
      Object.assign(document.createElement('span'), { className: 'card-tag', textContent: cat }),
    );
  }
  return el;
}

function updateStats() {
  streakEl.textContent = gs.streak;
  bestEl.textContent   = gs.best;
}

// ── Animations ────────────────────────────────────────────────────────────────

function animateCount(el, target, duration, withSound, onComplete) {
  const start = performance.now();
  let lastTick = 0;
  function step(now) {
    const t     = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    el.textContent = Math.round(eased * target).toLocaleString() + ' times';
    if (withSound && now - lastTick > 52) { playTick(eased); lastTick = now; }
    if (t < 1) { requestAnimationFrame(step); }
    else if (onComplete) { onComplete(); }
  }
  requestAnimationFrame(step);
}

function spawnParticles(cx, cy, colors, count) {
  for (let i = 0; i < count; i++) {
    const p     = document.createElement('div');
    const size  = 6 + Math.random() * 10;
    const angle = Math.random() * Math.PI * 2;
    const speed = 100 + Math.random() * 230;
    const vx    = Math.cos(angle) * speed;
    const vy    = Math.sin(angle) * speed - 110; // bias upward
    const vr    = (Math.random() - 0.5) * 1080;
    p.className = Math.random() > 0.45 ? 'particle round' : 'particle';
    p.style.cssText = [
      `left:${cx - size / 2}px`, `top:${cy - size / 2}px`,
      `width:${size}px`, `height:${size}px`,
      `background:${colors[i % colors.length]}`,
      `--vx:${vx}px`, `--vy:${vy}px`, `--vr:${vr}deg`,
    ].join(';');
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 920);
  }
}

function flashScreen(type) {
  screenFlash.className = '';
  void screenFlash.offsetWidth; // restart animation
  screenFlash.className = `flash-${type}`;
}

// ── Actions ───────────────────────────────────────────────────────────────────

function guess(playerGuess) {
  if (gs.phase !== 'guessing') return;

  const aCount  = anchor().count;
  const cCount  = challenger().count;
  const correct = cCount === aCount  // tie → always correct
    || (playerGuess === 'higher' ? cCount > aCount : cCount < aCount);

  gs.phase = correct ? 'correct' : 'wrong';
  render();
  actionBar.classList.add('hidden');

  const challengerCard = cardArea.querySelector('.card--challenger');
  const anchorCard     = cardArea.querySelector('.card--anchor');
  const subEl          = challengerCard?.querySelector('.card-sub');

  // Kick off count-up with ticking sounds; play resolve sound on completion
  if (subEl) {
    animateCount(subEl, cCount, correct ? 800 : 620, true, correct ? playCorrect : null);
  }

  if (correct) {
    flashScreen('correct');
    gs.streak++;
    if (gs.streak > gs.best) {
      gs.best = gs.streak;
      localStorage.setItem('waweed_best', gs.streak);
    }
    updateStats();
    if (challengerCard) {
      const rect = challengerCard.getBoundingClientRect();
      setTimeout(() => spawnParticles(
        rect.left + rect.width / 2,
        rect.top  + rect.height / 2,
        ['#39ff14', '#00ff87', '#ffffff', '#ffd700', '#00ccff'],
        20,
      ), 240);
    }
    nextBtn.classList.remove('hidden');
  } else {
    gs.wrong = { anchorRank: gs.anchorRank, challengerRank: gs.challengerRank, playerGuess };
    flashScreen('wrong');

    const koVariants = ['ko-fly', 'ko-spin', 'ko-fall', 'ko-implode'];
    const koVariant  = koVariants[Math.floor(Math.random() * koVariants.length)];

    setTimeout(() => {
      playWrong();
      if (anchorCard) anchorCard.classList.add('punching');
      if (challengerCard) {
        const rect = challengerCard.getBoundingClientRect();
        spawnParticles(
          rect.left + rect.width / 2,
          rect.top  + rect.height / 2,
          ['#ff1744', '#ff6b35', '#ffcc00', '#ffffff', '#ff00aa'],
          30,
        );
        challengerCard.classList.add('knockout', koVariant);
      }
    }, 490);
    setTimeout(showGameOver, 1220);
  }
}

function nextRound() {
  nextBtn.classList.add('hidden');

  // Fade out both cards before swapping in the new pair
  cardArea.querySelectorAll('.card').forEach(c => c.classList.add('exiting'));

  setTimeout(() => {
    // Chain: old challenger becomes new anchor
    gs.anchorRank     = gs.challengerRank;
    const pool = gs.streak < EARLY_ROUNDS ? gs.interestingPool : gs.postEarlyPool;
    gs.challengerRank = pickChallengerRank(
      gs.words, gs.streak, gs.rand, gs.used, gs.anchorRank, gs.trapQueue, pool,
    );
    gs.phase = 'guessing';

    render();
    actionBar.classList.remove('hidden');
  }, 220);
}

function showGameOver() {
  gs.phase = 'gameover';
  oScore.textContent = gs.streak;
  oBest.textContent  = `Best: ${gs.best}`;

  if (gs.wrong) {
    const { anchorRank, challengerRank, playerGuess } = gs.wrong;
    const a      = gs.words[anchorRank];
    const c      = gs.words[challengerRank];
    const actual = c.count > a.count ? 'higher' : c.count < a.count ? 'lower' : 'equal';
    oKiller.innerHTML =
      `"${c.word}" (${c.count.toLocaleString()}) is <strong>${actual}</strong> than `
      + `"${a.word}" (${a.count.toLocaleString()}) — you guessed ${playerGuess}`;
  }

  // Reset submit UI for this new game-over
  playerNameEl.value = '';
  playerNameEl.disabled = false;
  playerNameEl.classList.remove('hidden');
  submitBtn.disabled = false;
  submitBtn.classList.remove('hidden');
  submitMsg.textContent = '';
  submitMsg.className = 'hidden';
  submitLoading.classList.add('hidden');
  leaderboardEl.classList.add('hidden');
  leaderListEl.innerHTML = '';
  viewFullLbBtnContainer.classList.add('hidden');

  overlay.classList.remove('hidden');
}

async function submitScore() {
  const playerName = playerNameEl.value.trim();
  if (!playerName) { playerNameEl.focus(); return; }

  submitBtn.disabled = true;
  playerNameEl.disabled = true;
  submitBtn.classList.add('hidden');
  playerNameEl.classList.add('hidden');
  submitLoading.classList.remove('hidden');
  submitMsg.textContent = '';
  submitMsg.className = 'hidden';

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/validate-score`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ playerName, seed: gs.seed, streak: gs.streak }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? res.statusText);

    submitMsg.textContent = `Submitted! You ranked #${data.rank}`;
    submitMsg.className = 'submit-ok';
    submitLoading.classList.add('hidden');
    viewFullLbBtnContainer.classList.remove('hidden');
  } catch (err) {
    submitMsg.textContent = `Error: ${err.message}`;
    submitMsg.className = 'submit-err';
    submitBtn.disabled = false;
    playerNameEl.disabled = false;
    submitBtn.classList.remove('hidden');
    playerNameEl.classList.remove('hidden');
    submitLoading.classList.add('hidden');
  }
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function fetchLeaderboard() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/scores?select=player_name,streak,submitted_at&order=streak.desc,submitted_at.asc&limit=10`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } },
    );
    if (!res.ok) return;
    const rows = await res.json();

    leaderListEl.innerHTML = rows.map((r, i) => `
      <li>
        <span class="lb-rank">#${i + 1}</span>
        <span class="lb-name">${esc(r.player_name)}</span>
        <span class="lb-streak">${r.streak}</span>
      </li>`).join('');
    leaderboardEl.classList.remove('hidden');
  } catch { /* leaderboard is optional; silently skip on error */ }
}

async function fetchFullLeaderboard() {
  try {
    // Fetch top 50 all-time
    const allTimeRes = await fetch(
      `${SUPABASE_URL}/rest/v1/scores?select=player_name,streak,submitted_at&order=streak.desc,submitted_at.asc&limit=50`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } },
    );
    if (!allTimeRes.ok) return;
    const allTimeRows = await allTimeRes.json();

    allTimeList.innerHTML = allTimeRows.map((r, i) => `
      <li>
        <span class="lb-rank">#${i + 1}</span>
        <span class="lb-name">${esc(r.player_name)}</span>
        <span class="lb-streak">${r.streak}</span>
      </li>`).join('');

    // Fetch top 10 for current seed
    const seedRes = await fetch(
      `${SUPABASE_URL}/rest/v1/scores?select=player_name,streak,submitted_at&seed=eq.${gs.seed}&order=streak.desc,submitted_at.asc&limit=10`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } },
    );
    if (!seedRes.ok) return;
    const seedRows = await seedRes.json();

    seedList.innerHTML = seedRows.length > 0
      ? seedRows.map((r, i) => `
        <li>
          <span class="lb-rank">#${i + 1}</span>
          <span class="lb-name">${esc(r.player_name)}</span>
          <span class="lb-streak">${r.streak}</span>
        </li>`).join('')
      : '<li style="text-align: center; color: rgba(255,255,255,0.4); padding: 1rem;">No scores yet for this seed</li>';
  } catch (err) {
    console.error('Failed to fetch full leaderboard:', err);
  }
}

function showFullLeaderboard() {
  fetchFullLeaderboard();
  leaderboardModal.classList.remove('hidden');
}

function share() {
  const url = `${location.origin}${location.pathname}?seed=${gs.seed}`;
  navigator.clipboard.writeText(url)
    .then(() => {
      shareBtn.textContent = '✓ Copied!';
      setTimeout(() => { shareBtn.textContent = 'Share challenge'; }, 2000);
    })
    .catch(() => { prompt('Copy this link:', url); });
}

function restart(newSeed) {
  gs.seed   = newSeed ?? ((Math.random() * 2 ** 31) | 0);
  gs.rand   = mulberry32(gs.seed);
  gs.used   = new Set();
  gs.streak = 0;
  gs.wrong  = null;

  // Build and shuffle trap queue using the seeded PRNG so it's reproducible
  const idx = new Map(gs.words.map((w, i) => [w.word, i]));
  gs.trapQueue = TRAP_WORDS.map(w => idx.get(w)).filter(r => r !== undefined);
  for (let i = gs.trapQueue.length - 1; i > 0; i--) {
    const j = Math.floor(gs.rand() * (i + 1));
    [gs.trapQueue[i], gs.trapQueue[j]] = [gs.trapQueue[j], gs.trapQueue[i]];
  }

  // Build interesting pool: not in top-500 common English words, count >= 200
  gs.interestingPool = gs.words
    .map((w, i) => i)
    .filter(i => !COMMON_WORDS.has(gs.words[i].word.toLowerCase()) && gs.words[i].count >= 200);

  // Post-early pool: interesting pool + custom trap words freely mixed (rounds 6+)
  const trapRanks = TRAP_WORDS.map(w => idx.get(w)).filter(r => r !== undefined);
  gs.postEarlyPool = [...new Set([...gs.interestingPool, ...trapRanks])];

  // Start anchor from interesting pool
  const anchorPoolIdx = Math.floor(gs.rand() * gs.interestingPool.length);
  gs.anchorRank = gs.interestingPool[anchorPoolIdx];
  gs.used.add(gs.anchorRank);

  gs.challengerRank = pickChallengerRank(
    gs.words, 0, gs.rand, gs.used, gs.anchorRank, gs.trapQueue, gs.interestingPool,
  );
  gs.phase = 'guessing';

  const u = new URL(location.href);
  u.searchParams.set('seed', gs.seed);
  history.replaceState(null, '', u);

  updateStats();
  overlay.classList.add('hidden');
  nextBtn.classList.add('hidden');
  actionBar.classList.remove('hidden');
  render();
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.repeat) return;
  if (gs.phase === 'guessing') {
    if (e.key === 'ArrowUp'   || e.key === 'h' || e.key === 'H') guess('higher');
    if (e.key === 'ArrowDown' || e.key === 'l' || e.key === 'L') guess('lower');
  } else if (gs.phase === 'correct') {
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      nextRound();
    }
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────

higherBtn.addEventListener('click', () => guess('higher'));
lowerBtn.addEventListener('click',  () => guess('lower'));
nextBtn.addEventListener('click', nextRound);
shareBtn.addEventListener('click', share);
againBtn.addEventListener('click', () => restart());
submitBtn.addEventListener('click', submitScore);
playerNameEl.addEventListener('keydown', e => { if (e.key === 'Enter') submitScore(); });

// Leaderboard modal listeners
viewFullLbBtn.addEventListener('click', showFullLeaderboard);
viewLeaderboardHeaderBtn.addEventListener('click', showFullLeaderboard);
closeLeaderboardModalBtn.addEventListener('click', () => leaderboardModal.classList.add('hidden'));
closeLbModalBtn.addEventListener('click', () => leaderboardModal.classList.add('hidden'));

// Tab switching for leaderboard modal
tabAllTime.addEventListener('click', () => {
  tabAllTime.classList.add('active');
  tabSeed.classList.remove('active');
  allTimeLeaderboard.classList.remove('hidden');
  seedLeaderboard.classList.add('hidden');
});

tabSeed.addEventListener('click', () => {
  tabSeed.classList.add('active');
  tabAllTime.classList.remove('active');
  seedLeaderboard.classList.remove('hidden');
  allTimeLeaderboard.classList.add('hidden');
});

// Close modal on background click
leaderboardModal.addEventListener('click', (e) => {
  if (e.target === leaderboardModal) {
    leaderboardModal.classList.add('hidden');
  }
});

updateStats();

gs.seed = parseSeed();
const initUrl = new URL(location.href);
if (!initUrl.searchParams.has('seed')) {
  initUrl.searchParams.set('seed', gs.seed);
  history.replaceState(null, '', initUrl);
}

cardArea.innerHTML = '<div class="status-msg"><p>Loading word data…</p></div>';

fetch('../data/words.json')
  .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
  .then(data => {
    gs.words = data;
    restart(gs.seed);
  })
  .catch(err => {
    cardArea.innerHTML = `
      <div class="status-msg">
        <p>Could not load word data (${err.message}).</p>
        <p>Serve from the <strong>project root</strong>:<br>
        <code>python3 -m http.server 8000</code><br>
        then open <code>http://localhost:8000/game/</code></p>
      </div>`;
  });
