import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { attachSentryRequestScope, initBackendSentry, registerSentryFastifyErrorHandler } from "../sentry.js";

describe("sentry wiring", () => {
  it("init is safe when SENTRY_DSN is missing", () => {
    delete process.env.SENTRY_DSN;
    expect(() => initBackendSentry()).not.toThrow();
  });

  it("Fastify error handler registration is skipped without DSN", async () => {
    delete process.env.SENTRY_DSN;
    const app = Fastify();
    expect(() => registerSentryFastifyErrorHandler(app)).not.toThrow();
  });

  it("attachSentryRequestScope is safe without DSN", async () => {
    delete process.env.SENTRY_DSN;
    const req = {
      routeOptions: { url: "/api/v1/demo" },
      url: "/api/v1/demo",
      user: { uuid: "11111111-1111-1111-1111-111111111111", email: null, role: "Driver" },
      headers: {},
    } as never;
    expect(() => attachSentryRequestScope(req)).not.toThrow();
  });
});
