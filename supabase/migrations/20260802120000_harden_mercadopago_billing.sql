-- Harden Mercado Pago billing for installations where the initial billing
-- migration has already been applied.

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

alter table public.billing_checkout_attempts enable row level security;
alter table public.billing_refresh_attempts enable row level security;
revoke all on public.billing_checkout_attempts from anon, authenticated;
revoke all on public.billing_refresh_attempts from anon, authenticated;
grant all on public.billing_checkout_attempts to service_role;
grant all on public.billing_refresh_attempts to service_role;

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

revoke all on function public.reserve_billing_checkout_attempt(uuid)
  from public, anon, authenticated;
revoke all on function public.reserve_billing_refresh_attempt(uuid)
  from public, anon, authenticated;
revoke all on function public.process_billing_event(text, text, jsonb, uuid, text, text, text, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.reserve_billing_checkout_attempt(uuid) to service_role;
grant execute on function public.reserve_billing_refresh_attempt(uuid) to service_role;
grant execute on function public.process_billing_event(text, text, jsonb, uuid, text, text, text, text, timestamptz)
  to service_role;
