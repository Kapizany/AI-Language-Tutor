-- Webhook statuses, billing history fields, and user-facing event log.

alter table public.billing_events
  add column if not exists user_id uuid references public.profiles (id) on delete set null,
  add column if not exists event_type text;

create index if not exists billing_events_user_idx
  on public.billing_events (user_id, processed_at desc);

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
  elsif normalized_status in ('refunded', 'chargeback', 'failed') then
    next_plan := 'free';
    next_subscription_status := 'canceled';
  elsif normalized_status in ('pending', 'awaiting_payment', 'created', 'overdue') then
    update public.billing_checkouts
    set status = case
          when normalized_status = 'overdue' then 'pending'
          else 'pending'
        end,
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
    case
      when next_subscription_status = 'canceled' and next_plan = 'premium'
        then coalesce(p_ends_at, now() + interval '30 days')
      when next_subscription_status = 'canceled'
        then coalesce(p_ends_at, now())
      else null
    end
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
        when normalized_status in ('refunded', 'chargeback', 'failed') then 'failed'
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
  v_event_type text;
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

  v_event_type := coalesce(nullif(p_payload ->> 'event', ''), p_event_key);

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
      when normalized_status in ('refunded', 'chargeback', 'failed')
        then now()
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
        when normalized_status in ('refunded', 'chargeback', 'failed')
          then coalesce(p_ends_at, now())
        else ends_at
      end,
      updated_at = now()
  where user_id = p_user_id
    and external_subscription_id = p_external_subscription_id;

  insert into public.billing_events (
    provider,
    event_key,
    payload,
    user_id,
    event_type
  )
  values (
    p_provider,
    p_event_key,
    coalesce(p_payload, '{}'::jsonb),
    p_user_id,
    v_event_type
  )
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
      when normalized_status in ('refunded', 'chargeback', 'failed')
        then coalesce(p_ends_at, now())
      else null
    end
  );
end;
$$;
