import { mkdir, readFile, writeFile } from "node:fs/promises";

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const outputPath = new URL(
  "../supabase/migrations/20260731125000_seed_grammar_topics.sql",
  import.meta.url,
);
const cacheDirectory = new URL("../.local/generated-grammar-topics/", import.meta.url);

if (!apiKey) throw new Error("GEMINI_API_KEY is required");

const catalogs = {
  en: [
    ["A1", 1, "Verb to be"],
    ["A1", 2, "Articles and plurals"],
    ["A2", 3, "Simple present"],
    ["A2", 4, "Past simple"],
    ["A2", 5, "Future plans"],
    ["B1", 6, "Present perfect"],
    ["B1", 7, "Relative clauses"],
    ["B1", 8, "Modals and advice"],
    ["B2", 9, "Conditionals"],
    ["B2", 10, "Reported speech and nuance"],
  ],
  es: [
    ["A1", 1, "Ser y estar"],
    ["A1", 2, "Género y número"],
    ["A2", 3, "Presente regular"],
    ["A2", 4, "Pretérito indefinido"],
    ["A2", 5, "Futuro y planes"],
    ["B1", 6, "Pretérito perfecto"],
    ["B1", 7, "Pronombres de objeto"],
    ["B1", 8, "Subjuntivo presente"],
    ["B2", 9, "Condicionales"],
    ["B2", 10, "Discurso referido y matiz"],
  ],
  fr: [
    ["A1", 1, "Être et avoir"],
    ["A1", 2, "Articles et accord"],
    ["A2", 3, "Le présent"],
    ["A2", 4, "Le passé composé"],
    ["A2", 5, "Futur et projets"],
    ["B1", 6, "Imparfait ou passé composé"],
    ["B1", 7, "Pronoms compléments"],
    ["B1", 8, "Le subjonctif"],
    ["B2", 9, "Les hypothèses"],
    ["B2", 10, "Discours rapporté et nuance"],
  ],
  it: [
    ["A1", 1, "Essere e avere"],
    ["A1", 2, "Articoli e accordo"],
    ["A2", 3, "Il presente"],
    ["A2", 4, "Il passato prossimo"],
    ["A2", 5, "Futuro e progetti"],
    ["B1", 6, "Imperfetto o passato prossimo"],
    ["B1", 7, "Pronomi combinati"],
    ["B1", 8, "Il congiuntivo"],
    ["B2", 9, "Periodo ipotetico"],
    ["B2", 10, "Discorso indiretto e sfumature"],
  ],
};

const languageNames = {
  en: "inglês",
  es: "espanhol",
  fr: "francês",
  it: "italiano",
};

const sqlString = (value) => `'${value.replaceAll("'", "''")}'`;

function parseFirstJsonObject(text) {
  const start = text.indexOf("{");
  if (start < 0) throw new Error("Response does not contain JSON");
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
  throw new Error("Incomplete JSON response");
}

function validate(topics, language) {
  const expected = catalogs[language];
  if (!Array.isArray(topics) || topics.length !== expected.length) {
    throw new Error(`${language}: expected ${expected.length} topics`);
  }
  topics.forEach((topic, index) => {
    const [level, number] = expected[index];
    const expectedId = `${language}-grammar-${level}-${number}`;
    if (
      topic.id !== expectedId
      || typeof topic.title !== "string"
      || typeof topic.overview_pt_br !== "string"
      || topic.overview_pt_br.length < 80
      || typeof topic.formation_pt_br !== "string"
      || topic.formation_pt_br.length < 40
      || !Array.isArray(topic.use_cases)
      || topic.use_cases.length < 2
      || !Array.isArray(topic.common_mistakes)
      || topic.common_mistakes.length < 2
      || !Array.isArray(topic.notes_pt_br)
      || topic.notes_pt_br.length < 1
    ) {
      throw new Error(`${expectedId}: invalid topic structure ${JSON.stringify({
        id: topic.id,
        title: topic.title,
        overviewLength: topic.overview_pt_br?.length,
        formationLength: topic.formation_pt_br?.length,
        useCases: topic.use_cases?.length,
        mistakes: topic.common_mistakes?.length,
        notes: topic.notes_pt_br?.length,
      })}`);
    }
    topic.use_cases.forEach((useCase) => {
      if (
        !useCase.title_pt_br
        || !useCase.explanation_pt_br
        || !Array.isArray(useCase.examples)
        || useCase.examples.length < 1
        || useCase.examples.some((example) => !example.target || !example.translation_pt_br)
      ) {
        throw new Error(`${expectedId}: invalid use case ${JSON.stringify(useCase)}`);
      }
    });
    topic.common_mistakes.forEach((mistake) => {
      if (!mistake.incorrect || !mistake.correct || !mistake.explanation_pt_br) {
        throw new Error(`${expectedId}: invalid common mistake`);
      }
    });
  });
}

async function regenerateIncompleteTopic(language, topic, level, title) {
  const prompt = `
Reescreva e amplie este guia de gramática para brasileiros aprendendo ${languageNames[language]}:
${JSON.stringify(topic)}

O resultado deve manter id "${topic.id}" e tratar o tema "${title}" no nível ${level}.
Exija 3 a 5 casos de uso realmente distintos, com pelo menos 2 exemplos naturais e traduzidos
em cada caso; pelo menos 3 erros comuns; e pelo menos 2 observações práticas. Preserve ou
melhore overview_pt_br e formation_pt_br. Retorne somente:
{"topic":{"id":"","title":"","overview_pt_br":"","formation_pt_br":"","use_cases":[{"title_pt_br":"","explanation_pt_br":"","examples":[{"target":"","translation_pt_br":""}]}],"common_mistakes":[{"incorrect":"","correct":"","explanation_pt_br":""}],"notes_pt_br":[""]}}
`.trim();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      signal: AbortSignal.timeout(120_000),
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.3,
          maxOutputTokens: 16384,
        },
      }),
    },
  );
  if (!response.ok) throw new Error(`${topic.id}: regeneration failed with ${response.status}`);
  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
  return parseFirstJsonObject(text).topic;
}

async function generate(language) {
  const topics = catalogs[language];
  const prompt = `
Crie um guia gramatical aprofundado para adultos brasileiros aprendendo ${languageNames[language]}.
Produza exatamente os 10 temas abaixo, na mesma ordem:
${topics.map(([level, number, title]) => `- ${language}-grammar-${level}-${number}: ${title} (${level})`).join("\n")}

Para cada tema:
- mantenha exatamente o id e o título fornecidos;
- escreva overview_pt_br em português brasileiro, com 2 a 4 parágrafos claros, explicando
  significado, contexto e contraste com formas parecidas;
- escreva formation_pt_br detalhando a formação afirmativa, negativa e interrogativa quando
  aplicável, incluindo irregularidades importantes;
- crie de 3 a 5 casos de uso distintos; cada caso precisa de título e explicação em português
  e de 2 a 4 exemplos naturais em ${languageNames[language]} com tradução em português;
- inclua pelo menos 3 erros comuns de brasileiros, mostrando forma incorreta, correta e motivo;
- inclua de 2 a 5 observações práticas em notes_pt_br;
- adapte profundidade, vocabulário e exceções ao nível CEFR indicado;
- não use Markdown nem HTML nos valores.

Retorne somente JSON:
{
  "topics": [{
    "id": "id exato",
    "title": "título exato",
    "overview_pt_br": "texto",
    "formation_pt_br": "texto",
    "use_cases": [{
      "title_pt_br": "texto",
      "explanation_pt_br": "texto",
      "examples": [{
        "target": "exemplo no idioma estudado",
        "translation_pt_br": "tradução"
      }]
    }],
    "common_mistakes": [{
      "incorrect": "forma incorreta",
      "correct": "forma correta",
      "explanation_pt_br": "explicação"
    }],
    "notes_pt_br": ["observação"]
  }]
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
          temperature: 0.35,
          maxOutputTokens: 65536,
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`${language}: Gemini ${response.status}: ${await response.text()}`);
  }
  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
  const generated = parseFirstJsonObject(text).topics;
  for (let index = 0; index < generated.length; index += 1) {
    const topic = generated[index];
    if (
      topic.use_cases?.length < 2
      || topic.common_mistakes?.length < 2
      || topic.notes_pt_br?.length < 1
    ) {
      const [level, , title] = catalogs[language][index];
      generated[index] = await regenerateIncompleteTopic(language, topic, level, title);
    }
  }
  validate(generated, language);
  return generated;
}

async function generateOrLoad(language) {
  const cacheFile = new URL(`${language}.json`, cacheDirectory);
  try {
    const cached = JSON.parse(await readFile(cacheFile, "utf8"));
    validate(cached, language);
    return cached;
  } catch (error) {
    if (error?.code !== "ENOENT") process.stdout.write("cache inválido; ");
  }
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const topics = await generate(language);
      await writeFile(cacheFile, JSON.stringify(topics, null, 2), "utf8");
      return topics;
    } catch (error) {
      lastError = error;
      process.stdout.write(`tentativa ${attempt} falhou; `);
    }
  }
  throw lastError;
}

await mkdir(cacheDirectory, { recursive: true });
const rows = [];
for (const language of Object.keys(catalogs)) {
  process.stdout.write(`Gerando ${languageNames[language]}... `);
  const topics = await generateOrLoad(language);
  topics.forEach((topic, index) => {
    const [level, , catalogTitle] = catalogs[language][index];
    rows.push(
      `(${sqlString(topic.id)}, ${sqlString(language)}, ${sqlString(level)}, `
      + `${sqlString(catalogTitle)}, ${sqlString(topic.overview_pt_br)}, `
      + `${sqlString(topic.formation_pt_br)}, `
      + `${sqlString(JSON.stringify(topic.use_cases))}::jsonb, `
      + `${sqlString(JSON.stringify(topic.common_mistakes))}::jsonb, `
      + `${sqlString(JSON.stringify(topic.notes_pt_br))}::jsonb, ${index + 1})`,
    );
  });
  process.stdout.write("pronto\n");
}

const sql = `-- Detailed grammar theory for the 40 existing exercise topics.
insert into public.grammar_topics (
  id, language, level, title, overview_pt_br, formation_pt_br, use_cases,
  common_mistakes, notes_pt_br, sort_order
) values
${rows.join(",\n")}
on conflict (id) do update set
  language = excluded.language,
  level = excluded.level,
  title = excluded.title,
  overview_pt_br = excluded.overview_pt_br,
  formation_pt_br = excluded.formation_pt_br,
  use_cases = excluded.use_cases,
  common_mistakes = excluded.common_mistakes,
  notes_pt_br = excluded.notes_pt_br,
  sort_order = excluded.sort_order,
  is_published = true;

update public.grammar_exercises as exercise
set topic_id = topic.id
from public.grammar_topics as topic
where exercise.id like topic.id || '-%';

alter table public.grammar_exercises
  alter column topic_id set not null,
  add constraint grammar_exercises_topic_id_fkey
    foreign key (topic_id) references public.grammar_topics (id) on delete cascade;
`;

await writeFile(outputPath, sql, "utf8");
process.stdout.write(`Migration criada com ${rows.length} temas: ${outputPath.pathname}\n`);
