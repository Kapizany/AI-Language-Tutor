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
    where topic.is_published
    group by topic.id, topic.level
    having count(exercise.id) <> case topic.level
      when 'A1' then 5
      when 'A2' then 6
      when 'B1' then 8
      when 'B2' then 10
    end
  ) then
    raise exception 'Grammar catalog failure: expected A1=5, A2=6, B1=8, B2=10 exercises per topic';
  end if;

  if exists (
    select 1
    from public.grammar_exercises
    where is_published
      and (
        question not like '%___%'
        or question in (
          'Choose the correct sentence.',
          'Elige la frase correcta.',
          'Choisissez la phrase correcte.',
          'Scegli la frase corretta.'
        )
      )
  ) then
    raise exception 'Grammar catalog failure: exercises must be topic-aligned cloze prompts';
  end if;

  if exists (
    select 1
    from public.grammar_exercises
    where is_published
      and (
        (level in ('A1', 'A2') and jsonb_array_length(options) <> 3)
        or (level in ('B1', 'B2') and jsonb_array_length(options) <> 4)
      )
  ) then
    raise exception 'Grammar catalog failure: A1/A2 need 3 options and B1/B2 need 4 options';
  end if;

  if exists (
    select 1
    from public.quick_lessons
    where level in ('B1', 'B2')
      and (
        jsonb_array_length(options) <> 4
        or question in (
          'What helped Maya reach the goal?',
          'What helped Leo reach the goal?',
          'What helped Nina reach the goal?',
          'What helped Sam reach the goal?'
        )
      )
  ) then
    raise exception 'Advanced quick lesson failure: B1/B2 questions remain literal or trivial';
  end if;

end;
$$;

rollback;
