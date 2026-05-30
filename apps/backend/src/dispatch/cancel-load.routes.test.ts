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
