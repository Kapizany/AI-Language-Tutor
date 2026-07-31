create table public.learner_review_items (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source_type text not null check (source_type in ('quick_lesson', 'reading', 'grammar', 'conversation')),
  source_id text not null,
  source_step integer not null default 0 check (source_step >= 0),
  prompt text not null check (char_length(prompt) between 1 and 4000),
  learner_answer text not null check (char_length(learner_answer) between 1 and 4000),
  correct_answer text not null check (char_length(correct_answer) between 1 and 4000),
  explanation_pt_br text not null default '',
  language text not null check (language in ('en', 'es', 'fr', 'it')),
  level text not null check (level in ('A1', 'A2', 'B1', 'B2')),
  status text not null default 'pending' check (status in ('pending', 'mastered')),
  review_attempts integer not null default 0 check (review_attempts >= 0),
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_type, source_id, source_step)
);

create index learner_review_items_pending_idx
  on public.learner_review_items (user_id, language, created_at)
  where status = 'pending';

alter table public.learner_review_items enable row level security;
create policy "Users can read their own review items"
  on public.learner_review_items for select to authenticated
  using ((select auth.uid()) = user_id);
grant select on public.learner_review_items to authenticated;

create trigger learner_review_items_set_updated_at
  before update on public.learner_review_items
  for each row execute function public.set_updated_at();

create or replace function public.record_learning_mistake(
  p_activity_id text,
  p_activity_type text,
  p_step_index integer,
  p_selected_answer_index integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  item_language text;
  item_level text;
  item_prompt text;
  item_options jsonb;
  item_answer_index integer;
  item_explanation text := '';
  question_data jsonb;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_step_index < 0 or p_selected_answer_index < 0 then raise exception 'Invalid answer'; end if;

  case p_activity_type
    when 'quick_lesson' then
      select language, level, question, options, answer_index
      into item_language, item_level, item_prompt, item_options, item_answer_index
      from public.quick_lessons where id = p_activity_id and is_published;
    when 'grammar' then
      select language, level, question, options, answer_index
      into item_language, item_level, item_prompt, item_options, item_answer_index
      from public.grammar_exercises where id = p_activity_id and is_published;
      item_explanation := 'Revise a explicação do tema gramatical antes de tentar novamente.';
    when 'reading' then
      select language, level, questions -> p_step_index
      into item_language, item_level, question_data
      from public.reading_passages where id = p_activity_id and is_published;
      item_prompt := question_data ->> 'prompt';
      item_options := question_data -> 'options';
      item_answer_index := (question_data ->> 'answer_index')::integer;
      item_explanation := coalesce(question_data ->> 'explanation_pt_br', '');
    else raise exception 'Invalid activity type';
  end case;

  if item_prompt is null or p_selected_answer_index >= jsonb_array_length(item_options) then
    raise exception 'Activity or answer not found';
  end if;
  if p_selected_answer_index = item_answer_index then return; end if;

  insert into public.learner_review_items (
    user_id, source_type, source_id, source_step, prompt, learner_answer,
    correct_answer, explanation_pt_br, language, level
  ) values (
    current_user_id, p_activity_type, p_activity_id, p_step_index, item_prompt,
    item_options ->> p_selected_answer_index, item_options ->> item_answer_index,
    item_explanation, item_language, item_level
  )
  on conflict (user_id, source_type, source_id, source_step) do update
  set learner_answer = excluded.learner_answer,
      correct_answer = excluded.correct_answer,
      explanation_pt_br = excluded.explanation_pt_br,
      status = 'pending',
      updated_at = now();
end;
$$;

revoke all on function public.record_learning_mistake(text, text, integer, integer) from public;
grant execute on function public.record_learning_mistake(text, text, integer, integer) to authenticated;

create or replace function public.review_learning_mistake(p_item_id uuid, p_remembered boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  update public.learner_review_items
  set status = case when p_remembered then 'mastered' else 'pending' end,
      review_attempts = review_attempts + 1,
      last_reviewed_at = now()
  where id = p_item_id and user_id = (select auth.uid());
  if not found then raise exception 'Review item not found'; end if;
end;
$$;

revoke all on function public.review_learning_mistake(uuid, boolean) from public;
grant execute on function public.review_learning_mistake(uuid, boolean) to authenticated;

create or replace function public.capture_conversation_correction()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  session_language text;
  session_level text;
begin
  if new.correction is null then return new; end if;
  select target_language, learner_level into session_language, session_level
  from public.conversation_sessions where id = new.session_id;
  insert into public.learner_review_items (
    user_id, source_type, source_id, prompt, learner_answer, correct_answer,
    explanation_pt_br, language, level
  ) values (
    new.user_id, 'conversation', new.id::text, 'Correção da prática de conversação',
    new.correction ->> 'original', new.correction ->> 'corrected',
    new.correction ->> 'explanation_pt_br', session_language, session_level
  ) on conflict do nothing;
  return new;
end;
$$;

create trigger capture_conversation_correction_after_insert
  after insert on public.conversation_messages
  for each row when (new.correction is not null)
  execute function public.capture_conversation_correction();

insert into public.learner_review_items (
  user_id, source_type, source_id, prompt, learner_answer, correct_answer,
  explanation_pt_br, language, level, created_at
)
select
  message.user_id,
  'conversation',
  message.id::text,
  'Correção da prática de conversação',
  message.correction ->> 'original',
  message.correction ->> 'corrected',
  message.correction ->> 'explanation_pt_br',
  session.target_language,
  session.learner_level,
  message.created_at
from public.conversation_messages message
join public.conversation_sessions session on session.id = message.session_id
where message.correction is not null
on conflict do nothing;
