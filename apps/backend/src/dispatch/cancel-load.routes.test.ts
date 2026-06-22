import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerDispatchCancelLoadRoutes } from "./cancel-load.routes.js";

describe("registerDispatchCancelLoadRoutes", () => {
  it("returns 400 when cancel_reason is missing", async () => {
    const app = Fastify();
    await registerDispatchCancelLoadRoutes(app);
    app.post("/api/v1/dispatch/loads/:id/cancel", async () => ({ ok: true }));
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/loads/2ad9470f-57e2-4336-9648-4432f23c4da3/cancel",
      payload: {
        cancel_reason_code: "weather",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: "validation_error",
      details: {
        field: "cancel_reason",
        message: "cancel_reason is required",
      },
    });
    await app.close();
  });

  // Every reason the frontend dropdown can submit comes from catalogs.cancellation_reasons (migration 0101).
  // The preValidation must let each one THROUGH (no 400) — the catalog itself is validated downstream by the
  // cancelLoad service. This locks the regression where a hard-coded enum rejected all real catalog codes.
  const CATALOG_REASON_CODES = [
    "CUSTOMER_CANCELLED",
    "DRIVER_ISSUE",
    "EQUIPMENT_ISSUE",
    "WEATHER",
    "NO_PICKUP",
    "RATE_DISPUTE",
    "CUSTOMER_BANKRUPTCY",
    "TRUCK_BREAKDOWN",
    "DRIVER_WALKOFF",
  ] as const;

  it.each(CATALOG_REASON_CODES)("passes preValidation for catalog reason code %s (no 400)", async (code) => {
    const app = Fastify();
    await registerDispatchCancelLoadRoutes(app);
    app.post("/api/v1/dispatch/loads/:id/cancel", async (req) => ({ ok: true, body: req.body }));
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/loads/2ad9470f-57e2-4336-9648-4432f23c4da3/cancel",
      payload: {
        cancel_reason: "Customer called to cancel the load before pickup.",
        cancel_reason_code: code,
        cancellation_notes: "Customer called to cancel the load before pickup.",
      },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json() as { ok: boolean; body: { cancel_reason_code: string; reason_code: string } };
    expect(json.ok).toBe(true);
    // preValidation maps the code through to reason_code for the downstream catalog lookup.
    expect(json.body.cancel_reason_code).toBe(code);
    expect(json.body.reason_code).toBe(code);
    await app.close();
  });

  it("returns 400 when cancel_reason_code is missing", async () => {
    const app = Fastify();
    await registerDispatchCancelLoadRoutes(app);
    app.post("/api/v1/dispatch/loads/:id/cancel", async () => ({ ok: true }));
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/loads/2ad9470f-57e2-4336-9648-4432f23c4da3/cancel",
      payload: {
        cancel_reason: "Driver called out for weather closure",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: "validation_error",
      details: {
        field: "cancel_reason_code",
        message: "cancel_reason_code is required",
      },
    });
    await app.close();
  });
});
