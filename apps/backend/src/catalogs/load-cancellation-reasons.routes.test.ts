import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerLoadCancellationReasonRoutes } from "./load-cancellation-reasons.routes.js";

/**
 * Route-exists guard for the load-cancellation-reasons 404 report.
 *
 * Investigation (2026-06-24): the table catalogs.load_cancellation_reasons exists on prod (36 rows),
 * the route is registered unconditionally (index.ts), and every path the frontend calls
 * (apps/frontend/src/api/catalogs.ts) matches the backend exactly — so the reported 404 was stale.
 * This guard locks the FE↔BE path contract so a route-name mismatch can't silently 404 again:
 * each FE-called (method, url) must resolve to a mounted route (Fastify → 401/400/500 without a
 * session, NEVER 404).
 */
const FE_CONTRACT: Array<{ method: "GET" | "POST" | "PATCH"; url: string }> = [
  { method: "GET", url: "/api/v1/catalogs/load-cancellation-reasons?operating_company_id=00000000-0000-0000-0000-000000000000" },
  { method: "POST", url: "/api/v1/catalogs/load-cancellation-reasons" },
  { method: "PATCH", url: "/api/v1/catalogs/load-cancellation-reasons/00000000-0000-0000-0000-000000000000" },
  { method: "POST", url: "/api/v1/catalogs/load-cancellation-reasons/00000000-0000-0000-0000-000000000000/deactivate" },
  { method: "POST", url: "/api/v1/catalogs/load-cancellation-reasons/00000000-0000-0000-0000-000000000000/reactivate" },
];

describe("load-cancellation-reasons — FE↔BE route contract (404 guard)", () => {
  it("every frontend-called path is mounted (never 404)", async () => {
    const app = Fastify();
    await registerLoadCancellationReasonRoutes(app);
    await app.ready();
    try {
      for (const { method, url } of FE_CONTRACT) {
        const res = await app.inject({ method, url });
        expect(res.statusCode, `${method} ${url} is not mounted (got 404)`).not.toBe(404);
      }
    } finally {
      await app.close();
    }
  });
});
