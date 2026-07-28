const privateScreens = new Set([
  "dashboard",
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
