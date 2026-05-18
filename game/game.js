'use strict';

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

function pickChallengerRank(words, streak, rand, used, anchorRank, trapQueue) {
  const n = words.length;

  // Trap injection every 5 streaks
  if (streak > 0 && streak % 5 === 0 && trapQueue.length > 0) {
    while (trapQueue.length > 0) {
      const rank = trapQueue.shift();
      if (!used.has(rank) && rank !== anchorRank) {
        used.add(rank);
        return rank;
      }
    }
    // All trap words exhausted — fall through to normal pick
  }

  const frac   = Math.max(0.05, 0.80 * (1 - Math.min(streak, 25) / 25));
  const maxGap = Math.max(2, Math.floor(n * frac));

  // 20% chance: try to find a challenger that shares a category with the anchor
  const tryCategory = rand() < 0.20 && words[anchorRank].categories.length > 0;

  if (tryCategory) {
    const anchorCats = new Set(words[anchorRank].categories);
    for (let attempt = 0; attempt < 200; attempt++) {
      const rank = candidateRank(rand, anchorRank, maxGap, n);
      if (rank === -1 || used.has(rank)) continue;
      if (words[rank].categories.some(c => anchorCats.has(c))) {
        used.add(rank);
        return rank;
      }
    }
    // No category match found — fall through to random
  }

  // 80% (or fallback): pure random within difficulty window
  for (let attempt = 0; attempt < 500; attempt++) {
    const rank = candidateRank(rand, anchorRank, maxGap, n);
    if (rank === -1 || used.has(rank)) continue;
    used.add(rank);
    return rank;
  }

  // Exhaustion fallback: any unused rank
  for (let i = 0; i < n; i++) {
    if (!used.has(i) && i !== anchorRank) { used.add(i); return i; }
  }
  return (anchorRank + 1) % n;
}

function candidateRank(rand, anchorRank, maxGap, n) {
  const gap  = 1 + Math.floor(rand() * maxGap);
  const dir  = rand() < 0.5 ? 1 : -1;
  const rank = anchorRank + dir * gap;
  return rank >= 0 && rank < n ? rank : -1;
}

// ── State ─────────────────────────────────────────────────────────────────────

const gs = {
  words:          [],
  rand:           null,
  seed:           0,
  used:           new Set(),   // all rank indices shown so far
  streak:         0,
  best:           parseInt(localStorage.getItem('waweed_best') ?? '0', 10),
  anchorRank:     0,
  challengerRank: 0,
  // 'guessing' | 'correct' | 'wrong' | 'gameover'
  phase:          'loading',
  trapQueue:      [],
  wrong:          null,        // { anchorRank, challengerRank, playerGuess }
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
const overlay   = $('overlay');
const oScore    = $('overlay-score');
const oBest     = $('overlay-best');
const oKiller   = $('overlay-killer');
const shareBtn  = $('share-btn');
const againBtn  = $('again-btn');

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
    subEl.textContent = 'more or fewer?';
  } else {
    subEl.textContent = w.count.toLocaleString() + ' times';
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

// ── Actions ───────────────────────────────────────────────────────────────────

function guess(playerGuess) {
  if (gs.phase !== 'guessing') return;

  const aCount  = anchor().count;
  const cCount  = challenger().count;
  const correct = cCount === aCount  // tie → always correct
    || (playerGuess === 'more' ? cCount > aCount : cCount < aCount);

  gs.phase = correct ? 'correct' : 'wrong';
  render();
  actionBar.classList.add('hidden');

  if (correct) {
    gs.streak++;
    if (gs.streak > gs.best) {
      gs.best = gs.streak;
      localStorage.setItem('waweed_best', gs.streak);
    }
    updateStats();
    nextBtn.classList.remove('hidden');
  } else {
    gs.wrong = { anchorRank: gs.anchorRank, challengerRank: gs.challengerRank, playerGuess };
    setTimeout(showGameOver, 950);
  }
}

function nextRound() {
  nextBtn.classList.add('hidden');

  // Fade out both cards before swapping in the new pair
  cardArea.querySelectorAll('.card').forEach(c => c.classList.add('exiting'));

  setTimeout(() => {
    // Chain: old challenger becomes new anchor
    gs.anchorRank     = gs.challengerRank;
    gs.challengerRank = pickChallengerRank(
      gs.words, gs.streak, gs.rand, gs.used, gs.anchorRank, gs.trapQueue,
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
    const actual = c.count > a.count ? 'more' : c.count < a.count ? 'less' : 'equal';
    oKiller.innerHTML =
      `"${c.word}" (${c.count.toLocaleString()}) is said <strong>${actual}</strong> than `
      + `"${a.word}" (${a.count.toLocaleString()}) — you guessed ${playerGuess}`;
  }

  overlay.classList.remove('hidden');
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

  // Start anchor from top 20% so first word is always recognisable
  const topN       = Math.max(1, Math.floor(gs.words.length * 0.20));
  gs.anchorRank    = Math.floor(gs.rand() * topN);
  gs.used.add(gs.anchorRank);

  gs.challengerRank = pickChallengerRank(
    gs.words, 0, gs.rand, gs.used, gs.anchorRank, gs.trapQueue,
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
    if (e.key === 'ArrowUp'   || e.key === 'h' || e.key === 'H') guess('more');
    if (e.key === 'ArrowDown' || e.key === 'l' || e.key === 'L') guess('less');
  } else if (gs.phase === 'correct') {
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      nextRound();
    }
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────

higherBtn.addEventListener('click', () => guess('more'));
lowerBtn.addEventListener('click',  () => guess('less'));
nextBtn.addEventListener('click', nextRound);
shareBtn.addEventListener('click', share);
againBtn.addEventListener('click', () => restart());

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
