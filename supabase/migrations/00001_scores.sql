CREATE TABLE public.scores (
  id            bigint primary key generated always as identity,
  player_name   text    not null,
  seed          bigint  not null,
  streak        integer not null check (streak >= 0),
  submitted_at  timestamptz default now()
);

CREATE INDEX scores_leaderboard_idx ON public.scores (streak DESC, submitted_at ASC);

ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read scores
CREATE POLICY "read scores" ON public.scores FOR SELECT USING (true);
-- Only service role (used by the Edge Function) can insert
CREATE POLICY "service insert" ON public.scores FOR INSERT WITH CHECK (false);
