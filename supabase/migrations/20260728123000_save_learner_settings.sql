create or replace function public.save_learner_settings(
  p_display_name text,
  p_target_language text,
  p_current_level text,
  p_learning_goal text,
  p_study_minutes_per_day integer,
  p_study_days_per_week integer,
  p_complete_onboarding boolean default false
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.profiles
  set
    display_name = trim(p_display_name),
    onboarding_completed = onboarding_completed or p_complete_onboarding,
    terms_accepted_at = case
      when p_complete_onboarding then coalesce(terms_accepted_at, now())
      else terms_accepted_at
    end,
    privacy_policy_version = case
      when p_complete_onboarding then coalesce(privacy_policy_version, '2026-07-28')
      else privacy_policy_version
    end
  where id = current_user_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  insert into public.learner_preferences (
    user_id,
    target_language,
    current_level,
    learning_goal,
    study_minutes_per_day,
    study_days_per_week
  )
  values (
    current_user_id,
    p_target_language,
    p_current_level,
    p_learning_goal,
    p_study_minutes_per_day,
    p_study_days_per_week
  )
  on conflict (user_id) do update
  set
    target_language = excluded.target_language,
    current_level = excluded.current_level,
    learning_goal = excluded.learning_goal,
    study_minutes_per_day = excluded.study_minutes_per_day,
    study_days_per_week = excluded.study_days_per_week;
end;
$$;

revoke all on function public.save_learner_settings(
  text,
  text,
  text,
  text,
  integer,
  integer,
  boolean
) from public;

grant execute on function public.save_learner_settings(
  text,
  text,
  text,
  text,
  integer,
  integer,
  boolean
) to authenticated;
