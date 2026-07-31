create table public.learning_readings (
  id text primary key,
  language text not null check (language in ('en', 'es', 'fr', 'it')),
  level text not null check (level in ('A1', 'A2', 'B1', 'B2')),
  title text not null check (char_length(title) between 1 and 160),
  body text not null check (char_length(body) between 1 and 10000),
  question text not null check (char_length(question) between 1 and 500),
  options jsonb not null check (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) between 2 and 6
  ),
  answer_index smallint not null check (answer_index >= 0),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (answer_index < jsonb_array_length(options))
);

create table public.grammar_lessons (
  id text primary key,
  language text not null check (language in ('en', 'es', 'fr', 'it')),
  level text not null check (level in ('A1', 'A2', 'B1', 'B2')),
  title text not null check (char_length(title) between 1 and 160),
  explanation text not null check (char_length(explanation) between 1 and 2000),
  example text not null check (char_length(example) between 1 and 1000),
  question text not null check (char_length(question) between 1 and 500),
  options jsonb not null check (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) between 2 and 6
  ),
  answer_index smallint not null check (answer_index >= 0),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (answer_index < jsonb_array_length(options))
);

create table public.quick_lesson_flashcards (
  id text primary key,
  language text not null check (language in ('en', 'es', 'fr', 'it')),
  level text not null check (level in ('A1', 'A2', 'B1', 'B2')),
  front text not null check (char_length(front) between 1 and 1000),
  back text not null check (char_length(back) between 1 and 1000),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index learning_readings_catalog_idx
  on public.learning_readings (language, level, sort_order)
  where is_published;

create index grammar_lessons_catalog_idx
  on public.grammar_lessons (language, level, sort_order)
  where is_published;

create index quick_lesson_flashcards_catalog_idx
  on public.quick_lesson_flashcards (language, level, sort_order)
  where is_published;

alter table public.learning_readings enable row level security;
alter table public.grammar_lessons enable row level security;
alter table public.quick_lesson_flashcards enable row level security;

create policy "Published readings are publicly readable"
  on public.learning_readings for select
  to anon, authenticated
  using (is_published);

create policy "Published grammar lessons are publicly readable"
  on public.grammar_lessons for select
  to anon, authenticated
  using (is_published);

create policy "Published flashcards are publicly readable"
  on public.quick_lesson_flashcards for select
  to anon, authenticated
  using (is_published);

create trigger learning_readings_set_updated_at
  before update on public.learning_readings
  for each row execute function public.set_updated_at();

create trigger grammar_lessons_set_updated_at
  before update on public.grammar_lessons
  for each row execute function public.set_updated_at();

create trigger quick_lesson_flashcards_set_updated_at
  before update on public.quick_lesson_flashcards
  for each row execute function public.set_updated_at();

grant select on public.learning_readings to anon, authenticated;
grant select on public.grammar_lessons to anon, authenticated;
grant select on public.quick_lesson_flashcards to anon, authenticated;
