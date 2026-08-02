import { expect, test, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const userId = "10000000-0000-0000-0000-000000000001";
const sessionId = "40000000-0000-0000-0000-000000000001";

const confirmedUser = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email: "learner@example.test",
  email_confirmed_at: "2026-08-01T10:00:00Z",
  user_metadata: { display_name: "Marina" },
};

const tokenResponse = {
  access_token: "test-access-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: 2_000_000_000,
  refresh_token: "test-refresh-token",
  user: confirmedUser,
};

const preferences = {
  target_language: "en",
  current_level: "A2",
  learning_goal: "conversation",
  study_minutes_per_day: 20,
  study_days_per_week: 5,
  correction_preference: "grouped",
  interests: ["culture"],
  desired_scenarios: ["daily"],
};

const scenarioRow = {
  id: "coffee",
  category: "daily",
  title_pt_br: "Na cafeteria",
  description_pt_br: "Faça um pedido e converse com o atendente.",
  objective_pt_br: "Pedir uma bebida e perguntar o preço.",
  min_level: "A1",
  max_level: "B2",
  planned_minutes: 10,
  icon: "coffee",
  accent: "coral",
  goals_pt_br: ["Cumprimentar", "Fazer o pedido"],
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockSupabase(
  page: Page,
  {
    onboardingCompleted,
    captureSettings,
  }: {
    onboardingCompleted: boolean;
    captureSettings?: (payload: Record<string, unknown>) => void;
  },
) {
  await page.route("**/mock-supabase/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path.endsWith("/auth/v1/token") && request.method() === "POST") {
      return json(route, tokenResponse);
    }
    if (path.endsWith("/auth/v1/logout")) return json(route, {});
    if (path.endsWith("/auth/v1/user")) return json(route, confirmedUser);
    if (path.endsWith("/rest/v1/profiles")) {
      return json(route, [{
        display_name: "Marina",
        onboarding_completed: onboardingCompleted,
        voice_processing_policy_version: null,
      }]);
    }
    if (path.endsWith("/rest/v1/learner_preferences")) {
      return json(route, onboardingCompleted ? [preferences] : []);
    }
    if (path.endsWith("/rest/v1/learner_languages")) {
      return json(route, onboardingCompleted ? [{
        target_language: preferences.target_language,
        current_level: preferences.current_level,
      }] : []);
    }
    if (path.endsWith("/rest/v1/user_roles")) {
      return json(route, []);
    }
    if (
      path.endsWith("/rest/v1/rpc/save_learner_settings")
      || path.endsWith("/rest/v1/rpc/switch_active_language")
      || path.endsWith("/rest/v1/rpc/add_learner_language")
      || path.endsWith("/rest/v1/rpc/update_learner_language_level")
    ) {
      captureSettings?.(request.postDataJSON() as Record<string, unknown>);
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith("/rest/v1/conversation_scenarios")) {
      return json(route, [scenarioRow]);
    }
    if (
      path.endsWith("/rest/v1/learning_activity_events")
      || path.endsWith("/rest/v1/learning_activity_progress")
      || path.endsWith("/rest/v1/learning_section_progress")
      || path.endsWith("/rest/v1/personal_review_items")
      || path.endsWith("/rest/v1/conversation_sessions")
    ) {
      return json(route, []);
    }
    return json(route, []);
  });
}

async function login(page: Page) {
  await page.goto("/#/login");
  await page.getByLabel("Email").fill("learner@example.test");
  await page.locator('input[autocomplete="current-password"]').fill("StrongPassword!123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

test("cadastro sem confirmação permanece fora das telas privadas", async ({ page }) => {
  await page.route("**/mock-supabase/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/v1/signup")) {
      return json(route, {
        user: { ...confirmedUser, email_confirmed_at: null },
        session: null,
      });
    }
    return json(route, {});
  });

  await page.goto("/#/signup");
  await page.getByLabel("Nome").fill("Marina");
  await page.getByLabel("Email").fill("learner@example.test");
  await page.locator('input[autocomplete="new-password"]').fill("StrongPassword!123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Confirme seu email" })).toBeVisible();
  await page.goto("/#/dashboard");
  await expect(page.getByRole("heading", { name: "Que bom ter você de volta" })).toBeVisible();
});

test("onboarding completo persiste correções, interesses e cenários", async ({ page }) => {
  let settingsPayload: Record<string, unknown> | undefined;
  await mockSupabase(page, {
    onboardingCompleted: false,
    captureSettings: (payload) => {
      settingsPayload = payload;
    },
  });

  await login(page);
  await expect(page.getByText("Passo 1 de 6")).toBeVisible();
  await page.getByRole("button", { name: /Inglês/ }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: /A2 · Básico/ }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: /Conversação/ }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: /20 minutos por dia/ }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: /Em pequenos grupos/ }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Cultura" }).click();
  await page.getByRole("button", { name: "Cotidiano" }).click();
  await page.getByRole("button", { name: "Criar meu plano" }).click();

  await expect(page.getByRole("heading", { name: /Olá, Marina/ })).toBeVisible();
  expect(settingsPayload).toMatchObject({
    p_complete_onboarding: true,
    p_correction_preference: "grouped",
    p_interests: ["culture"],
    p_desired_scenarios: ["daily"],
  });
});

test("conversa persiste, encerra e exibe resumo real", async ({ page }) => {
  await mockSupabase(page, { onboardingCompleted: true });
  let messageStored = false;

  await page.route("**/mock-api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/api/v1/conversations") && request.method() === "POST") {
      return json(route, {
        session_id: sessionId,
        scenario_id: "coffee",
        target_language: "en",
        learner_level: "A2",
        planned_minutes: 10,
        started_at: new Date().toISOString(),
        resumed: false,
        learner_message_count: 0,
        max_learner_messages: 30,
        messages: [{ sequence: 1, role: "tutor", content: "Good morning! What would you like?" }],
      }, 201);
    }
    if (path.endsWith(`/api/v1/conversations/${sessionId}/messages`)) {
      messageStored = true;
      return json(route, {
        request_id: request.postDataJSON().request_id,
        learner_sequence: 2,
        tutor_sequence: 3,
        result: {
          reply: "Certainly. Would you like milk?",
          correction: null,
          should_retry: false,
        },
        usage: {
          provider: "mock",
          model: "mock",
          input_tokens: 10,
          output_tokens: 8,
          estimated_cost_usd: 0,
          latency_ms: 5,
        },
        learner_message_count: 1,
        max_learner_messages: 30,
      });
    }
    if (path.endsWith(`/api/v1/conversations/${sessionId}/complete`)) {
      return json(route, {
        session_id: sessionId,
        summary: {
          headline_pt_br: "Você concluiu o pedido",
          encouragement_pt_br: "Boa conversa!",
          strengths_pt_br: ["Respondeu no contexto"],
          focus_areas: [],
          vocabulary: [{ term: "milk", translation_pt_br: "leite" }],
          objective_progress: 90,
        },
        usage: null,
      });
    }
    return json(route, {});
  });

  await login(page);
  await page.getByRole("button", { name: "Começar conversa" }).click();
  await expect(page.getByText("Good morning! What would you like?")).toBeVisible();
  await page.getByPlaceholder(/Digite sua resposta/).fill("A coffee, please.");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.getByText("Certainly. Would you like milk?")).toBeVisible();
  expect(messageStored).toBe(true);
  await page.getByRole("button", { name: "Encerrar", exact: true }).click();

  await expect(page.getByText("Você concluiu o pedido")).toBeVisible();
  await expect(page.getByText("90%")).toBeVisible();
});

test("conversa retomada preserva histórico e avisa ao atingir o tempo", async ({ page }) => {
  await mockSupabase(page, { onboardingCompleted: true });
  await page.route("**/mock-api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/api/v1/conversations")) {
      return json(route, {
        session_id: sessionId,
        scenario_id: "coffee",
        target_language: "en",
        learner_level: "A2",
        planned_minutes: 10,
        started_at: new Date(Date.now() - 11 * 60_000).toISOString(),
        resumed: true,
        learner_message_count: 1,
        max_learner_messages: 30,
        messages: [
          { sequence: 1, role: "tutor", content: "Welcome back." },
          { sequence: 2, role: "learner", content: "A coffee, please." },
          { sequence: 3, role: "tutor", content: "What size would you like?" },
        ],
      }, 201);
    }
    return json(route, {});
  });

  await login(page);
  await page.getByRole("button", { name: "Começar conversa" }).click();
  await expect(page.getByText("Conversa retomada")).toBeVisible();
  await expect(page.getByText("A coffee, please.")).toBeVisible();
  await expect(page.getByText("Você completou os 10 minutos planejados.")).toBeVisible();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByText("Você completou os 10 minutos planejados.")).toBeHidden();
});

test("login e dashboard não têm violações graves de acessibilidade", async ({ page }) => {
  await page.goto("/#/login");
  const loginResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    loginResults.violations.filter(({ impact }) => impact === "critical" || impact === "serious"),
  ).toEqual([]);

  await mockSupabase(page, { onboardingCompleted: true });
  await login(page);
  await expect(page.getByRole("heading", { name: /Olá, Marina/ })).toBeVisible();
  const dashboardResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    dashboardResults.violations.filter(
      ({ impact }) => impact === "critical" || impact === "serious",
    ),
  ).toEqual([]);
});
