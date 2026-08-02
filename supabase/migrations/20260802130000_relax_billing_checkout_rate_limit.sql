-- Relax checkout rate limits and allow rolling back attempts when checkout fails.

create or replace function public.release_billing_checkout_attempt(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.billing_checkout_attempts
  where id = (
    select id
    from public.billing_checkout_attempts
    where user_id = p_user_id
    order by attempted_at desc
    limit 1
  );
end;
$$;

create or replace function public.reserve_billing_checkout_attempt(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_attempts integer;
  last_attempt_at timestamptz;
  retry_after_seconds integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  if public.resolve_user_plan(p_user_id) = 'premium' then
    return jsonb_build_object('allowed', false, 'reason', 'already_premium');
  end if;

  select attempted_at
  into last_attempt_at
  from public.billing_checkout_attempts
  where user_id = p_user_id
  order by attempted_at desc
  limit 1;

  if last_attempt_at is not null
     and last_attempt_at >= now() - interval '5 seconds' then
    retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from ((last_attempt_at + interval '5 seconds') - now())))::integer
    );
    return jsonb_build_object(
      'allowed', false,
      'reason', 'rate_limit',
      'retry_after_seconds', retry_after_seconds
    );
  end if;

  select count(*)
  into recent_attempts
  from public.billing_checkout_attempts
  where user_id = p_user_id
    and attempted_at >= now() - interval '15 minutes';

  if recent_attempts >= 6 then
    select attempted_at
    into last_attempt_at
    from public.billing_checkout_attempts
    where user_id = p_user_id
      and attempted_at >= now() - interval '15 minutes'
    order by attempted_at asc
    limit 1;

    retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from ((last_attempt_at + interval '15 minutes') - now())))::integer
    );

    return jsonb_build_object(
      'allowed', false,
      'reason', 'rate_limit',
      'retry_after_seconds', retry_after_seconds
    );
  end if;

  insert into public.billing_checkout_attempts (user_id) values (p_user_id);
  return jsonb_build_object('allowed', true);
end;
$$;

revoke all on function public.release_billing_checkout_attempt(uuid)
  from public, anon, authenticated;
revoke all on function public.reserve_billing_checkout_attempt(uuid)
  from public, anon, authenticated;

grant execute on function public.release_billing_checkout_attempt(uuid) to service_role;
grant execute on function public.reserve_billing_checkout_attempt(uuid) to service_role;
