-- Ensure checkout links Mercado Pago metadata even when no subscription row exists yet.

create or replace function public.create_billing_checkout(
  p_user_id uuid,
  p_billing_cycle text,
  p_external_subscription_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  checkout_id bigint;
begin
  if p_billing_cycle not in ('monthly', 'annual') then
    return jsonb_build_object('created', false, 'reason', 'invalid_billing_cycle');
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    return jsonb_build_object('created', false, 'reason', 'user_not_found');
  end if;

  insert into public.billing_checkouts (
    user_id,
    billing_cycle,
    external_subscription_id,
    status
  )
  values (
    p_user_id,
    p_billing_cycle,
    p_external_subscription_id,
    'pending'
  )
  returning id into checkout_id;

  insert into public.user_subscriptions (
    user_id,
    plan_id,
    status,
    subscription_source,
    billing_cycle,
    external_subscription_id
  )
  values (
    p_user_id,
    'free',
    'active',
    'mercadopago',
    p_billing_cycle,
    p_external_subscription_id
  )
  on conflict (user_id) do update
  set external_subscription_id = excluded.external_subscription_id,
      billing_cycle = excluded.billing_cycle,
      subscription_source = 'mercadopago',
      updated_at = now();

  return jsonb_build_object(
    'created', true,
    'checkout_id', checkout_id,
    'external_subscription_id', p_external_subscription_id
  );
end;
$$;
