export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown) {
    super(`API request failed with status ${status}`);
    this.status = status;
    this.data = data;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  signal?: AbortSignal;
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();

function buildUrl(path: string): string {
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL.replace(/\/$/, "")}${path}`;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(buildUrl(path), {
    method: options.method ?? "GET",
    credentials: "include",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (response.status === 401) {
    if (window.location.pathname !== "/login") {
      window.location.href = "/login?reason=session_expired";
    }
    throw new ApiError(response.status, payload);
  }

  if (response.status === 403) {
    const errorCode = typeof payload === "object" && payload !== null ? (payload as { error?: string }).error : undefined;
    if (errorCode === "drivers_only" || errorCode === "driver_profile_not_found") {
      const onDriversOnlyPage =
        window.location.pathname === "/login" && new URLSearchParams(window.location.search).get("reason") === "drivers_only";
      if (!onDriversOnlyPage) {
        window.location.href = "/login?reason=drivers_only";
      }
      throw new ApiError(response.status, payload);
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, payload);
  }

  return payload as T;
}
