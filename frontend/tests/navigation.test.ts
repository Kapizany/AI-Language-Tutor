import assert from "node:assert/strict";
import test from "node:test";

import { getLearningContent } from "../src/lib/learning-content.ts";
import { calculateDashboardMetrics } from "../src/lib/progress.ts";
import {
  isEmailConfirmed,
  isPasswordRecoveryCallback,
  onboardingStorageKeys,
  passwordRecoveryRedirectUrl,
  resolveDestination,
  scenarioStorageKey,
} from "../src/lib/navigation.ts";

test("visitante é enviado ao login ao abrir tela privada", () => {
  assert.equal(resolveDestination("dashboard", false, false), "login");
});

test("usuário autenticado sem onboarding é enviado ao onboarding", () => {
  assert.equal(resolveDestination("plan", true, false), "onboarding");
});

test("usuário com onboarding concluído acessa tela privada", () => {
  assert.equal(resolveDestination("scenarios", true, true), "scenarios");
});

test("usuário com onboarding concluído não refaz o onboarding", () => {
  assert.equal(resolveDestination("onboarding", true, true), "dashboard");
});

test("telas públicas continuam acessíveis", () => {
  assert.equal(resolveDestination("landing", false, false), "landing");
  assert.equal(resolveDestination("demo", false, false), "demo");
});

test("rascunhos de onboarding são isolados por usuário", () => {
  const firstUser = onboardingStorageKeys("user-a");
  const secondUser = onboardingStorageKeys("user-b");

  assert.notEqual(firstUser.draft, secondUser.draft);
  assert.notEqual(firstUser.step, secondUser.step);
  assert.equal(firstUser.draft, "lume:onboarding-draft:user-a");
});

test("cenário selecionado é isolado por usuário", () => {
  assert.notEqual(scenarioStorageKey("user-a"), scenarioStorageKey("user-b"));
});

test("sessão sem confirmação de email não autentica o usuário", () => {
  assert.equal(isEmailConfirmed(null), false);
  assert.equal(isEmailConfirmed({ email_confirmed_at: null }), false);
});

test("email confirmado é identificado pelo timestamp do Supabase", () => {
  assert.equal(isEmailConfirmed({ email_confirmed_at: "2026-07-30T12:00:00Z" }), true);
});

test("redirect de recuperação usa query string sem competir com tokens no hash", () => {
  assert.equal(
    passwordRecoveryRedirectUrl("https://tutor.caps-labs.com/"),
    "https://tutor.caps-labs.com/?auth=recovery",
  );
});

test("callback de recuperação aceita marcador próprio e evento implícito do Supabase", () => {
  assert.equal(isPasswordRecoveryCallback("", "?auth=recovery"), true);
  assert.equal(isPasswordRecoveryCallback("#access_token=token&type=recovery", ""), true);
  assert.equal(isPasswordRecoveryCallback("#/login", ""), false);
});

test("catálogo oferece leitura e gramática nos quatro níveis para todos os idiomas", () => {
  for (const language of ["en", "es", "fr", "it"] as const) {
    const content = getLearningContent(language);
    assert.deepEqual(content.readings.map(({ level }) => level), ["A1", "A2", "B1", "B2"]);
    assert.deepEqual(content.grammar.map(({ level }) => level), ["A1", "A2", "B1", "B2"]);
    assert.ok(content.flashcards.length >= 5);
  }
});

test("dashboard calcula sequência, semana e progresso diário com atividades reais", () => {
  const metrics = calculateDashboardMetrics([
    "2026-07-27T12:00:00-03:00",
    "2026-07-28T12:00:00-03:00",
    "2026-07-29T12:00:00-03:00",
    "2026-07-30T09:00:00-03:00",
    "2026-07-30T10:00:00-03:00",
  ], 5, new Date("2026-07-30T15:00:00-03:00"));

  assert.equal(metrics.streak, 4);
  assert.equal(metrics.activeDaysThisWeek, 4);
  assert.equal(metrics.completedToday, 2);
  assert.equal(metrics.activitiesThisMonth, 5);
  assert.equal(metrics.weeklyPercent, 80);
});

test("sequência permanece válida quando o usuário ainda não estudou hoje", () => {
  const metrics = calculateDashboardMetrics([
    "2026-07-28T12:00:00-03:00",
    "2026-07-29T12:00:00-03:00",
  ], 3, new Date("2026-07-30T08:00:00-03:00"));

  assert.equal(metrics.streak, 2);
  assert.equal(metrics.completedToday, 0);
});
