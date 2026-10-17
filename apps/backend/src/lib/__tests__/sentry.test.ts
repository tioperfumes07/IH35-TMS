import { afterEach, describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { attachSentryRequestScope, initBackendSentry, registerSentryFastifyErrorHandler } from "../sentry.js";
import * as Sentry from "@sentry/node";

vi.mock("@sentry/node", () => ({ init: vi.fn(), setupFastifyErrorHandler: vi.fn() }));
vi.mock("@sentry/profiling-node", () => ({ nodeProfilingIntegration: () => ({ name: "MockProfiler" }) }));

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("sentry wiring", () => {
  it("uses v11 profiling without enabling automatic sensitive-data collection", () => {
    vi.stubEnv("SENTRY_DSN", "https://public@example.invalid/1");
    initBackendSentry();
    const options = vi.mocked(Sentry.init).mock.calls[0][0]!;
    expect(options.profileSessionSampleRate).toBe(0.1);
    expect(options.profileLifecycle).toBe("trace");
    expect(options).not.toHaveProperty("profilesSampleRate");
    expect(options.traceLifecycle).toBe("static");
    // Class (b), ROUND 443.191: 676fab556e "Codex- Upgrade Sentry SDKs together with profiling and
    // privacy compatibility (#26762)" set httpHeaders: false + queues: false; bc5ee92f32 "Cursor- S7
    // DEGH-05 trailer on bill INSERT + G6 adopt 4 bare bank cats + G11 post-geocode bind (#26764)"
    // changed it to httpHeaders: { request: false, response: false } and dropped `queues`, matching
    // the installed @sentry/core 10.70.0 DataCollection type (build/types/types/datacollection.d.ts:
    // `httpHeaders?: { request?: CollectBehavior; response?: CollectBehavior }`, no `queues` key).
    // Full toEqual kept: any key flipping to true / a new collected key fails this test.
    expect(options.dataCollection).toEqual({
      userInfo: false, cookies: false, httpHeaders: { request: false, response: false }, httpBodies: [],
      urlQueryParams: false, graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false }, databaseQueryData: false,
      stackFrameVariables: false,
    });
    expect(options.beforeSend).toBeTypeOf("function");
    expect(options.beforeBreadcrumb).toBeTypeOf("function");
  });
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
