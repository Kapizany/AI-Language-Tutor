-- Phase 7: premium text-to-speech entitlements, cache and access checks.

-- A zero entitlement explicitly disables a feature for a plan. Earlier
-- entitlements were all positive, so the original constraint did not yet need
-- to represent this state.
alter table public.plan_entitlements
  drop constraint plan_entitlements_limit_value_check,
  add constraint plan_entitlements_limit_value_check check (limit_value >= 0);

insert into public.plan_entitlements (
  plan_id, feature_key, limit_type, limit_value, period, metadata
)
values
  ('free', 'speech_synthesis', 'count', 0, 'daily', '{}'::jsonb),
  ('premium', 'speech_synthesis', 'count', 200, 'daily', '{"max_characters_per_request": 500}'::jsonb)
on conflict (plan_id, feature_key, limit_type, period) do update
set limit_value = excluded.limit_value,
    metadata = excluded.metadata;

create table public.speech_synthesis_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index speech_synthesis_attempts_user_time_idx
  on public.speech_synthesis_attempts (user_id, attempted_at desc);

alter table public.speech_synthesis_attempts enable row level security;
revoke all on table public.speech_synthesis_attempts from anon, authenticated;

create table public.speech_synthesis_cache (
  cache_key text primary key,
  audio_content bytea not null,
  content_type text not null default 'audio/mpeg',
  provider text not null,
  voice text not null,
  speaking_rate numeric(4, 2) not null check (speaking_rate > 0),
  provider_version text not null,
  character_count integer not null check (character_count > 0),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create index speech_synthesis_cache_last_used_idx
  on public.speech_synthesis_cache (last_used_at desc);

alter table public.speech_synthesis_cache enable row level security;
revoke all on table public.speech_synthesis_cache from anon, authenticated;
grant select, insert, update on public.speech_synthesis_cache to service_role;

create or replace function public.get_speech_synthesis_cache(p_cache_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cache_row public.speech_synthesis_cache%rowtype;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select *
  into cache_row
  from public.speech_synthesis_cache
  where cache_key = p_cache_key;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  update public.speech_synthesis_cache
  set last_used_at = now()
  where cache_key = p_cache_key;

  return jsonb_build_object(
    'found', true,
    'content_type', cache_row.content_type,
    'provider', cache_row.provider,
    'voice', cache_row.voice,
    'speaking_rate', cache_row.speaking_rate,
    'character_count', cache_row.character_count,
    'audio_base64', encode(cache_row.audio_content, 'base64')
  );
end;
$$;

create or replace function public.store_speech_synthesis_cache(
  p_cache_key text,
  p_audio_base64 text,
  p_content_type text,
  p_provider text,
  p_voice text,
  p_speaking_rate numeric,
  p_provider_version text,
  p_character_count integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'Service role required';
  end if;

  insert into public.speech_synthesis_cache (
    cache_key,
    audio_content,
    content_type,
    provider,
    voice,
    speaking_rate,
    provider_version,
    character_count
  )
  values (
    p_cache_key,
    decode(p_audio_base64, 'base64'),
    coalesce(nullif(p_content_type, ''), 'audio/mpeg'),
    p_provider,
    p_voice,
    p_speaking_rate,
    p_provider_version,
    p_character_count
  )
  on conflict (cache_key) do update
  set audio_content = excluded.audio_content,
      content_type = excluded.content_type,
      provider = excluded.provider,
      voice = excluded.voice,
      speaking_rate = excluded.speaking_rate,
      provider_version = excluded.provider_version,
      character_count = excluded.character_count,
      last_used_at = now();
end;
$$;

create or replace function public.check_speech_synthesis_access(
  p_user_id uuid,
  p_character_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_attempts integer;
  v_global_attempts integer;
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

  perform pg_advisory_xact_lock(hashtext('speech-synthesis-user:' || p_user_id::text));
  perform pg_advisory_xact_lock(hashtext('speech-synthesis-global'));

  v_plan_id := public.resolve_user_plan(p_user_id);
  v_daily_limit := public.get_entitlement_limit(v_plan_id, 'speech_synthesis', 'count');

  if v_daily_limit <= 0 then
    return jsonb_build_object('allowed', false, 'reason', 'premium_required');
  end if;

  select count(*)
  into v_daily_usage
  from public.speech_synthesis_attempts
  where user_id = p_user_id
    and attempted_at >= date_trunc('day', now());

  if v_daily_usage >= v_daily_limit then
    return jsonb_build_object('allowed', false, 'reason', 'daily_synthesis_limit');
  end if;

  if p_character_count <= 0 or p_character_count > 500 then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_text_length');
  end if;

  select count(*)
  into v_user_attempts
  from public.speech_synthesis_attempts
  where user_id = p_user_id
    and attempted_at >= now() - interval '1 minute';

  if v_user_attempts >= 10 then
    return jsonb_build_object('allowed', false, 'reason', 'user_rate_limit');
  end if;

  select count(*)
  into v_global_attempts
  from public.speech_synthesis_attempts
  where attempted_at >= now() - interval '1 minute';

  if v_global_attempts >= 120 then
    return jsonb_build_object('allowed', false, 'reason', 'global_rate_limit');
  end if;

  insert into public.speech_synthesis_attempts (user_id)
  values (p_user_id);

  perform public.record_feature_usage(
    p_user_id,
    'speech_synthesis',
    1,
    'count',
    null,
    jsonb_build_object('character_count', p_character_count)
  );

  return jsonb_build_object('allowed', true);
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
      ),
      'speech_syntheses', jsonb_build_object(
        'used', v_syntheses_today,
        'limit', v_synthesis_limit
      )
    )
  );
end;
$$;

revoke all on function public.get_speech_synthesis_cache(text) from public, anon, authenticated;
revoke all on function public.store_speech_synthesis_cache(
  text, text, text, text, text, numeric, text, integer
) from public, anon, authenticated;
revoke all on function public.check_speech_synthesis_access(uuid, integer)
  from public, anon, authenticated;

grant execute on function public.get_speech_synthesis_cache(text) to service_role;
grant execute on function public.store_speech_synthesis_cache(
  text, text, text, text, text, numeric, text, integer
) to service_role;
grant execute on function public.check_speech_synthesis_access(uuid, integer) to service_role;
