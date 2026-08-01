-- B1/B2 devem avaliar compreensão e uso, não apenas localização literal.
-- Mantemos os IDs (e, portanto, o progresso) e elevamos perguntas/distratores.
with advanced_lessons as (
  select
    id,
    language,
    level,
    (options ->> answer_index) as original_answer,
    ((sort_order - 1) % 5) + 1 as variant,
    (sort_order % 4) as answer_slot
  from public.quick_lessons
  where level in ('B1', 'B2')
),
upgraded as (
  select *,
    case
      when language = 'en' and level = 'B1'
        then 'The response — ' || original_answer
          || ' — addressed the obstacle without abandoning the intended outcome.'
      when language = 'en'
        then 'Adapting the method can preserve the central objective when circumstances change.'
      when language = 'es' and level = 'B1'
        then 'La respuesta — ' || original_answer
          || ' — afrontó el obstáculo sin abandonar el resultado buscado.'
      when language = 'es'
        then 'Adaptar el método permite conservar el objetivo central cuando cambian las circunstancias.'
      when language = 'fr' and level = 'B1'
        then 'La réponse — ' || original_answer
          || ' — a traité l''obstacle sans abandonner le résultat recherché.'
      when language = 'fr'
        then 'Adapter la méthode permet de préserver l''objectif central lorsque la situation change.'
      when language = 'it' and level = 'B1'
        then 'La risposta — ' || original_answer
          || ' — ha affrontato l''ostacolo senza abbandonare il risultato previsto.'
      else
        'Adattare il metodo permette di preservare l''obiettivo centrale quando cambiano le circostanze.'
    end as correct_answer
  from advanced_lessons
)
update public.quick_lessons lesson
set
  question = case
    when upgraded.language = 'en' and upgraded.level = 'B1' then
      (array[
        'Which interpretation best explains why the response was effective?',
        'What can be inferred about the relationship between the obstacle and the chosen response?',
        'Which option best paraphrases the character''s decision in context?',
        'Which detail provides the strongest evidence of purposeful adaptation?',
        'How did the character preserve the original objective despite the difficulty?'
      ])[upgraded.variant]
    when upgraded.language = 'en' and upgraded.level = 'B2' then
      (array[
        'Which underlying principle is most strongly illustrated by the character''s response?',
        'Which inference is justified by the way the alternatives were evaluated?',
        'What assumption about effective decision-making does the passage challenge?',
        'Which statement best captures the relationship between adaptation and purpose?',
        'Had the character reacted impulsively, which outcome would most likely have been compromised?'
      ])[upgraded.variant]
    when upgraded.language = 'es' and upgraded.level = 'B1' then
      (array[
        '¿Qué interpretación explica mejor por qué la respuesta fue eficaz?',
        '¿Qué se puede inferir sobre la relación entre el obstáculo y la solución elegida?',
        '¿Qué opción parafrasea mejor la decisión del personaje en este contexto?',
        '¿Qué detalle demuestra con mayor claridad una adaptación intencional?',
        '¿Cómo conservó el personaje el objetivo inicial a pesar de la dificultad?'
      ])[upgraded.variant]
    when upgraded.language = 'es' and upgraded.level = 'B2' then
      (array[
        '¿Qué principio subyacente ilustra mejor la reacción del personaje?',
        '¿Qué inferencia se justifica por la forma en que se evaluaron las alternativas?',
        '¿Qué supuesto sobre la toma de decisiones cuestiona el texto?',
        '¿Qué afirmación resume mejor la relación entre adaptación y propósito?',
        'Si el personaje hubiera reaccionado impulsivamente, ¿qué resultado habría peligrado?'
      ])[upgraded.variant]
    when upgraded.language = 'fr' and upgraded.level = 'B1' then
      (array[
        'Quelle interprétation explique le mieux l''efficacité de la réaction ?',
        'Que peut-on déduire du lien entre l''obstacle et la solution choisie ?',
        'Quelle proposition reformule le mieux la décision du personnage en contexte ?',
        'Quel détail prouve le plus clairement une adaptation réfléchie ?',
        'Comment le personnage a-t-il préservé son objectif malgré la difficulté ?'
      ])[upgraded.variant]
    when upgraded.language = 'fr' and upgraded.level = 'B2' then
      (array[
        'Quel principe sous-jacent la réaction du personnage illustre-t-elle le mieux ?',
        'Quelle inférence est justifiée par la manière dont les solutions ont été évaluées ?',
        'Quelle idée reçue sur la prise de décision le texte remet-il en question ?',
        'Quelle affirmation résume le mieux le rapport entre adaptation et objectif ?',
        'Si le personnage avait réagi impulsivement, quel résultat aurait été compromis ?'
      ])[upgraded.variant]
    when upgraded.language = 'it' and upgraded.level = 'B1' then
      (array[
        'Quale interpretazione spiega meglio perché la reazione è stata efficace?',
        'Che cosa si può dedurre dal rapporto tra l''ostacolo e la soluzione scelta?',
        'Quale opzione riformula meglio la decisione del personaggio nel contesto?',
        'Quale dettaglio dimostra più chiaramente un adattamento consapevole?',
        'In che modo il personaggio ha mantenuto l''obiettivo nonostante la difficoltà?'
      ])[upgraded.variant]
    else
      (array[
        'Quale principio sottostante è illustrato meglio dalla reazione del personaggio?',
        'Quale inferenza è giustificata dal modo in cui sono state valutate le alternative?',
        'Quale presupposto sul processo decisionale viene messo in discussione?',
        'Quale affermazione riassume meglio il rapporto tra adattamento e obiettivo?',
        'Se il personaggio avesse reagito impulsivamente, quale risultato sarebbe stato compromesso?'
      ])[upgraded.variant]
  end,
  options = case upgraded.answer_slot
    when 0 then jsonb_build_array(
      upgraded.correct_answer,
      case upgraded.language
        when 'en' then 'Abandoning the original goal as soon as uncertainty appeared'
        when 'es' then 'Abandonar el objetivo inicial en cuanto surgió la incertidumbre'
        when 'fr' then 'Abandonner l''objectif initial dès l''apparition de l''incertitude'
        else 'Abbandonare l''obiettivo iniziale appena è emersa l''incertezza'
      end,
      case upgraded.language
        when 'en' then 'Postponing every decision until the obstacle disappeared by itself'
        when 'es' then 'Aplazar toda decisión hasta que el obstáculo desapareciera solo'
        when 'fr' then 'Reporter toute décision jusqu''à ce que l''obstacle disparaisse seul'
        else 'Rimandare ogni decisione finché l''ostacolo non fosse scomparso da solo'
      end,
      case upgraded.language
        when 'en' then 'Prioritizing an immediate reaction without considering its consequences'
        when 'es' then 'Priorizar una reacción inmediata sin considerar sus consecuencias'
        when 'fr' then 'Privilégier une réaction immédiate sans en considérer les conséquences'
        else 'Privilegiare una reazione immediata senza considerarne le conseguenze'
      end
    )
    when 1 then jsonb_build_array(
      case upgraded.language
        when 'en' then 'Replacing the objective with an easier but unrelated one'
        when 'es' then 'Sustituir el objetivo por otro más fácil pero sin relación'
        when 'fr' then 'Remplacer l''objectif par un autre plus facile mais sans rapport'
        else 'Sostituire l''obiettivo con uno più facile ma non pertinente'
      end,
      upgraded.correct_answer,
      case upgraded.language
        when 'en' then 'Treating the first available option as necessarily the best one'
        when 'es' then 'Considerar que la primera opción disponible era necesariamente la mejor'
        when 'fr' then 'Considérer la première option disponible comme forcément la meilleure'
        else 'Considerare necessariamente migliore la prima opzione disponibile'
      end,
      case upgraded.language
        when 'en' then 'Avoiding the difficulty without addressing its effect on the plan'
        when 'es' then 'Evitar la dificultad sin afrontar su efecto en el plan'
        when 'fr' then 'Éviter la difficulté sans traiter son effet sur le projet'
        else 'Evitare la difficoltà senza affrontarne l''effetto sul piano'
      end
    )
    when 2 then jsonb_build_array(
      case upgraded.language
        when 'en' then 'Focusing on the obstacle while losing sight of the intended outcome'
        when 'es' then 'Concentrarse en el obstáculo y perder de vista el resultado buscado'
        when 'fr' then 'Se concentrer sur l''obstacle en perdant de vue le résultat recherché'
        else 'Concentrarsi sull''ostacolo perdendo di vista il risultato desiderato'
      end,
      case upgraded.language
        when 'en' then 'Assuming that changing the method meant accepting failure'
        when 'es' then 'Suponer que cambiar el método equivalía a aceptar el fracaso'
        when 'fr' then 'Supposer que changer de méthode revenait à accepter l''échec'
        else 'Supporre che cambiare metodo significasse accettare il fallimento'
      end,
      upgraded.correct_answer,
      case upgraded.language
        when 'en' then 'Choosing speed over a response suited to the actual constraints'
        when 'es' then 'Elegir la rapidez en vez de una respuesta adecuada a las condiciones'
        when 'fr' then 'Choisir la rapidité plutôt qu''une réponse adaptée aux contraintes'
        else 'Scegliere la rapidità invece di una risposta adatta ai vincoli reali'
      end
    )
    else jsonb_build_array(
      case upgraded.language
        when 'en' then 'Waiting for complete certainty before taking any relevant action'
        when 'es' then 'Esperar una certeza total antes de emprender una acción pertinente'
        when 'fr' then 'Attendre une certitude totale avant d''entreprendre une action pertinente'
        else 'Aspettare una certezza assoluta prima di intraprendere un''azione pertinente'
      end,
      case upgraded.language
        when 'en' then 'Solving a secondary issue while leaving the central obstacle untouched'
        when 'es' then 'Resolver un asunto secundario sin abordar el obstáculo principal'
        when 'fr' then 'Résoudre un problème secondaire sans traiter l''obstacle principal'
        else 'Risolvere un problema secondario senza affrontare l''ostacolo principale'
      end,
      case upgraded.language
        when 'en' then 'Following the initial plan rigidly despite the changed circumstances'
        when 'es' then 'Seguir el plan inicial rígidamente pese al cambio de circunstancias'
        when 'fr' then 'Suivre rigidement le projet initial malgré le changement de situation'
        else 'Seguire rigidamente il piano iniziale nonostante le nuove circostanze'
      end,
      upgraded.correct_answer
    )
  end,
  answer_index = upgraded.answer_slot
from upgraded
where lesson.id = upgraded.id;

-- Os cinco exercícios de cada tema passam a exigir aplicação em contexto,
-- análise de erro, equivalência, registro e integração discursiva.
update public.grammar_exercises exercise
set question = case exercise.language
  when 'en' then (array[
    'Which option completes the context while preserving the intended grammatical relationship?',
    'Which formulation corrects the error without changing the speaker''s intended meaning?',
    'Which sentence is grammatically accurate and semantically equivalent to the example?',
    'In a formal or neutral context, which option has the most appropriate structure and register?',
    'Which option integrates the target structure coherently into a longer argument?'
  ])[greatest(1, least(5, exercise.sort_order % 10))]
  when 'es' then (array[
    '¿Qué opción completa el contexto conservando la relación gramatical prevista?',
    '¿Qué formulación corrige el error sin alterar la intención del hablante?',
    '¿Qué oración es gramaticalmente precisa y semánticamente equivalente al ejemplo?',
    'En un contexto formal o neutro, ¿qué opción presenta la estructura y el registro adecuados?',
    '¿Qué opción integra la estructura estudiada de forma coherente en un argumento más amplio?'
  ])[greatest(1, least(5, exercise.sort_order % 10))]
  when 'fr' then (array[
    'Quelle option complète le contexte tout en préservant la relation grammaticale visée ?',
    'Quelle formulation corrige l''erreur sans modifier l''intention du locuteur ?',
    'Quelle phrase est correcte et sémantiquement équivalente à l''exemple ?',
    'Dans un contexte formel ou neutre, quelle option convient par sa structure et son registre ?',
    'Quelle option intègre la structure étudiée de façon cohérente dans un raisonnement plus large ?'
  ])[greatest(1, least(5, exercise.sort_order % 10))]
  else (array[
    'Quale opzione completa il contesto mantenendo la relazione grammaticale prevista?',
    'Quale formulazione corregge l''errore senza cambiare l''intenzione del parlante?',
    'Quale frase è corretta e semanticamente equivalente all''esempio?',
    'In un contesto formale o neutro, quale opzione presenta struttura e registro adeguati?',
    'Quale opzione integra la struttura studiata in modo coerente in un ragionamento più ampio?'
  ])[greatest(1, least(5, exercise.sort_order % 10))]
end
where exercise.level in ('B1', 'B2');
