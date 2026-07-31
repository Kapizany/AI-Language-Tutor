create table public.learning_activity_progress (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  activity_id text not null,
  activity_type text not null
    check (activity_type in ('reading', 'grammar', 'flashcard')),
  score integer not null default 0 check (score between 0 and 100),
  attempts integer not null default 1 check (attempts > 0),
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, activity_id)
);

create index learning_activity_progress_user_updated_idx
  on public.learning_activity_progress (user_id, updated_at desc);

alter table public.learning_activity_progress enable row level security;

create policy "Users can read their own learning progress"
  on public.learning_activity_progress for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own learning progress"
  on public.learning_activity_progress for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own learning progress"
  on public.learning_activity_progress for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create trigger learning_activity_progress_set_updated_at
  before update on public.learning_activity_progress
  for each row execute function public.set_updated_at();

grant select, insert, update on public.learning_activity_progress to authenticated;
