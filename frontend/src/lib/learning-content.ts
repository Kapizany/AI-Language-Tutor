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

export type GrammarExample = {
  target: string;
  translation: string;
};

export type GrammarUseCase = {
  title: string;
  explanation: string;
  examples: GrammarExample[];
};

export type GrammarMistake = {
  incorrect: string;
  correct: string;
  explanation: string;
};

export type GrammarTopic = {
  id: string;
  language: LearningLanguage;
  level: LearningLevel;
  title: string;
  overview: string;
  formation: string;
  useCases: GrammarUseCase[];
  commonMistakes: GrammarMistake[];
  notes: string[];
};

export type GrammarExercise = {
  id: string;
  topicId: string;
  language: LearningLanguage;
  level: LearningLevel;
  title: string;
  question: string;
  options: string[];
  answer: number;
};

export type Flashcard = {
  id: string;
  level: LearningLevel;
  front: string;
  back: string;
};

export type LearningContent = {
  quickLessons: QuickLessonActivity[];
  readings: ReadingPassage[];
  grammarTopics: GrammarTopic[];
  grammarExercises: GrammarExercise[];
  flashcards: Flashcard[];
};

export async function loadLearningContent(
  supabase: SupabaseClient,
  language: LearningLanguage,
): Promise<LearningContent> {
  const [
    quickLessonsResult,
    readingsResult,
    grammarTopicsResult,
    grammarExercisesResult,
    flashcardsResult,
  ] = await Promise.all([
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
      .from("grammar_topics")
      .select("id,language,level,title,overview_pt_br,formation_pt_br,use_cases,common_mistakes,notes_pt_br")
      .eq("language", language)
      .eq("is_published", true)
      .order("sort_order"),
    supabase
      .from("grammar_exercises")
      .select("id,topic_id,language,level,title,question,options,answer_index")
      .eq("language", language)
      .eq("is_published", true)
      .order("sort_order"),
    supabase
      .from("review_flashcards")
      .select("id,level,front,back")
      .eq("language", language)
      .eq("is_published", true)
      .order("sort_order"),
  ]);

  const error = quickLessonsResult.error
    || readingsResult.error
    || grammarTopicsResult.error
    || grammarExercisesResult.error
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
    grammarTopics: (grammarTopicsResult.data || []).map((row) => ({
      id: row.id,
      language: row.language as LearningLanguage,
      level: row.level as LearningLevel,
      title: row.title,
      overview: row.overview_pt_br,
      formation: row.formation_pt_br,
      useCases: (row.use_cases as Array<{
        title_pt_br: string;
        explanation_pt_br: string;
        examples: Array<{ target: string; translation_pt_br: string }>;
      }>).map((useCase) => ({
        title: useCase.title_pt_br,
        explanation: useCase.explanation_pt_br,
        examples: useCase.examples.map((example) => ({
          target: example.target,
          translation: example.translation_pt_br,
        })),
      })),
      commonMistakes: (row.common_mistakes as Array<{
        incorrect: string;
        correct: string;
        explanation_pt_br: string;
      }>).map((mistake) => ({
        incorrect: mistake.incorrect,
        correct: mistake.correct,
        explanation: mistake.explanation_pt_br,
      })),
      notes: row.notes_pt_br as string[],
    })),
    grammarExercises: (grammarExercisesResult.data || []).map((row) => ({
      id: row.id,
      topicId: row.topic_id,
      language: row.language as LearningLanguage,
      level: row.level as LearningLevel,
      title: row.title,
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
      || !content.grammarTopics.some((item) => item.level === level)
      || !content.grammarExercises.some((item) => item.level === level),
  ) || content.flashcards.length === 0;
  if (incomplete) throw new Error("Learning catalog is incomplete");

  return content;
}

export async function loadReviewFlashcards(
  supabase: SupabaseClient,
  language: LearningLanguage,
): Promise<Flashcard[]> {
  const { data, error } = await supabase
    .from("review_flashcards")
    .select("id,level,front,back")
    .eq("language", language)
    .eq("is_published", true)
    .order("sort_order");
  if (error) throw error;
  if (!data?.length) throw new Error("Review catalog is empty");
  return data as Flashcard[];
}
