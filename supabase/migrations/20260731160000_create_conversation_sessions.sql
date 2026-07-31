-- Fase 5 — conversação textual persistida.
--
-- Sessões, mensagens e resumos pertencem ao aluno e são legíveis por ele, mas
-- toda escrita acontece por RPCs `security definer` executadas apenas pelo
-- backend com `service_role`. Isso mantém contadores, limites de custo e
-- sequência de mensagens fora do alcance do cliente, seguindo o mesmo princípio
-- da migration 20260731150000.

-- 1. Catálogo de cenários -----------------------------------------------------

create table public.conversation_scenarios (
  id text primary key,
  category text not null check (category in ('daily', 'professional', 'travel')),
  title_pt_br text not null check (char_length(title_pt_br) between 1 and 160),
  description_pt_br text not null check (char_length(description_pt_br) between 1 and 400),
  objective_pt_br text not null check (char_length(objective_pt_br) between 1 and 400),
  min_level text not null check (min_level in ('A1', 'A2', 'B1', 'B2')),
  max_level text not null check (max_level in ('A1', 'A2', 'B1', 'B2')),
  planned_minutes integer not null check (planned_minutes between 5 and 30),
  icon text not null check (char_length(icon) between 1 and 40),
  accent text not null check (char_length(accent) between 1 and 20),
  openings jsonb not null check (
    jsonb_typeof(openings) = 'object'
    and openings ? 'en'
    and openings ? 'es'
    and openings ? 'fr'
    and openings ? 'it'
  ),
  goals_pt_br jsonb not null check (
    jsonb_typeof(goals_pt_br) = 'array'
    and jsonb_array_length(goals_pt_br) between 2 and 5
  ),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversation_scenarios_level_range check (
    case min_level when 'A1' then 1 when 'A2' then 2 when 'B1' then 3 else 4 end
    <= case max_level when 'A1' then 1 when 'A2' then 2 when 'B1' then 3 else 4 end
  )
);

create index conversation_scenarios_catalog_idx
  on public.conversation_scenarios (category, sort_order)
  where is_published;

alter table public.conversation_scenarios enable row level security;

create policy "Published scenarios are authenticated readable"
  on public.conversation_scenarios for select
  to authenticated
  using (is_published);

create trigger conversation_scenarios_set_updated_at
  before update on public.conversation_scenarios
  for each row execute function public.set_updated_at();

grant select on public.conversation_scenarios to authenticated;

-- 2. Sessões ------------------------------------------------------------------

create table public.conversation_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  scenario_id text not null references public.conversation_scenarios (id),
  target_language text not null check (target_language in ('en', 'es', 'fr', 'it')),
  learner_level text not null check (learner_level in ('A1', 'A2', 'B1', 'B2', 'unknown')),
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  planned_minutes integer not null check (planned_minutes between 5 and 30),
  message_count integer not null default 0 check (message_count >= 0),
  learner_message_count integer not null default 0 check (learner_message_count >= 0),
  correction_count integer not null default 0 check (correction_count >= 0),
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversation_sessions_ended_at_matches_status check (
    (status = 'active' and ended_at is null)
    or (status <> 'active' and ended_at is not null)
  )
);

create index conversation_sessions_user_started_idx
  on public.conversation_sessions (user_id, started_at desc);

create index conversation_sessions_active_idx
  on public.conversation_sessions (user_id, last_activity_at desc)
  where status = 'active';

alter table public.conversation_sessions enable row level security;

create policy "Users can read their own conversation sessions"
  on public.conversation_sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create trigger conversation_sessions_set_updated_at
  before update on public.conversation_sessions
  for each row execute function public.set_updated_at();

grant select on public.conversation_sessions to authenticated;

-- 3. Mensagens ----------------------------------------------------------------

create table public.conversation_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.conversation_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  sequence integer not null check (sequence > 0),
  role text not null check (role in ('tutor', 'learner')),
  content text not null check (char_length(content) between 1 and 4000),
  correction jsonb,
  request_id uuid,
  created_at timestamptz not null default now(),
  unique (session_id, sequence),
  constraint conversation_messages_correction_belongs_to_tutor check (
    correction is null or role = 'tutor'
  ),
  constraint conversation_messages_correction_shape check (
    correction is null
    or (
      jsonb_typeof(correction) = 'object'
      and correction ? 'original'
      and correction ? 'corrected'
      and correction ? 'explanation_pt_br'
      and correction ->> 'severity' in ('minor', 'important', 'blocking')
    )
  )
);

create index conversation_messages_session_sequence_idx
  on public.conversation_messages (session_id, sequence);

alter table public.conversation_messages enable row level security;

create policy "Users can read their own conversation messages"
  on public.conversation_messages for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.conversation_messages to authenticated;

-- 4. Resumos ------------------------------------------------------------------

create table public.session_summaries (
  session_id uuid primary key references public.conversation_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  headline_pt_br text not null check (char_length(headline_pt_br) between 1 and 200),
  encouragement_pt_br text not null check (char_length(encouragement_pt_br) between 1 and 600),
  strengths_pt_br jsonb not null check (
    jsonb_typeof(strengths_pt_br) = 'array'
    and jsonb_array_length(strengths_pt_br) between 1 and 5
  ),
  focus_areas jsonb not null check (
    jsonb_typeof(focus_areas) = 'array'
    and jsonb_array_length(focus_areas) between 0 and 5
  ),
  vocabulary jsonb not null check (
    jsonb_typeof(vocabulary) = 'array'
    and jsonb_array_length(vocabulary) between 0 and 12
  ),
  objective_progress smallint not null check (objective_progress between 0 and 100),
  request_id uuid,
  created_at timestamptz not null default now()
);

alter table public.session_summaries enable row level security;

create policy "Users can read their own session summaries"
  on public.session_summaries for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.session_summaries to authenticated;

-- 5. Limites de conversa ------------------------------------------------------

alter table public.llm_budget_policies
  add column daily_conversation_sessions_per_user integer not null default 3
    check (daily_conversation_sessions_per_user > 0),
  add column max_learner_messages_per_session integer not null default 30
    check (max_learner_messages_per_session > 0),
  add column session_idle_timeout_minutes integer not null default 60
    check (session_idle_timeout_minutes > 0);

-- 6. Escrita controlada -------------------------------------------------------

-- Encerra sessões esquecidas antes de qualquer contagem, para que o limite
-- diário não seja consumido por sessões que o aluno abandonou.
create or replace function public.expire_idle_conversation_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  idle_minutes integer;
  expired_count integer;
begin
  select session_idle_timeout_minutes
  into idle_minutes
  from public.llm_budget_policies
  where id = true;

  update public.conversation_sessions
  set status = 'abandoned',
      ended_at = last_activity_at
  where user_id = p_user_id
    and status = 'active'
    and last_activity_at < now() - make_interval(mins => idle_minutes);

  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

create or replace function public.start_conversation_session(
  p_user_id uuid,
  p_scenario_id text,
  p_target_language text,
  p_learner_level text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  scenario_row public.conversation_scenarios%rowtype;
  session_row public.conversation_sessions%rowtype;
  policy_row public.llm_budget_policies%rowtype;
  sessions_today integer;
  opening_text text;
begin
  -- Serializa o início de sessões do mesmo aluno para que o limite diário não
  -- possa ser furado por requisições concorrentes.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('conversation_session_start:' || p_user_id::text, 0)
  );

  select * into scenario_row
  from public.conversation_scenarios
  where id = p_scenario_id and is_published;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'scenario_not_found');
  end if;

  opening_text := scenario_row.openings ->> p_target_language;
  if opening_text is null or char_length(opening_text) = 0 then
    return jsonb_build_object('allowed', false, 'reason', 'scenario_language_unavailable');
  end if;

  if (
    case p_learner_level
      when 'unknown' then 1 when 'A1' then 1 when 'A2' then 2 when 'B1' then 3 when 'B2' then 4
      else 0
    end
    not between
      case scenario_row.min_level when 'A1' then 1 when 'A2' then 2 when 'B1' then 3 else 4 end
      and case scenario_row.max_level when 'A1' then 1 when 'A2' then 2 when 'B1' then 3 else 4 end
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'scenario_level_unavailable');
  end if;

  perform public.expire_idle_conversation_sessions(p_user_id);

  -- Retomada: uma sessão ativa do mesmo cenário e idioma continua em vez de
  -- consumir outra sessão do limite diário.
  select * into session_row
  from public.conversation_sessions
  where user_id = p_user_id
    and scenario_id = p_scenario_id
    and target_language = p_target_language
    and status = 'active'
  order by last_activity_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'allowed', true,
      'resumed', true,
      'session_id', session_row.id,
      'scenario_id', session_row.scenario_id,
      'target_language', session_row.target_language,
      'learner_level', session_row.learner_level,
      'planned_minutes', session_row.planned_minutes,
      'started_at', session_row.started_at,
      'learner_message_count', session_row.learner_message_count,
      'max_learner_messages', (
        select max_learner_messages_per_session from public.llm_budget_policies where id = true
      )
    );
  end if;

  select * into policy_row
  from public.llm_budget_policies
  where id = true;

  select count(*) into sessions_today
  from public.conversation_sessions
  where user_id = p_user_id
    and started_at >= date_trunc('day', now())
    and (status <> 'abandoned' or learner_message_count > 0);

  if sessions_today >= policy_row.daily_conversation_sessions_per_user then
    return jsonb_build_object('allowed', false, 'reason', 'daily_session_limit');
  end if;

  insert into public.conversation_sessions (
    user_id,
    scenario_id,
    target_language,
    learner_level,
    planned_minutes,
    message_count
  )
  values (
    p_user_id,
    p_scenario_id,
    p_target_language,
    p_learner_level,
    scenario_row.planned_minutes,
    1
  )
  returning * into session_row;

  insert into public.conversation_messages (
    session_id,
    user_id,
    sequence,
    role,
    content
  )
  values (
    session_row.id,
    p_user_id,
    1,
    'tutor',
    opening_text
  );

  return jsonb_build_object(
    'allowed', true,
    'resumed', false,
    'session_id', session_row.id,
    'scenario_id', session_row.scenario_id,
    'target_language', session_row.target_language,
    'learner_level', session_row.learner_level,
    'planned_minutes', session_row.planned_minutes,
    'started_at', session_row.started_at,
    'learner_message_count', 0,
    'max_learner_messages', policy_row.max_learner_messages_per_session
  );
end;
$$;

-- Contexto para o modelo: apenas as mensagens mais recentes viajam no prompt,
-- e a contagem total permite descrever o que ficou fora da janela.
create or replace function public.get_conversation_context(
  p_session_id uuid,
  p_user_id uuid,
  p_history_limit integer default 12
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.conversation_sessions%rowtype;
  scenario_row public.conversation_scenarios%rowtype;
  recent jsonb;
  corrected jsonb;
begin
  select * into session_row
  from public.conversation_sessions
  where id = p_session_id and user_id = p_user_id;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  select * into scenario_row
  from public.conversation_scenarios
  where id = session_row.scenario_id;

  -- A ordenação usa a coluna numérica: ordenar pelo campo JSON produziria
  -- ordem lexicográfica e colocaria a mensagem 10 antes da 2.
  select coalesce(jsonb_agg(item order by window_sequence), '[]'::jsonb)
  into recent
  from (
    select sequence as window_sequence,
           jsonb_build_object(
             'sequence', sequence,
             'role', role,
             'content', content,
             'correction', correction
           ) as item
    from public.conversation_messages
    where session_id = p_session_id
    order by sequence desc
    limit greatest(p_history_limit, 2)
  ) as window_messages;

  select coalesce(jsonb_agg(distinct correction ->> 'corrected'), '[]'::jsonb)
  into corrected
  from public.conversation_messages
  where session_id = p_session_id
    and correction is not null;

  return jsonb_build_object(
    'found', true,
    'status', session_row.status,
    'scenario_id', session_row.scenario_id,
    'objective_pt_br', scenario_row.objective_pt_br,
    'goals_pt_br', scenario_row.goals_pt_br,
    'target_language', session_row.target_language,
    'learner_level', session_row.learner_level,
    'planned_minutes', session_row.planned_minutes,
    'started_at', session_row.started_at,
    'message_count', session_row.message_count,
    'learner_message_count', session_row.learner_message_count,
    'correction_count', session_row.correction_count,
    'max_learner_messages', (
      select max_learner_messages_per_session from public.llm_budget_policies where id = true
    ),
    'previously_corrected', corrected,
    'recent_messages', recent
  );
end;
$$;

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
begin
  select * into session_row
  from public.conversation_sessions
  where id = p_session_id and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('stored', false, 'reason', 'session_not_found');
  end if;

  if session_row.status <> 'active' then
    return jsonb_build_object('stored', false, 'reason', 'session_not_active');
  end if;

  select max_learner_messages_per_session
  into max_learner_messages
  from public.llm_budget_policies
  where id = true;

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
    'learner_sequence', next_sequence,
    'tutor_sequence', next_sequence + 1,
    'learner_message_count', session_row.learner_message_count + 1,
    'max_learner_messages', max_learner_messages
  );
end;
$$;

create or replace function public.complete_conversation_session(
  p_session_id uuid,
  p_user_id uuid,
  p_headline_pt_br text,
  p_encouragement_pt_br text,
  p_strengths_pt_br jsonb,
  p_focus_areas jsonb,
  p_vocabulary jsonb,
  p_objective_progress integer,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.conversation_sessions%rowtype;
begin
  select * into session_row
  from public.conversation_sessions
  where id = p_session_id and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('completed', false, 'reason', 'session_not_found');
  end if;

  if session_row.status = 'completed' then
    return jsonb_build_object('completed', false, 'reason', 'session_already_completed');
  end if;

  update public.conversation_sessions
  set status = 'completed',
      ended_at = now(),
      last_activity_at = now()
  where id = p_session_id;

  insert into public.session_summaries (
    session_id,
    user_id,
    headline_pt_br,
    encouragement_pt_br,
    strengths_pt_br,
    focus_areas,
    vocabulary,
    objective_progress,
    request_id
  ) values (
    p_session_id,
    p_user_id,
    p_headline_pt_br,
    p_encouragement_pt_br,
    p_strengths_pt_br,
    p_focus_areas,
    p_vocabulary,
    p_objective_progress,
    p_request_id
  )
  on conflict (session_id) do update
  set headline_pt_br = excluded.headline_pt_br,
      encouragement_pt_br = excluded.encouragement_pt_br,
      strengths_pt_br = excluded.strengths_pt_br,
      focus_areas = excluded.focus_areas,
      vocabulary = excluded.vocabulary,
      objective_progress = excluded.objective_progress,
      request_id = excluded.request_id;

  return jsonb_build_object('completed', true, 'session_id', p_session_id);
end;
$$;

create or replace function public.abandon_conversation_session(
  p_session_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversation_sessions
  set status = 'abandoned',
      ended_at = now()
  where id = p_session_id
    and user_id = p_user_id
    and status = 'active';

  if not found then
    return jsonb_build_object('abandoned', false, 'reason', 'session_not_active');
  end if;

  return jsonb_build_object('abandoned', true, 'session_id', p_session_id);
end;
$$;

-- 7. Permissões ---------------------------------------------------------------

revoke all on function public.expire_idle_conversation_sessions(uuid)
  from public, anon, authenticated;
revoke all on function public.start_conversation_session(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.get_conversation_context(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.append_conversation_exchange(uuid, uuid, text, text, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_conversation_session(
  uuid, uuid, text, text, jsonb, jsonb, jsonb, integer, uuid
) from public, anon, authenticated;
revoke all on function public.abandon_conversation_session(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.expire_idle_conversation_sessions(uuid) to service_role;
grant execute on function public.start_conversation_session(uuid, text, text, text) to service_role;
grant execute on function public.get_conversation_context(uuid, uuid, integer) to service_role;
grant execute on function public.append_conversation_exchange(
  uuid, uuid, text, text, jsonb, uuid
) to service_role;
grant execute on function public.complete_conversation_session(
  uuid, uuid, text, text, jsonb, jsonb, jsonb, integer, uuid
) to service_role;
grant execute on function public.abandon_conversation_session(uuid, uuid) to service_role;
