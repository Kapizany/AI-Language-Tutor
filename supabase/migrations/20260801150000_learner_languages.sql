-- Per-language levels so learners can study multiple languages and switch the active one.
create table public.learner_languages (
  user_id uuid not null references public.profiles (id) on delete cascade,
  target_language text not null,
  current_level text not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, target_language),
  constraint learner_languages_target_language
    check (target_language in ('en', 'es', 'fr', 'it')),
  constraint learner_languages_current_level
    check (current_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'unknown'))
);

create index learner_languages_user_created_idx
  on public.learner_languages (user_id, created_at);

insert into public.learner_languages (user_id, target_language, current_level)
select lp.user_id, lp.target_language, lp.current_level
from public.learner_preferences as lp
inner join public.profiles as p on p.id = lp.user_id
on conflict (user_id, target_language) do nothing;

alter table public.learner_languages enable row level security;

create policy "Users can read their studied languages"
  on public.learner_languages for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their studied languages"
  on public.learner_languages for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their studied languages"
  on public.learner_languages for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create trigger learner_languages_set_updated_at
  before update on public.learner_languages
  for each row execute function public.set_updated_at();

grant select, insert, update on public.learner_languages to authenticated;

create or replace function public.add_learner_language(
  p_target_language text,
  p_current_level text default 'unknown'
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
  if p_target_language not in ('en', 'es', 'fr', 'it') then
    raise exception 'Invalid target language';
  end if;
  if p_current_level not in ('A1', 'A2', 'B1', 'B2', 'C1', 'unknown') then
    raise exception 'Invalid current level';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = current_user_id
  ) then
    raise exception 'Profile not found';
  end if;

  insert into public.learner_languages (user_id, target_language, current_level)
  values (current_user_id, p_target_language, p_current_level)
  on conflict (user_id, target_language) do update
  set current_level = excluded.current_level;
end;
$$;

create or replace function public.update_learner_language_level(
  p_target_language text,
  p_current_level text
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
  if p_target_language not in ('en', 'es', 'fr', 'it') then
    raise exception 'Invalid target language';
  end if;
  if p_current_level not in ('A1', 'A2', 'B1', 'B2', 'C1', 'unknown') then
    raise exception 'Invalid current level';
  end if;

  update public.learner_languages
  set current_level = p_current_level
  where user_id = current_user_id
    and target_language = p_target_language;

  if not found then
    raise exception 'Language not found';
  end if;

  update public.learner_preferences
  set current_level = p_current_level
  where user_id = current_user_id
    and target_language = p_target_language;
end;
$$;

create or replace function public.switch_active_language(
  p_target_language text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  next_level text;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_target_language not in ('en', 'es', 'fr', 'it') then
    raise exception 'Invalid target language';
  end if;

  select ll.current_level
  into next_level
  from public.learner_languages ll
  where ll.user_id = current_user_id
    and ll.target_language = p_target_language;

  if next_level is null then
    raise exception 'Language not found';
  end if;

  update public.learner_preferences
  set
    target_language = p_target_language,
    current_level = next_level
  where user_id = current_user_id;

  if not found then
    raise exception 'Preferences not found';
  end if;
end;
$$;

revoke all on function public.add_learner_language(text, text) from public;
revoke all on function public.update_learner_language_level(text, text) from public;
revoke all on function public.switch_active_language(text) from public;

grant execute on function public.add_learner_language(text, text) to authenticated;
grant execute on function public.update_learner_language_level(text, text) to authenticated;
grant execute on function public.switch_active_language(text) to authenticated;

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

  insert into public.learner_languages (user_id, target_language, current_level)
  values (current_user_id, p_target_language, p_current_level)
  on conflict (user_id, target_language) do update
  set current_level = excluded.current_level;

  if p_complete_onboarding then
    insert into public.audit_events (actor_user_id, event_type, target_type, target_id)
    values (current_user_id, 'onboarding.completed', 'profile', current_user_id::text);
  end if;
end;
$$;
