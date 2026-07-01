import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerVoidCancelReasonRoutes } from "./void-cancel-reasons.routes.js";

/**
 * Task #24 — FE↔BE route contract for the financial void/cancel reason catalog CRUD. Each frontend-called
 * (method, url) must resolve to a mounted route (401/400 without a session, NEVER 404). Also proves there is
 * NO DELETE route (void-not-delete): DELETE must 404 while /deactivate is mounted.
 */
const FE_CONTRACT: Array<{ method: "GET" | "POST" | "PATCH"; url: string }> = [
  { method: "GET", url: "/api/v1/catalogs/void-cancel-reasons?operating_company_id=00000000-0000-0000-0000-000000000000" },
  { method: "POST", url: "/api/v1/catalogs/void-cancel-reasons" },
  { method: "PATCH", url: "/api/v1/catalogs/void-cancel-reasons/00000000-0000-0000-0000-000000000000" },
  { method: "POST", url: "/api/v1/catalogs/void-cancel-reasons/00000000-0000-0000-0000-000000000000/deactivate" },
  { method: "POST", url: "/api/v1/catalogs/void-cancel-reasons/00000000-0000-0000-0000-000000000000/reactivate" },
];

describe("void-cancel-reasons — FE↔BE route contract", () => {
  it("every frontend-called path is mounted (never 404)", async () => {
    const app = Fastify();
    await registerVoidCancelReasonRoutes(app);
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

  it("has NO DELETE route (void-not-delete)", async () => {
    const app = Fastify();
    await registerVoidCancelReasonRoutes(app);
    await app.ready();
    try {
      const res = await app.inject({ method: "DELETE", url: "/api/v1/catalogs/void-cancel-reasons/00000000-0000-0000-0000-000000000000" });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
