"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { LearnerLanguage } from "@/lib/learner-languages";
import type { LearnerPreferences, TargetLanguage } from "@/lib/learner";

type LearnerContextValue = {
  preferences: LearnerPreferences | null;
  studiedLanguages: LearnerLanguage[];
  isAdmin: boolean;
  switchLanguage: (language: TargetLanguage) => Promise<{ error?: string }>;
  addLanguage: (language: TargetLanguage, level?: LearnerLanguage["currentLevel"]) => Promise<{ error?: string }>;
};

const LearnerContext = createContext<LearnerContextValue | null>(null);

export function LearnerProvider({
  children,
  preferences,
  studiedLanguages,
  isAdmin,
  switchLanguage,
  addLanguage,
}: LearnerContextValue & { children: ReactNode }) {
  return (
    <LearnerContext.Provider
      value={{ preferences, studiedLanguages, isAdmin, switchLanguage, addLanguage }}
    >
      {children}
    </LearnerContext.Provider>
  );
}

export function useLearner() {
  const value = useContext(LearnerContext);
  if (!value) {
    throw new Error("useLearner must be used within LearnerProvider");
  }
  return value;
}

export function useLearnerOptional() {
  return useContext(LearnerContext);
}
