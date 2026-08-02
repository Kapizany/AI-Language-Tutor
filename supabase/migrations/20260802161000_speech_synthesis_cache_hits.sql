-- Cache hits must verify Premium without consuming daily TTS quota.

drop function if exists public.check_speech_synthesis_access(uuid, integer);
drop function if exists public.check_speech_synthesis_access(uuid, integer, boolean);

create or replace function public.check_speech_synthesis_access(
  p_user_id uuid,
  p_character_count integer,
  p_meter_usage boolean default true
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

  v_plan_id := public.resolve_user_plan(p_user_id);
  v_daily_limit := public.get_entitlement_limit(v_plan_id, 'speech_synthesis', 'count');

  if v_daily_limit <= 0 then
    return jsonb_build_object('allowed', false, 'reason', 'premium_required');
  end if;

  if p_character_count <= 0 or p_character_count > 500 then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_text_length');
  end if;

  -- Cached audio is free on Google's side; only verify entitlement.
  if not p_meter_usage then
    return jsonb_build_object('allowed', true, 'cached', true);
  end if;

  perform pg_advisory_xact_lock(hashtext('speech-synthesis-user:' || p_user_id::text));
  perform pg_advisory_xact_lock(hashtext('speech-synthesis-global'));

  select count(*)
  into v_daily_usage
  from public.speech_synthesis_attempts
  where user_id = p_user_id
    and attempted_at >= date_trunc('day', now());

  if v_daily_usage >= v_daily_limit then
    return jsonb_build_object('allowed', false, 'reason', 'daily_synthesis_limit');
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

  return jsonb_build_object('allowed', true, 'cached', false);
end;
$$;

revoke all on function public.check_speech_synthesis_access(uuid, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.check_speech_synthesis_access(uuid, integer, boolean)
  to service_role;
