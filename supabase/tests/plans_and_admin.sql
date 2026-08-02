begin;

set local role postgres;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'free-user@example.test', '',
    now(), '{}', '{"display_name":"Free User"}', now(), now()
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'admin-user@example.test', '',
    now(), '{}', '{"display_name":"Admin User"}', now(), now()
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'premium-user@example.test', '',
    now(), '{}', '{"display_name":"Premium User"}', now(), now()
  );

insert into public.learner_preferences (
  user_id, target_language, current_level, learning_goal,
  study_minutes_per_day, study_days_per_week
)
values
  ('20000000-0000-0000-0000-000000000001', 'en', 'A1', 'conversation', 10, 5),
  ('20000000-0000-0000-0000-000000000002', 'en', 'B1', 'career', 20, 5),
  ('20000000-0000-0000-0000-000000000003', 'es', 'A2', 'travel', 20, 5);

insert into public.user_roles (user_id, role)
values ('20000000-0000-0000-0000-000000000002', 'admin');

update public.user_subscriptions
set plan_id = 'premium', status = 'active'
where user_id = '20000000-0000-0000-0000-000000000003';

-- RLS: users cannot escalate privileges
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);

do $$
begin
  begin
    insert into public.user_roles (user_id, role)
    values ('20000000-0000-0000-0000-000000000001', 'admin');
    raise exception 'Authorization failure: user promoted themselves to admin';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.user_subscriptions
    set plan_id = 'premium'
    where user_id = '20000000-0000-0000-0000-000000000001';
    raise exception 'Authorization failure: user changed own subscription';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.admin_audit_logs (action, target_type, target_id)
    values ('forged.action', 'user', '20000000-0000-0000-0000-000000000001');
    raise exception 'Authorization failure: user wrote admin audit log';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

-- Users can read their own subscription
do $$
declare
  own_plan text;
begin
  select plan_id into own_plan
  from public.user_subscriptions
  where user_id = '20000000-0000-0000-0000-000000000001';

  if own_plan <> 'free' then
    raise exception 'Subscription failure: expected free plan for user A';
  end if;
end;
$$;

-- Admin RPC rejects non-admin
set local role service_role;

do $$
declare
  result jsonb;
begin
  begin
    perform public.admin_get_overview('20000000-0000-0000-0000-000000000001');
    raise exception 'Admin failure: non-admin accessed overview';
  exception
    when others then
      if position('Admin role required' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  result := public.admin_get_overview('20000000-0000-0000-0000-000000000002');
  if coalesce((result ->> 'users_total')::integer, 0) < 3 then
    raise exception 'Admin failure: overview returned unexpected user count';
  end if;
end;
$$;

-- Entitlements summary reflects free plan limits
do $$
declare
  summary jsonb;
begin
  summary := public.get_user_entitlements_summary('20000000-0000-0000-0000-000000000001');
  if summary ->> 'plan_id' <> 'free' then
    raise exception 'Entitlement failure: free user plan mismatch';
  end if;
  if (summary #>> '{usage,conversation_sessions,limit}')::numeric <> 2 then
    raise exception 'Entitlement failure: free session limit mismatch';
  end if;
  if (summary #>> '{usage,llm_requests,limit}')::numeric <> 40 then
    raise exception 'Entitlement failure: free llm request limit mismatch';
  end if;
  if (summary #>> '{usage,transcriptions,limit}')::numeric <> 10 then
    raise exception 'Entitlement failure: free transcription limit mismatch';
  end if;
end;
$$;

-- Plan change is audited
do $$
declare
  audit_count integer;
begin
  perform public.admin_change_user_plan(
    '20000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'premium'
  );

  select count(*) into audit_count
  from public.admin_audit_logs
  where action = 'user.plan_changed'
    and target_id = '20000000-0000-0000-0000-000000000001';

  if audit_count <> 1 then
    raise exception 'Audit failure: plan change was not logged';
  end if;
end;
$$;

-- Admin role grant/revoke is audited
do $$
declare
  summary jsonb;
  result jsonb;
  audit_count integer;
begin
  summary := public.admin_get_user_summary(
    '20000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001'
  );
  if coalesce(summary ->> 'is_admin', 'false') <> 'false' then
    raise exception 'Admin summary failure: free user should not be admin';
  end if;

  result := public.admin_set_user_admin_role(
    '20000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    true
  );
  if coalesce(result ->> 'updated', 'false') <> 'true' then
    raise exception 'Admin role failure: grant did not succeed';
  end if;

  summary := public.admin_get_user_summary(
    '20000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001'
  );
  if coalesce(summary ->> 'is_admin', 'false') <> 'true' then
    raise exception 'Admin summary failure: granted user should be admin';
  end if;

  select count(*) into audit_count
  from public.admin_audit_logs
  where action = 'user.admin_granted'
    and target_id = '20000000-0000-0000-0000-000000000001';

  if audit_count <> 1 then
    raise exception 'Audit failure: admin grant was not logged';
  end if;

  result := public.admin_set_user_admin_role(
    '20000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    false
  );
  if coalesce(result ->> 'updated', 'false') <> 'true' then
    raise exception 'Admin role failure: revoke did not succeed';
  end if;

  result := public.admin_set_user_admin_role(
    '20000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    false
  );
  if coalesce(result ->> 'reason', '') <> 'cannot_revoke_self' then
    raise exception 'Admin role failure: self-revoke should be blocked';
  end if;
end;
$$;

-- Suspension blocks conversation start
do $$
declare
  start_result jsonb;
begin
  perform public.admin_set_account_status(
    '20000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'suspended',
    'test suspension'
  );

  start_result := public.start_conversation_session(
    '20000000-0000-0000-0000-000000000001',
    (select id from public.conversation_scenarios where is_published limit 1),
    'en',
    'A1'
  );

  if coalesce(start_result ->> 'reason', '') <> 'account_suspended' then
    raise exception 'Suspension failure: active guard did not block conversation start';
  end if;
end;
$$;

-- Entitlements summary reflects premium plan limits
do $$
declare
  summary jsonb;
begin
  summary := public.get_user_entitlements_summary('20000000-0000-0000-0000-000000000003');
  if summary ->> 'plan_id' <> 'premium' then
    raise exception 'Entitlement failure: premium user plan mismatch';
  end if;
  if (summary #>> '{usage,conversation_sessions,limit}')::numeric <> 20 then
    raise exception 'Entitlement failure: premium session limit mismatch';
  end if;
end;
$$;

rollback;
