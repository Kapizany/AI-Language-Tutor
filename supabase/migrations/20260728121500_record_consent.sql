alter table public.profiles
  add column terms_accepted_at timestamptz,
  add column privacy_policy_version text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    display_name,
    terms_accepted_at,
    privacy_policy_version
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    case
      when new.raw_user_meta_data ->> 'terms_accepted' = 'true' then now()
      else null
    end,
    nullif(new.raw_user_meta_data ->> 'privacy_policy_version', '')
  );
  return new;
end;
$$;
