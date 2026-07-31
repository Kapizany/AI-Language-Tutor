alter table public.profiles
  add column voice_processing_consent_at timestamptz,
  add column voice_processing_policy_version text;

create table public.speech_transcription_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index speech_transcription_attempts_user_time_idx
  on public.speech_transcription_attempts (user_id, attempted_at desc);

alter table public.speech_transcription_attempts enable row level security;
revoke all on table public.speech_transcription_attempts from anon, authenticated;

create or replace function public.record_voice_processing_consent(
  p_policy_version text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if p_policy_version <> '2026-07-31-voice-v1' then
    raise exception 'Unsupported voice processing policy version';
  end if;

  update public.profiles
  set
    voice_processing_consent_at = now(),
    voice_processing_policy_version = p_policy_version,
    updated_at = now()
  where id = (select auth.uid());
end;
$$;

revoke all on function public.record_voice_processing_consent(text) from public;
grant execute on function public.record_voice_processing_consent(text) to authenticated;

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
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'Service role required';
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

  return jsonb_build_object('allowed', true);
end;
$$;

revoke all on function public.check_speech_transcription_access(uuid, text) from public;
grant execute on function public.check_speech_transcription_access(uuid, text) to service_role;

