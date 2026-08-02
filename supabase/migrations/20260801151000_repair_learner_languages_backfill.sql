-- Idempotent backfill for environments where learner_languages was created
-- but rows were not copied from learner_preferences.
insert into public.learner_languages (user_id, target_language, current_level)
select lp.user_id, lp.target_language, lp.current_level
from public.learner_preferences as lp
inner join public.profiles as p on p.id = lp.user_id
on conflict (user_id, target_language) do update
set current_level = excluded.current_level;
