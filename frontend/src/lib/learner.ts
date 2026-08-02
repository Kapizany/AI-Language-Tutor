export type ScreenId =
  | "landing"
  | "demo"
  | "signup"
  | "login"
  | "recover"
  | "confirm-email"
  | "onboarding"
  | "dashboard"
  | "learn"
  | "plan"
  | "scenarios"
  | "conversation"
  | "summary"
  | "sessions"
  | "vocabulary"
  | "assessment"
  | "progress"
  | "profile"
  | "privacy"
  | "admin";

export type IconType = React.ComponentType<{ size?: number; strokeWidth?: number }>;

export type AuthFeedback = {
  error?: string;
  success?: string;
};

export type TargetLanguage = "en" | "es" | "fr" | "it";
export type LearnerLevelId = "A1" | "A2" | "B1" | "B2" | "C1" | "unknown";

export type OnboardingData = {
  targetLanguage: TargetLanguage;
  currentLevel: LearnerLevelId;
  learningGoal: "travel" | "career" | "conversation" | "exam";
  studyMinutesPerDay: 10 | 20 | 30 | 60;
  correctionPreference: "immediate" | "grouped" | "final";
  interests: string[];
  desiredScenarios: string[];
};

export type LearnerPreferences = OnboardingData & {
  studyDaysPerWeek: number;
};

export type LearnerPreferencesRow = {
  target_language: TargetLanguage;
  current_level: LearnerLevelId;
  learning_goal: OnboardingData["learningGoal"];
  study_minutes_per_day: OnboardingData["studyMinutesPerDay"];
  study_days_per_week: number;
  correction_preference: OnboardingData["correctionPreference"];
  interests: string[];
  desired_scenarios: string[];
};

export const mapLearnerPreferences = (row: LearnerPreferencesRow): LearnerPreferences => ({
  targetLanguage: row.target_language,
  currentLevel: row.current_level,
  learningGoal: row.learning_goal,
  studyMinutesPerDay: row.study_minutes_per_day,
  studyDaysPerWeek: row.study_days_per_week,
  correctionPreference: row.correction_preference,
  interests: row.interests || [],
  desiredScenarios: row.desired_scenarios || [],
});

export const languageDetails: Record<TargetLanguage, { flag: string; name: string }> = {
  en: { flag: "🇺🇸", name: "Inglês" },
  es: { flag: "🇪🇸", name: "Espanhol" },
  fr: { flag: "🇫🇷", name: "Francês" },
  it: { flag: "🇮🇹", name: "Italiano" },
};

export const levelLabels: Record<LearnerLevelId, string> = {
  unknown: "Nível ainda não definido",
  A1: "A1 · Iniciante",
  A2: "A2 · Básico",
  B1: "B1 · Intermediário",
  B2: "B2 · Independente",
  C1: "C1 · Avançado",
};

export const selectableLevels: LearnerLevelId[] = ["unknown", "A1", "A2", "B1", "B2"];

export const goalLabels: Record<OnboardingData["learningGoal"], string> = {
  travel: "Viagens",
  career: "Carreira",
  conversation: "Conversação",
  exam: "Preparação para provas",
};

export const correctionPreferenceLabels: Record<
  OnboardingData["correctionPreference"],
  string
> = {
  immediate: "Corrigir durante a conversa",
  grouped: "Agrupar correções importantes",
  final: "Revisar apenas ao final",
};

export const shortLevel = (level: LearnerLevelId) => levelLabels[level].split(" · ")[0];

/**
 * O backend só aceita A1–B2 e `unknown`. C1 é oferecido no perfil mas o tutor
 * trabalha no teto do MVP, então mapeamos antes de enviar.
 */
export function tutorLevel(level: LearnerLevelId | undefined): Exclude<LearnerLevelId, "C1"> {
  if (!level) return "unknown";
  return level === "C1" ? "B2" : level;
}
