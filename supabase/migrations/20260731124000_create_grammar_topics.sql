alter table public.grammar_lessons rename to grammar_exercises;

alter table public.grammar_exercises
  add column topic_id text;

create table public.grammar_topics (
  id text primary key,
  language text not null check (language in ('en', 'es', 'fr', 'it')),
  level text not null check (level in ('A1', 'A2', 'B1', 'B2')),
  title text not null check (char_length(title) between 1 and 160),
  overview_pt_br text not null check (char_length(overview_pt_br) between 80 and 5000),
  formation_pt_br text not null check (char_length(formation_pt_br) between 40 and 3000),
  use_cases jsonb not null check (
    jsonb_typeof(use_cases) = 'array'
    and jsonb_array_length(use_cases) between 2 and 8
  ),
  common_mistakes jsonb not null check (
    jsonb_typeof(common_mistakes) = 'array'
    and jsonb_array_length(common_mistakes) between 2 and 8
  ),
  notes_pt_br jsonb not null check (
    jsonb_typeof(notes_pt_br) = 'array'
    and jsonb_array_length(notes_pt_br) between 1 and 8
  ),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index grammar_topics_catalog_idx
  on public.grammar_topics (language, level, sort_order)
  where is_published;

create index grammar_exercises_topic_idx
  on public.grammar_exercises (topic_id, sort_order)
  where is_published;

alter table public.grammar_topics enable row level security;

create policy "Published grammar topics are publicly readable"
  on public.grammar_topics for select
  to anon, authenticated
  using (is_published);

create trigger grammar_topics_set_updated_at
  before update on public.grammar_topics
  for each row execute function public.set_updated_at();

grant select on public.grammar_topics to anon, authenticated;
