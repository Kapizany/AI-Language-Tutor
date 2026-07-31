import type { SupabaseClient } from "@supabase/supabase-js";

export type LearningLanguage = "en" | "es" | "fr" | "it";
export type LearningLevel = "A1" | "A2" | "B1" | "B2";

export type ReadingActivity = {
  id: string;
  language: LearningLanguage;
  level: LearningLevel;
  title: string;
  text: string;
  question: string;
  options: string[];
  answer: number;
};

export type GrammarActivity = {
  id: string;
  language: LearningLanguage;
  level: LearningLevel;
  title: string;
  explanation: string;
  example: string;
  question: string;
  options: string[];
  answer: number;
};

export type Flashcard = {
  front: string;
  back: string;
};

export type LearningContent = {
  readings: ReadingActivity[];
  grammar: GrammarActivity[];
  flashcards: Flashcard[];
};

export async function loadLearningContent(
  supabase: SupabaseClient,
  language: LearningLanguage,
): Promise<LearningContent> {
  const [readingsResult, grammarResult, flashcardsResult] = await Promise.all([
    supabase
      .from("learning_readings")
      .select("id,language,level,title,body,question,options,answer_index")
      .eq("language", language)
      .eq("is_published", true)
      .order("sort_order"),
    supabase
      .from("grammar_lessons")
      .select("id,language,level,title,explanation,example,question,options,answer_index")
      .eq("language", language)
      .eq("is_published", true)
      .order("sort_order"),
    supabase
      .from("quick_lesson_flashcards")
      .select("front,back")
      .eq("language", language)
      .eq("is_published", true)
      .order("sort_order"),
  ]);

  const error = readingsResult.error || grammarResult.error || flashcardsResult.error;
  if (error) throw error;

  const content: LearningContent = {
    readings: (readingsResult.data || []).map((row) => ({
      id: row.id,
      language: row.language as LearningLanguage,
      level: row.level as LearningLevel,
      title: row.title,
      text: row.body,
      question: row.question,
      options: row.options as string[],
      answer: row.answer_index,
    })),
    grammar: (grammarResult.data || []).map((row) => ({
      id: row.id,
      language: row.language as LearningLanguage,
      level: row.level as LearningLevel,
      title: row.title,
      explanation: row.explanation,
      example: row.example,
      question: row.question,
      options: row.options as string[],
      answer: row.answer_index,
    })),
    flashcards: flashcardsResult.data || [],
  };

  const levels: LearningLevel[] = ["A1", "A2", "B1", "B2"];
  const incomplete = levels.some(
    (level) =>
      !content.readings.some((item) => item.level === level)
      || !content.grammar.some((item) => item.level === level),
  ) || content.flashcards.length === 0;
  if (incomplete) throw new Error("Learning catalog is incomplete");

  return content;
}
