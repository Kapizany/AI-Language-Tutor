create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  native_language text not null default 'pt-BR',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) <= 100)
);

create table public.learner_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  target_language text not null,
  current_level text not null,
  learning_goal text not null,
  study_minutes_per_day integer not null,
  study_days_per_week integer not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learner_preferences_target_language
    check (target_language in ('en', 'es', 'fr', 'it')),
  constraint learner_preferences_current_level
    check (current_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'unknown')),
  constraint learner_preferences_learning_goal
    check (learning_goal in ('travel', 'career', 'conversation', 'exam')),
  constraint learner_preferences_study_minutes
    check (study_minutes_per_day in (10, 20, 30, 45)),
  constraint learner_preferences_study_days
    check (study_days_per_week between 1 and 7)
);

alter table public.profiles enable row level security;
alter table public.learner_preferences enable row level security;

insert into public.profiles (id, display_name)
select id, coalesce(raw_user_meta_data ->> 'display_name', '')
from auth.users
on conflict (id) do nothing;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Users can create their own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "Users can read their own learning preferences"
  on public.learner_preferences for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own learning preferences"
  on public.learner_preferences for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own learning preferences"
  on public.learner_preferences for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger learner_preferences_set_updated_at
  before update on public.learner_preferences
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.learner_preferences to authenticated;
