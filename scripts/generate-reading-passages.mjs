import { mkdir, readFile, writeFile } from "node:fs/promises";

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite-preview";
const outputPath = new URL(
  "../supabase/migrations/20260731123000_seed_reading_passages.sql",
  import.meta.url,
);
const cacheDirectory = new URL("../.local/generated-reading-passages/", import.meta.url);

if (!apiKey) throw new Error("GEMINI_API_KEY is required");

const languages = {
  en: "English",
  es: "Spanish",
  fr: "French",
  it: "Italian",
};

const levels = {
  A1: { paragraphs: 3, questions: 3, words: "90–130" },
  A2: { paragraphs: 4, questions: 4, words: "170–230" },
  B1: { paragraphs: 5, questions: 5, words: "320–430" },
  B2: { paragraphs: 6, questions: 7, words: "500–650" },
};

const themes = [
  "daily routines and independence",
  "travel and cultural discovery",
  "work and professional communication",
  "health and well-being",
  "food, traditions, and community",
  "technology in everyday life",
  "environment and sustainable choices",
  "relationships and social life",
  "personal finance and consumption",
  "education and lifelong learning",
];

const sqlString = (value) => `'${value.replaceAll("'", "''")}'`;

function validatePassages(passages, language, level, expectedCount) {
  const expected = levels[level];
  if (!Array.isArray(passages) || passages.length !== expectedCount) {
    throw new Error(`${language}/${level}: expected ${expectedCount} passages`);
  }

  passages.forEach((passage, index) => {
    const paragraphs = passage.paragraphs;
    if (!passage.title || !Array.isArray(paragraphs) || paragraphs.length !== expected.paragraphs) {
      throw new Error(`${language}/${level}/${index + 1}: invalid paragraph count`);
    }
    if (!Array.isArray(passage.questions) || passage.questions.length !== expected.questions) {
      throw new Error(`${language}/${level}/${index + 1}: invalid question count`);
    }
    passage.questions.forEach((question, questionIndex) => {
      if (
        !question.prompt
        || !Array.isArray(question.options)
        || question.options.length !== 4
        || !Number.isInteger(question.answer_index)
        || question.answer_index < 0
        || question.answer_index > 3
        || !question.explanation_pt_br
      ) {
        throw new Error(
          `${language}/${level}/${index + 1}/question/${questionIndex + 1}: invalid question`,
        );
      }
    });
  });
}

function parseFirstJsonObject(text) {
  const start = text.indexOf("{");
  if (start < 0) throw new Error("Response does not contain a JSON object");
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") inString = false;
      continue;
    }
    if (character === "\"") inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(start, index + 1));
    }
  }
  throw new Error("Response contains an incomplete JSON object");
}

async function generate(language, level, batchThemes) {
  const requirements = levels[level];
  const prompt = `
Create exactly ${batchThemes.length} original reading-comprehension activities for Brazilian adults learning
${languages[language]} at CEFR level ${level}.

Use the themes below in the same order, one theme per activity:
${batchThemes.map((theme, index) => `${index + 1}. ${theme}`).join("\n")}

Strict requirements for every activity:
- All titles, paragraphs, questions, and answer options must be written in ${languages[language]}.
- The complete passage must contain ${requirements.words} words.
- Split it into exactly ${requirements.paragraphs} substantive paragraphs.
- Create exactly ${requirements.questions} comprehension questions, each with exactly 4 plausible options.
- Questions must cover explicit information, vocabulary in context, sequencing/inference, and
  the main idea as appropriate for ${level}; do not make the answer obvious by its length.
- "answer_index" is zero-based and must identify the only correct option.
- "explanation_pt_br" must briefly explain the answer in Brazilian Portuguese.
- Difficulty, sentence structure, vocabulary, cohesion, and inference must be appropriate for
  ${level}. The catalog is progressive: A1 is concrete and direct; A2 introduces connected
  events; B1 uses detailed narratives and opinions; B2 uses nuance, implicit meaning, and
  competing viewpoints.
- Do not use markdown, translations, HTML, or labels such as "Paragraph 1".

Return only a JSON object with this shape:
{
  "passages": [
    {
      "title": "string",
      "paragraphs": ["string"],
      "questions": [
        {
          "prompt": "string",
          "options": ["string", "string", "string", "string"],
          "answer_index": 0,
          "explanation_pt_br": "string"
        }
      ]
    }
  ]
}`.trim();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      signal: AbortSignal.timeout(240_000),
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.75,
          maxOutputTokens: 65536,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`${language}/${level}: Gemini ${response.status}: ${await response.text()}`);
  }
  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`${language}/${level}: empty Gemini response`);
  const passages = parseFirstJsonObject(text).passages;
  validatePassages(passages, language, level, batchThemes.length);
  return passages;
}

async function generateOrLoad(language, level, offset, batchThemes) {
  const cacheFile = new URL(`${language}-${level.toLowerCase()}-${offset}.json`, cacheDirectory);
  try {
    const cached = JSON.parse(await readFile(cacheFile, "utf8"));
    validatePassages(cached, language, level, batchThemes.length);
    return cached;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      process.stdout.write("cache inválido; ");
    }
  }

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const passages = await generate(language, level, batchThemes);
      await writeFile(cacheFile, JSON.stringify(passages, null, 2), "utf8");
      return passages;
    } catch (error) {
      lastError = error;
      process.stdout.write(`tentativa ${attempt} falhou; `);
    }
  }
  throw lastError;
}

await mkdir(cacheDirectory, { recursive: true });
const rows = [];
for (const [language, languageName] of Object.entries(languages)) {
  for (const level of Object.keys(levels)) {
    process.stdout.write(`Generating ${languageName} ${level}... `);
    const passages = [];
    for (let offset = 0; offset < themes.length; offset += 5) {
      passages.push(
        ...await generateOrLoad(language, level, offset, themes.slice(offset, offset + 5)),
      );
      process.stdout.write(`${passages.length}/10 `);
    }
    passages.forEach((passage, index) => {
      const id = `${language}-passage-${level.toLowerCase()}-${String(index + 1).padStart(2, "0")}`;
      const questions = JSON.stringify(passage.questions);
      rows.push(
        `(${sqlString(id)}, ${sqlString(language)}, ${sqlString(level)}, `
        + `${sqlString(passage.title)}, ${sqlString(passage.paragraphs.join("\n\n"))}, `
        + `${sqlString(questions)}::jsonb, ${index + 1})`,
      );
    });
    process.stdout.write("done\n");
  }
}

const sql = `-- Generated and validated reading-comprehension catalog.
-- 10 passages per level and language: 160 passages in total.
insert into public.reading_passages (
  id, language, level, title, body, questions, sort_order
) values
${rows.join(",\n")}
on conflict (id) do update set
  language = excluded.language,
  level = excluded.level,
  title = excluded.title,
  body = excluded.body,
  questions = excluded.questions,
  sort_order = excluded.sort_order,
  is_published = true;
`;

await writeFile(outputPath, sql, "utf8");
process.stdout.write(`Wrote ${rows.length} passages to ${outputPath.pathname}\n`);
