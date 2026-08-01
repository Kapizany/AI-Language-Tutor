-- Remaining structured preferences from the Phase 3 onboarding audit.
alter table public.learner_preferences
  add column correction_preference text not null default 'immediate'
    check (correction_preference in ('immediate', 'grouped', 'final')),
  add column interests text[] not null default '{}'
    check (cardinality(interests) <= 12),
  add column desired_scenarios text[] not null default '{}'
    check (cardinality(desired_scenarios) <= 12);

-- Generic, append-only security/operation audit foundation. There is
-- intentionally no authenticated policy: browser clients cannot read or write
-- audit records. Administrative reporting will consume it through backend-only
-- endpoints in Phase 6.
create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references public.profiles (id) on delete set null,
  event_type text not null check (char_length(event_type) between 3 and 100),
  target_type text check (target_type is null or char_length(target_type) <= 100),
  target_id text check (target_id is null or char_length(target_id) <= 200),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index audit_events_actor_created_idx
  on public.audit_events (actor_user_id, created_at desc);
create index audit_events_type_created_idx
  on public.audit_events (event_type, created_at desc);

alter table public.audit_events enable row level security;
revoke all on public.audit_events from anon, authenticated;
grant select, insert on public.audit_events to service_role;

create or replace function public.save_learner_settings(
  p_display_name text,
  p_target_language text,
  p_current_level text,
  p_learning_goal text,
  p_study_minutes_per_day integer,
  p_study_days_per_week integer,
  p_complete_onboarding boolean default false,
  p_correction_preference text default 'immediate',
  p_interests text[] default '{}',
  p_desired_scenarios text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_correction_preference not in ('immediate', 'grouped', 'final') then
    raise exception 'Invalid correction preference';
  end if;
  if cardinality(p_interests) > 12 or cardinality(p_desired_scenarios) > 12 then
    raise exception 'Too many onboarding selections';
  end if;

  update public.profiles
  set
    display_name = trim(p_display_name),
    native_language = 'pt-BR',
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
    study_days_per_week,
    correction_preference,
    interests,
    desired_scenarios
  )
  values (
    current_user_id,
    p_target_language,
    p_current_level,
    p_learning_goal,
    p_study_minutes_per_day,
    p_study_days_per_week,
    p_correction_preference,
    coalesce(p_interests, '{}'),
    coalesce(p_desired_scenarios, '{}')
  )
  on conflict (user_id) do update
  set
    target_language = excluded.target_language,
    current_level = excluded.current_level,
    learning_goal = excluded.learning_goal,
    study_minutes_per_day = excluded.study_minutes_per_day,
    study_days_per_week = excluded.study_days_per_week,
    correction_preference = excluded.correction_preference,
    interests = excluded.interests,
    desired_scenarios = excluded.desired_scenarios;

  if p_complete_onboarding then
    insert into public.audit_events (actor_user_id, event_type, target_type, target_id)
    values (current_user_id, 'onboarding.completed', 'profile', current_user_id::text);
  end if;
end;
$$;

revoke all on function public.save_learner_settings(
  text, text, text, text, integer, integer, boolean
) from public, authenticated;

revoke all on function public.save_learner_settings(
  text, text, text, text, integer, integer, boolean, text, text[], text[]
) from public;

grant execute on function public.save_learner_settings(
  text, text, text, text, integer, integer, boolean, text, text[], text[]
) to authenticated;
