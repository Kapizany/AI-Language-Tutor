#!/usr/bin/env python3
"""Upgrade B1/B2 reading, quick-lesson, and grammar exercises with mixed difficulty.

A1/A2 stay mostly single-word cloze.
B1/B2 mix: multi-word cloze + text interpretation / meaning questions.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "supabase/migrations/20260803170000_advanced_b1_b2_mixed_exercises.sql"
SEED_READINGS = ROOT / "supabase/migrations/20260731123000_seed_reading_passages.sql"
LESSONS_JSON = Path("/tmp/quick_lessons.json")
TOPICS_JSON = Path("/tmp/grammar_topics.json")

READING_COUNTS = {"A1": 3, "A2": 4, "B1": 6, "B2": 8}
QUICK_COUNTS = {"A1": 2, "A2": 3, "B1": 4, "B2": 5}
GRAMMAR_COUNTS = {"A1": 5, "A2": 6, "B1": 8, "B2": 10}
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
    "el", "la", "los", "las", "un", "una", "y", "o", "de", "del", "en", "con", "por",
    "para", "que", "se", "su", "al", "lo", "le", "es", "son", "no", "me", "te", "mi",
    "les", "des", "du", "une", "et", "ou", "à", "au", "aux", "ce", "je", "tu", "il",
    "elle", "nous", "vous", "est", "sont", "pas", "ne", "qui", "dans", "sur", "avec",
    "i", "gli", "di", "da", "su", "per", "che", "non", "si", "è", "sono", "ha", "mi",
    "ti", "ci", "vi", "every", "first", "maya", "leo", "nina", "sam",
}

GENERIC = {
    "en": ["quickly", "rarely", "often", "later", "usually", "suddenly", "carefully", "never"],
    "es": ["rápido", "raramente", "luego", "siempre", "apenas", "casi", "nunca", "hoy"],
    "fr": ["vite", "rarement", "ensuite", "souvent", "presque", "jamais", "encore", "aussi"],
    "it": ["presto", "raramente", "poi", "spesso", "quasi", "mai", "ancora", "anche"],
}

INTERP_PROMPTS = {
    "en": {
        "main": "What is the main idea of the text?",
        "true": "According to the text, which statement is true?",
        "infer": "What can reasonably be inferred from the text?",
        "purpose": "What is the author's main purpose in this passage?",
        "detail": "Which detail is supported by the text?",
    },
    "es": {
        "main": "¿Cuál es la idea principal del texto?",
        "true": "Según el texto, ¿qué afirmación es verdadera?",
        "infer": "¿Qué se puede inferir razonablemente del texto?",
        "purpose": "¿Cuál es el propósito principal del autor?",
        "detail": "¿Qué detalle está respaldado por el texto?",
    },
    "fr": {
        "main": "Quelle est l'idée principale du texte ?",
        "true": "D'après le texte, laquelle de ces affirmations est vraie ?",
        "infer": "Que peut-on raisonnablement déduire du texte ?",
        "purpose": "Quel est le but principal de l'auteur ?",
        "detail": "Quel détail est confirmé par le texte ?",
    },
    "it": {
        "main": "Qual è l'idea principale del testo?",
        "true": "Secondo il testo, quale affermazione è vera?",
        "infer": "Cosa si può ragionevolmente dedurre dal testo?",
        "purpose": "Qual è lo scopo principale dell'autore?",
        "detail": "Quale dettaglio è supportato dal testo?",
    },
}

FALSE_DISTRACTORS = {
    "en": [
        "The narrator refuses to change any habits.",
        "The text argues that effort is never useful.",
        "Everything happens without any difficulty.",
        "The author recommends ignoring the problem completely.",
    ],
    "es": [
        "El narrador rechaza cambiar cualquier hábito.",
        "El texto dice que el esfuerzo nunca sirve.",
        "Todo ocurre sin ninguna dificultad.",
        "El autor recomienda ignorar por completo el problema.",
    ],
    "fr": [
        "Le narrateur refuse de changer la moindre habitude.",
        "Le texte affirme que l'effort n'est jamais utile.",
        "Tout se passe sans aucune difficulté.",
        "L'auteur recommande d'ignorer complètement le problème.",
    ],
    "it": [
        "Il narratore rifiuta di cambiare qualsiasi abitudine.",
        "Il testo afferma che lo sforzo non serve mai.",
        "Tutto avviene senza alcuna difficoltà.",
        "L'autore consiglia di ignorare del tutto il problema.",
    ],
}

PURPOSE_OPTIONS = {
    "en": [
        "To explain a situation and its consequences",
        "To advertise a product",
        "To give cooking instructions only",
        "To list unrelated vocabulary",
    ],
    "es": [
        "Explicar una situación y sus consecuencias",
        "Anunciar un producto",
        "Dar solo instrucciones de cocina",
        "Listar vocabulario sin relación",
    ],
    "fr": [
        "Expliquer une situation et ses conséquences",
        "Faire la publicité d'un produit",
        "Donner seulement des consignes de cuisine",
        "Lister un vocabulaire sans lien",
    ],
    "it": [
        "Spiegare una situazione e le sue conseguenze",
        "Pubblicizzare un prodotto",
        "Dare solo istruzioni di cucina",
        "Elencare vocaboli senza relazione",
    ],
}


def sql_escape(value: str) -> str:
    return value.replace("'", "''")


def unescape(value: str) -> str:
    return value.replace("''", "'")


def tokenize(text: str) -> list[str]:
    return re.findall(r"[A-Za-zÀ-ÿ']+", text)


def content_words(text: str) -> list[str]:
    out, seen = [], set()
    for word in tokenize(text):
        key = word.lower()
        if key in STOP or len(key) < 4 or key in seen:
            continue
        seen.add(key)
        out.append(word)
    return out


def sentences(body: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", body.replace("\n", " ").strip())
    return [p.strip() for p in parts if len(p.strip()) > 18]


def clip(text: str, limit: int = 120) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip(" ,;:") + "…"


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
    gi = 0
    while len(distractors) < need - 1:
        cand = GENERIC[language][(salt + gi) % len(GENERIC[language])]
        gi += 1
        if cand.lower() != answer.lower() and cand.lower() not in {d.lower() for d in distractors}:
            distractors.append(cand)
    options = distractors[: need - 1]
    answer_index = salt % need
    options.insert(answer_index, answer)
    return options, answer_index


def single_cloze(sentence: str, word: str) -> str | None:
    pattern = re.compile(rf"\b{re.escape(word)}\b", re.I)
    if not pattern.search(sentence):
        return None
    filled = pattern.sub("___", sentence, count=1)
    prompt = f"Complete: {filled}"
    return prompt if len(prompt) <= 500 else f"Complete: {clip(filled, 180)}"


def multi_word_cloze(sentence: str, span: int = 2) -> tuple[str, str] | None:
    words = sentence.split()
    if len(words) < span + 2:
        return None
    content_idxs = [
        i for i, word in enumerate(words)
        if re.sub(r"[^\wÀ-ÿ']", "", word).lower() not in STOP
        and len(re.sub(r"[^\wÀ-ÿ']", "", word)) >= 4
    ]
    if len(content_idxs) < 1:
        return None
    # Prefer a clean interior span without trailing punctuation on the last word.
    start = None
    for idx in content_idxs:
        if idx + span <= len(words):
            chunk = words[idx: idx + span]
            if any(re.search(r"[,:;]$", w) for w in chunk[:-1]):
                continue
            start = idx
            break
    if start is None:
        return None
    raw_answer_words = words[start: start + span]
    answer = " ".join(re.sub(r"^[^\wÀ-ÿ']+|[^\wÀ-ÿ']+$", "", w) for w in raw_answer_words)
    if len(re.sub(r"\W+", "", answer)) < 6:
        return None
    filled_words = words[:start] + ["___"] + words[start + span :]
    filled = " ".join(filled_words)
    prompt = f"Complete: {filled}"
    if len(prompt) > 500:
        prompt = f"Complete: {clip(filled, 180)}"
    return prompt, answer


MEANING_DISTRACTORS_PT = [
    "Expressa uma ordem militar sem contexto.",
    "Indica apenas uma cor ou número isolado.",
    "Serve só para cumprimentar alguém.",
    "Mostra uma medida de peso ou distância.",
    "Descreve o clima do dia seguinte.",
    "Nomeia um país sem função gramatical.",
]


def paraphrase(sentence: str, language: str) -> str:
    # Light paraphrase for correct interpretation option
    s = sentence.strip()
    s = re.sub(r"\b(I|Je|Yo|Io)\b", {"en": "The narrator", "es": "El narrador", "fr": "Le narrateur", "it": "Il narratore"}[language], s, count=1)
    return clip(s, 110)


def contradiction(sentence: str, language: str, salt: int) -> str:
    return FALSE_DISTRACTORS[language][salt % len(FALSE_DISTRACTORS[language])]


def build_beginner_cloze(body: str, language: str, level: str, need: int) -> list[dict]:
    sents = sentences(body)
    words = content_words(body)
    ranked = words if level in {"A1", "A2"} else sorted(words, key=lambda w: (-len(w), w.lower()))
    selected, used = [], set()
    for word in ranked:
        if word.lower() in used:
            continue
        candidates = [s for s in sents if re.search(rf"\b{re.escape(word)}\b", s, re.I)]
        if not candidates:
            continue
        sentence = candidates[0]
        prompt = single_cloze(sentence, word)
        if not prompt:
            continue
        options, ai = make_options(word, language, level, words, len(selected) * 3 + len(word))
        selected.append({
            "prompt": prompt,
            "options": options,
            "answer_index": ai,
            "explanation_pt_br": "Complete com a palavra que aparece no texto.",
        })
        used.add(word.lower())
        if len(selected) >= need:
            break
    return selected[:need]


def build_advanced_text_questions(body: str, language: str, level: str, need: int) -> list[dict]:
    """Mix multi-word cloze and interpretation for B1/B2."""
    sents = sentences(body)
    words = content_words(body)
    prompts = INTERP_PROMPTS[language]
    selected: list[dict] = []

    # Target mix: roughly half cloze (prefer multi-word), half interpretation
    cloze_target = need // 2
    interp_target = need - cloze_target

    # Multi-word / single cloze
    used_answers = set()
    for sentence in sorted(sents, key=len, reverse=True):
        if len(selected) >= cloze_target:
            break
        span = 2
        if level == "B2" and len(content_words(sentence)) >= 5:
            span = 3
        result = multi_word_cloze(sentence, span=span)
        if not result and span == 3:
            result = multi_word_cloze(sentence, span=2)
        if not result:
            # fallback single long word
            ranked = sorted(content_words(sentence), key=len, reverse=True)
            if not ranked:
                continue
            prompt = single_cloze(sentence, ranked[0])
            if not prompt:
                continue
            answer = ranked[0]
        else:
            prompt, answer = result
        if answer.lower() in used_answers:
            continue
        # distractors: other multi-word chunks or words
        pool = []
        for other in sents:
            alt = multi_word_cloze(other, span=span)
            if alt and alt[1].lower() != answer.lower():
                pool.append(alt[1])
        pool.extend(words)
        options, ai = make_options(answer, language, level, pool, len(selected) + len(answer))
        selected.append({
            "prompt": prompt,
            "options": options,
            "answer_index": ai,
            "explanation_pt_br": "Complete com o trecho que aparece no texto (pode ter mais de uma palavra).",
        })
        used_answers.add(answer.lower())

    # Interpretation questions
    interp_items: list[dict] = []
    if sents:
        main_correct = paraphrase(sents[0], language)
        main_opts, main_ai = make_options(
            main_correct,
            language,
            level,
            [contradiction(sents[0], language, i) for i in range(6)] + [paraphrase(s, language) for s in sents[1:4]],
            1,
        )
        interp_items.append({
            "prompt": prompts["main"],
            "options": main_opts,
            "answer_index": main_ai,
            "explanation_pt_br": "A ideia principal resume o foco central do texto.",
        })

        detail_sent = sents[min(1, len(sents) - 1)]
        detail_correct = paraphrase(detail_sent, language)
        detail_opts, detail_ai = make_options(
            detail_correct,
            language,
            level,
            [contradiction(detail_sent, language, i + 2) for i in range(6)],
            2,
        )
        interp_items.append({
            "prompt": prompts["true"] if level == "B1" else prompts["detail"],
            "options": detail_opts,
            "answer_index": detail_ai,
            "explanation_pt_br": "A opção correta reproduz uma informação presente no texto.",
        })

        infer_correct = paraphrase(sents[-1], language)
        infer_opts, infer_ai = make_options(
            infer_correct,
            language,
            level,
            [contradiction(sents[-1], language, i + 4) for i in range(6)],
            3,
        )
        interp_items.append({
            "prompt": prompts["infer"],
            "options": infer_opts,
            "answer_index": infer_ai,
            "explanation_pt_br": "A inferência deve ser compatível com o que o texto sugere.",
        })

        purpose_opts = PURPOSE_OPTIONS[language][:]
        purpose_ai = 0
        # rotate answer index
        purpose_ai = (len(body) // 7) % 4
        correct = purpose_opts[0]
        purpose_opts = purpose_opts[1:]
        purpose_opts.insert(purpose_ai, correct)
        interp_items.append({
            "prompt": prompts["purpose"],
            "options": purpose_opts,
            "answer_index": purpose_ai,
            "explanation_pt_br": "O texto descreve uma situação e seus efeitos ou conclusões.",
        })

    # Interleave: cloze, interp, cloze, interp...
    cloze_items = selected[:cloze_target]
    while len(cloze_items) < cloze_target and words:
        # pad with single cloze
        word = words[len(cloze_items) % len(words)]
        sentence = next((s for s in sents if re.search(rf"\b{re.escape(word)}\b", s, re.I)), sents[0] if sents else body)
        prompt = single_cloze(sentence, word) or f"Complete: ___ {word}"
        options, ai = make_options(word, language, level, words, len(cloze_items) + 9)
        cloze_items.append({
            "prompt": prompt,
            "options": options,
            "answer_index": ai,
            "explanation_pt_br": "Complete com a palavra do texto.",
        })

    final: list[dict] = []
    i_c = i_i = 0
    while len(final) < need:
        if len(final) % 2 == 0 and i_c < len(cloze_items):
            final.append(cloze_items[i_c]); i_c += 1
        elif i_i < len(interp_items):
            final.append(interp_items[i_i]); i_i += 1
        elif i_c < len(cloze_items):
            final.append(cloze_items[i_c]); i_c += 1
        else:
            break
    # ensure length
    while len(final) < need and interp_items:
        final.append(interp_items[len(final) % len(interp_items)])
    return final[:need]


def parse_passages(sql: str) -> list[dict]:
    pattern = re.compile(
        r"\('((?:en|es|fr|it)-passage-[^']+)',\s*"
        r"'(en|es|fr|it)',\s*"
        r"'(A1|A2|B1|B2)',\s*"
        r"'((?:[^']|'')*)',\s*"
        r"'((?:[^']|'')*)',\s*"
        r"'(\[(?:[^']|'')*\])'::jsonb",
        re.S,
    )
    rows = []
    for m in pattern.finditer(sql):
        rows.append({
            "id": m.group(1),
            "language": m.group(2),
            "level": m.group(3),
            "title": unescape(m.group(4)),
            "body": unescape(m.group(5)),
        })
    return rows


# --- Quick lessons ---
sys.path.insert(0, str(ROOT / "scripts"))
from build_quick_lesson_cloze import (  # noqa: E402
    LOCALES,
    build_body_cloze,
    expanded_meta,
)


def build_advanced_quick(lesson: dict) -> list[dict]:
    level = lesson["level"]
    language = lesson["language"]
    body = lesson["body"]
    need = QUICK_COUNTS[level]
    if level in {"A1", "A2"}:
        # reuse existing beginner generator via body cloze
        items = build_body_cloze(lesson)
        return items[:need]

    items = build_advanced_text_questions(body, language, level, need)
    # Enrich with strategy/interpretation tied to action when expanded metadata exists
    meta = expanded_meta(lesson["id"])
    if meta and len(items) >= 2:
        name, topic, _ = meta
        title, goal, problem, action, outcome = topic
        prompts = INTERP_PROMPTS[language]
        correct = {
            "en": f"{name} chose to {action}",
            "es": f"{name} decidió {action}",
            "fr": f"{name} a décidé de {action}",
            "it": f"{name} ha deciso di {action}",
        }[language]
        wrong = FALSE_DISTRACTORS[language][:]
        options, ai = make_options(correct, language, level, wrong, 11)
        items[1] = {
            "prompt": prompts["true"],
            "options": options,
            "answer_index": ai,
            "explanation_pt_br": f"No texto, a estratégia usada é: {action}.",
        }
        # Multi-word cloze on action phrase if possible
        if action in body or any(w in body for w in action.split()):
            result = multi_word_cloze(_sentence_with(body, action.split()[0]), span=min(3, len(action.split())))
            if result:
                prompt, answer = result
                # Prefer blanking the action phrase itself
                if action.lower() in body.lower():
                    prompt = f"Complete: {re.sub(re.escape(action), '___', body, count=1, flags=re.I)}"
                    if len(prompt) > 500:
                        prompt = f"Complete: ... ___ ..."
                    answer = action
                pool = [goal, problem, outcome] + content_words(body)
                options, ai = make_options(answer, language, level, pool, 12)
                items[0] = {
                    "prompt": prompt if prompt.startswith("Complete") else f"Complete: {prompt}",
                    "options": options,
                    "answer_index": ai,
                    "explanation_pt_br": "Complete com a expressão do texto (pode ter mais de uma palavra).",
                }
    return items[:need]


def _sentence_with(body: str, word: str) -> str:
    for part in sentences(body):
        if re.search(rf"\b{re.escape(word)}\b", part, re.I):
            return part
    return body.split(".")[0]


# --- Grammar ---
def load_grammar_banks():
    banks = {}
    for mod_name in (
        "grammar_cloze_banks_en",
        "grammar_cloze_banks_es",
        "grammar_cloze_banks_fr",
        "grammar_cloze_banks_it",
    ):
        mod = __import__(mod_name)
        banks.update(mod.get_banks())
    return banks


def upgrade_grammar_item(item: tuple, topic: dict, index: int) -> tuple:
    """For B1/B2: mix multi-word cloze, sentence choice, and meaning questions."""
    question, options, answer_index, explanation, example = item
    level = topic["level"]
    language = topic["lang"]
    title = topic["title"]
    if level not in {"B1", "B2"}:
        return item

    kind = index % 3
    answer = options[answer_index]

    if kind == 0:
        # Multi-word cloze from example when possible
        result = multi_word_cloze(example, span=2 if level == "B1" else 3)
        if result:
            prompt, multi_answer = result
            pool = [o for o in options if o != answer] + content_words(example)
            # Include a couple of plausible multi-word distractors from the example
            other = multi_word_cloze(example, span=2)
            if other and other[1].lower() != multi_answer.lower():
                pool.insert(0, other[1])
            new_options, new_ai = make_options(multi_answer, language, level, pool + [answer], index + 3)
            return (prompt, new_options, new_ai, explanation, example)
        return item

    if kind == 1:
        # Choose the correct sentence (topic-aligned)
        correct = example
        wrongs = []
        for opt in options:
            if opt == answer:
                continue
            if answer in example:
                mutated = example.replace(answer, opt, 1)
                if mutated != example:
                    wrongs.append(mutated)
            else:
                wrongs.append(f"{opt}")
        # Ensure clearly wrong distractors if mutations failed
        while len(wrongs) < 3:
            wrongs.append(FALSE_DISTRACTORS[language][len(wrongs) % len(FALSE_DISTRACTORS[language])])
        new_options = []
        for item_opt in wrongs:
            if item_opt != correct and item_opt not in new_options:
                new_options.append(item_opt)
            if len(new_options) == 3:
                break
        while len(new_options) < 3:
            new_options.append(FALSE_DISTRACTORS[language][len(new_options)])
        ai = (index * 2) % 4
        new_options.insert(ai, correct)
        prompt = {
            "en": f"Which sentence correctly uses “{title}”?",
            "es": f"¿Qué frase usa correctamente “{title}”?",
            "fr": f"Quelle phrase utilise correctement « {title} » ?",
            "it": f"Quale frase usa correttamente “{title}”?",
        }[language]
        return (prompt, new_options[:4], ai, explanation, example)

    # kind == 2: meaning / interpretation of the example
    prompt = {
        "en": f"What does this sentence express?\n“{clip(example, 140)}”",
        "es": f"¿Qué expresa esta frase?\n“{clip(example, 140)}”",
        "fr": f"Que signifie cette phrase ?\n« {clip(example, 140)} »",
        "it": f"Cosa esprime questa frase?\n“{clip(example, 140)}”",
    }[language]
    correct = clip(explanation, 110)
    wrongs = MEANING_DISTRACTORS_PT[:]
    new_options, ai = make_options(correct, language, level, wrongs, index + 5)
    return (prompt, new_options, ai, explanation, example)


def main() -> None:
    if not LESSONS_JSON.exists():
        raise SystemExit("Missing /tmp/quick_lessons.json — regenerate lesson extract first")
    if not TOPICS_JSON.exists():
        raise SystemExit("Missing /tmp/grammar_topics.json")

    passages = parse_passages(SEED_READINGS.read_text())
    lessons = json.loads(LESSONS_JSON.read_text())
    topics = json.loads(TOPICS_JSON.read_text())
    banks = load_grammar_banks()

    parts: list[str] = [
        "-- Advanced B1/B2 mixed exercises (multi-word cloze + interpretation).",
        "-- Generated by scripts/build_advanced_b1_b2_exercises.py",
        "-- A1/A2 remain mostly single-word cloze; B1/B2 become more varied and harder.",
        "",
    ]

    # Readings: rewrite all to keep A1/A2 quality + advanced B1/B2
    reading_updates = []
    for passage in passages:
        level = passage["level"]
        if level in {"A1", "A2"}:
            questions = build_beginner_cloze(passage["body"], passage["language"], level, READING_COUNTS[level])
        else:
            questions = build_advanced_text_questions(passage["body"], passage["language"], level, READING_COUNTS[level])
        if len(questions) != READING_COUNTS[level]:
            raise SystemExit(f"{passage['id']}: expected {READING_COUNTS[level]}, got {len(questions)}")
        for q in questions:
            if len(q["options"]) != OPTS[level]:
                raise SystemExit(f"{passage['id']}: bad options")
            if level in {"A1", "A2"} and "___" not in q["prompt"]:
                raise SystemExit(f"{passage['id']}: beginner missing cloze")
        reading_updates.append(
            "update public.reading_passages set\n"
            f"  questions = '{sql_escape(json.dumps(questions, ensure_ascii=False))}'::jsonb\n"
            f"where id = '{sql_escape(passage['id'])}';"
        )
    parts.append("-- Readings")
    parts.extend(reading_updates)

    # Quick lessons
    quick_updates = []
    for lesson in lessons:
        questions = build_advanced_quick(lesson)
        level = lesson["level"]
        if len(questions) != QUICK_COUNTS[level]:
            # pad from body cloze
            questions = (questions + build_body_cloze(lesson))[: QUICK_COUNTS[level]]
        if len(questions) != QUICK_COUNTS[level]:
            raise SystemExit(f"{lesson['id']}: expected {QUICK_COUNTS[level]}, got {len(questions)}")
        first = questions[0]
        quick_updates.append(
            "update public.quick_lessons set\n"
            f"  questions = '{sql_escape(json.dumps(questions, ensure_ascii=False))}'::jsonb,\n"
            f"  question = '{sql_escape(first['prompt'])}',\n"
            f"  options = '{sql_escape(json.dumps(first['options'], ensure_ascii=False))}'::jsonb,\n"
            f"  answer_index = {first['answer_index']}\n"
            f"where id = '{sql_escape(lesson['id'])}';"
        )
    parts.append("\n-- Quick lessons")
    parts.extend(quick_updates)

    # Grammar B1/B2 only (update in place)
    grammar_updates = []
    for topic in topics:
        if topic["level"] not in {"B1", "B2"}:
            continue
        items = banks[topic["id"]][: GRAMMAR_COUNTS[topic["level"]]]
        for n, item in enumerate(items):
            upgraded = upgrade_grammar_item(item, topic, n)
            question, options, answer_index, explanation, example = upgraded
            exercise_id = f"{topic['id']}-cloze-{n + 1}"
            title = f"{topic['title']} · exercício {n + 1}"
            grammar_updates.append(
                "update public.grammar_exercises set\n"
                f"  title = '{sql_escape(title[:160])}',\n"
                f"  explanation = '{sql_escape(explanation)}',\n"
                f"  example = '{sql_escape(example)}',\n"
                f"  question = '{sql_escape(question)}',\n"
                f"  options = '{sql_escape(json.dumps(options, ensure_ascii=False))}'::jsonb,\n"
                f"  answer_index = {answer_index}\n"
                f"where id = '{sql_escape(exercise_id)}';"
            )
    parts.append("\n-- Grammar B1/B2")
    parts.extend(grammar_updates)

    OUT.write_text("\n".join(parts) + "\n")
    print(f"Wrote {OUT}")
    print(f"readings={len(reading_updates)} quick={len(quick_updates)} grammar={len(grammar_updates)}")


if __name__ == "__main__":
    main()
