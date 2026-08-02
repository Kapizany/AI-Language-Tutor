-- Expose subscription lifecycle details to authorized administrators.

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
        coalesce(us.status, 'active') as subscription_status,
        us.ends_at as subscription_ends_at,
        us.billing_cycle,
        coalesce(us.subscription_source, 'system') as subscription_source,
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
    'subscription_ends_at', us.ends_at,
    'billing_cycle', us.billing_cycle,
    'subscription_source', coalesce(us.subscription_source, 'system'),
    'is_admin', public.user_is_admin(p.id),
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

revoke all on function public.admin_search_users(uuid, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.admin_get_user_summary(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.admin_search_users(uuid, text, integer, integer)
  to service_role;
grant execute on function public.admin_get_user_summary(uuid, uuid)
  to service_role;
