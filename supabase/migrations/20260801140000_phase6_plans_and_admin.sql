-- Phase 6: plans, entitlements, admin roles, audit and server-side limit resolution.

-- 1. Plans -------------------------------------------------------------------

create table public.plans (
  id text primary key,
  display_name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.plan_entitlements (
  id bigint generated always as identity primary key,
  plan_id text not null references public.plans (id) on delete cascade,
  feature_key text not null,
  limit_type text not null check (limit_type in ('count', 'cost_usd')),
  limit_value numeric(12, 8) not null check (limit_value > 0),
  period text not null check (period in ('daily', 'monthly', 'none')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (plan_id, feature_key, limit_type, period)
);

insert into public.plans (id, display_name, sort_order)
values
  ('free', 'Free', 1),
  ('premium', 'Premium', 2);

insert into public.plan_entitlements (
  plan_id, feature_key, limit_type, limit_value, period, metadata
)
values
  ('free', 'conversation_session', 'count', 3, 'daily', '{"max_learner_messages_per_session": 30}'::jsonb),
  ('free', 'llm_request', 'count', 100, 'daily', '{}'::jsonb),
  ('free', 'llm_cost_usd', 'cost_usd', 0.25, 'daily', '{}'::jsonb),
  ('free', 'transcription', 'count', 20, 'daily', '{}'::jsonb),
  ('premium', 'conversation_session', 'count', 20, 'daily', '{"max_learner_messages_per_session": 60}'::jsonb),
  ('premium', 'llm_request', 'count', 500, 'daily', '{}'::jsonb),
  ('premium', 'llm_cost_usd', 'cost_usd', 2.00, 'daily', '{}'::jsonb),
  ('premium', 'transcription', 'count', 100, 'daily', '{}'::jsonb);

alter table public.plans enable row level security;
alter table public.plan_entitlements enable row level security;
revoke all on public.plans from anon, authenticated;
revoke all on public.plan_entitlements from anon, authenticated;
grant select on public.plans to service_role;
grant select on public.plan_entitlements to service_role;

-- 2. Subscriptions and account status ----------------------------------------

create table public.user_subscriptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  plan_id text not null references public.plans (id),
  status text not null default 'active'
    check (status in ('active', 'trialing', 'canceled', 'suspended')),
  started_at timestamptz not null default now(),
  ends_at timestamptz,
  external_customer_id text,
  external_subscription_id text,
  updated_at timestamptz not null default now()
);

create index user_subscriptions_plan_idx on public.user_subscriptions (plan_id);

alter table public.profiles
  add column account_status text not null default 'active'
    check (account_status in ('active', 'suspended')),
  add column suspended_at timestamptz,
  add column suspended_reason text;

alter table public.user_subscriptions enable row level security;

create policy "Users can read their own subscription"
  on public.user_subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.user_subscriptions from anon, authenticated;
grant select on public.user_subscriptions to authenticated;
grant all on public.user_subscriptions to service_role;

insert into public.user_subscriptions (user_id, plan_id, status)
select id, 'free', 'active'
from public.profiles
on conflict (user_id) do nothing;

-- 3. Roles -------------------------------------------------------------------

create table public.user_roles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'admin')),
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles (id) on delete set null
);

alter table public.user_roles enable row level security;

create policy "Users can read their own role"
  on public.user_roles for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

-- 4. Admin audit -------------------------------------------------------------

create table public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references public.profiles (id) on delete set null,
  action text not null check (char_length(action) between 3 and 100),
  target_type text not null check (char_length(target_type) between 1 and 100),
  target_id text not null check (char_length(target_id) <= 200),
  previous_state jsonb not null default '{}'::jsonb,
  new_state jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index admin_audit_logs_created_idx
  on public.admin_audit_logs (created_at desc);

alter table public.admin_audit_logs enable row level security;
revoke all on public.admin_audit_logs from anon, authenticated;
grant select, insert on public.admin_audit_logs to service_role;

-- 5. Feature usage (normalized events) ---------------------------------------

create table public.feature_usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_id text not null references public.plans (id),
  feature_key text not null,
  quantity numeric(12, 8) not null default 1 check (quantity >= 0),
  unit text not null default 'count',
  request_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index feature_usage_events_user_created_idx
  on public.feature_usage_events (user_id, created_at desc);

create index feature_usage_events_feature_created_idx
  on public.feature_usage_events (feature_key, created_at desc);

alter table public.feature_usage_events enable row level security;
revoke all on public.feature_usage_events from anon, authenticated;
grant select, insert on public.feature_usage_events to service_role;

-- 6. Helpers -----------------------------------------------------------------

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
    and us.status = 'active';

  return coalesce(resolved_plan, 'free');
end;
$$;

create or replace function public.get_entitlement_limit(
  p_plan_id text,
  p_feature_key text,
  p_limit_type text
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select pe.limit_value
  from public.plan_entitlements pe
  where pe.plan_id = p_plan_id
    and pe.feature_key = p_feature_key
    and pe.limit_type = p_limit_type
    and pe.period = 'daily'
  limit 1;
$$;

create or replace function public.plan_session_message_limit(p_plan_id text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select (pe.metadata ->> 'max_learner_messages_per_session')::integer
      from public.plan_entitlements pe
      where pe.plan_id = p_plan_id
        and pe.feature_key = 'conversation_session'
      limit 1
    ),
    (
      select max_learner_messages_per_session
      from public.llm_budget_policies
      where id = true
    ),
    30
  );
$$;

create or replace function public.assert_account_active(p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select account_status
  into v_status
  from public.profiles
  where id = p_user_id;

  if v_status is null then
    raise exception 'Profile not found';
  end if;

  if v_status <> 'active' then
    raise exception 'account_suspended';
  end if;
end;
$$;

create or replace function public.account_status_for(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select account_status
  from public.profiles
  where id = p_user_id;
$$;

create or replace function public.user_is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = p_user_id
      and ur.role = 'admin'
  );
$$;

create or replace function public.record_feature_usage(
  p_user_id uuid,
  p_feature_key text,
  p_quantity numeric default 1,
  p_unit text default 'count',
  p_request_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.feature_usage_events (
    user_id,
    plan_id,
    feature_key,
    quantity,
    unit,
    request_id,
    metadata
  )
  values (
    p_user_id,
    public.resolve_user_plan(p_user_id),
    p_feature_key,
    p_quantity,
    p_unit,
    p_request_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

-- 7. New user hook -----------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));

  insert into public.user_subscriptions (user_id, plan_id, status)
  values (new.id, 'free', 'active')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- 8. Entitlements summary (read via backend) ---------------------------------

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
begin
  select account_status
  into v_account_status
  from public.profiles
  where id = p_user_id;

  if v_account_status is null then
    return jsonb_build_object('found', false);
  end if;

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

-- 9. Refactored budget reservation -------------------------------------------

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
  plan_id text;
  user_request_count integer;
  user_daily_cost numeric(12, 8);
  global_monthly_cost numeric(12, 8);
  request_limit numeric;
  cost_limit numeric;
  v_account_status text;
begin
  v_account_status := public.account_status_for(p_user_id);
  if v_account_status is null then
    return jsonb_build_object('allowed', false, 'reason', 'profile_not_found');
  end if;
  if v_account_status <> 'active' then
    return jsonb_build_object('allowed', false, 'reason', 'account_suspended');
  end if;

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

  plan_id := public.resolve_user_plan(p_user_id);
  request_limit := public.get_entitlement_limit(plan_id, 'llm_request', 'count');
  cost_limit := public.get_entitlement_limit(plan_id, 'llm_cost_usd', 'cost_usd');

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

  if user_request_count >= request_limit then
    return jsonb_build_object('allowed', false, 'reason', 'daily_request_limit');
  end if;

  if user_daily_cost + p_estimated_max_cost_usd > cost_limit then
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

-- 10. Refactored conversation session start ----------------------------------

create or replace function public.start_conversation_session(
  p_user_id uuid,
  p_scenario_id text,
  p_target_language text,
  p_learner_level text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  scenario_row public.conversation_scenarios%rowtype;
  session_row public.conversation_sessions%rowtype;
  plan_id text;
  session_limit numeric;
  max_messages integer;
  sessions_today integer;
  opening_text text;
  v_account_status text;
begin
  v_account_status := public.account_status_for(p_user_id);
  if v_account_status is null then
    return jsonb_build_object('allowed', false, 'reason', 'profile_not_found');
  end if;
  if v_account_status <> 'active' then
    return jsonb_build_object('allowed', false, 'reason', 'account_suspended');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('conversation_session_start:' || p_user_id::text, 0)
  );

  select * into scenario_row
  from public.conversation_scenarios
  where id = p_scenario_id and is_published;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'scenario_not_found');
  end if;

  opening_text := scenario_row.openings ->> p_target_language;
  if opening_text is null or char_length(opening_text) = 0 then
    return jsonb_build_object('allowed', false, 'reason', 'scenario_language_unavailable');
  end if;

  if (
    case p_learner_level
      when 'unknown' then 1 when 'A1' then 1 when 'A2' then 2 when 'B1' then 3 when 'B2' then 4
      else 0
    end
    not between
      case scenario_row.min_level when 'A1' then 1 when 'A2' then 2 when 'B1' then 3 else 4 end
      and case scenario_row.max_level when 'A1' then 1 when 'A2' then 2 when 'B1' then 3 else 4 end
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'scenario_level_unavailable');
  end if;

  perform public.expire_idle_conversation_sessions(p_user_id);

  plan_id := public.resolve_user_plan(p_user_id);
  max_messages := public.plan_session_message_limit(plan_id);

  select * into session_row
  from public.conversation_sessions
  where user_id = p_user_id
    and scenario_id = p_scenario_id
    and target_language = p_target_language
    and status = 'active'
  order by last_activity_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'allowed', true,
      'resumed', true,
      'session_id', session_row.id,
      'scenario_id', session_row.scenario_id,
      'target_language', session_row.target_language,
      'learner_level', session_row.learner_level,
      'planned_minutes', session_row.planned_minutes,
      'started_at', session_row.started_at,
      'learner_message_count', session_row.learner_message_count,
      'max_learner_messages', max_messages
    );
  end if;

  session_limit := public.get_entitlement_limit(plan_id, 'conversation_session', 'count');

  select count(*) into sessions_today
  from public.conversation_sessions
  where user_id = p_user_id
    and started_at >= date_trunc('day', now())
    and (status <> 'abandoned' or learner_message_count > 0);

  if sessions_today >= session_limit then
    return jsonb_build_object('allowed', false, 'reason', 'daily_session_limit');
  end if;

  insert into public.conversation_sessions (
    user_id,
    scenario_id,
    target_language,
    learner_level,
    planned_minutes,
    message_count
  )
  values (
    p_user_id,
    p_scenario_id,
    p_target_language,
    p_learner_level,
    scenario_row.planned_minutes,
    1
  )
  returning * into session_row;

  insert into public.conversation_messages (
    session_id,
    user_id,
    sequence,
    role,
    content
  )
  values (
    session_row.id,
    p_user_id,
    1,
    'tutor',
    opening_text
  );

  perform public.record_feature_usage(
    p_user_id,
    'conversation_session',
    1,
    'count',
    null,
    jsonb_build_object('session_id', session_row.id)
  );

  return jsonb_build_object(
    'allowed', true,
    'resumed', false,
    'session_id', session_row.id,
    'scenario_id', session_row.scenario_id,
    'target_language', session_row.target_language,
    'learner_level', session_row.learner_level,
    'planned_minutes', session_row.planned_minutes,
    'started_at', session_row.started_at,
    'learner_message_count', 0,
    'max_learner_messages', max_messages
  );
end;
$$;

create or replace function public.get_conversation_context(
  p_session_id uuid,
  p_user_id uuid,
  p_history_limit integer default 12
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.conversation_sessions%rowtype;
  scenario_row public.conversation_scenarios%rowtype;
  recent jsonb;
  corrected jsonb;
  max_messages integer;
begin
  select * into session_row
  from public.conversation_sessions
  where id = p_session_id and user_id = p_user_id;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  select * into scenario_row
  from public.conversation_scenarios
  where id = session_row.scenario_id;

  max_messages := public.plan_session_message_limit(public.resolve_user_plan(p_user_id));

  select coalesce(jsonb_agg(item order by window_sequence), '[]'::jsonb)
  into recent
  from (
    select sequence as window_sequence,
           jsonb_build_object(
             'sequence', sequence,
             'role', role,
             'content', content,
             'correction', correction
           ) as item
    from public.conversation_messages
    where session_id = p_session_id
    order by sequence desc
    limit greatest(p_history_limit, 2)
  ) as window_messages;

  select coalesce(jsonb_agg(distinct correction ->> 'corrected'), '[]'::jsonb)
  into corrected
  from public.conversation_messages
  where session_id = p_session_id
    and correction is not null;

  return jsonb_build_object(
    'found', true,
    'status', session_row.status,
    'scenario_id', session_row.scenario_id,
    'objective_pt_br', scenario_row.objective_pt_br,
    'goals_pt_br', scenario_row.goals_pt_br,
    'target_language', session_row.target_language,
    'learner_level', session_row.learner_level,
    'planned_minutes', session_row.planned_minutes,
    'started_at', session_row.started_at,
    'message_count', session_row.message_count,
    'learner_message_count', session_row.learner_message_count,
    'correction_count', session_row.correction_count,
    'max_learner_messages', max_messages,
    'previously_corrected', corrected,
    'recent_messages', recent
  );
end;
$$;

create or replace function public.append_conversation_exchange(
  p_session_id uuid,
  p_user_id uuid,
  p_learner_message text,
  p_tutor_reply text,
  p_correction jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.conversation_sessions%rowtype;
  max_learner_messages integer;
  next_sequence integer;
  existing_learner_sequence integer;
  existing_tutor_sequence integer;
  v_account_status text;
begin
  v_account_status := public.account_status_for(p_user_id);
  if v_account_status is null then
    return jsonb_build_object('stored', false, 'reason', 'profile_not_found');
  end if;
  if v_account_status <> 'active' then
    return jsonb_build_object('stored', false, 'reason', 'account_suspended');
  end if;

  select * into session_row
  from public.conversation_sessions
  where id = p_session_id and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('stored', false, 'reason', 'session_not_found');
  end if;

  select
    min(sequence) filter (where role = 'learner'),
    min(sequence) filter (where role = 'tutor')
  into existing_learner_sequence, existing_tutor_sequence
  from public.conversation_messages
  where session_id = p_session_id and request_id = p_request_id;

  max_learner_messages := public.plan_session_message_limit(public.resolve_user_plan(p_user_id));

  if existing_learner_sequence is not null and existing_tutor_sequence is not null then
    return jsonb_build_object(
      'stored', true,
      'replayed', true,
      'learner_sequence', existing_learner_sequence,
      'tutor_sequence', existing_tutor_sequence,
      'learner_message_count', session_row.learner_message_count,
      'max_learner_messages', max_learner_messages
    );
  end if;

  if session_row.status <> 'active' then
    return jsonb_build_object('stored', false, 'reason', 'session_not_active');
  end if;

  if session_row.learner_message_count >= max_learner_messages then
    return jsonb_build_object('stored', false, 'reason', 'session_message_limit');
  end if;

  select coalesce(max(sequence), 0) + 1
  into next_sequence
  from public.conversation_messages
  where session_id = p_session_id;

  insert into public.conversation_messages (
    session_id, user_id, sequence, role, content, request_id
  ) values (
    p_session_id, p_user_id, next_sequence, 'learner', p_learner_message, p_request_id
  );

  insert into public.conversation_messages (
    session_id, user_id, sequence, role, content, correction, request_id
  ) values (
    p_session_id, p_user_id, next_sequence + 1, 'tutor', p_tutor_reply, p_correction, p_request_id
  );

  update public.conversation_sessions
  set message_count = message_count + 2,
      learner_message_count = learner_message_count + 1,
      correction_count = correction_count + case when p_correction is null then 0 else 1 end,
      last_activity_at = now()
  where id = p_session_id;

  return jsonb_build_object(
    'stored', true,
    'replayed', false,
    'learner_sequence', next_sequence,
    'tutor_sequence', next_sequence + 1,
    'learner_message_count', session_row.learner_message_count + 1,
    'max_learner_messages', max_learner_messages
  );
end;
$$;

-- 11. Transcription entitlement ----------------------------------------------

create or replace function public.check_speech_transcription_access(
  p_user_id uuid,
  p_policy_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_attempts integer;
  v_global_attempts integer;
  v_has_consent boolean;
  v_plan_id text;
  v_daily_limit numeric;
  v_daily_usage integer;
  v_account_status text;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select account_status
  into v_account_status
  from public.profiles
  where id = p_user_id;

  if v_account_status is distinct from 'active' then
    return jsonb_build_object('allowed', false, 'reason', 'account_suspended');
  end if;

  perform pg_advisory_xact_lock(hashtext('speech-rate-user:' || p_user_id::text));
  perform pg_advisory_xact_lock(hashtext('speech-rate-global'));

  select exists (
    select 1
    from public.profiles
    where id = p_user_id
      and voice_processing_consent_at is not null
      and voice_processing_policy_version = p_policy_version
  ) into v_has_consent;

  if not v_has_consent then
    return jsonb_build_object('allowed', false, 'reason', 'voice_consent_required');
  end if;

  v_plan_id := public.resolve_user_plan(p_user_id);
  v_daily_limit := public.get_entitlement_limit(v_plan_id, 'transcription', 'count');

  select count(*) into v_daily_usage
  from public.speech_transcription_attempts
  where user_id = p_user_id
    and attempted_at >= date_trunc('day', now());

  if v_daily_usage >= v_daily_limit then
    return jsonb_build_object('allowed', false, 'reason', 'daily_transcription_limit');
  end if;

  select count(*) into v_user_attempts
  from public.speech_transcription_attempts
  where user_id = p_user_id
    and attempted_at >= now() - interval '1 minute';

  if v_user_attempts >= 5 then
    return jsonb_build_object('allowed', false, 'reason', 'user_rate_limit');
  end if;

  select count(*) into v_global_attempts
  from public.speech_transcription_attempts
  where attempted_at >= now() - interval '1 minute';

  if v_global_attempts >= 60 then
    return jsonb_build_object('allowed', false, 'reason', 'global_rate_limit');
  end if;

  insert into public.speech_transcription_attempts (user_id)
  values (p_user_id);

  perform public.record_feature_usage(
    p_user_id,
    'transcription',
    1,
    'count',
    null,
    '{}'::jsonb
  );

  return jsonb_build_object('allowed', true);
end;
$$;

-- 12. Admin RPCs -------------------------------------------------------------

create or replace function public.admin_get_overview(
  p_actor_user_id uuid,
  p_from timestamptz default now() - interval '30 days',
  p_to timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.user_is_admin(p_actor_user_id) then
    raise exception 'Admin role required';
  end if;

  select jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'users_new', (
      select count(*)
      from public.profiles
      where created_at >= p_from and created_at <= p_to
    ),
    'onboarding_completed', (
      select count(*) from public.profiles where onboarding_completed
    ),
    'dau', (
      select count(distinct user_id)
      from public.learning_activity_events
      where completed_at >= date_trunc('day', now())
    ),
    'wau', (
      select count(distinct user_id)
      from public.learning_activity_events
      where completed_at >= now() - interval '7 days'
    ),
    'mau', (
      select count(distinct user_id)
      from public.learning_activity_events
      where completed_at >= now() - interval '30 days'
    ),
    'conversation_sessions', (
      select count(*)
      from public.conversation_sessions
      where started_at >= p_from and started_at <= p_to
    ),
    'conversation_messages', (
      select count(*)
      from public.conversation_messages cm
      join public.conversation_sessions cs on cs.id = cm.session_id
      where cm.created_at >= p_from and cm.created_at <= p_to
    ),
    'llm_cost_usd', (
      select coalesce(sum(estimated_cost_usd), 0)
      from public.llm_usage_events
      where status = 'succeeded'
        and created_at >= p_from and created_at <= p_to
    ),
    'llm_requests', (
      select count(*)
      from public.llm_usage_events
      where created_at >= p_from and created_at <= p_to
    ),
    'plan_distribution', (
      select coalesce(jsonb_object_agg(plan_id, total), '{}'::jsonb)
      from (
        select plan_id, count(*) as total
        from public.user_subscriptions
        where status = 'active'
        group by plan_id
      ) plans
    ),
    'language_distribution', (
      select coalesce(jsonb_object_agg(target_language, total), '{}'::jsonb)
      from (
        select target_language, count(*) as total
        from public.learner_preferences
        group by target_language
      ) langs
    ),
    'level_distribution', (
      select coalesce(jsonb_object_agg(current_level, total), '{}'::jsonb)
      from (
        select current_level, count(*) as total
        from public.learner_preferences
        group by current_level
      ) levels
    )
  )
  into result;

  return result;
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

  insert into public.user_subscriptions (user_id, plan_id, status)
  values (p_target_user_id, p_plan_id, 'active')
  on conflict (user_id) do update
  set plan_id = excluded.plan_id,
      status = 'active',
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

create or replace function public.admin_set_account_status(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_status text;
begin
  if not public.user_is_admin(p_actor_user_id) then
    raise exception 'Admin role required';
  end if;

  if p_status not in ('active', 'suspended') then
    return jsonb_build_object('updated', false, 'reason', 'invalid_status');
  end if;

  select account_status
  into previous_status
  from public.profiles
  where id = p_target_user_id;

  if previous_status is null then
    return jsonb_build_object('updated', false, 'reason', 'user_not_found');
  end if;

  update public.profiles
  set account_status = p_status,
      suspended_at = case when p_status = 'suspended' then now() else null end,
      suspended_reason = case when p_status = 'suspended' then p_reason else null end,
      updated_at = now()
  where id = p_target_user_id;

  insert into public.admin_audit_logs (
    actor_user_id,
    action,
    target_type,
    target_id,
    previous_state,
    new_state,
    metadata
  )
  values (
    p_actor_user_id,
    case when p_status = 'suspended' then 'user.suspended' else 'user.reactivated' end,
    'user',
    p_target_user_id::text,
    jsonb_build_object('account_status', previous_status),
    jsonb_build_object('account_status', p_status),
    jsonb_build_object('reason', p_reason)
  );

  return jsonb_build_object('updated', true, 'account_status', p_status);
end;
$$;

create or replace function public.admin_list_audit_logs(
  p_actor_user_id uuid,
  p_limit integer default 50,
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
    select jsonb_agg(row_to_json(log_row))
    from (
      select
        id,
        actor_user_id,
        action,
        target_type,
        target_id,
        previous_state,
        new_state,
        metadata,
        created_at
      from public.admin_audit_logs
      order by created_at desc
      limit greatest(p_limit, 1)
      offset greatest(p_offset, 0)
    ) log_row
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_get_feature_usage(
  p_actor_user_id uuid,
  p_from timestamptz default now() - interval '30 days',
  p_to timestamptz default now()
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
    select jsonb_agg(row_to_json(feature_row))
    from (
      select
        feature,
        count(*) as requests,
        coalesce(sum(estimated_cost_usd), 0) as cost_usd,
        coalesce(avg(latency_ms), 0) as avg_latency_ms,
        coalesce(sum(input_tokens), 0) as input_tokens,
        coalesce(sum(output_tokens), 0) as output_tokens
      from public.llm_usage_events
      where created_at >= p_from
        and created_at <= p_to
        and status = 'succeeded'
      group by feature
      order by cost_usd desc
    ) feature_row
  ), '[]'::jsonb);
end;
$$;

-- 13. Permissions ------------------------------------------------------------

revoke all on function public.resolve_user_plan(uuid) from public, anon, authenticated;
revoke all on function public.get_entitlement_limit(text, text, text) from public, anon, authenticated;
revoke all on function public.plan_session_message_limit(text) from public, anon, authenticated;
revoke all on function public.assert_account_active(uuid) from public, anon, authenticated;
revoke all on function public.account_status_for(uuid) from public, anon, authenticated;
revoke all on function public.user_is_admin(uuid) from public, anon, authenticated;
revoke all on function public.record_feature_usage(uuid, text, numeric, text, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.get_user_entitlements_summary(uuid) from public, anon, authenticated;

grant execute on function public.resolve_user_plan(uuid) to service_role;
grant execute on function public.get_entitlement_limit(text, text, text) to service_role;
grant execute on function public.plan_session_message_limit(text) to service_role;
grant execute on function public.assert_account_active(uuid) to service_role;
grant execute on function public.user_is_admin(uuid) to service_role;
grant execute on function public.record_feature_usage(uuid, text, numeric, text, uuid, jsonb)
  to service_role;
grant execute on function public.get_user_entitlements_summary(uuid) to service_role;

grant execute on function public.account_status_for(uuid) to service_role;

revoke all on function public.admin_get_overview(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.admin_search_users(uuid, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.admin_get_user_summary(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.admin_change_user_plan(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.admin_set_account_status(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.admin_list_audit_logs(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.admin_get_feature_usage(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

grant execute on function public.admin_get_overview(uuid, timestamptz, timestamptz) to service_role;
grant execute on function public.admin_search_users(uuid, text, integer, integer) to service_role;
grant execute on function public.admin_get_user_summary(uuid, uuid) to service_role;
grant execute on function public.admin_change_user_plan(uuid, uuid, text) to service_role;
grant execute on function public.admin_set_account_status(uuid, uuid, text, text) to service_role;
grant execute on function public.admin_list_audit_logs(uuid, integer, integer) to service_role;
grant execute on function public.admin_get_feature_usage(uuid, timestamptz, timestamptz) to service_role;
