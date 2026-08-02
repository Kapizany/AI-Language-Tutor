-- Asaas billing provider: generalize subscription source and payment method.

alter table public.user_subscriptions
  drop constraint if exists user_subscriptions_subscription_source_check;

alter table public.user_subscriptions
  add constraint user_subscriptions_subscription_source_check
  check (subscription_source in ('system', 'admin', 'mercadopago', 'asaas'));

alter table public.user_subscriptions
  add column if not exists payment_method text;

alter table public.billing_checkouts
  add column if not exists payment_method text;

-- Drop prior signatures so CREATE OR REPLACE does not leave ambiguous overloads.
drop function if exists public.create_billing_checkout(uuid, text, text);
drop function if exists public.sync_billing_subscription(uuid, text, text, text, text, timestamptz);
drop function if exists public.process_billing_event(
  text, text, jsonb, uuid, text, text, text, text, timestamptz
);

create or replace function public.create_billing_checkout(
  p_user_id uuid,
  p_billing_cycle text,
  p_external_subscription_id text,
  p_payment_method text default null,
  p_subscription_source text default 'asaas'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  checkout_id bigint;
begin
  if p_billing_cycle not in ('monthly', 'annual') then
    return jsonb_build_object('created', false, 'reason', 'invalid_billing_cycle');
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    return jsonb_build_object('created', false, 'reason', 'user_not_found');
  end if;

  insert into public.billing_checkouts (
    user_id,
    billing_cycle,
    external_subscription_id,
    status,
    payment_method
  )
  values (
    p_user_id,
    p_billing_cycle,
    p_external_subscription_id,
    'pending',
    p_payment_method
  )
  returning id into checkout_id;

  insert into public.user_subscriptions (
    user_id,
    plan_id,
    status,
    subscription_source,
    billing_cycle,
    external_subscription_id,
    payment_method
  )
  values (
    p_user_id,
    'free',
    'active',
    p_subscription_source,
    p_billing_cycle,
    p_external_subscription_id,
    p_payment_method
  )
  on conflict (user_id) do update
  set external_subscription_id = excluded.external_subscription_id,
      billing_cycle = excluded.billing_cycle,
      subscription_source = excluded.subscription_source,
      payment_method = excluded.payment_method,
      updated_at = now();

  return jsonb_build_object(
    'created', true,
    'checkout_id', checkout_id,
    'external_subscription_id', p_external_subscription_id
  );
end;
$$;

create or replace function public.sync_billing_subscription(
  p_user_id uuid,
  p_external_subscription_id text,
  p_external_customer_id text,
  p_mp_status text,
  p_billing_cycle text default null,
  p_ends_at timestamptz default null,
  p_subscription_source text default 'asaas',
  p_payment_method text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_status text;
  next_plan text;
  next_subscription_status text;
begin
  if not exists (select 1 from public.profiles where id = p_user_id) then
    return jsonb_build_object('updated', false, 'reason', 'user_not_found');
  end if;

  normalized_status := lower(coalesce(p_mp_status, ''));

  if normalized_status in ('authorized', 'active', 'confirmed', 'received') then
    next_plan := 'premium';
    next_subscription_status := 'active';
  elsif normalized_status in ('cancelled', 'canceled', 'paused', 'inactive', 'deleted') then
    next_plan := 'premium';
    next_subscription_status := 'canceled';
  elsif normalized_status in ('pending', 'awaiting_payment', 'created') then
    update public.billing_checkouts
    set status = 'pending',
        updated_at = now()
    where user_id = p_user_id
      and external_subscription_id = p_external_subscription_id;

    return jsonb_build_object(
      'updated', true,
      'plan_id', public.resolve_user_plan(p_user_id),
      'subscription_status', 'pending'
    );
  else
    return jsonb_build_object('updated', false, 'reason', 'unsupported_status');
  end if;

  insert into public.user_subscriptions (
    user_id,
    plan_id,
    status,
    external_customer_id,
    external_subscription_id,
    billing_cycle,
    subscription_source,
    payment_method,
    ends_at
  )
  values (
    p_user_id,
    next_plan,
    next_subscription_status,
    p_external_customer_id,
    p_external_subscription_id,
    p_billing_cycle,
    p_subscription_source,
    p_payment_method,
    case when next_subscription_status = 'canceled' then p_ends_at else null end
  )
  on conflict (user_id) do update
  set plan_id = excluded.plan_id,
      status = excluded.status,
      external_customer_id = coalesce(excluded.external_customer_id, user_subscriptions.external_customer_id),
      external_subscription_id = excluded.external_subscription_id,
      billing_cycle = coalesce(excluded.billing_cycle, user_subscriptions.billing_cycle),
      subscription_source = excluded.subscription_source,
      payment_method = coalesce(excluded.payment_method, user_subscriptions.payment_method),
      ends_at = case
        when excluded.status = 'active' then null
        when excluded.status = 'canceled' then coalesce(excluded.ends_at, user_subscriptions.ends_at)
        else user_subscriptions.ends_at
      end,
      updated_at = now();

  update public.billing_checkouts
  set status = case
        when next_subscription_status = 'active' then 'authorized'
        when next_subscription_status = 'canceled' then 'cancelled'
        else status
      end,
      updated_at = now()
  where user_id = p_user_id
    and external_subscription_id = p_external_subscription_id;

  return jsonb_build_object(
    'updated', true,
    'plan_id', public.resolve_user_plan(p_user_id),
    'subscription_status', next_subscription_status
  );
end;
$$;

create or replace function public.process_billing_event(
  p_provider text,
  p_event_key text,
  p_payload jsonb,
  p_user_id uuid,
  p_external_subscription_id text,
  p_external_customer_id text,
  p_mp_status text,
  p_billing_cycle text default null,
  p_ends_at timestamptz default null,
  p_subscription_source text default 'asaas',
  p_payment_method text default null
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
    provider_started_at := coalesce(
      nullif(p_payload ->> 'dateCreated', '')::timestamptz,
      nullif(p_payload ->> 'confirmedDate', '')::timestamptz,
      nullif(p_payload ->> 'paymentDate', '')::timestamptz
    );
  exception when invalid_datetime_format then
    provider_started_at := null;
  end;

  begin
    provider_renews_at := coalesce(
      nullif(p_payload ->> 'nextDueDate', '')::timestamptz,
      nullif(p_payload ->> 'next_payment_date', '')::timestamptz
    );
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
      when normalized_status in ('cancelled', 'canceled', 'paused', 'inactive', 'deleted')
        then provider_renews_at
      else null
    end),
    p_subscription_source,
    p_payment_method
  );

  if coalesce((sync_result ->> 'updated')::boolean, false) is false then
    return sync_result;
  end if;

  update public.user_subscriptions
  set started_at = case
        when normalized_status in ('authorized', 'active', 'confirmed', 'received')
          then coalesce(provider_started_at, started_at, now())
        else started_at
      end,
      renews_at = case
        when normalized_status in ('authorized', 'active', 'confirmed', 'received')
          then provider_renews_at
        when normalized_status in ('cancelled', 'canceled', 'paused', 'inactive', 'deleted')
          then null
        else renews_at
      end,
      ends_at = case
        when normalized_status in ('cancelled', 'canceled', 'paused', 'inactive', 'deleted')
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
      when normalized_status in ('authorized', 'active', 'confirmed', 'received')
        then provider_renews_at
      else null
    end,
    'ends_at', case
      when normalized_status in ('cancelled', 'canceled', 'paused', 'inactive', 'deleted')
        then coalesce(p_ends_at, provider_renews_at)
      else null
    end
  );
end;
$$;

-- Refresh entitlements helper for admin + profile views.
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
  v_speech_syntheses_today integer;
  v_session_limit numeric;
  v_llm_request_limit numeric;
  v_llm_cost_limit numeric;
  v_transcription_limit numeric;
  v_speech_synthesis_limit numeric;
  v_subscription public.user_subscriptions%rowtype;
begin
  select account_status
  into v_account_status
  from public.profiles
  where id = p_user_id;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  select *
  into v_subscription
  from public.user_subscriptions
  where user_id = p_user_id;

  v_plan_id := public.resolve_user_plan(p_user_id);

  select count(*)::integer
  into v_sessions_today
  from public.conversation_sessions
  where user_id = p_user_id
    and started_at >= date_trunc('day', now());

  select coalesce(sum(message_count), 0)::integer
  into v_llm_requests_today
  from public.conversation_sessions
  where user_id = p_user_id
    and started_at >= date_trunc('day', now());

  select coalesce(sum(estimated_cost_usd), 0)
  into v_llm_cost_today
  from public.llm_usage_events
  where user_id = p_user_id
    and created_at >= date_trunc('day', now());

  select count(*)::integer
  into v_transcriptions_today
  from public.speech_transcription_events
  where user_id = p_user_id
    and created_at >= date_trunc('day', now());

  select count(*)::integer
  into v_speech_syntheses_today
  from public.speech_synthesis_cache_hits
  where user_id = p_user_id
    and created_at >= date_trunc('day', now());

  select daily_conversation_sessions, daily_llm_requests, daily_llm_cost_usd,
         daily_transcriptions, daily_speech_syntheses
  into v_session_limit, v_llm_request_limit, v_llm_cost_limit,
       v_transcription_limit, v_speech_synthesis_limit
  from public.plans
  where id = v_plan_id;

  return jsonb_build_object(
    'found', true,
    'plan_id', v_plan_id,
    'account_status', v_account_status,
    'subscription_status', coalesce(v_subscription.status, 'active'),
    'subscription_started_at', v_subscription.started_at,
    'subscription_ends_at', v_subscription.ends_at,
    'subscription_renews_at', v_subscription.renews_at,
    'billing_cycle', v_subscription.billing_cycle,
    'subscription_source', coalesce(v_subscription.subscription_source, 'system'),
    'payment_method', v_subscription.payment_method,
    'can_manage_billing', coalesce(v_subscription.subscription_source, 'system') in ('mercadopago', 'asaas'),
    'max_learner_messages_per_session', public.plan_session_message_limit(v_plan_id),
    'usage', jsonb_build_object(
      'conversation_sessions', jsonb_build_object('used', v_sessions_today, 'limit', v_session_limit),
      'llm_requests', jsonb_build_object('used', v_llm_requests_today, 'limit', v_llm_request_limit),
      'llm_cost_usd', jsonb_build_object('used', v_llm_cost_today, 'limit', v_llm_cost_limit),
      'transcriptions', jsonb_build_object('used', v_transcriptions_today, 'limit', v_transcription_limit),
      'speech_syntheses', jsonb_build_object('used', v_speech_syntheses_today, 'limit', v_speech_synthesis_limit)
    )
  );
end;
$$;

revoke all on function public.create_billing_checkout(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_billing_checkout(uuid, text, text, text, text) to service_role;

revoke all on function public.sync_billing_subscription(uuid, text, text, text, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.sync_billing_subscription(uuid, text, text, text, text, timestamptz, text, text) to service_role;

revoke all on function public.process_billing_event(text, text, jsonb, uuid, text, text, text, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.process_billing_event(text, text, jsonb, uuid, text, text, text, text, timestamptz, text, text) to service_role;

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
    'payment_method', v_subscription.payment_method,
    'can_manage_billing', coalesce(v_subscription.subscription_source, 'system') in ('mercadopago', 'asaas'),
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
