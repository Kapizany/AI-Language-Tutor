import type { LearnerLevelId, LearnerPreferences, TargetLanguage } from "@/lib/learner";

export type LearnerLanguage = {
  targetLanguage: TargetLanguage;
  currentLevel: LearnerLevelId;
};

export type LearnerLanguageRow = {
  target_language: TargetLanguage;
  current_level: LearnerLevelId;
};

export function mapLearnerLanguages(rows: LearnerLanguageRow[]): LearnerLanguage[] {
  return rows.map((row) => ({
    targetLanguage: row.target_language,
    currentLevel: row.current_level,
  }));
}

export function fallbackStudiedLanguages(
  preferences: LearnerPreferences | null,
): LearnerLanguage[] {
  if (!preferences) return [];
  return [
    {
      targetLanguage: preferences.targetLanguage,
      currentLevel: preferences.currentLevel,
    },
  ];
}
