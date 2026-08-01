-- A resposta do modelo é armazenada antes de finalizar custo e anexar a troca.
-- Assim, repetir o mesmo request_id após uma falha de persistência não chama o
-- provedor novamente nem duplica mensagens.
create table public.conversation_generation_results (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.conversation_sessions(id) on delete cascade,
  result jsonb not null,
  provider text not null,
  model text not null,
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  estimated_cost_usd numeric(12, 8) not null check (estimated_cost_usd >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  created_at timestamptz not null default now()
);

alter table public.conversation_generation_results enable row level security;
revoke all on public.conversation_generation_results from anon, authenticated;
grant select, insert, update, delete on public.conversation_generation_results to service_role;

create unique index conversation_messages_request_role_unique
  on public.conversation_messages (session_id, request_id, role)
  where request_id is not null;

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
begin
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

  select max_learner_messages_per_session
  into max_learner_messages
  from public.llm_budget_policies
  where id = true;

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
