
/** FAIL-K2/K3 — prefer server message/error over bare "status 400". */
function messageFromApiPayload(status: number, data: unknown): string {
  if (status === 429) {
    return ""; // constructor handles 429 separately
  }
  if (typeof data === "string" && data.trim()) return data.trim().slice(0, 500);
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const key of ["message", "error_description", "detail"] as const) {
      const v = o[key];
      if (typeof v === "string" && v.trim()) return v.trim().slice(0, 500);
    }
    const err = o.error;
    if (typeof err === "string" && err.trim()) {
      // Prefer human message when paired; else machine code beats bare HTTP status.
      return err.trim().slice(0, 500);
    }
    const blockers = o.blockers;
    if (Array.isArray(blockers) && blockers[0] && typeof blockers[0] === "object") {
      const m = (blockers[0] as { message?: unknown }).message;
      if (typeof m === "string" && m.trim()) return m.trim().slice(0, 500);
    }
  }
  return `API request failed with status ${status}`;
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  retryAfter: number | null;

  constructor(status: number, data: unknown, retryAfter: number | null = null) {
    super(
      status === 429
        ? `Too many requests — please wait ${retryAfter ?? "a few"} second${retryAfter === 1 ? "" : "s"} and try again.`
        : messageFromApiPayload(status, data)
    );
    this.status = status;
    this.data = data;
    this.retryAfter = retryAfter;
  }
}

function retryAfterSeconds(response: Response): number | null {
  if (response.status !== 429) return null;
  const raw = Number(response.headers.get("Retry-After"));
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** RFC4122 v4 UUID, used to auto-attach an Idempotency-Key to mutating requests. */
function generateIdempotencyKey(): string {
  const c = typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback for environments without crypto.randomUUID.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function buildUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (API_BASE_URL) return `${API_BASE_URL.replace(/\/$/, "")}${path}`;

  // In jsdom/unit tests, fetch requires an absolute URL.
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(path, window.location.origin).toString();
  }

  return `http://localhost${path}`;
}

export function resolveApiUrl(path: string): string {
  return buildUrl(path);
}

export async function apiRequestFormData<T>(path: string, formData: FormData, method: "POST" | "PATCH" = "POST"): Promise<T> {
  const response = await fetch(buildUrl(path), {
    method,
    credentials: "include",
    body: formData,
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();
  if (!response.ok) {
    throw new ApiError(response.status, payload, retryAfterSeconds(response));
  }
  return payload as T;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  // Auto-generate an Idempotency-Key for every mutating call so retries are safe (GAP-IDEMP-KEYS).
  if (MUTATING_METHODS.has(method) && !headers["Idempotency-Key"] && !headers["idempotency-key"]) {
    headers["Idempotency-Key"] = generateIdempotencyKey();
  }

  const response = await fetch(buildUrl(path), {
    method,
    credentials: "include",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    throw new ApiError(response.status, payload, retryAfterSeconds(response));
  }

  return payload as T;
}
