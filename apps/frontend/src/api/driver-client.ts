import { resolveApiUrl, ApiError } from "./client";
import { clearDriverAuth, getValidDriverAccessToken } from "../lib/auth-token";

type DriverRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
};

export async function driverApiRequest<T>(path: string, options: DriverRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  const token = await getValidDriverAccessToken();
  if (token) headers["x-driver-token"] = token;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(resolveApiUrl(path), {
    method: options.method ?? "GET",
    credentials: "include",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (response.status === 204) return undefined as T;
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();
  if (!response.ok) {
    if (response.status === 401) clearDriverAuth();
    throw new ApiError(response.status, payload);
  }
  return payload as T;
}
