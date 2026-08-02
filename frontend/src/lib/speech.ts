import { apiBaseUrl } from "@/lib/api-client";
import { ConversationApiError } from "@/lib/conversation";
import type { TargetLanguage } from "@/lib/learner";

export type SpeechSynthesisOptions = {
  text: string;
  language: TargetLanguage;
  speakingRate?: number;
  requestId?: string;
  signal?: AbortSignal;
};

const CLIENT_CACHE_LIMIT = 40;

type CachedBlob = {
  blob: Blob;
  objectUrl: string;
};

const clientCache = new Map<string, CachedBlob>();

function normalizeRate(rate: number) {
  return rate <= 0.9 ? 0.85 : 1;
}

function cacheKey(text: string, language: TargetLanguage, speakingRate: number) {
  return `${language}|${normalizeRate(speakingRate)}|${text.trim().replace(/\s+/g, " ")}`;
}

function remember(key: string, blob: Blob) {
  if (clientCache.has(key)) {
    const previous = clientCache.get(key);
    if (previous) URL.revokeObjectURL(previous.objectUrl);
    clientCache.delete(key);
  }
  while (clientCache.size >= CLIENT_CACHE_LIMIT) {
    const oldest = clientCache.keys().next().value;
    if (!oldest) break;
    const entry = clientCache.get(oldest);
    if (entry) URL.revokeObjectURL(entry.objectUrl);
    clientCache.delete(oldest);
  }
  const objectUrl = URL.createObjectURL(blob);
  clientCache.set(key, { blob, objectUrl });
  return objectUrl;
}

export function getCachedSpeechObjectUrl(
  text: string,
  language: TargetLanguage,
  speakingRate = 1,
) {
  const key = cacheKey(text, language, speakingRate);
  const cached = clientCache.get(key);
  if (!cached) return null;
  // Refresh LRU order.
  clientCache.delete(key);
  clientCache.set(key, cached);
  return cached.objectUrl;
}

export async function synthesizeSpeech(
  accessToken: string,
  options: SpeechSynthesisOptions,
): Promise<{ blob: Blob; objectUrl: string; fromCache: boolean }> {
  const speakingRate = normalizeRate(options.speakingRate ?? 1);
  const key = cacheKey(options.text, options.language, speakingRate);
  const cached = clientCache.get(key);
  if (cached) {
    clientCache.delete(key);
    clientCache.set(key, cached);
    return { blob: cached.blob, objectUrl: cached.objectUrl, fromCache: true };
  }

  const baseUrl = apiBaseUrl();
  if (!baseUrl) {
    throw new ConversationApiError("A URL do backend ainda não foi configurada.", 0);
  }

  const response = await fetch(`${baseUrl}/api/v1/speech/synthesize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: options.text,
      language: options.language,
      speaking_rate: speakingRate,
      request_id: options.requestId ?? crypto.randomUUID(),
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail = typeof payload?.detail === "string" ? payload.detail : null;
    throw new ConversationApiError(
      detail || "Não foi possível gerar o áudio agora.",
      response.status,
    );
  }

  const blob = await response.blob();
  const objectUrl = remember(key, blob);
  return { blob, objectUrl, fromCache: false };
}
