create table public.learning_section_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  language text not null check (language in ('en', 'es', 'fr', 'it')),
  section text not null check (section in ('quick_lesson', 'reading', 'grammar')),
  level text not null check (level in ('A1', 'A2', 'B1', 'B2')),
  activity_id text not null,
  step_index integer not null default 0 check (step_index >= 0),
  correct_answers integer not null default 0 check (correct_answers >= 0),
  view text not null default 'activity' check (
    view in ('activity', 'explanations', 'exercises')
  ),
  updated_at timestamptz not null default now(),
  primary key (user_id, language, section, level)
);

create index learning_section_progress_user_updated_idx
  on public.learning_section_progress (user_id, updated_at desc);

alter table public.learning_section_progress enable row level security;

create policy "Users can read their own learning section progress"
  on public.learning_section_progress for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.learning_section_progress to authenticated;
revoke insert, update, delete on public.learning_section_progress from anon, authenticated;

create or replace function public.save_learning_section_progress(
  p_language text,
  p_section text,
  p_level text,
  p_activity_id text,
  p_step_index integer default 0,
  p_correct_answers integer default 0,
  p_view text default 'activity'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  activity_exists boolean := false;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_language not in ('en', 'es', 'fr', 'it')
    or p_section not in ('quick_lesson', 'reading', 'grammar')
    or p_level not in ('A1', 'A2', 'B1', 'B2')
    or p_step_index < 0
    or p_correct_answers < 0
    or p_view not in ('activity', 'explanations', 'exercises') then
    raise exception 'Invalid learning progress';
  end if;

  case p_section
    when 'quick_lesson' then
      select exists(
        select 1 from public.quick_lessons
        where id = p_activity_id
          and language = p_language
          and level = p_level
          and is_published
      ) into activity_exists;
    when 'reading' then
      select exists(
        select 1 from public.reading_passages
        where id = p_activity_id
          and language = p_language
          and level = p_level
          and is_published
      ) into activity_exists;
    when 'grammar' then
      select exists(
        select 1 from public.grammar_topics
        where id = p_activity_id
          and language = p_language
          and level = p_level
          and is_published
      ) into activity_exists;
  end case;

  if not activity_exists then
    raise exception 'Activity not found';
  end if;

  insert into public.learning_section_progress (
    user_id,
    language,
    section,
    level,
    activity_id,
    step_index,
    correct_answers,
    view,
    updated_at
  ) values (
    current_user_id,
    p_language,
    p_section,
    p_level,
    p_activity_id,
    p_step_index,
    p_correct_answers,
    p_view,
    now()
  )
  on conflict (user_id, language, section, level) do update
  set activity_id = excluded.activity_id,
      step_index = excluded.step_index,
      correct_answers = excluded.correct_answers,
      view = excluded.view,
      updated_at = now();
end;
$$;

revoke all on function public.save_learning_section_progress(
  text, text, text, text, integer, integer, text
) from public;
grant execute on function public.save_learning_section_progress(
  text, text, text, text, integer, integer, text
) to authenticated;
