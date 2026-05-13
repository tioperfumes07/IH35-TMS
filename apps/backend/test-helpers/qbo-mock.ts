import { vi } from "vitest";

/** Minimal fetch stub helper for QBO-style JSON endpoints in unit tests. */
export function mockJsonFetchOnce(payload: unknown, init?: { ok?: boolean; status?: number }) {
  return vi.fn().mockResolvedValue({
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  });
}
