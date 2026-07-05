import Fastify, { type FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  CSRF_EXEMPT_PREFIXES,
  evaluateCsrfOrigin,
  isCsrfExemptPath,
  originFromReferer,
  registerCsrfOriginGuard,
  requestHasSessionCookie,
} from "../csrf-origin-guard.js";

const ALLOWED = ["https://app.ih35dispatch.com", "http://localhost:5173"];
const SESSION = "ih35_session=abc123";
const GOOD_ORIGIN = "https://app.ih35dispatch.com";
const EVIL_ORIGIN = "https://evil.example.com";

describe("csrf-origin-guard: pure helpers", () => {
  it("detects the session cookie among other cookies", () => {
    expect(requestHasSessionCookie(undefined)).toBe(false);
    expect(requestHasSessionCookie("")).toBe(false);
    expect(requestHasSessionCookie("foo=1; bar=2")).toBe(false);
    expect(requestHasSessionCookie("ih35_session=abc")).toBe(true);
    expect(requestHasSessionCookie("foo=1; ih35_session=abc; bar=2")).toBe(true);
    // must not match a look-alike prefix
    expect(requestHasSessionCookie("ih35_session_other=abc")).toBe(false);
  });

  it("parses the origin out of a referer URL", () => {
    expect(originFromReferer("https://app.ih35dispatch.com/loads/123")).toBe("https://app.ih35dispatch.com");
    expect(originFromReferer("http://localhost:5173/x?y=1")).toBe("http://localhost:5173");
    expect(originFromReferer(undefined)).toBeNull();
    expect(originFromReferer("not a url")).toBeNull();
  });

  it("treats every webhook + health prefix as exempt", () => {
    expect(isCsrfExemptPath("/api/v1/qbo/webhook")).toBe(true);
    expect(isCsrfExemptPath("/api/v1/integrations/samsara/webhook")).toBe(true);
    expect(isCsrfExemptPath("/api/v1/samsara/webhooks")).toBe(true);
    expect(isCsrfExemptPath("/api/v1/webhooks/plaid")).toBe(true);
    expect(isCsrfExemptPath("/api/v1/banking/plaid/webhook")).toBe(true);
    expect(isCsrfExemptPath("/api/v1/dispatch/ocr-intake/webhook/email")).toBe(true);
    expect(isCsrfExemptPath("/api/v1/healthz/shallow")).toBe(true);
    expect(isCsrfExemptPath("/api/v1/loads")).toBe(false);
  });
});

describe("csrf-origin-guard: decision function", () => {
  const base = { cookieHeader: SESSION, referer: undefined, allowedOrigins: ALLOWED };

  it("never blocks safe methods (GET/HEAD/OPTIONS)", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(
        evaluateCsrfOrigin({ ...base, method, path: "/api/v1/loads", origin: EVIL_ORIGIN })
      ).toBeNull();
    }
  });

  it("allows a cookie POST from an allowed Origin", () => {
    expect(
      evaluateCsrfOrigin({ ...base, method: "POST", path: "/api/v1/loads", origin: GOOD_ORIGIN })
    ).toBeNull();
  });

  it("blocks a cookie POST from a foreign Origin (403)", () => {
    expect(
      evaluateCsrfOrigin({ ...base, method: "POST", path: "/api/v1/loads", origin: EVIL_ORIGIN })
    ).toEqual({ status: 403, error: "csrf_origin_not_allowed" });
  });

  it("blocks a cookie POST with NO Origin and no Referer (403)", () => {
    expect(
      evaluateCsrfOrigin({ ...base, method: "POST", path: "/api/v1/loads", origin: undefined })
    ).toEqual({ status: 403, error: "csrf_origin_not_allowed" });
  });

  it("falls back to Referer when Origin is absent", () => {
    expect(
      evaluateCsrfOrigin({
        ...base,
        method: "POST",
        path: "/api/v1/loads",
        origin: undefined,
        referer: "https://app.ih35dispatch.com/loads",
      })
    ).toBeNull();
    expect(
      evaluateCsrfOrigin({
        ...base,
        method: "POST",
        path: "/api/v1/loads",
        origin: undefined,
        referer: "https://evil.example.com/x",
      })
    ).toEqual({ status: 403, error: "csrf_origin_not_allowed" });
  });

  it("does NOT block a webhook POST with no cookie and no Origin (exempt caller)", () => {
    expect(
      evaluateCsrfOrigin({
        method: "POST",
        path: "/api/v1/qbo/webhook",
        cookieHeader: undefined,
        origin: undefined,
        referer: undefined,
        allowedOrigins: ALLOWED,
      })
    ).toBeNull();
  });

  it("does NOT block a state-changing request that carries no session cookie", () => {
    // e.g. S2S / test-auth-header requests — nothing for CSRF to ride
    expect(
      evaluateCsrfOrigin({
        method: "POST",
        path: "/api/v1/loads",
        cookieHeader: "other=1",
        origin: undefined,
        referer: undefined,
        allowedOrigins: ALLOWED,
      })
    ).toBeNull();
  });

  it("blocks a webhook path ONLY if it were reached with a cookie+foreign origin — but path is exempt so allowed", () => {
    // Confirms exemption wins even if a cookie is somehow present.
    expect(
      evaluateCsrfOrigin({
        method: "POST",
        path: "/api/v1/qbo/webhook",
        cookieHeader: SESSION,
        origin: EVIL_ORIGIN,
        referer: undefined,
        allowedOrigins: ALLOWED,
      })
    ).toBeNull();
  });
});

describe("csrf-origin-guard: live Fastify integration", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  async function buildApp(): Promise<FastifyInstance> {
    const instance = Fastify();
    await registerCsrfOriginGuard(instance, { allowedOrigins: () => ALLOWED });
    instance.post("/api/v1/loads", async () => ({ ok: true }));
    instance.get("/api/v1/loads", async () => ({ ok: true }));
    instance.post("/api/v1/qbo/webhook", async () => ({ ok: true }));
    await instance.ready();
    return instance;
  }

  it("allowed-origin cookie POST → 200", async () => {
    app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/loads",
      headers: { cookie: SESSION, origin: GOOD_ORIGIN },
    });
    expect(res.statusCode).toBe(200);
  });

  it("foreign-origin cookie POST → 403", async () => {
    app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/loads",
      headers: { cookie: SESSION, origin: EVIL_ORIGIN },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "csrf_origin_not_allowed" });
  });

  it("missing-origin cookie POST → 403", async () => {
    app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/loads",
      headers: { cookie: SESSION },
    });
    expect(res.statusCode).toBe(403);
  });

  it("webhook POST with no cookie/origin → 200 (exempt)", async () => {
    app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/api/v1/qbo/webhook" });
    expect(res.statusCode).toBe(200);
  });

  it("GET is never blocked, even from a foreign origin", async () => {
    app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/loads",
      headers: { cookie: SESSION, origin: EVIL_ORIGIN },
    });
    expect(res.statusCode).toBe(200);
  });

  it("state-changing request WITHOUT the session cookie is untouched (S2S/test path)", async () => {
    app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/api/v1/loads" });
    expect(res.statusCode).toBe(200);
  });
});

describe("csrf-origin-guard: static wiring guard (regression)", () => {
  it("index.ts registers the CSRF guard before route registration", () => {
    const indexPath = fileURLToPath(new URL("../../index.ts", import.meta.url));
    const src = readFileSync(indexPath, "utf8");
    expect(src).toContain("registerCsrfOriginGuard");
    // must be wired after session middleware and before the auth routes register
    const guardIdx = src.indexOf("await registerCsrfOriginGuard(app)");
    const authRoutesIdx = src.indexOf("await registerAuthRoutes(app)");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(authRoutesIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(authRoutesIdx);
  });

  it("keeps every known webhook path on the exempt list", () => {
    for (const p of [
      "/api/v1/qbo/webhook",
      "/api/v1/integrations/samsara/webhook",
      "/api/v1/samsara/webhooks",
      "/api/v1/webhooks/plaid",
      "/api/v1/banking/plaid/webhook",
      "/api/v1/dispatch/ocr-intake/webhook/email",
    ]) {
      expect(CSRF_EXEMPT_PREFIXES).toContain(p);
    }
  });
});
