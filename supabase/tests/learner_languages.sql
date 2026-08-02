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
values (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'learner-languages@example.test',
  '',
  now(),
  '{}',
  '{"display_name":"Languages Test"}',
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
values (
  '10000000-0000-0000-0000-000000000001',
  'en',
  'A1',
  'conversation',
  20,
  5
);

insert into public.learner_languages (user_id, target_language, current_level)
values ('10000000-0000-0000-0000-000000000001', 'en', 'A1');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select public.add_learner_language('es', 'A2');

select public.switch_active_language('es');

do $$
begin
  if (
    select target_language || ':' || current_level
    from public.learner_preferences
    where user_id = '10000000-0000-0000-0000-000000000001'
  ) <> 'es:A2' then
    raise exception 'switch_active_language failed to update active preferences';
  end if;
end;
$$;

select public.update_learner_language_level('en', 'B1');

select public.switch_active_language('en');

do $$
begin
  if (
    select target_language || ':' || current_level
    from public.learner_preferences
    where user_id = '10000000-0000-0000-0000-000000000001'
  ) <> 'en:B1' then
    raise exception 'switch back to english failed to restore saved level';
  end if;

  if (
    select count(*)
    from public.learner_languages
    where user_id = '10000000-0000-0000-0000-000000000001'
  ) <> 2 then
    raise exception 'expected two studied languages';
  end if;
end;
$$;

rollback;
