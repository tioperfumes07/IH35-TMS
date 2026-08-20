import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerWoCancellationReasonRoutes } from "./wo-cancellation-reasons.routes.js";

/**
 * WO-CANCEL-REASON-NO-CREATE-ROUTE — this route was GET-only, so both frontend WO cancel-reason
 * pickers had no "+ Add new" affordance to POST to. Proves the FE↔BE contract every consumer
 * needs is actually mounted (never 404), and that there is still NO DELETE route (void-not-delete
 * via is_active, matching every other catalog CRUD route in this repo).
 */
const FE_CONTRACT: Array<{ method: "GET" | "POST" | "PATCH"; url: string }> = [
  { method: "GET", url: "/api/v1/catalogs/wo-cancellation-reasons" },
  { method: "POST", url: "/api/v1/catalogs/wo-cancellation-reasons" },
  { method: "PATCH", url: "/api/v1/catalogs/wo-cancellation-reasons/DUPLICATE" },
  { method: "POST", url: "/api/v1/catalogs/wo-cancellation-reasons/DUPLICATE/deactivate" },
  { method: "POST", url: "/api/v1/catalogs/wo-cancellation-reasons/DUPLICATE/reactivate" },
];

describe("wo-cancellation-reasons — FE↔BE route contract", () => {
  it("every frontend-called path is mounted (never 404)", async () => {
    const app = Fastify();
    await registerWoCancellationReasonRoutes(app);
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

  it("has NO DELETE route (void-not-delete via is_active)", async () => {
    const app = Fastify();
    await registerWoCancellationReasonRoutes(app);
    await app.ready();
    try {
      const res = await app.inject({ method: "DELETE", url: "/api/v1/catalogs/wo-cancellation-reasons/DUPLICATE" });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("rejects an unauthenticated create with 401, not a phantom 404", async () => {
    const app = Fastify();
    await registerWoCancellationReasonRoutes(app);
    await app.ready();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/catalogs/wo-cancellation-reasons",
        payload: { reason_code: "TEST_REASON", reason_label: "Test reason" },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});
