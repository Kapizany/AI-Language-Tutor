begin;

set local role postgres;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '21000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'billing-user@example.test', '',
  now(), '{}', '{"display_name":"Billing User"}', now(), now()
);

insert into public.learner_preferences (
  user_id, target_language, current_level, learning_goal,
  study_minutes_per_day, study_days_per_week
)
values ('21000000-0000-0000-0000-000000000001', 'en', 'A1', 'conversation', 10, 5);

-- Active premium via Mercado Pago
do $$
declare
  result jsonb;
  plan_id text;
begin
  result := public.sync_billing_subscription(
    '21000000-0000-0000-0000-000000000001',
    'mp-preapproval-active',
    'mp-payer-1',
    'authorized',
    'monthly',
    null
  );
  if coalesce(result ->> 'updated', 'false') <> 'true' then
    raise exception 'Billing failure: premium activation failed';
  end if;

  plan_id := public.resolve_user_plan('21000000-0000-0000-0000-000000000001');
  if plan_id <> 'premium' then
    raise exception 'Billing failure: active premium not resolved';
  end if;
end;
$$;

-- Canceled with grace period keeps premium until ends_at
do $$
declare
  result jsonb;
  plan_id text;
  grace_end timestamptz := now() + interval '10 days';
begin
  result := public.sync_billing_subscription(
    '21000000-0000-0000-0000-000000000001',
    'mp-preapproval-active',
    'mp-payer-1',
    'cancelled',
    'monthly',
    grace_end
  );
  if coalesce(result ->> 'updated', 'false') <> 'true' then
    raise exception 'Billing failure: cancellation sync failed';
  end if;

  plan_id := public.resolve_user_plan('21000000-0000-0000-0000-000000000001');
  if plan_id <> 'premium' then
    raise exception 'Billing failure: grace period should keep premium';
  end if;
end;
$$;

-- After grace ends, user falls back to free entitlements
do $$
declare
  plan_id text;
begin
  update public.user_subscriptions
  set ends_at = now() - interval '1 day'
  where user_id = '21000000-0000-0000-0000-000000000001';

  plan_id := public.resolve_user_plan('21000000-0000-0000-0000-000000000001');
  if plan_id <> 'free' then
    raise exception 'Billing failure: expired grace should revert to free';
  end if;
end;
$$;

-- Checkout attempts are rate-limited and repeated billing events are idempotent.
do $$
declare
  first_attempt jsonb;
  second_attempt jsonb;
  first_event jsonb;
  duplicate_event jsonb;
  subscription_started_at timestamptz;
  subscription_renews_at timestamptz;
begin
  update public.user_subscriptions
  set plan_id = 'free', status = 'active', ends_at = null
  where user_id = '21000000-0000-0000-0000-000000000001';

  first_attempt := public.reserve_billing_checkout_attempt(
    '21000000-0000-0000-0000-000000000001'
  );
  second_attempt := public.reserve_billing_checkout_attempt(
    '21000000-0000-0000-0000-000000000001'
  );
  if coalesce(first_attempt ->> 'allowed', 'false') <> 'true'
     or coalesce(second_attempt ->> 'reason', '') <> 'rate_limit' then
    raise exception 'Billing failure: checkout rate limit failed';
  end if;

  first_event := public.process_billing_event(
    'mercadopago', 'test-event-1',
    '{"status":"authorized","date_created":"2026-08-02T12:00:00Z","next_payment_date":"2026-09-02T12:00:00Z"}',
    '21000000-0000-0000-0000-000000000001',
    'mp-preapproval-event', 'mp-payer-1', 'authorized', 'monthly', null
  );
  duplicate_event := public.process_billing_event(
    'mercadopago', 'test-event-1',
    '{"status":"authorized","date_created":"2026-08-02T12:00:00Z","next_payment_date":"2026-09-02T12:00:00Z"}',
    '21000000-0000-0000-0000-000000000001',
    'mp-preapproval-event', 'mp-payer-1', 'authorized', 'monthly', null
  );
  if coalesce(first_event ->> 'updated', 'false') <> 'true'
     or coalesce(duplicate_event ->> 'reason', '') <> 'duplicate_event' then
    raise exception 'Billing failure: atomic idempotency failed';
  end if;

  select started_at, renews_at
  into subscription_started_at, subscription_renews_at
  from public.user_subscriptions
  where user_id = '21000000-0000-0000-0000-000000000001';

  if subscription_started_at <> '2026-08-02T12:00:00Z'::timestamptz
     or subscription_renews_at <> '2026-09-02T12:00:00Z'::timestamptz then
    raise exception 'Billing failure: subscription lifecycle dates were not persisted';
  end if;
end;
$$;

rollback;
