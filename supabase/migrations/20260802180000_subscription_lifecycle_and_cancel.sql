-- Persist subscription lifecycle dates for customer and administrator visibility.

alter table public.user_subscriptions
  add column if not exists renews_at timestamptz;

create or replace function public.process_billing_event(
  p_provider text,
  p_event_key text,
  p_payload jsonb,
  p_user_id uuid,
  p_external_subscription_id text,
  p_external_customer_id text,
  p_mp_status text,
  p_billing_cycle text default null,
  p_ends_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sync_result jsonb;
  provider_started_at timestamptz;
  provider_renews_at timestamptz;
  normalized_status text;
begin
  if exists (
    select 1
    from public.billing_events
    where provider = p_provider and event_key = p_event_key
  ) then
    return jsonb_build_object(
      'updated', true,
      'reason', 'duplicate_event',
      'subscription_status', lower(coalesce(p_mp_status, ''))
    );
  end if;

  begin
    provider_started_at := nullif(p_payload ->> 'date_created', '')::timestamptz;
  exception when invalid_datetime_format then
    provider_started_at := null;
  end;

  begin
    provider_renews_at := nullif(p_payload ->> 'next_payment_date', '')::timestamptz;
  exception when invalid_datetime_format then
    provider_renews_at := null;
  end;

  normalized_status := lower(coalesce(p_mp_status, ''));

  sync_result := public.sync_billing_subscription(
    p_user_id,
    p_external_subscription_id,
    p_external_customer_id,
    p_mp_status,
    p_billing_cycle,
    coalesce(p_ends_at, case
      when normalized_status in ('cancelled', 'canceled', 'paused')
        then provider_renews_at
      else null
    end)
  );

  if coalesce((sync_result ->> 'updated')::boolean, false) is false then
    return sync_result;
  end if;

  update public.user_subscriptions
  set started_at = case
        when normalized_status in ('authorized', 'active')
          then coalesce(provider_started_at, started_at)
        else started_at
      end,
      renews_at = case
        when normalized_status in ('authorized', 'active') then provider_renews_at
        when normalized_status in ('cancelled', 'canceled', 'paused') then null
        else renews_at
      end,
      ends_at = case
        when normalized_status in ('cancelled', 'canceled', 'paused')
          then coalesce(p_ends_at, provider_renews_at, ends_at)
        else ends_at
      end,
      updated_at = now()
  where user_id = p_user_id
    and external_subscription_id = p_external_subscription_id;

  insert into public.billing_events (provider, event_key, payload)
  values (p_provider, p_event_key, coalesce(p_payload, '{}'::jsonb))
  on conflict (provider, event_key) do nothing;

  return sync_result || jsonb_build_object(
    'started_at', provider_started_at,
    'renews_at', case
      when normalized_status in ('authorized', 'active') then provider_renews_at
      else null
    end,
    'ends_at', case
      when normalized_status in ('cancelled', 'canceled', 'paused')
        then coalesce(p_ends_at, provider_renews_at)
      else null
    end
  );
end;
$$;

create or replace function public.get_user_entitlements_summary(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan_id text;
  v_account_status text;
  v_sessions_today integer;
  v_llm_requests_today integer;
  v_llm_cost_today numeric(12, 8);
  v_transcriptions_today integer;
  v_syntheses_today integer;
  v_session_limit numeric;
  v_llm_request_limit numeric;
  v_llm_cost_limit numeric;
  v_transcription_limit numeric;
  v_synthesis_limit numeric;
  v_subscription public.user_subscriptions%rowtype;
begin
  select account_status
  into v_account_status
  from public.profiles
  where id = p_user_id;

  if v_account_status is null then
    return jsonb_build_object('found', false);
  end if;

  v_plan_id := public.resolve_user_plan(p_user_id);

  select *
  into v_subscription
  from public.user_subscriptions
  where user_id = p_user_id;

  v_session_limit := public.get_entitlement_limit(v_plan_id, 'conversation_session', 'count');
  v_llm_request_limit := public.get_entitlement_limit(v_plan_id, 'llm_request', 'count');
  v_llm_cost_limit := public.get_entitlement_limit(v_plan_id, 'llm_cost_usd', 'cost_usd');
  v_transcription_limit := public.get_entitlement_limit(v_plan_id, 'transcription', 'count');
  v_synthesis_limit := public.get_entitlement_limit(v_plan_id, 'speech_synthesis', 'count');

  select count(*)
  into v_sessions_today
  from public.conversation_sessions cs
  where cs.user_id = p_user_id
    and cs.started_at >= date_trunc('day', now())
    and (cs.status <> 'abandoned' or cs.learner_message_count > 0);

  select count(*),
         coalesce(sum(
           case
             when status = 'reserved' then reserved_cost_usd
             when status = 'succeeded' then estimated_cost_usd
             else 0
           end
         ), 0)
  into v_llm_requests_today, v_llm_cost_today
  from public.llm_usage_events
  where user_id = p_user_id
    and created_at >= date_trunc('day', now())
    and status in ('reserved', 'succeeded');

  select count(*)
  into v_transcriptions_today
  from public.speech_transcription_attempts sta
  where sta.user_id = p_user_id
    and sta.attempted_at >= date_trunc('day', now());

  select count(*)
  into v_syntheses_today
  from public.speech_synthesis_attempts ssa
  where ssa.user_id = p_user_id
    and ssa.attempted_at >= date_trunc('day', now());

  return jsonb_build_object(
    'found', true,
    'plan_id', v_plan_id,
    'account_status', v_account_status,
    'max_learner_messages_per_session', public.plan_session_message_limit(v_plan_id),
    'subscription_status', coalesce(v_subscription.status, 'active'),
    'subscription_started_at', case
      when v_subscription.plan_id = 'premium' then v_subscription.started_at
      else null
    end,
    'subscription_ends_at', v_subscription.ends_at,
    'subscription_renews_at', v_subscription.renews_at,
    'billing_cycle', v_subscription.billing_cycle,
    'subscription_source', coalesce(v_subscription.subscription_source, 'system'),
    'can_manage_billing', coalesce(v_subscription.subscription_source, 'system') = 'mercadopago',
    'usage', jsonb_build_object(
      'conversation_sessions', jsonb_build_object(
        'used', v_sessions_today,
        'limit', v_session_limit
      ),
      'llm_requests', jsonb_build_object(
        'used', v_llm_requests_today,
        'limit', v_llm_request_limit
      ),
      'llm_cost_usd', jsonb_build_object(
        'used', v_llm_cost_today,
        'limit', v_llm_cost_limit
      ),
      'transcriptions', jsonb_build_object(
        'used', v_transcriptions_today,
        'limit', v_transcription_limit
      ),
      'speech_syntheses', jsonb_build_object(
        'used', v_syntheses_today,
        'limit', v_synthesis_limit
      )
    )
  );
end;
$$;

create or replace function public.admin_search_users(
  p_actor_user_id uuid,
  p_query text default '',
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.user_is_admin(p_actor_user_id) then
    raise exception 'Admin role required';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(search_row))
    from (
      select
        p.id as user_id,
        left(coalesce(au.email, ''), 1) || '***@' ||
          split_part(coalesce(au.email, 'unknown'), '@', 2) as email_masked,
        p.display_name,
        p.account_status,
        p.onboarding_completed,
        coalesce(us.plan_id, 'free') as plan_id,
        coalesce(us.status, 'active') as subscription_status,
        case when us.plan_id = 'premium' then us.started_at else null end
          as subscription_started_at,
        us.ends_at as subscription_ends_at,
        us.renews_at as subscription_renews_at,
        us.billing_cycle,
        coalesce(us.subscription_source, 'system') as subscription_source,
        p.created_at
      from public.profiles p
      left join auth.users au on au.id = p.id
      left join public.user_subscriptions us on us.user_id = p.id
      where p_query = ''
        or p.id::text = p_query
        or au.email ilike '%' || p_query || '%'
        or p.display_name ilike '%' || p_query || '%'
      order by p.created_at desc
      limit greatest(p_limit, 1)
      offset greatest(p_offset, 0)
    ) search_row
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_get_user_summary(
  p_actor_user_id uuid,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  summary jsonb;
begin
  if not public.user_is_admin(p_actor_user_id) then
    raise exception 'Admin role required';
  end if;

  select jsonb_build_object(
    'user_id', p.id,
    'email_masked', left(coalesce(au.email, ''), 1) || '***@' ||
      split_part(coalesce(au.email, 'unknown'), '@', 2),
    'display_name', p.display_name,
    'account_status', p.account_status,
    'suspended_at', p.suspended_at,
    'suspended_reason', p.suspended_reason,
    'onboarding_completed', p.onboarding_completed,
    'plan_id', coalesce(us.plan_id, 'free'),
    'subscription_status', coalesce(us.status, 'active'),
    'subscription_started_at', case
      when us.plan_id = 'premium' then us.started_at
      else null
    end,
    'subscription_ends_at', us.ends_at,
    'subscription_renews_at', us.renews_at,
    'billing_cycle', us.billing_cycle,
    'subscription_source', coalesce(us.subscription_source, 'system'),
    'is_admin', public.user_is_admin(p.id),
    'created_at', p.created_at,
    'target_language', lp.target_language,
    'current_level', lp.current_level,
    'conversation_sessions', (
      select count(*) from public.conversation_sessions cs where cs.user_id = p.id
    ),
    'conversation_completed', (
      select count(*)
      from public.conversation_sessions cs
      where cs.user_id = p.id and cs.status = 'completed'
    ),
    'llm_cost_usd', (
      select coalesce(sum(estimated_cost_usd), 0)
      from public.llm_usage_events
      where user_id = p.id and status = 'succeeded'
    ),
    'entitlements', public.get_user_entitlements_summary(p.id)
  )
  into summary
  from public.profiles p
  left join auth.users au on au.id = p.id
  left join public.user_subscriptions us on us.user_id = p.id
  left join public.learner_preferences lp on lp.user_id = p.id
  where p.id = p_target_user_id;

  return coalesce(summary, jsonb_build_object('found', false));
end;
$$;

create or replace function public.admin_change_user_plan(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_plan_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_plan text;
begin
  if not public.user_is_admin(p_actor_user_id) then
    raise exception 'Admin role required';
  end if;

  if not exists (select 1 from public.plans where id = p_plan_id and is_active) then
    return jsonb_build_object('updated', false, 'reason', 'invalid_plan');
  end if;

  select coalesce(plan_id, 'free')
  into previous_plan
  from public.user_subscriptions
  where user_id = p_target_user_id;

  insert into public.user_subscriptions (
    user_id, plan_id, status, started_at, subscription_source, ends_at, renews_at
  )
  values (p_target_user_id, p_plan_id, 'active', now(), 'admin', null, null)
  on conflict (user_id) do update
  set plan_id = excluded.plan_id,
      status = 'active',
      started_at = case
        when user_subscriptions.plan_id is distinct from excluded.plan_id then now()
        else user_subscriptions.started_at
      end,
      subscription_source = 'admin',
      ends_at = null,
      renews_at = null,
      updated_at = now();

  insert into public.admin_audit_logs (
    actor_user_id, action, target_type, target_id, previous_state, new_state
  )
  values (
    p_actor_user_id,
    'user.plan_changed',
    'user',
    p_target_user_id::text,
    jsonb_build_object('plan_id', coalesce(previous_plan, 'free')),
    jsonb_build_object('plan_id', p_plan_id)
  );

  return jsonb_build_object('updated', true, 'plan_id', p_plan_id);
end;
$$;

revoke all on function public.process_billing_event(
  text, text, jsonb, uuid, text, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.get_user_entitlements_summary(uuid)
  from public, anon, authenticated;
revoke all on function public.admin_search_users(uuid, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.admin_get_user_summary(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.admin_change_user_plan(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.process_billing_event(
  text, text, jsonb, uuid, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.get_user_entitlements_summary(uuid) to service_role;
grant execute on function public.admin_search_users(uuid, text, integer, integer)
  to service_role;
grant execute on function public.admin_get_user_summary(uuid, uuid)
  to service_role;
grant execute on function public.admin_change_user_plan(uuid, uuid, text)
  to service_role;
