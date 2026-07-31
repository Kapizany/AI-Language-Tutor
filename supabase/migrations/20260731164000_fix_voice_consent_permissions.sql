create or replace function public.record_voice_processing_consent(
  p_policy_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
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
  where id = current_user_id;

  if not found then
    raise exception 'Profile not found';
  end if;
end;
$$;

revoke all on function public.record_voice_processing_consent(text) from public;
grant execute on function public.record_voice_processing_consent(text) to authenticated;

