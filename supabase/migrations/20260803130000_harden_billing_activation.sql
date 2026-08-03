-- Harden billing activation:
-- - Premium only via confirmed/received/authorized (never bare "active")
-- - recorded = log-only webhook events (SUBSCRIPTION_CREATED / SUBSCRIPTION_UPDATED ACTIVE)
-- - overdue / payment_deleted fail pending checkouts and revoke premature Premium

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
  has_authorized_checkout boolean;
begin
  if not exists (select 1 from public.profiles where id = p_user_id) then
    return jsonb_build_object('updated', false, 'reason', 'user_not_found');
  end if;

  normalized_status := lower(coalesce(p_mp_status, ''));

  if normalized_status in ('recorded', 'info') then
    return jsonb_build_object(
      'updated', true,
      'reason', 'recorded',
      'plan_id', public.resolve_user_plan(p_user_id),
      'subscription_status', coalesce(
        (select status from public.user_subscriptions where user_id = p_user_id),
        'pending'
      )
    );
  end if;

  if normalized_status in ('authorized', 'confirmed', 'received') then
    next_plan := 'premium';
    next_subscription_status := 'active';
  elsif normalized_status in ('cancelled', 'canceled', 'paused', 'inactive', 'deleted') then
    next_plan := 'premium';
    next_subscription_status := 'canceled';
  elsif normalized_status in ('refunded', 'chargeback') then
    next_plan := 'free';
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
  elsif normalized_status in ('overdue', 'payment_deleted', 'failed') then
    update public.billing_checkouts
    set status = 'failed',
        updated_at = now()
    where user_id = p_user_id
      and external_subscription_id = p_external_subscription_id
      and status = 'pending';

    select exists (
      select 1
      from public.billing_checkouts
      where user_id = p_user_id
        and external_subscription_id = p_external_subscription_id
        and status = 'authorized'
    )
    into has_authorized_checkout;

    -- Revoke Premium only when this charge never confirmed (premature activation).
    if not has_authorized_checkout then
      update public.user_subscriptions
      set plan_id = 'free',
          status = 'active',
          ends_at = null,
          renews_at = null,
          updated_at = now()
      where user_id = p_user_id
        and external_subscription_id = p_external_subscription_id
        and plan_id = 'premium';
    end if;

    return jsonb_build_object(
      'updated', true,
      'plan_id', public.resolve_user_plan(p_user_id),
      'subscription_status', 'pending',
      'reason', normalized_status
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
        when normalized_status in ('refunded', 'chargeback') then 'failed'
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
      when normalized_status in ('refunded', 'chargeback')
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
        when normalized_status in ('authorized', 'confirmed', 'received')
          then coalesce(provider_started_at, started_at, now())
        else started_at
      end,
      renews_at = case
        when normalized_status in ('authorized', 'confirmed', 'received')
          then provider_renews_at
        when normalized_status in ('cancelled', 'canceled', 'paused', 'inactive', 'deleted')
          then null
        else renews_at
      end,
      ends_at = case
        when normalized_status in ('cancelled', 'canceled', 'paused', 'inactive', 'deleted')
          then coalesce(p_ends_at, provider_renews_at, ends_at)
        when normalized_status in ('refunded', 'chargeback')
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
      when normalized_status in ('authorized', 'confirmed', 'received')
        then provider_renews_at
      else null
    end,
    'ends_at', case
      when normalized_status in ('cancelled', 'canceled', 'paused', 'inactive', 'deleted')
        then coalesce(p_ends_at, provider_renews_at)
      when normalized_status in ('refunded', 'chargeback')
        then coalesce(p_ends_at, now())
      else null
    end
  );
end;
$$;
