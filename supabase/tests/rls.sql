begin;

set local role postgres;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'rls-user-a@example.test',
    '',
    now(),
    '{}',
    '{"display_name":"RLS A"}',
    now(),
    now()
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'rls-user-b@example.test',
    '',
    now(),
    '{}',
    '{"display_name":"RLS B"}',
    now(),
    now()
  );

insert into public.learner_preferences (
  user_id,
  target_language,
  current_level,
  learning_goal,
  study_minutes_per_day,
  study_days_per_week
)
values
  ('10000000-0000-0000-0000-000000000001', 'en', 'A1', 'conversation', 20, 5),
  ('10000000-0000-0000-0000-000000000002', 'es', 'A2', 'travel', 30, 4);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

do $$
begin
  if (select count(*) from public.profiles) <> 1 then
    raise exception 'RLS failure: user A can see another profile';
  end if;

  if (select count(*) from public.learner_preferences) <> 1 then
    raise exception 'RLS failure: user A can see another preference row';
  end if;

  if exists (
    select 1
    from public.learner_preferences
    where user_id = '10000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'RLS failure: user A can read user B preferences';
  end if;
end;
$$;

do $$
begin
  begin
    update public.learner_preferences
    set current_level = 'B2'
    where user_id = '10000000-0000-0000-0000-000000000002';
    raise exception 'Authorization failure: direct preference update was allowed';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

select public.save_learner_settings(
  'Updated A',
  'fr',
  'B1',
  'career',
  60,
  6,
  true
);

set local role postgres;

do $$
begin
  if (
    select current_level
    from public.learner_preferences
    where user_id = '10000000-0000-0000-0000-000000000002'
  ) <> 'A2' then
    raise exception 'RLS failure: user A modified user B preferences';
  end if;

  if (
    select target_language
    from public.learner_preferences
    where user_id = '10000000-0000-0000-0000-000000000001'
  ) <> 'fr' then
    raise exception 'Settings failure: user A preferences were not updated';
  end if;

  if not (
    select onboarding_completed
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Settings failure: onboarding was not completed';
  end if;
end;
$$;

rollback;
