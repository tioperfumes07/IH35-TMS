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

  it("does not swallow mobile 429 as null when SAFER has no record", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("mobile.fmcsa")) return jsonResponse(429, {}, { "retry-after": "8" });
      // SAFER "no records" HTML (authoritative miss) — must still surface mobile rate-limit.
      return htmlResponse(200, "<html>No records found</html>");
    }) as typeof fetch;
    const { lookupCarrierByMC } = await import("../fmcsa-client.js");
    await expect(lookupCarrierByMC("12345")).rejects.toMatchObject({
      name: "FmcsaRetryableError",
      status: 429,
      retryAfterMs: 8_000,
    });
  });

  it("does not collapse mobile permanent into not-found when SAFER misses", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("mobile.fmcsa")) return jsonResponse(403);
      return htmlResponse(200, "<html>No records found</html>");
    }) as typeof fetch;
    const { lookupCarrierByMC } = await import("../fmcsa-client.js");
    await expect(lookupCarrierByMC("12345")).rejects.toMatchObject({
      name: "FmcsaPermanentError",
      status: 403,
    });
  });

  it("prefers authoritative SAFER hit over prior mobile permanent", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("mobile.fmcsa")) return jsonResponse(403);
      // Plain-text labels match parseSaferSnapshotHtml capturePlain patterns.
      return htmlResponse(
        200,
        [
          "Legal Name: Acme Trucking LLC",
          "DBA Name: Acme",
          "Physical Address: 1 Main St Laredo, TX 78040",
          "Phone: (555) 555-0100",
          "USDOT Number: 1234567",
          "MC/MX/FF Number(s): MC-999999",
          "Operating Authority Status: Active",
        ].join("\n")
      );
    }) as typeof fetch;
    const { lookupCarrierByMC } = await import("../fmcsa-client.js");
    const result = await lookupCarrierByMC("999999");
    expect(result?.legal_name).toMatch(/Acme/i);
    expect(result?.usdot_number).toBe("1234567");
  });

  it("both-source authoritative 404 remains null (not permanent)", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("mobile.fmcsa")) return jsonResponse(404);
      return htmlResponse(404);
    }) as typeof fetch;
    const { lookupCarrierByMC } = await import("../fmcsa-client.js");
    await expect(lookupCarrierByMC("12345")).resolves.toBeNull();
  });
});
