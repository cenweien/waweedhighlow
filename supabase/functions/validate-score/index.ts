// Deno edge function — validates a claimed streak then records the score.
//
// words.json is bundled at deploy time via the static import below; it never
// leaves the Supabase edge network after that.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import WORDS from '../../../data/words.json' assert { type: 'json' };

// ── Types ─────────────────────────────────────────────────────────────────────

interface Word { word: string; count: number; categories: string[] }

// ── Seeded PRNG — mulberry32 (verbatim from game/game.js) ────────────────────

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Game logic — verbatim from game/game.js ───────────────────────────────────

const TRAP_WORDS = [
  'sherman', 'wts', 'ape', 'op', 'ho', 'ppl', 'kk',
  'cuz', 'gay', 'bruh', 'dude', 'bro',
];

function candidateRank(rand: () => number, anchorRank: number, maxGap: number, n: number): number {
  const gap  = 1 + Math.floor(rand() * maxGap);
  const dir  = rand() < 0.5 ? 1 : -1;
  const rank = anchorRank + dir * gap;
  return rank >= 0 && rank < n ? rank : -1;
}

function pickChallengerRank(
  words: Word[], streak: number, rand: () => number,
  used: Set<number>, anchorRank: number, trapQueue: number[],
): number {
  const n = words.length;

  if (streak > 0 && streak % 5 === 0 && trapQueue.length > 0) {
    while (trapQueue.length > 0) {
      const rank = trapQueue.shift()!;
      if (!used.has(rank) && rank !== anchorRank) { used.add(rank); return rank; }
    }
  }

  const frac   = Math.max(0.05, 0.80 * (1 - Math.min(streak, 25) / 25));
  const maxGap = Math.max(2, Math.floor(n * frac));

  const tryCategory = rand() < 0.20 && words[anchorRank].categories.length > 0;
  if (tryCategory) {
    const anchorCats = new Set(words[anchorRank].categories);
    for (let attempt = 0; attempt < 200; attempt++) {
      const rank = candidateRank(rand, anchorRank, maxGap, n);
      if (rank === -1 || used.has(rank)) continue;
      if (words[rank].categories.some((c: string) => anchorCats.has(c))) { used.add(rank); return rank; }
    }
  }

  for (let attempt = 0; attempt < 500; attempt++) {
    const rank = candidateRank(rand, anchorRank, maxGap, n);
    if (rank === -1 || used.has(rank)) continue;
    used.add(rank);
    return rank;
  }

  for (let i = 0; i < n; i++) {
    if (!used.has(i) && i !== anchorRank) { used.add(i); return i; }
  }
  return (anchorRank + 1) % n;
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateStreak(seed: number, claimedStreak: number): boolean {
  const words = WORDS as Word[];
  const n     = words.length;
  if (claimedStreak < 1 || claimedStreak > n) return false;

  const rand = mulberry32(seed);

  // Build trap queue (same shuffle as restart() in game.js)
  const idx = new Map(words.map((w, i) => [w.word, i]));
  const trapQueue: number[] = TRAP_WORDS.map(w => idx.get(w)!).filter(r => r !== undefined);
  for (let i = trapQueue.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [trapQueue[i], trapQueue[j]] = [trapQueue[j], trapQueue[i]];
  }

  const used      = new Set<number>();
  const topN      = Math.max(1, Math.floor(n * 0.20));
  let anchorRank  = Math.floor(rand() * topN);
  used.add(anchorRank);

  let challengerRank = pickChallengerRank(words, 0, rand, used, anchorRank, trapQueue);

  // Replay `claimedStreak` rounds and confirm each pair is reachable
  for (let round = 0; round < claimedStreak; round++) {
    if (anchorRank < 0 || anchorRank >= n) return false;
    if (challengerRank < 0 || challengerRank >= n) return false;
    // Both pairs must be distinct words (ties count as correct in game, so no hard failure)
    if (anchorRank === challengerRank) return false;

    // Advance: challenger becomes anchor for next round
    anchorRank     = challengerRank;
    challengerRank = pickChallengerRank(words, round + 1, rand, used, anchorRank, trapQueue);
  }

  return true;
}

// ── Handler ───────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  let body: { playerName?: unknown; seed?: unknown; streak?: unknown };
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders }); }

  const playerName = typeof body.playerName === 'string' ? body.playerName.trim().slice(0, 20) : '';
  const seed       = typeof body.seed   === 'number' ? Math.trunc(body.seed)   : NaN;
  const streak     = typeof body.streak === 'number' ? Math.trunc(body.streak) : NaN;

  if (!playerName) {
    return new Response(JSON.stringify({ error: 'playerName required' }), { status: 400, headers: corsHeaders });
  }
  if (!Number.isFinite(seed) || !Number.isFinite(streak) || streak < 1) {
    return new Response(JSON.stringify({ error: 'Invalid seed or streak' }), { status: 400, headers: corsHeaders });
  }

  if (!validateStreak(seed, streak)) {
    return new Response(JSON.stringify({ error: 'Streak could not be validated for this seed' }), { status: 422, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { error: dbErr } = await supabase
    .from('scores')
    .insert({ player_name: playerName, seed, streak });

  if (dbErr) {
    console.error(dbErr);
    return new Response(JSON.stringify({ error: 'Database error' }), { status: 500, headers: corsHeaders });
  }

  // Return rank (1-based position on the leaderboard)
  const { count } = await supabase
    .from('scores')
    .select('*', { count: 'exact', head: true })
    .gt('streak', streak);

  const rank = (count ?? 0) + 1;

  return new Response(JSON.stringify({ ok: true, rank }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
