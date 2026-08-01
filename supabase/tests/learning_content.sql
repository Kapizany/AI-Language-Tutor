begin;

set local role postgres;

do $$
declare
  catalog_row record;
  language_code text;
  a1_average numeric;
  a2_average numeric;
  b1_average numeric;
  b2_average numeric;
begin
  for catalog_row in
    select language, level, count(*) as lesson_count
    from public.quick_lessons
    where is_published
    group by language, level
  loop
    if catalog_row.lesson_count <> 50 then
      raise exception 'Quick lesson catalog failure: %/% has % rows',
        catalog_row.language, catalog_row.level, catalog_row.lesson_count;
    end if;
  end loop;

  if (
    select count(*)
    from (
      select language, level
      from public.quick_lessons
      where is_published
      group by language, level
    ) combinations
  ) <> 16 then
    raise exception 'Quick lesson catalog failure: expected 16 language/level combinations';
  end if;

  foreach language_code in array array['en', 'es', 'fr', 'it']
  loop
    select
      avg(char_length(body)) filter (where level = 'A1'),
      avg(char_length(body)) filter (where level = 'A2'),
      avg(char_length(body)) filter (where level = 'B1'),
      avg(char_length(body)) filter (where level = 'B2')
    into a1_average, a2_average, b1_average, b2_average
    from public.quick_lessons
    where language = language_code and is_published;

    if not (a1_average < a2_average and a2_average < b1_average and b1_average < b2_average) then
      raise exception 'Quick lesson complexity failure for %', language_code;
    end if;

    if (
      select count(*) from public.grammar_topics
      where language = language_code and is_published
    ) <> 40 then
      raise exception 'Grammar catalog failure for %: expected 40 topics', language_code;
    end if;

    if exists (
      select level
      from public.grammar_topics
      where language = language_code and is_published
      group by level
      having count(*) <> 10
    ) then
      raise exception 'Grammar catalog failure for %: expected 10 topics per level', language_code;
    end if;
  end loop;

  if (
    select count(*)
    from public.grammar_topics
    where id like '%-grammar-extra-%' and is_published
  ) <> 32 then
    raise exception 'Grammar catalog failure: expected 32 extended topics';
  end if;

  if exists (
    select topic.id
    from public.grammar_topics topic
    left join public.grammar_exercises exercise
      on exercise.topic_id = topic.id and exercise.is_published
    where topic.id like '%-grammar-extra-%'
    group by topic.id
    having count(exercise.id) <> 5
  ) then
    raise exception 'Grammar catalog failure: every extended topic needs five exercises';
  end if;

  if exists (
    select topic.id
    from public.grammar_topics topic
    left join public.grammar_exercises exercise
      on exercise.topic_id = topic.id and exercise.is_published
    where topic.is_published
    group by topic.id
    having count(exercise.id) <> 5
  ) then
    raise exception 'Grammar catalog failure: every topic needs five exercises';
  end if;
end;
$$;

rollback;
