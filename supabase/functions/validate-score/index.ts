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

const EARLY_ROUNDS = 5;

const COMMON_WORDS = new Set([
  'the','a','an','this','that','these','those','each','every','all','both',
  'either','neither','some','any','many','much','more','most','few','less',
  'several','enough','other','another','such','whatever','whichever',
  'i','you','he','she','it','we','they','me','him','her','us','them',
  'my','your','his','its','our','their','mine','yours','hers','ours','theirs',
  'myself','yourself','himself','herself','itself','ourselves','themselves',
  'who','whom','whose','which','what','whoever','one',
  'when','where','why','how',
  'be','am','is','are','was','were','been','being',
  'have','has','had',
  'do','does','did','done',
  'say','says','said','saying',
  'go','goes','went','gone','going',
  'get','gets','got','gotten','getting',
  'make','makes','made','making',
  'know','knows','knew','known','knowing',
  'think','thinks','thought','thinking',
  'take','takes','took','taken','taking',
  'see','sees','saw','seen','seeing',
  'come','comes','came','coming',
  'want','wants','wanted','wanting',
  'use','uses','used','using',
  'find','finds','found','finding',
  'give','gives','gave','given','giving',
  'tell','tells','told','telling',
  'work','works','worked','working',
  'call','calls','called','calling',
  'try','tries','tried','trying',
  'ask','asks','asked','asking',
  'need','needs','needed','needing',
  'feel','feels','felt','feeling',
  'become','becomes','became','becoming',
  'leave','leaves','left','leaving',
  'put','puts','putting',
  'keep','keeps','kept','keeping',
  'let','lets','letting',
  'begin','begins','began','begun','beginning',
  'start','starts','started','starting',
  'show','shows','showed','shown','showing',
  'hear','hears','heard','hearing',
  'seem','seems','seemed','seeming',
  'turn','turns','turned','turning',
  'move','moves','moved','moving',
  'live','lives','lived','living',
  'happen','happens','happened','happening',
  'follow','follows','followed','following',
  'stand','stands','stood','standing',
  'lose','loses','lost','losing',
  'pay','pays','paid','paying',
  'meet','meets','met','meeting',
  'run','runs','ran','running',
  'hold','holds','held','holding',
  'bring','brings','brought','bringing',
  'write','writes','wrote','written','writing',
  'read','reads','reading',
  'sit','sits','sat','sitting',
  'lead','leads','led','leading',
  'set','sets','setting',
  'look','looks','looked','looking',
  'play','plays','played','playing',
  'grow','grows','grew','grown','growing',
  'open','opens','opened','opening',
  'walk','walks','walked','walking',
  'win','wins','won','winning',
  'remember','remembers','remembered','remembering',
  'believe','believes','believed','believing',
  'stay','stays','stayed','staying',
  'fall','falls','fell','fallen','falling',
  'cut','cuts','cutting',
  'stop','stops','stopped','stopping',
  'pass','passes','passed','passing',
  'reach','reaches','reached','reaching',
  'change','changes','changed','changing',
  'build','builds','built','building',
  'send','sends','sent','sending',
  'buy','buys','bought','buying',
  'learn','learns','learned','learning',
  'return','returns','returned','returning',
  'talk','talks','talked','talking',
  'speak','speaks','spoke','spoken','speaking',
  'wait','waits','waited','waiting',
  'add','adds','added','adding',
  'die','dies','died','dying',
  'help','helps','helped','helping',
  'break','breaks','broke','broken','breaking',
  'carry','carries','carried','carrying',
  'allow','allows','allowed','allowing',
  'pull','pulls','pulled','pulling',
  'push','pushes','pushed','pushing',
  'draw','draws','drew','drawn','drawing',
  'choose','chooses','chose','chosen','choosing',
  'create','creates','created','creating',
  'spend','spends','spent','spending',
  'close','closes','closed','closing',
  'rise','rises','rose','risen','rising',
  'raise','raises','raised','raising',
  'decide','decides','decided','deciding',
  'plan','plans','planned','planning',
  'can','could','will','would','shall','should','may','might','must','ought',
  'in','on','at','to','of','with','by','from','up','about','into','through',
  'out','over','under','after','before','off','down','around','along',
  'during','until','near','between','among','across','behind','beyond',
  'except','since','toward','towards','within','without','against',
  'despite','inside','outside','per','via','than','as',
  'and','but','or','nor','so','yet','for','because','while','although',
  'unless','if','then','though','whereas','whether','once','whenever',
  'wherever','however','therefore','thus','otherwise','meanwhile',
  'furthermore','moreover','besides','instead','rather','also','even',
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
  'white','black','low','late',
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
  'ahead','already','instead','sometimes','maybe','else',
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
  'back','front','bottom',
  'one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','first','second','third','fourth','fifth',
  'hundred','thousand','million','billion',
  'ok','okay','yes','no','yeah','nope','yep','hmm','ah','oh','uh','um',
  'im','ur','dont','cant','ill','hes','shes','weve','theyre','youre','ive',
  'isnt','arent','wasnt','werent','wont','wouldnt','couldnt','shouldnt',
  'didnt','doesnt','havent','hasnt','thats','whats','hows',
  'gonna','wanna','gotta','kinda','sorta',
  'lol','lmao','haha','omg','wtf','tbh','imo','idk','ngl','fr','rn','bc','tho',
  'like',
]);

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
  pool?: number[],
): number {
  const n = pool ? pool.length : words.length;

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
      const rank = pool
        ? pool[Math.floor(rand() * pool.length)]
        : candidateRank(rand, anchorRank, maxGap, n);
      if (rank === undefined || rank === -1 || used.has(rank) || rank === anchorRank) continue;
      if (words[rank].categories.some((c: string) => anchorCats.has(c))) { used.add(rank); return rank; }
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

  const source = pool ?? words.map((_, i) => i);
  for (const rank of source) {
    if (!used.has(rank) && rank !== anchorRank) { used.add(rank); return rank; }
  }
  return (anchorRank + 1) % words.length;
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

  // Build interesting pool (same logic as restart() in game.js)
  const interestingPool: number[] = words
    .map((w, i) => i)
    .filter(i => !COMMON_WORDS.has(words[i].word.toLowerCase()) && words[i].count >= 200);

  // Post-early pool: interesting words + trap words freely mixed (rounds 6+)
  const trapRanks = TRAP_WORDS.map(w => idx.get(w)!).filter(r => r !== undefined);
  const postEarlyPool: number[] = [...new Set([...interestingPool, ...trapRanks])];

  // Start anchor from interesting pool
  const anchorPoolIdx = Math.floor(rand() * interestingPool.length);
  const used = new Set<number>();
  let anchorRank = interestingPool[anchorPoolIdx];
  used.add(anchorRank);

  let challengerRank = pickChallengerRank(words, 0, rand, used, anchorRank, trapQueue, interestingPool);

  // Replay `claimedStreak` rounds and confirm each pair is reachable
  for (let round = 0; round < claimedStreak; round++) {
    if (anchorRank < 0 || anchorRank >= n) return false;
    if (challengerRank < 0 || challengerRank >= n) return false;
    if (anchorRank === challengerRank) return false;

    anchorRank     = challengerRank;
    const pool     = round + 1 < EARLY_ROUNDS ? interestingPool : postEarlyPool;
    challengerRank = pickChallengerRank(words, round + 1, rand, used, anchorRank, trapQueue, pool);
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

  const playerName = typeof body.playerName === 'string' ? body.playerName.trim().slice(0, 30) : '';
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
