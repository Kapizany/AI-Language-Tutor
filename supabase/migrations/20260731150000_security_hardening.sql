-- Prevent property-level authorization bypasses. Mutations are exposed only
-- through narrowly scoped RPCs that derive the user id from the JWT.
revoke insert, update on public.profiles from authenticated;
revoke insert, update on public.learner_preferences from authenticated;

drop policy if exists "Users can create their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Users can create their own preferences" on public.learner_preferences;
drop policy if exists "Users can update their own preferences" on public.learner_preferences;

alter function public.save_learner_settings(
  text, text, text, text, integer, integer, boolean
) security definer;

-- Learning content is part of the authenticated product, not a public API.
drop policy if exists "Published readings are publicly readable" on public.quick_lessons;
drop policy if exists "Published grammar lessons are publicly readable" on public.grammar_exercises;
drop policy if exists "Published flashcards are publicly readable" on public.review_flashcards;
drop policy if exists "Published reading passages are publicly readable" on public.reading_passages;
drop policy if exists "Published grammar topics are publicly readable" on public.grammar_topics;

revoke select on public.quick_lessons from anon;
revoke select on public.grammar_exercises from anon;
revoke select on public.review_flashcards from anon;
revoke select on public.reading_passages from anon;
revoke select on public.grammar_topics from anon;

create policy "Published quick lessons are authenticated readable"
  on public.quick_lessons for select to authenticated using (is_published);
create policy "Published grammar exercises are authenticated readable"
  on public.grammar_exercises for select to authenticated using (is_published);
create policy "Published review flashcards are authenticated readable"
  on public.review_flashcards for select to authenticated using (is_published);
create policy "Published reading passages are authenticated readable"
  on public.reading_passages for select to authenticated using (is_published);
create policy "Published grammar topics are authenticated readable"
  on public.grammar_topics for select to authenticated using (is_published);

-- Attempts and scores are server-calculated. Direct table writes allowed users
-- to forge analytics or submit identifiers that do not exist in the catalog.
revoke insert, update on public.learning_activity_progress from authenticated;
drop policy if exists "Users can create their own learning progress"
  on public.learning_activity_progress;
drop policy if exists "Users can update their own learning progress"
  on public.learning_activity_progress;

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

  insert into public.learning_activity_progress (
    user_id, activity_id, activity_type, score, attempts, completed_at
  ) values (
    current_user_id, p_activity_id, p_activity_type, p_score, 1, now()
  )
  on conflict (user_id, activity_id) do update
  set activity_type = excluded.activity_type,
      score = excluded.score,
      attempts = public.learning_activity_progress.attempts + 1,
      completed_at = now();
end;
$$;

revoke all on function public.record_learning_activity_progress(text, text, integer)
  from public;
grant execute on function public.record_learning_activity_progress(text, text, integer)
  to authenticated;
