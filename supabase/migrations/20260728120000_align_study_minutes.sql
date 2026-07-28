alter table public.learner_preferences
  drop constraint learner_preferences_study_minutes;

update public.learner_preferences
set study_minutes_per_day = 60
where study_minutes_per_day = 45;

alter table public.learner_preferences
  add constraint learner_preferences_study_minutes
  check (study_minutes_per_day in (10, 20, 30, 60));
