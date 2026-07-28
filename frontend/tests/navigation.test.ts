import assert from "node:assert/strict";
import test from "node:test";

import { onboardingStorageKeys, resolveDestination, scenarioStorageKey } from "../src/lib/navigation.ts";

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
