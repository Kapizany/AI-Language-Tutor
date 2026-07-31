const privateScreens = new Set([
  "dashboard",
  "learn",
  "plan",
  "scenarios",
  "conversation",
  "summary",
  "vocabulary",
  "assessment",
  "progress",
  "profile",
  "privacy",
]);

export function resolveDestination(
  requested: string,
  authenticated: boolean,
  onboardingCompleted: boolean,
) {
  const requiresAuthentication = privateScreens.has(requested) || requested === "onboarding";

  if (requiresAuthentication && !authenticated) return "login";
  if (privateScreens.has(requested) && !onboardingCompleted) return "onboarding";
  if (requested === "onboarding" && onboardingCompleted) return "dashboard";
  return requested;
}

export function onboardingStorageKeys(userId: string) {
  return {
    draft: `lume:onboarding-draft:${userId}`,
    step: `lume:onboarding-step:${userId}`,
  };
}

export function scenarioStorageKey(userId: string) {
  return `lume:selected-scenario:${userId}`;
}

export function isEmailConfirmed(
  user: { email_confirmed_at?: string | null } | null | undefined,
) {
  return Boolean(user?.email_confirmed_at);
}

export function passwordRecoveryRedirectUrl(origin: string) {
  return `${origin.replace(/\/+$/, "")}/?auth=recovery`;
}

export function isPasswordRecoveryCallback(hash: string, search: string) {
  return hash.includes("type=recovery")
    || new URLSearchParams(search).get("auth") === "recovery";
}

export function validateNewPassword(password: string) {
  if (password.length < 12) return "Use pelo menos 12 caracteres.";
  if (password.length > 128) return "A senha deve ter no máximo 128 caracteres.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)
    || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return "Inclua letra maiúscula, minúscula, número e símbolo.";
  }
  return null;
}
