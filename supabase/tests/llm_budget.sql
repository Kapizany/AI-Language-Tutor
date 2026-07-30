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
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'budget-user-a@example.test',
    '',
    now(),
    '{}',
    '{"display_name":"Budget A"}',
    now(),
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'budget-user-b@example.test',
    '',
    now(),
    '{}',
    '{"display_name":"Budget B"}',
    now(),
    now()
  );

set local role service_role;

do $$
declare
  reservation jsonb;
  duplicate_reservation jsonb;
begin
  reservation := public.reserve_llm_budget(
    '20000000-0000-0000-0000-000000000001',
    '21111111-1111-4111-8111-111111111111',
    'tutor_reply',
    'mock',
    'deterministic-tutor-v1',
    0.01
  );

  if not (reservation ->> 'allowed')::boolean then
    raise exception 'Budget failure: valid reservation was blocked';
  end if;

  duplicate_reservation := public.reserve_llm_budget(
    '20000000-0000-0000-0000-000000000001',
    '21111111-1111-4111-8111-111111111111',
    'tutor_reply',
    'mock',
    'deterministic-tutor-v1',
    0.01
  );

  if (duplicate_reservation ->> 'allowed')::boolean then
    raise exception 'Budget failure: duplicate request was accepted';
  end if;
end;
$$;

select public.finalize_llm_usage(
  '21111111-1111-4111-8111-111111111111',
  'succeeded',
  'mock',
  'deterministic-tutor-v1',
  10,
  20,
  0,
  25,
  null
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);

do $$
begin
  if (select count(*) from public.llm_usage_events) <> 1 then
    raise exception 'RLS failure: owner cannot read own usage';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);

do $$
begin
  if (select count(*) from public.llm_usage_events) <> 0 then
    raise exception 'RLS failure: another user can read usage';
  end if;
end;
$$;

rollback;
