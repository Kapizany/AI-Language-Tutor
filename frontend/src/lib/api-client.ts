export class ApiClientError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
  }
}

const apiBaseUrl = () => process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "";

export async function apiRequest<T>(
  path: string,
  {
    accessToken,
    method = "GET",
    body,
    signal,
  }: {
    accessToken: string;
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    signal?: AbortSignal;
  },
): Promise<T> {
  const baseUrl = apiBaseUrl();
  if (!baseUrl) {
    throw new ApiClientError("A URL do backend ainda não foi configurada.", 0);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof payload?.detail === "string" ? payload.detail : null;
    throw new ApiClientError(detail || "Não foi possível completar a operação.", response.status);
  }
  return payload as T;
}
