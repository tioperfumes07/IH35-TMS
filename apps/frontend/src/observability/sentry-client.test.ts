import { afterEach, expect, it, vi } from "vitest";

vi.mock("@sentry/react", () => ({ init: vi.fn() }));

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.clearAllMocks(); });

it("initializes once without collecting financial or customer payloads", async () => {
  vi.stubEnv("VITE_SENTRY_DSN", "https://public@example.invalid/1");
  const { initFrontendSentry } = await import("./sentry-client");
  const { init } = await import("@sentry/react");
  await initFrontendSentry();
  await initFrontendSentry();
  expect(init).toHaveBeenCalledTimes(1);
  expect(vi.mocked(init).mock.calls[0][0]).toMatchObject({
    traceLifecycle: "static",
    dataCollection: {
      userInfo: false, cookies: false, httpHeaders: false, httpBodies: [],
      urlQueryParams: false, graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false }, databaseQueryData: false,
      queues: false, stackFrameVariables: false,
    },
  });
});
