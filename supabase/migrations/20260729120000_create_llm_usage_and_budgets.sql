create table public.llm_budget_policies (
  id boolean primary key default true check (id),
  daily_requests_per_user integer not null default 100
    check (daily_requests_per_user > 0),
  daily_cost_per_user_usd numeric(12, 8) not null default 0.25
    check (daily_cost_per_user_usd > 0),
  monthly_global_cost_usd numeric(12, 8) not null default 10
    check (monthly_global_cost_usd > 0),
  updated_at timestamptz not null default now()
);

insert into public.llm_budget_policies (id)
values (true);

create table public.llm_usage_events (
  id uuid primary key default extensions.gen_random_uuid(),
  request_id uuid not null unique,
  user_id uuid not null references public.profiles (id) on delete cascade,
  feature text not null,
  provider text not null,
  model text not null,
  status text not null check (status in ('reserved', 'succeeded', 'failed')),
  reserved_cost_usd numeric(12, 8) not null default 0
    check (reserved_cost_usd >= 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost_usd numeric(12, 8) not null default 0
    check (estimated_cost_usd >= 0),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index llm_usage_events_user_created_idx
  on public.llm_usage_events (user_id, created_at desc);

create index llm_usage_events_created_idx
  on public.llm_usage_events (created_at desc);

alter table public.llm_budget_policies enable row level security;
alter table public.llm_usage_events enable row level security;

create policy "Users can read their own LLM usage"
  on public.llm_usage_events
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.llm_usage_events to authenticated;

create or replace function public.reserve_llm_budget(
  p_user_id uuid,
  p_request_id uuid,
  p_feature text,
  p_provider text,
  p_model text,
  p_estimated_max_cost_usd numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  policy_row public.llm_budget_policies%rowtype;
  user_request_count integer;
  user_daily_cost numeric(12, 8);
  global_monthly_cost numeric(12, 8);
begin
  perform pg_catalog.pg_advisory_xact_lock(2026072912);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );

  if exists (
    select 1
    from public.llm_usage_events
    where request_id = p_request_id
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'duplicate_request');
  end if;

  select *
  into policy_row
  from public.llm_budget_policies
  where id = true;

  select
    count(*),
    coalesce(sum(
      case
        when status = 'reserved' then reserved_cost_usd
        when status = 'succeeded' then estimated_cost_usd
        else 0
      end
    ), 0)
  into user_request_count, user_daily_cost
  from public.llm_usage_events
  where user_id = p_user_id
    and created_at >= date_trunc('day', now())
    and status in ('reserved', 'succeeded');

  if user_request_count >= policy_row.daily_requests_per_user then
    return jsonb_build_object('allowed', false, 'reason', 'daily_request_limit');
  end if;

  if user_daily_cost + p_estimated_max_cost_usd > policy_row.daily_cost_per_user_usd then
    return jsonb_build_object('allowed', false, 'reason', 'daily_cost_limit');
  end if;

  select coalesce(sum(
    case
      when status = 'reserved' then reserved_cost_usd
      when status = 'succeeded' then estimated_cost_usd
      else 0
    end
  ), 0)
  into global_monthly_cost
  from public.llm_usage_events
  where created_at >= date_trunc('month', now())
    and status in ('reserved', 'succeeded');

  if global_monthly_cost + p_estimated_max_cost_usd > policy_row.monthly_global_cost_usd then
    return jsonb_build_object('allowed', false, 'reason', 'global_monthly_cost_limit');
  end if;

  insert into public.llm_usage_events (
    request_id,
    user_id,
    feature,
    provider,
    model,
    status,
    reserved_cost_usd
  )
  values (
    p_request_id,
    p_user_id,
    p_feature,
    p_provider,
    p_model,
    'reserved',
    p_estimated_max_cost_usd
  );

  return jsonb_build_object('allowed', true);
end;
$$;

create or replace function public.finalize_llm_usage(
  p_request_id uuid,
  p_status text,
  p_provider text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_estimated_cost_usd numeric,
  p_latency_ms integer,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('succeeded', 'failed') then
    raise exception 'Invalid final status';
  end if;

  update public.llm_usage_events
  set
    status = p_status,
    provider = p_provider,
    model = p_model,
    input_tokens = p_input_tokens,
    output_tokens = p_output_tokens,
    estimated_cost_usd = p_estimated_cost_usd,
    latency_ms = p_latency_ms,
    error_code = p_error_code,
    completed_at = now()
  where request_id = p_request_id
    and status = 'reserved';

  if not found then
    raise exception 'Usage reservation not found';
  end if;
end;
$$;

revoke all on function public.reserve_llm_budget(
  uuid,
  uuid,
  text,
  text,
  text,
  numeric
) from public, anon, authenticated;

revoke all on function public.finalize_llm_usage(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  numeric,
  integer,
  text
) from public, anon, authenticated;

grant execute on function public.reserve_llm_budget(
  uuid,
  uuid,
  text,
  text,
  text,
  numeric
) to service_role;

grant execute on function public.finalize_llm_usage(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  numeric,
  integer,
  text
) to service_role;
