-- Tighter Free plan daily limits: 2 conversations, 40 LLM calls, 10 transcriptions.

update public.plan_entitlements
set limit_value = 2
where plan_id = 'free'
  and feature_key = 'conversation_session';

update public.plan_entitlements
set limit_value = 40
where plan_id = 'free'
  and feature_key = 'llm_request';

update public.plan_entitlements
set limit_value = 10
where plan_id = 'free'
  and feature_key = 'transcription';
