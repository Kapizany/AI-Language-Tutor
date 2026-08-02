-- Admin panel: promote/revoke admin role and expose is_admin in user summary.

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

create or replace function public.admin_set_user_admin_role(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_is_admin boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  was_admin boolean;
  admin_count integer;
begin
  if not public.user_is_admin(p_actor_user_id) then
    raise exception 'Admin role required';
  end if;

  if not exists (select 1 from public.profiles where id = p_target_user_id) then
    return jsonb_build_object('updated', false, 'reason', 'user_not_found');
  end if;

  was_admin := public.user_is_admin(p_target_user_id);

  if p_is_admin and was_admin then
    return jsonb_build_object('updated', true, 'is_admin', true, 'unchanged', true);
  end if;

  if not p_is_admin and not was_admin then
    return jsonb_build_object('updated', true, 'is_admin', false, 'unchanged', true);
  end if;

  if not p_is_admin and p_actor_user_id = p_target_user_id then
    return jsonb_build_object('updated', false, 'reason', 'cannot_revoke_self');
  end if;

  if not p_is_admin then
    select count(*)
    into admin_count
    from public.user_roles
    where role = 'admin';

    if admin_count <= 1 then
      return jsonb_build_object('updated', false, 'reason', 'last_admin');
    end if;
  end if;

  if p_is_admin then
    insert into public.user_roles (user_id, role, granted_by)
    values (p_target_user_id, 'admin', p_actor_user_id)
    on conflict (user_id) do update
    set role = 'admin',
        granted_at = now(),
        granted_by = p_actor_user_id;
  else
    delete from public.user_roles
    where user_id = p_target_user_id
      and role = 'admin';
  end if;

  insert into public.admin_audit_logs (
    actor_user_id,
    action,
    target_type,
    target_id,
    previous_state,
    new_state
  )
  values (
    p_actor_user_id,
    case when p_is_admin then 'user.admin_granted' else 'user.admin_revoked' end,
    'user',
    p_target_user_id::text,
    jsonb_build_object('is_admin', was_admin),
    jsonb_build_object('is_admin', p_is_admin)
  );

  return jsonb_build_object('updated', true, 'is_admin', p_is_admin);
end;
$$;

revoke all on function public.admin_set_user_admin_role(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_set_user_admin_role(uuid, uuid, boolean) to service_role;
