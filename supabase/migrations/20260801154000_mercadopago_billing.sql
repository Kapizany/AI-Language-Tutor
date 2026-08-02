-- Mercado Pago billing: grace period via ends_at, checkout tracking and sync RPC.

alter table public.user_subscriptions
  add column if not exists billing_cycle text
    check (billing_cycle is null or billing_cycle in ('monthly', 'annual')),
  add column if not exists subscription_source text not null default 'system'
    check (subscription_source in ('system', 'admin', 'mercadopago'));

create table if not exists public.billing_checkouts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  billing_cycle text not null check (billing_cycle in ('monthly', 'annual')),
  external_subscription_id text not null,
  status text not null default 'pending'
    check (status in ('pending', 'authorized', 'cancelled', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_checkouts_user_idx
  on public.billing_checkouts (user_id, created_at desc);

create table if not exists public.billing_events (
  id bigint generated always as identity primary key,
  provider text not null default 'mercadopago',
  event_key text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  unique (provider, event_key)
);

create table if not exists public.billing_checkout_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create table if not exists public.billing_refresh_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index if not exists billing_checkout_attempts_user_idx
  on public.billing_checkout_attempts (user_id, attempted_at desc);
create index if not exists billing_refresh_attempts_user_idx
  on public.billing_refresh_attempts (user_id, attempted_at desc);

alter table public.billing_checkouts enable row level security;
alter table public.billing_events enable row level security;
alter table public.billing_checkout_attempts enable row level security;
alter table public.billing_refresh_attempts enable row level security;

revoke all on public.billing_checkouts from anon, authenticated;
revoke all on public.billing_events from anon, authenticated;
revoke all on public.billing_checkout_attempts from anon, authenticated;
revoke all on public.billing_refresh_attempts from anon, authenticated;
grant all on public.billing_checkouts to service_role;
grant all on public.billing_events to service_role;
grant all on public.billing_checkout_attempts to service_role;
grant all on public.billing_refresh_attempts to service_role;

create or replace function public.resolve_user_plan(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved_plan text;
begin
  select us.plan_id
  into resolved_plan
  from public.user_subscriptions us
  where us.user_id = p_user_id
    and us.plan_id = 'premium'
    and (
      us.status in ('active', 'trialing')
      or (
        us.status = 'canceled'
        and us.ends_at is not null
        and us.ends_at > now()
      )
    )
  limit 1;

  return coalesce(resolved_plan, 'free');
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
  v_session_limit numeric;
  v_llm_request_limit numeric;
  v_llm_cost_limit numeric;
  v_transcription_limit numeric;
  v_subscription public.user_subscriptions%rowtype;
begin
  select account_status
  into v_account_status
  from public.profiles
  where id = p_user_id;

  if v_account_status is null then
    return jsonb_build_object('found', false);
  end if;

  select *
  into v_subscription
  from public.user_subscriptions
  where user_id = p_user_id;

  v_plan_id := public.resolve_user_plan(p_user_id);

  v_session_limit := public.get_entitlement_limit(v_plan_id, 'conversation_session', 'count');
  v_llm_request_limit := public.get_entitlement_limit(v_plan_id, 'llm_request', 'count');
  v_llm_cost_limit := public.get_entitlement_limit(v_plan_id, 'llm_cost_usd', 'cost_usd');
  v_transcription_limit := public.get_entitlement_limit(v_plan_id, 'transcription', 'count');

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

  return jsonb_build_object(
    'found', true,
    'plan_id', v_plan_id,
    'account_status', v_account_status,
    'max_learner_messages_per_session', public.plan_session_message_limit(v_plan_id),
    'subscription_status', coalesce(v_subscription.status, 'active'),
    'subscription_ends_at', v_subscription.ends_at,
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
      )
    )
  );
end;
$$;

create or replace function public.record_billing_event(
  p_provider text,
  p_event_key text,
  p_payload jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_id bigint;
begin
  insert into public.billing_events (provider, event_key, payload)
  values (p_provider, p_event_key, coalesce(p_payload, '{}'::jsonb))
  on conflict (provider, event_key) do nothing
  returning id into inserted_id;

  return inserted_id is not null;
end;
$$;

create or replace function public.create_billing_checkout(
  p_user_id uuid,
  p_billing_cycle text,
  p_external_subscription_id text
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
    status
  )
  values (
    p_user_id,
    p_billing_cycle,
    p_external_subscription_id,
    'pending'
  )
  returning id into checkout_id;

  update public.user_subscriptions
  set external_subscription_id = p_external_subscription_id,
      billing_cycle = p_billing_cycle,
      subscription_source = 'mercadopago',
      updated_at = now()
  where user_id = p_user_id;

  return jsonb_build_object(
    'created', true,
    'checkout_id', checkout_id,
    'external_subscription_id', p_external_subscription_id
  );
end;
$$;

create or replace function public.reserve_billing_checkout_attempt(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_attempts integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  if public.resolve_user_plan(p_user_id) = 'premium' then
    return jsonb_build_object('allowed', false, 'reason', 'already_premium');
  end if;

  if exists (
    select 1
    from public.billing_checkout_attempts
    where user_id = p_user_id
      and attempted_at >= now() - interval '30 seconds'
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'rate_limit');
  end if;

  select count(*)
  into recent_attempts
  from public.billing_checkout_attempts
  where user_id = p_user_id
    and attempted_at >= now() - interval '10 minutes';

  if recent_attempts >= 3 then
    return jsonb_build_object('allowed', false, 'reason', 'rate_limit');
  end if;

  insert into public.billing_checkout_attempts (user_id) values (p_user_id);
  return jsonb_build_object('allowed', true);
end;
$$;

create or replace function public.reserve_billing_refresh_attempt(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_attempts integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('refresh:' || p_user_id::text, 0));

  if exists (
    select 1
    from public.billing_refresh_attempts
    where user_id = p_user_id
      and attempted_at >= now() - interval '15 seconds'
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'rate_limit');
  end if;

  select count(*)
  into recent_attempts
  from public.billing_refresh_attempts
  where user_id = p_user_id
    and attempted_at >= now() - interval '10 minutes';

  if recent_attempts >= 10 then
    return jsonb_build_object('allowed', false, 'reason', 'rate_limit');
  end if;

  insert into public.billing_refresh_attempts (user_id) values (p_user_id);
  return jsonb_build_object('allowed', true);
end;
$$;

create or replace function public.sync_billing_subscription(
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
  normalized_status text;
  next_plan text;
  next_subscription_status text;
begin
  if not exists (select 1 from public.profiles where id = p_user_id) then
    return jsonb_build_object('updated', false, 'reason', 'user_not_found');
  end if;

  normalized_status := lower(coalesce(p_mp_status, ''));

  if normalized_status in ('authorized', 'active') then
    next_plan := 'premium';
    next_subscription_status := 'active';
  elsif normalized_status in ('cancelled', 'canceled', 'paused') then
    next_plan := 'premium';
    next_subscription_status := 'canceled';
  elsif normalized_status = 'pending' then
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
    ends_at
  )
  values (
    p_user_id,
    next_plan,
    next_subscription_status,
    p_external_customer_id,
    p_external_subscription_id,
    p_billing_cycle,
    'mercadopago',
    case when next_subscription_status = 'canceled' then p_ends_at else null end
  )
  on conflict (user_id) do update
  set plan_id = excluded.plan_id,
      status = excluded.status,
      external_customer_id = coalesce(excluded.external_customer_id, user_subscriptions.external_customer_id),
      external_subscription_id = excluded.external_subscription_id,
      billing_cycle = coalesce(excluded.billing_cycle, user_subscriptions.billing_cycle),
      subscription_source = 'mercadopago',
      ends_at = case
        when excluded.status = 'active' then null
        when excluded.status = 'canceled' then coalesce(excluded.ends_at, user_subscriptions.ends_at)
        else user_subscriptions.ends_at
      end,
      updated_at = now();

  update public.billing_checkouts
  set status = case
        when normalized_status in ('authorized', 'active') then 'authorized'
        when normalized_status in ('cancelled', 'canceled', 'paused') then 'cancelled'
        when normalized_status = 'pending' then 'pending'
        else 'failed'
      end,
      updated_at = now()
  where user_id = p_user_id
    and external_subscription_id = p_external_subscription_id;

  return jsonb_build_object(
    'updated', true,
    'plan_id', public.resolve_user_plan(p_user_id),
    'subscription_status', next_subscription_status,
    'ends_at', case when next_subscription_status = 'canceled' then p_ends_at else null end
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
  p_ends_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sync_result jsonb;
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

  sync_result := public.sync_billing_subscription(
    p_user_id,
    p_external_subscription_id,
    p_external_customer_id,
    p_mp_status,
    p_billing_cycle,
    p_ends_at
  );

  if coalesce((sync_result ->> 'updated')::boolean, false) is false then
    return sync_result;
  end if;

  insert into public.billing_events (provider, event_key, payload)
  values (p_provider, p_event_key, coalesce(p_payload, '{}'::jsonb))
  on conflict (provider, event_key) do nothing;

  return sync_result;
end;
$$;

revoke all on function public.record_billing_event(text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.create_billing_checkout(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.reserve_billing_checkout_attempt(uuid)
  from public, anon, authenticated;
revoke all on function public.reserve_billing_refresh_attempt(uuid)
  from public, anon, authenticated;
revoke all on function public.sync_billing_subscription(uuid, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.process_billing_event(text, text, jsonb, uuid, text, text, text, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.record_billing_event(text, text, jsonb) to service_role;
grant execute on function public.create_billing_checkout(uuid, text, text) to service_role;
grant execute on function public.reserve_billing_checkout_attempt(uuid) to service_role;
grant execute on function public.reserve_billing_refresh_attempt(uuid) to service_role;
grant execute on function public.sync_billing_subscription(uuid, text, text, text, text, timestamptz) to service_role;
grant execute on function public.process_billing_event(text, text, jsonb, uuid, text, text, text, text, timestamptz)
  to service_role;

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

  insert into public.user_subscriptions (user_id, plan_id, status, subscription_source, ends_at)
  values (p_target_user_id, p_plan_id, 'active', 'admin', null)
  on conflict (user_id) do update
  set plan_id = excluded.plan_id,
      status = 'active',
      subscription_source = 'admin',
      ends_at = null,
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
