import { afterEach, describe, expect, it, vi } from "vitest";
import { FmcsaPermanentError, FmcsaRetryableError } from "../fmcsa-http-errors.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function htmlResponse(status: number, html = "<html></html>", headers: Record<string, string> = {}) {
  return new Response(html, {
    status,
    headers: { "content-type": "text/html", ...headers },
  });
}

describe("fmcsa-client HTTP taxonomy", () => {
  it("throws typed retryable on 429 and honors Retry-After", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(429, {}, { "retry-after": "12" })) as typeof fetch;
    const { lookupCarrierByMC } = await import("../fmcsa-client.js");
    await expect(lookupCarrierByMC("12345")).rejects.toMatchObject({
      name: "FmcsaRetryableError",
      retryable: true,
      status: 429,
      retryAfterMs: 12_000,
    } satisfies Partial<FmcsaRetryableError>);
  });

  it("throws typed retryable on 5xx (no null silent swallow)", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("mobile.fmcsa")) return jsonResponse(503);
      return htmlResponse(503);
    }) as typeof fetch;
    const { lookupCarrierByMC } = await import("../fmcsa-client.js");
    await expect(lookupCarrierByMC("12345")).rejects.toBeInstanceOf(FmcsaRetryableError);
  });

  it("returns null on authoritative 404 not-found (both sources)", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("mobile.fmcsa")) return jsonResponse(404);
      return htmlResponse(404);
    }) as typeof fetch;
    const { lookupCarrierByMC } = await import("../fmcsa-client.js");
    await expect(lookupCarrierByMC("12345")).resolves.toBeNull();
  });

  it("throws permanent on non-404 4xx (deliberate, not treated as not-found)", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("mobile.fmcsa")) return jsonResponse(403);
      return htmlResponse(403);
    }) as typeof fetch;
    const { lookupCarrierByMC } = await import("../fmcsa-client.js");
    await expect(lookupCarrierByMC("12345")).rejects.toBeInstanceOf(FmcsaPermanentError);
  });

  it("throws retryable on network failure", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const { lookupCarrierByMC } = await import("../fmcsa-client.js");
    await expect(lookupCarrierByMC("12345")).rejects.toBeInstanceOf(FmcsaRetryableError);
  });
});
