alter table public.learning_readings rename to quick_lessons;
alter table public.quick_lesson_flashcards rename to review_flashcards;

create table public.reading_passages (
  id text primary key,
  language text not null check (language in ('en', 'es', 'fr', 'it')),
  level text not null check (level in ('A1', 'A2', 'B1', 'B2')),
  title text not null check (char_length(title) between 1 and 160),
  body text not null check (char_length(body) between 1 and 20000),
  questions jsonb not null check (
    jsonb_typeof(questions) = 'array'
    and jsonb_array_length(questions) between 3 and 7
  ),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (level = 'A1' and jsonb_array_length(questions) = 3)
    or (level = 'A2' and jsonb_array_length(questions) = 4)
    or (level = 'B1' and jsonb_array_length(questions) = 5)
    or (level = 'B2' and jsonb_array_length(questions) = 7)
  ),
  check (
    level not in ('B1', 'B2')
    or array_length(regexp_split_to_array(body, E'\\n[[:space:]]*\\n'), 1) >= 5
  )
);

create index reading_passages_catalog_idx
  on public.reading_passages (language, level, sort_order)
  where is_published;

alter table public.reading_passages enable row level security;

create policy "Published reading passages are publicly readable"
  on public.reading_passages for select
  to anon, authenticated
  using (is_published);

create trigger reading_passages_set_updated_at
  before update on public.reading_passages
  for each row execute function public.set_updated_at();

grant select on public.reading_passages to anon, authenticated;

alter table public.learning_activity_progress
  drop constraint learning_activity_progress_activity_type_check;

alter table public.learning_activity_progress
  add constraint learning_activity_progress_activity_type_check
  check (
    activity_type in (
      'reading',
      'grammar',
      'flashcard',
      'quick_lesson',
      'review'
    )
  );
