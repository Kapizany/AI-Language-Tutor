create table public.learning_activity_events (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  activity_id text not null,
  activity_type text not null check (
    activity_type in ('reading', 'grammar', 'quick_lesson', 'review')
  ),
  score integer not null check (score between 0 and 100),
  completed_at timestamptz not null default now()
);

create index learning_activity_events_user_completed_idx
  on public.learning_activity_events (user_id, completed_at desc);

alter table public.learning_activity_events enable row level security;

create policy "Users can read their own learning activity events"
  on public.learning_activity_events for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.learning_activity_events to authenticated;

-- Preserve the latest known completion for existing users. Earlier repeated
-- attempts cannot be reconstructed from the previous summary-only table.
insert into public.learning_activity_events (
  user_id,
  activity_id,
  activity_type,
  score,
  completed_at
)
select
  user_id,
  activity_id,
  case when activity_type = 'flashcard' then 'review' else activity_type end,
  score,
  completed_at
from public.learning_activity_progress;

create or replace function public.record_learning_activity_progress(
  p_activity_id text,
  p_activity_type text,
  p_score integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  activity_exists boolean := false;
  completion_time timestamptz := now();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_score < 0 or p_score > 100 then
    raise exception 'Invalid score';
  end if;

  case p_activity_type
    when 'quick_lesson' then
      select exists(select 1 from public.quick_lessons where id = p_activity_id and is_published)
        into activity_exists;
    when 'reading' then
      select exists(select 1 from public.reading_passages where id = p_activity_id and is_published)
        into activity_exists;
    when 'grammar' then
      select exists(select 1 from public.grammar_exercises where id = p_activity_id and is_published)
        into activity_exists;
    when 'review' then
      select exists(select 1 from public.review_flashcards where id = p_activity_id and is_published)
        into activity_exists;
    else
      raise exception 'Invalid activity type';
  end case;

  if not activity_exists then
    raise exception 'Activity not found';
  end if;

  insert into public.learning_activity_events (
    user_id, activity_id, activity_type, score, completed_at
  ) values (
    current_user_id, p_activity_id, p_activity_type, p_score, completion_time
  );

  insert into public.learning_activity_progress (
    user_id, activity_id, activity_type, score, attempts, completed_at
  ) values (
    current_user_id, p_activity_id, p_activity_type, p_score, 1, completion_time
  )
  on conflict (user_id, activity_id) do update
  set activity_type = excluded.activity_type,
      score = excluded.score,
      attempts = public.learning_activity_progress.attempts + 1,
      completed_at = completion_time;
end;
$$;
