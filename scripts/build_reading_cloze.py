#!/usr/bin/env python3
"""Build migration: reading_passages questions as text-aligned cloze."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "supabase/migrations/20260731123000_seed_reading_passages.sql"
OUT = ROOT / "supabase/migrations/20260803161000_text_aligned_reading_cloze.sql"

COUNTS = {"A1": 3, "A2": 4, "B1": 6, "B2": 8}
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
    "every", "first", "after", "being", "helps", "feel", "ready", "busy", "day",
    "el", "la", "los", "las", "un", "una", "y", "o", "de", "del", "en", "con", "por",
    "para", "que", "se", "su", "al", "lo", "le", "es", "son", "no", "me", "te", "mi",
    "le", "la", "les", "des", "du", "une", "et", "ou", "à", "au", "aux", "ce", "je",
    "tu", "il", "elle", "nous", "vous", "est", "sont", "pas", "ne", "qui", "dans",
    "sur", "avec", "il", "lo", "la", "i", "gli", "le", "di", "da", "in", "su", "per",
    "che", "non", "si", "è", "sono", "ha", "mi", "ti", "ci", "vi",
}

GENERIC = {
    "en": ["quickly", "quietly", "rarely", "often", "suddenly", "carefully", "usually", "later"],
    "es": ["rápido", "raramente", "a menudo", "de repente", "cuidadosamente", "luego", "apenas", "casi"],
    "fr": ["vite", "rarement", "souvent", "soudain", "soigneusement", "ensuite", "presque", "encore"],
    "it": ["presto", "raramente", "spesso", "improvvisamente", "con attenzione", "poi", "quasi", "ancora"],
}


def sql_escape(value: str) -> str:
    return value.replace("'", "''")


def unescape(value: str) -> str:
    return value.replace("''", "'")


def parse_passages(sql: str) -> list[dict]:
    # Rows: ('id', 'lang', 'level', 'title', 'body', 'questions'::jsonb, sort, true)
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


def tokenize(text: str) -> list[str]:
    return re.findall(r"[A-Za-zÀ-ÿ']+", text)


def content_words(text: str) -> list[str]:
    words = []
    seen = set()
    for word in tokenize(text):
        key = word.lower()
        if key in STOP or len(key) < 4:
            continue
        if key in seen:
            continue
        seen.add(key)
        words.append(word)
    return words


def sentences(body: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", body.replace("\n", " ").strip())
    return [p.strip() for p in parts if len(p.strip()) > 20]


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


def cloze(sentence: str, word: str) -> str | None:
    pattern = re.compile(rf"\b{re.escape(word)}\b", re.I)
    if not pattern.search(sentence):
        return None
    filled = pattern.sub("___", sentence, count=1)
    prompt = f"Complete: {filled}"
    if len(prompt) > 500:
        # trim around blank
        idx = filled.find("___")
        start = max(0, idx - 60)
        end = min(len(filled), idx + 60)
        snippet = filled[start:end].strip(" ,;")
        if start > 0:
            snippet = "..." + snippet
        if end < len(filled):
            snippet = snippet + "..."
        prompt = f"Complete: {snippet}"
    return prompt


def build_questions(passage: dict) -> list[dict]:
    level = passage["level"]
    language = passage["language"]
    body = passage["body"]
    sents = sentences(body)
    words = content_words(body)
    need = COUNTS[level]

    # Rank words: longer first for advanced; reading order for beginners
    if level in {"B1", "B2"}:
        ranked = sorted(words, key=lambda w: (-len(w), w.lower()))
    else:
        ranked = words

    selected: list[dict] = []
    used_answers: set[str] = set()
    used_sentences: set[str] = set()

    for word in ranked:
        if word.lower() in used_answers:
            continue
        # Prefer a sentence containing the word; advanced levels prefer longer sentences
        candidates = [s for s in sents if re.search(rf"\b{re.escape(word)}\b", s, re.I)]
        if not candidates:
            continue
        if level in {"B1", "B2"}:
            candidates = sorted(candidates, key=len, reverse=True)
        sentence = next((s for s in candidates if s not in used_sentences), candidates[0])
        prompt = cloze(sentence, word)
        if not prompt:
            continue
        options, answer_index = make_options(
            word, language, level, words, len(selected) * 5 + len(word) + len(passage["id"])
        )
        selected.append({
            "prompt": prompt,
            "options": options,
            "answer_index": answer_index,
            "explanation_pt_br": "Complete com a palavra que aparece no texto da leitura.",
        })
        used_answers.add(word.lower())
        used_sentences.add(sentence)
        if len(selected) >= need:
            break

    if len(selected) < need:
        raise SystemExit(f"{passage['id']}: only generated {len(selected)}/{need} cloze items")
    return selected[:need]


def main() -> None:
    passages = parse_passages(SEED.read_text())
    if len(passages) != 160:
        raise SystemExit(f"Expected 160 passages, got {len(passages)}")

    updates = []
    for passage in passages:
        questions = build_questions(passage)
        for q in questions:
            if "___" not in q["prompt"]:
                raise SystemExit(f"{passage['id']}: missing blank")
            if len(q["options"]) != OPTS[passage["level"]]:
                raise SystemExit(f"{passage['id']}: bad options")
        updates.append(
            "update public.reading_passages set\n"
            f"  questions = '{sql_escape(json.dumps(questions, ensure_ascii=False))}'::jsonb\n"
            f"where id = '{sql_escape(passage['id'])}';"
        )

    sql = f"""-- Text-aligned cloze questions for reading passages.
-- Generated by scripts/build_reading_cloze.py
-- Counts: A1=3, A2=4, B1=6, B2=8. Blank marker: ___.

-- Drop inline CHECK constraints that limit question counts (names are auto-generated).
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'reading_passages'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%jsonb_array_length(questions)%'
  loop
    execute format('alter table public.reading_passages drop constraint %I', constraint_row.conname);
  end loop;
end;
$$;

{chr(10).join(updates)}

alter table public.reading_passages
  drop constraint if exists reading_passages_questions_shape_check;

alter table public.reading_passages
  drop constraint if exists reading_passages_questions_level_check;

alter table public.reading_passages
  add constraint reading_passages_questions_shape_check check (
    jsonb_typeof(questions) = 'array'
    and jsonb_array_length(questions) between 3 and 8
  );

alter table public.reading_passages
  add constraint reading_passages_questions_level_check check (
    (level = 'A1' and jsonb_array_length(questions) = 3)
    or (level = 'A2' and jsonb_array_length(questions) = 4)
    or (level = 'B1' and jsonb_array_length(questions) = 6)
    or (level = 'B2' and jsonb_array_length(questions) = 8)
  );
"""
    OUT.write_text(sql)
    total = sum(COUNTS[p["level"]] for p in passages)
    print(f"Wrote {OUT}")
    print(f"passages=160 questions={total}")


if __name__ == "__main__":
    main()
