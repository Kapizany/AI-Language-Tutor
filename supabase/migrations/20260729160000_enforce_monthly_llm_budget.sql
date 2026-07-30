-- Keep the production-wide LLM spend ceiling at US$10 per calendar month.
-- The reservation function serializes requests and includes in-flight reservations,
-- so concurrent requests cannot bypass this limit.
update public.llm_budget_policies
set
  monthly_global_cost_usd = 10,
  updated_at = now()
where id = true;
