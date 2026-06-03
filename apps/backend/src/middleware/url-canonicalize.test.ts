import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildStaticGetPathSet,
  registerUrlCanonicalizeMiddleware,
  resolveUnderscoreRedirectPath,
  underscoreToHyphenPath,
} from "./url-canonicalize.js";

describe("url-canonicalize helpers", () => {
  it("underscoreToHyphenPath replaces every underscore segment", () => {
    expect(underscoreToHyphenPath("/lists_drivers")).toBe("/lists-drivers");
    expect(underscoreToHyphenPath("/lists/driver/pay_rate_templates")).toBe("/lists/driver/pay-rate-templates");
  });

  it("resolveUnderscoreRedirectPath redirects only when hyphen route exists", () => {
    const staticPaths = new Set(["/lists-drivers", "/lists/driver/pay-rate-templates"]);
    expect(resolveUnderscoreRedirectPath("/lists_drivers", staticPaths)).toBe("/lists-drivers");
    expect(resolveUnderscoreRedirectPath("/lists/driver/pay_rate_templates", staticPaths)).toBe(
      "/lists/driver/pay-rate-templates"
    );
    expect(resolveUnderscoreRedirectPath("/lists/unknown_stub", staticPaths)).toBeNull();
    expect(resolveUnderscoreRedirectPath("/api/v1/_healthcheck", staticPaths)).toBeNull();
    expect(resolveUnderscoreRedirectPath("/lists-drivers", staticPaths)).toBeNull();
  });
});

describe("registerUrlCanonicalizeMiddleware", () => {
  const apps: Array<Awaited<ReturnType<typeof Fastify>>> = [];

  afterEach(async () => {
    while (apps.length > 0) {
      const app = apps.pop();
      if (app) await app.close();
    }
  });

  async function createApp() {
    const app = Fastify();
    apps.push(app);
    await registerUrlCanonicalizeMiddleware(app);
    app.get("/lists-drivers", async () => ({ ok: true }));
    await app.ready();
    return app;
  }

  it("GET /lists_drivers returns 301 to /lists-drivers", async () => {
    const app = await createApp();
    expect(buildStaticGetPathSet(app).has("/lists-drivers")).toBe(true);

    const res = await app.inject({
      method: "GET",
      url: "/lists_drivers",
    });

    expect(res.statusCode).toBe(301);
    expect(res.headers.location).toBe("/lists-drivers");
  });

  it("GET /lists-drivers is unaffected and preserves query strings on redirects", async () => {
    const app = await createApp();

    const canonical = await app.inject({
      method: "GET",
      url: "/lists-drivers?operating_company_id=abc",
    });
    expect(canonical.statusCode).toBe(200);

    const redirected = await app.inject({
      method: "GET",
      url: "/lists_drivers?operating_company_id=abc",
    });
    expect(redirected.statusCode).toBe(301);
    expect(redirected.headers.location).toBe("/lists-drivers?operating_company_id=abc");
  });
});
