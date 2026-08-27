import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { createReasonBodySchema, registerLoadCancellationReasonRoutes } from "./load-cancellation-reasons.routes.js";

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

// LISTS-LOAD-CANCELLATION-REASONS-CREATE-DESCRIPTION-NULL-400 — live-reproduced this session: the
// frontend's blank-Description form value is `description: null` (LoadCancellationReasonsListPage.tsx's
// onSave: `description: form.description || null`), but createReasonBodySchema's description field was
// a bare `.optional()` (accepts undefined, rejects null) — so ANY create with Description left blank
// 400'd with `fieldErrors.description: ["Invalid input: expected string, received null"]`, and the
// modal's own error-surfacing (parseConflict) only read fieldErrors.reason_code, so the failure was
// completely silent — the Create Entry button just appeared to do nothing. Confirmed live via direct
// fetch against prod: description:null -> 400; description:"real text" -> 201 (row created + voided).
const VALID_CREATE_BODY = {
  operating_company_id: "00000000-0000-0000-0000-000000000000",
  reason_code: "TEST_CODE",
  display_name: "Test Code",
  category: "other" as const,
  sort_order: 100,
};

describe("createReasonBodySchema — LISTS-LOAD-CANCELLATION-REASONS-CREATE-DESCRIPTION-NULL-400", () => {
  it("accepts description: null (the frontend's real blank-field value)", () => {
    const parsed = createReasonBodySchema.safeParse({ ...VALID_CREATE_BODY, description: null });
    expect(parsed.success).toBe(true);
  });

  it("accepts description: undefined (the key omitted entirely)", () => {
    const parsed = createReasonBodySchema.safeParse(VALID_CREATE_BODY);
    expect(parsed.success).toBe(true);
  });

  it("still accepts a real description string", () => {
    const parsed = createReasonBodySchema.safeParse({ ...VALID_CREATE_BODY, description: "a real reason" });
    expect(parsed.success).toBe(true);
  });
});
