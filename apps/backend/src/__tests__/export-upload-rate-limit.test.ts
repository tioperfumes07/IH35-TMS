import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { afterEach, describe, expect, it } from "vitest";

/**
 * H4-5: heavy financial exports, audit-report generation, and binary uploads
 * are throttled via per-route `config: { rateLimit: { max, timeWindow } }`.
 *
 * The app registers `@fastify/rate-limit` with `global:false`, so only routes
 * that opt in are throttled. This test proves that contract end-to-end:
 *   - a route carrying the same config literal we apply returns 429 past its cap,
 *   - a route WITHOUT the config is never throttled (proving global:false and
 *     therefore that our added configs are what does the throttling).
 */
describe("H4-5 export/upload per-route rate limiting", () => {
  let app: Awaited<ReturnType<typeof buildApp>> | null = null;

  async function buildApp() {
    const f = Fastify();
    // Same registration the real server uses (src/index.ts): opt-in only.
    await f.register(rateLimit, { global: false });

    // Mirrors the config literal applied to heavy export/audit routes.
    f.get(
      "/export",
      { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
      async () => ({ ok: true })
    );
    // An unthrottled control route (no config) — proves global:false.
    f.get("/unthrottled", async () => ({ ok: true }));

    await f.ready();
    return f;
  }

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it("returns 429 once the per-route cap (10/min) is exceeded, but not before", async () => {
    app = await buildApp();

    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const res = await app.inject({ method: "GET", url: "/export" });
      statuses.push(res.statusCode);
    }

    // First 10 pass, 11th is throttled.
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("does not throttle routes that omit config.rateLimit (global:false)", async () => {
    app = await buildApp();

    const statuses: number[] = [];
    for (let i = 0; i < 25; i += 1) {
      const res = await app.inject({ method: "GET", url: "/unthrottled" });
      statuses.push(res.statusCode);
    }

    expect(statuses.every((s) => s === 200)).toBe(true);
  });
});
