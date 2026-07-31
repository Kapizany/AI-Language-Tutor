import type { SupabaseClient } from "@supabase/supabase-js";

export type LearningLanguage = "en" | "es" | "fr" | "it";
export type LearningLevel = "A1" | "A2" | "B1" | "B2";

export type QuickLessonActivity = {
  id: string;
  language: LearningLanguage;
  level: LearningLevel;
  title: string;
  text: string;
  question: string;
  options: string[];
  answer: number;
};

export type ReadingQuestion = {
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
};

export type ReadingPassage = {
  id: string;
  language: LearningLanguage;
  level: LearningLevel;
  title: string;
  paragraphs: string[];
  questions: ReadingQuestion[];
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
  quickLessons: QuickLessonActivity[];
  readings: ReadingPassage[];
  grammar: GrammarActivity[];
  flashcards: Flashcard[];
};

export async function loadLearningContent(
  supabase: SupabaseClient,
  language: LearningLanguage,
): Promise<LearningContent> {
  const [quickLessonsResult, readingsResult, grammarResult, flashcardsResult] = await Promise.all([
    supabase
      .from("quick_lessons")
      .select("id,language,level,title,body,question,options,answer_index")
      .eq("language", language)
      .eq("is_published", true)
      .order("sort_order"),
    supabase
      .from("reading_passages")
      .select("id,language,level,title,body,questions")
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
      .from("review_flashcards")
      .select("front,back")
      .eq("language", language)
      .eq("is_published", true)
      .order("sort_order"),
  ]);

  const error = quickLessonsResult.error
    || readingsResult.error
    || grammarResult.error
    || flashcardsResult.error;
  if (error) throw error;

  const content: LearningContent = {
    quickLessons: (quickLessonsResult.data || []).map((row) => ({
      id: row.id,
      language: row.language as LearningLanguage,
      level: row.level as LearningLevel,
      title: row.title,
      text: row.body,
      question: row.question,
      options: row.options as string[],
      answer: row.answer_index,
    })),
    readings: (readingsResult.data || []).map((row) => ({
      id: row.id,
      language: row.language as LearningLanguage,
      level: row.level as LearningLevel,
      title: row.title,
      paragraphs: row.body.split(/\n\s*\n/).filter(Boolean),
      questions: (row.questions as Array<{
        prompt: string;
        options: string[];
        answer_index: number;
        explanation_pt_br: string;
      }>).map((question) => ({
        prompt: question.prompt,
        options: question.options,
        answer: question.answer_index,
        explanation: question.explanation_pt_br,
      })),
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
      !content.quickLessons.some((item) => item.level === level)
      || !content.readings.some((item) => item.level === level)
      || !content.grammar.some((item) => item.level === level),
  ) || content.flashcards.length === 0;
  if (incomplete) throw new Error("Learning catalog is incomplete");

  return content;
}
