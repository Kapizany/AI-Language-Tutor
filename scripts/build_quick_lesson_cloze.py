#!/usr/bin/env python3
"""Build migration: quick_lessons.questions as topic-aligned cloze."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "supabase/migrations/20260803160000_topic_aligned_quick_lesson_cloze.sql"
LESSONS_JSON = Path("/tmp/quick_lessons.json")

COUNTS = {"A1": 2, "A2": 3, "B1": 4, "B2": 5}
OPTS = {"A1": 3, "A2": 3, "B1": 4, "B2": 4}

STOP = {
    "a", "an", "the", "and", "or", "but", "to", "of", "in", "on", "at", "for", "with",
    "is", "are", "was", "were", "be", "been", "being", "am", "do", "does", "did",
    "have", "has", "had", "this", "that", "these", "those", "there", "their", "they",
    "he", "she", "it", "we", "you", "i", "my", "his", "her", "our", "your", "not",
    "can", "could", "would", "should", "will", "may", "might", "must", "from", "into",
    "by", "as", "if", "so", "than", "then", "also", "only", "just", "very", "more",
    "most", "some", "any", "all", "each", "other", "about", "after", "before", "when",
    "while", "because", "which", "who", "what", "how", "where", "why", "up", "out",
    "el", "la", "los", "las", "un", "una", "unos", "unas", "y", "o", "de", "del",
    "en", "con", "por", "para", "que", "se", "su", "sus", "al", "lo", "le", "les",
    "es", "son", "era", "fue", "hay", "no", "si", "más", "muy", "ya", "como",
    "le", "la", "les", "des", "du", "une", "et", "ou", "à", "au", "aux", "ce",
    "ces", "son", "sa", "ses", "il", "elle", "ils", "elles", "nous", "vous", "je",
    "tu", "est", "sont", "été", "être", "avoir", "a", "ont", "pas", "ne", "qui",
    "que", "dont", "où", "dans", "sur", "avec", "sans", "plus", "moins", "très",
    "il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "di", "da", "in", "su",
    "con", "per", "che", "non", "si", "è", "sono", "era", "fu", "ha", "hanno",
    "più", "molto", "come", "quando", "mentre", "dopo", "prima", "anche",
    "maya", "leo", "nina", "sam", "ana", "nora", "ben", "mia", "priya",
}

GENERIC_DISTRACTORS = {
    "en": ["quickly", "quietly", "always", "never", "sometimes", "later", "today", "again"],
    "es": ["rápido", "siempre", "nunca", "luego", "hoy", "también", "apenas", "casi"],
    "fr": ["vite", "toujours", "jamais", "ensuite", "aujourd'hui", "aussi", "presque", "encore"],
    "it": ["presto", "sempre", "mai", "poi", "oggi", "anche", "quasi", "ancora"],
}

EXPLANATIONS = {
    "en": "Complete with the word used in the lesson text.",
    "es": "Complete com a palavra usada no texto da lição.",
    "fr": "Complete com a palavra usada no texto da lição.",
    "it": "Complete com a palavra usada no texto da lição.",
}

# Topic metadata from generate-quick-lessons.mjs for expanded lessons
LOCALES = {
    "en": {
        "contexts": ["this morning", "yesterday", "last weekend", "during a busy afternoon"],
        "topics": [
            ["Organizing the day", "organize the day", "too many tasks", "write a short priority list", "finish the important work"],
            ["Finding an address", "meet a friend downtown", "take a wrong street", "ask a local for directions", "arrive at the right place"],
            ["Preparing a meal", "cook dinner for friends", "forget one ingredient", "use a similar ingredient", "serve dinner on time"],
            ["Solving a delay", "get to an appointment", "face a transport delay", "send a message and choose another route", "avoid a misunderstanding"],
            ["Learning a skill", "learn a new digital skill", "find the first lesson difficult", "practice in short daily sessions", "complete a small project"],
            ["Helping a neighbor", "help a new neighbor", "notice a communication problem", "speak slowly and show an example", "solve the problem together"],
            ["Planning a trip", "plan a short trip", "discover that the first option is expensive", "compare dates and alternatives", "stay within the budget"],
            ["Improving health", "build a healthier routine", "feel tired after work", "start with a short walk", "exercise consistently"],
            ["Working in a team", "prepare a team presentation", "receive different suggestions", "listen and divide the responsibilities", "deliver a clear presentation"],
            ["Making a decision", "choose an evening course", "have several similar options", "compare schedule, price, and practice", "select the most useful course"],
        ],
        "names": ["Maya", "Leo", "Nina", "Sam"],
    },
    "es": {
        "contexts": ["esta mañana", "ayer", "el fin de semana pasado", "durante una tarde ocupada"],
        "topics": [
            ["Organizar el día", "organizar el día", "tener demasiadas tareas", "escribir una lista breve de prioridades", "terminar el trabajo importante"],
            ["Encontrar una dirección", "encontrarse con un amigo en el centro", "tomar una calle equivocada", "pedir indicaciones a una persona", "llegar al lugar correcto"],
            ["Preparar una comida", "preparar una cena para sus amigos", "olvidar un ingrediente", "usar un ingrediente parecido", "servir la cena a tiempo"],
            ["Resolver un retraso", "llegar a una cita", "tener un retraso en el transporte", "enviar un mensaje y elegir otra ruta", "evitar un malentendido"],
            ["Aprender una habilidad", "aprender una nueva habilidad digital", "encontrar difícil la primera lección", "practicar en sesiones cortas cada día", "completar un pequeño proyecto"],
            ["Ayudar a un vecino", "ayudar a un vecino nuevo", "notar un problema de comunicación", "hablar despacio y mostrar un ejemplo", "resolver el problema juntos"],
            ["Planear un viaje", "planear un viaje corto", "descubrir que la primera opción es cara", "comparar fechas y alternativas", "respetar el presupuesto"],
            ["Mejorar la salud", "crear una rutina más saludable", "sentirse cansado después del trabajo", "empezar con un paseo corto", "hacer ejercicio con constancia"],
            ["Trabajar en equipo", "preparar una presentación en equipo", "recibir sugerencias diferentes", "escuchar y dividir las responsabilidades", "hacer una presentación clara"],
            ["Tomar una decisión", "elegir un curso nocturno", "tener varias opciones parecidas", "comparar horario, precio y práctica", "elegir el curso más útil"],
        ],
        "names": ["Maya", "Leo", "Nina", "Sam"],
    },
    "fr": {
        "contexts": ["ce matin", "hier", "le week-end dernier", "pendant un après-midi chargé"],
        "topics": [
            ["Organiser la journée", "organiser sa journée", "avoir trop de tâches", "écrire une courte liste de priorités", "terminer le travail important"],
            ["Trouver une adresse", "retrouver un ami en ville", "prendre la mauvaise rue", "demander son chemin à quelqu'un", "arriver au bon endroit"],
            ["Préparer un repas", "préparer un dîner pour ses amis", "oublier un ingrédient", "utiliser un ingrédient similaire", "servir le dîner à l'heure"],
            ["Gérer un retard", "arriver à un rendez-vous", "subir un retard de transport", "envoyer un message et choisir un autre trajet", "éviter un malentendu"],
            ["Apprendre une compétence", "apprendre une compétence numérique", "trouver la première leçon difficile", "pratiquer chaque jour pendant peu de temps", "terminer un petit projet"],
            ["Aider un voisin", "aider un nouveau voisin", "remarquer un problème de communication", "parler lentement et montrer un exemple", "résoudre le problème ensemble"],
            ["Planifier un voyage", "planifier un court voyage", "découvrir que la première option est chère", "comparer les dates et les possibilités", "respecter son budget"],
            ["Améliorer sa santé", "adopter une routine plus saine", "se sentir fatigué après le travail", "commencer par une courte promenade", "faire régulièrement de l'exercice"],
            ["Travailler en équipe", "préparer une présentation en équipe", "recevoir des suggestions différentes", "écouter et partager les responsabilités", "faire une présentation claire"],
            ["Prendre une décision", "choisir un cours du soir", "avoir plusieurs options similaires", "comparer les horaires, le prix et la pratique", "choisir le cours le plus utile"],
        ],
        "names": ["Maya", "Leo", "Nina", "Sam"],
    },
    "it": {
        "contexts": ["questa mattina", "ieri", "lo scorso fine settimana", "durante un pomeriggio impegnativo"],
        "topics": [
            ["Organizzare la giornata", "organizzare la giornata", "avere troppi impegni", "scrivere una breve lista di priorità", "finire il lavoro importante"],
            ["Trovare un indirizzo", "incontrare un amico in centro", "prendere la strada sbagliata", "chiedere indicazioni a una persona", "arrivare nel posto giusto"],
            ["Preparare un pasto", "preparare una cena per gli amici", "dimenticare un ingrediente", "usare un ingrediente simile", "servire la cena in tempo"],
            ["Gestire un ritardo", "arrivare a un appuntamento", "avere un ritardo nei trasporti", "inviare un messaggio e scegliere un altro percorso", "evitare un malinteso"],
            ["Imparare una competenza", "imparare una nuova competenza digitale", "trovare difficile la prima lezione", "esercitarsi ogni giorno per poco tempo", "completare un piccolo progetto"],
            ["Aiutare un vicino", "aiutare un nuovo vicino", "notare un problema di comunicazione", "parlare lentamente e mostrare un esempio", "risolvere il problema insieme"],
            ["Pianificare un viaggio", "pianificare un breve viaggio", "scoprire che la prima opzione è costosa", "confrontare date e alternative", "rispettare il budget"],
            ["Migliorare la salute", "creare una routine più sana", "sentirsi stanco dopo il lavoro", "iniziare con una breve passeggiata", "fare esercizio con costanza"],
            ["Lavorare in squadra", "preparare una presentazione di gruppo", "ricevere suggerimenti diversi", "ascoltare e dividere le responsabilità", "fare una presentazione chiara"],
            ["Prendere una decisione", "scegliere un corso serale", "avere diverse opzioni simili", "confrontare orario, prezzo e pratica", "scegliere il corso più utile"],
        ],
        "names": ["Maya", "Leo", "Nina", "Sam"],
    },
}


def sql_escape(value: str) -> str:
    return value.replace("'", "''")


def tokenize(text: str) -> list[str]:
    return re.findall(r"[A-Za-zÀ-ÿ']+", text)


def content_words(text: str) -> list[str]:
    words = []
    seen = set()
    for word in tokenize(text):
        key = word.lower()
        if key in STOP or len(key) < 3:
            continue
        if key in seen:
            continue
        seen.add(key)
        words.append(word)
    return words


def make_options(answer: str, language: str, level: str, pool: list[str], salt: int) -> tuple[list[str], int]:
    need = OPTS[level]
    distractors: list[str] = []
    for word in pool:
        if word.lower() == answer.lower():
            continue
        if word.lower() in {d.lower() for d in distractors}:
            continue
        distractors.append(word)
        if len(distractors) >= need - 1:
            break
    generics = GENERIC_DISTRACTORS[language]
    gi = 0
    while len(distractors) < need - 1:
        cand = generics[(salt + gi) % len(generics)]
        gi += 1
        if cand.lower() != answer.lower() and cand.lower() not in {d.lower() for d in distractors}:
            distractors.append(cand)
    options = distractors[: need - 1]
    answer_index = salt % need
    options.insert(answer_index, answer)
    return options, answer_index


def cloze_from_phrase(phrase: str, blank_word: str) -> str | None:
    pattern = re.compile(rf"\b{re.escape(blank_word)}\b", re.I)
    if not pattern.search(phrase):
        return None
    return f"Complete: {pattern.sub('___', phrase, count=1)}"


def expanded_meta(lesson_id: str) -> tuple[str, list[str], str] | None:
    # en-quick-a1-11
    m = re.match(r"(en|es|fr|it)-quick-(a1|a2|b1|b2)-(\d+)$", lesson_id)
    if not m:
        return None
    language, _level, number_s = m.group(1), m.group(2), m.group(3)
    number = int(number_s)
    offset = number - 11
    locale = LOCALES[language]
    topic = locale["topics"][offset % len(locale["topics"])]
    variant = offset // len(locale["topics"])
    name = locale["names"][variant]
    context = locale["contexts"][variant]
    return name, topic, context


def _topic_pool(language: str) -> list[str]:
    words: list[str] = []
    for topic in LOCALES[language]["topics"]:
        for phrase in topic[1:]:
            words.extend(content_words(phrase))
    return words


def build_expanded_cloze(lesson: dict) -> list[dict]:
    meta = expanded_meta(lesson["id"])
    if not meta:
        return build_body_cloze(lesson)
    name, topic, _context = meta
    level = lesson["level"]
    language = lesson["language"]
    body = lesson["body"]
    title, goal, problem, action, outcome = topic

    # Prefer distinctive words from action/problem/outcome first.
    phrase_priority = (action, problem, outcome, goal)
    candidates: list[tuple[str, str, str]] = []
    for phrase in phrase_priority:
        ranked = sorted(content_words(phrase), key=lambda w: (-len(w), w.lower()))
        for word in ranked:
            if len(word) < 4:
                continue
            sentence = _short_sentence(body, word)
            prompt = cloze_from_phrase(sentence, word)
            if prompt:
                candidates.append((prompt, word, f"Complete com a palavra do texto sobre “{title}”."))

    selected: list[dict] = []
    used_answers: set[str] = set()
    pool = content_words(" ".join(phrase_priority)) + _topic_pool(language)
    for prompt, answer, explanation in candidates:
        if answer.lower() in used_answers:
            continue
        options, answer_index = make_options(
            answer, language, level, pool, len(selected) + sum(ord(c) for c in lesson["id"])
        )
        selected.append({
            "prompt": prompt if len(prompt) <= 500 else prompt[:497] + "...",
            "options": options,
            "answer_index": answer_index,
            "explanation_pt_br": explanation,
        })
        used_answers.add(answer.lower())
        if len(selected) >= COUNTS[level]:
            break

    if len(selected) < COUNTS[level]:
        selected.extend(build_body_cloze(lesson)[len(selected):])
    return selected[: COUNTS[level]]


def _short_sentence(body: str, word: str) -> str:
    parts = re.split(r"(?<=[.!?])\s+", body.strip())
    for part in parts:
        if re.search(rf"\b{re.escape(word)}\b", part, re.I):
            return part.strip()
    # window around word
    m = re.search(rf"(.{{0,40}}\b{re.escape(word)}\b.{{0,40}})", body, re.I)
    if m:
        return m.group(1).strip(" ,;")
    return body.split(".")[0].strip()


def build_body_cloze(lesson: dict) -> list[dict]:
    level = lesson["level"]
    language = lesson["language"]
    body = lesson["body"]
    words = content_words(body)
    need = COUNTS[level]
    selected: list[dict] = []
    used: set[str] = set()

    # Prefer longer/more distinctive words for higher levels
    ranked = sorted(words, key=lambda w: (-len(w), w.lower()))
    if level in {"A1", "A2"}:
        ranked = words  # keep reading order for beginners

    for word in ranked:
        if word.lower() in used:
            continue
        sentence = _short_sentence(body, word)
        prompt = cloze_from_phrase(sentence, word)
        if not prompt:
            continue
        # For B1/B2, prefer longer sentence context from body when available
        if level in {"B1", "B2"}:
            full = cloze_from_phrase(sentence if len(sentence) > 40 else body.split(".")[0] + ".", word)
            if full:
                prompt = full
        options, answer_index = make_options(word, language, level, words, len(selected) * 3 + len(word))
        selected.append({
            "prompt": prompt if len(prompt) <= 500 else f"Complete: {sentence[:80]} ___ ...",
            "options": options,
            "answer_index": answer_index,
            "explanation_pt_br": EXPLANATIONS[language],
        })
        used.add(word.lower())
        if len(selected) >= need:
            break

    # Absolute fallback
    while len(selected) < need:
        answer = words[len(selected) % max(1, len(words))] if words else "yes"
        options, answer_index = make_options(answer, language, level, words or GENERIC_DISTRACTORS[language], len(selected))
        selected.append({
            "prompt": f"Complete: {answer} means focus on ___ in this lesson." if False else f"Complete: The lesson uses the word ___.",
            "options": options,
            "answer_index": answer_index,
            "explanation_pt_br": EXPLANATIONS[language],
        })
        # Fix fallback prompt to actually blank the answer word in a body snippet
        snippet = body.split(".")[0].strip()
        if answer.lower() in snippet.lower():
            selected[-1]["prompt"] = cloze_from_phrase(snippet, answer) or selected[-1]["prompt"]
        else:
            selected[-1]["prompt"] = f"Complete: ___ appears in this lesson."
            selected[-1]["options"] = options
    return selected[:need]


def build_questions(lesson: dict) -> list[dict]:
    if "-quick-" in lesson["id"]:
        return expanded_cloze_safe(lesson)
    return build_body_cloze(lesson)


def expanded_cloze_safe(lesson: dict) -> list[dict]:
    items = build_expanded_cloze(lesson)
    # Validate shapes
    need = COUNTS[lesson["level"]]
    opt = OPTS[lesson["level"]]
    cleaned = []
    for item in items:
        if "___" not in item["prompt"]:
            continue
        if len(item["options"]) != opt:
            continue
        if not (0 <= item["answer_index"] < len(item["options"])):
            continue
        cleaned.append(item)
    if len(cleaned) < need:
        cleaned.extend(build_body_cloze(lesson))
    return cleaned[:need]


def main() -> None:
    lessons = json.loads(LESSONS_JSON.read_text())
    if len(lessons) != 800:
        raise SystemExit(f"Expected 800 lessons, got {len(lessons)}")

    updates: list[str] = []
    for lesson in lessons:
        questions = build_questions(lesson)
        if len(questions) != COUNTS[lesson["level"]]:
            raise SystemExit(f"{lesson['id']}: got {len(questions)} questions")
        for q in questions:
            if "___" not in q["prompt"]:
                raise SystemExit(f"{lesson['id']}: missing blank in {q['prompt']!r}")
            if len(q["options"]) != OPTS[lesson["level"]]:
                raise SystemExit(f"{lesson['id']}: bad option count")
        first = questions[0]
        questions_json = json.dumps(questions, ensure_ascii=False)
        updates.append(
            "update public.quick_lessons set\n"
            f"  questions = '{sql_escape(questions_json)}'::jsonb,\n"
            f"  question = '{sql_escape(first['prompt'])}',\n"
            f"  options = '{sql_escape(json.dumps(first['options'], ensure_ascii=False))}'::jsonb,\n"
            f"  answer_index = {first['answer_index']}\n"
            f"where id = '{sql_escape(lesson['id'])}';"
        )

    sql = f"""-- Topic-aligned cloze questions for quick lessons.
-- Generated by scripts/build_quick_lesson_cloze.py
-- Counts: A1=2, A2=3, B1=4, B2=5. Blank marker: ___.

alter table public.quick_lessons
  add column if not exists questions jsonb;

-- Temporary placeholder so the column can be set NOT NULL before row updates.
update public.quick_lessons
set questions = jsonb_build_array(
  jsonb_build_object(
    'prompt', 'Complete: ___',
    'options', '["a","b","c"]'::jsonb,
    'answer_index', 0,
    'explanation_pt_br', 'placeholder'
  ),
  jsonb_build_object(
    'prompt', 'Complete: ___',
    'options', '["a","b","c"]'::jsonb,
    'answer_index', 0,
    'explanation_pt_br', 'placeholder'
  )
)
where questions is null;

alter table public.quick_lessons
  alter column questions set not null;

{chr(10).join(updates)}

alter table public.quick_lessons
  drop constraint if exists quick_lessons_questions_level_check;

alter table public.quick_lessons
  drop constraint if exists quick_lessons_questions_shape_check;

alter table public.quick_lessons
  add constraint quick_lessons_questions_shape_check check (
    jsonb_typeof(questions) = 'array'
    and jsonb_array_length(questions) between 2 and 5
  );

alter table public.quick_lessons
  add constraint quick_lessons_questions_level_check check (
    (level = 'A1' and jsonb_array_length(questions) = 2)
    or (level = 'A2' and jsonb_array_length(questions) = 3)
    or (level = 'B1' and jsonb_array_length(questions) = 4)
    or (level = 'B2' and jsonb_array_length(questions) = 5)
  );

-- Quick lessons now store multi-step cloze in questions[]; resolve mistakes by step.
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
  current_user_id uuid := auth.uid();
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
      select language, level, questions -> p_step_index
      into item_language, item_level, question_data
      from public.quick_lessons where id = p_activity_id and is_published;
      item_prompt := question_data ->> 'prompt';
      item_options := question_data -> 'options';
      item_answer_index := (question_data ->> 'answer_index')::integer;
      item_explanation := coalesce(question_data ->> 'explanation_pt_br', '');
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
"""
    OUT.write_text(sql)
    total_q = sum(COUNTS[l["level"]] for l in lessons)
    print(f"Wrote {OUT}")
    print(f"lessons=800 questions={total_q}")


if __name__ == "__main__":
    main()
