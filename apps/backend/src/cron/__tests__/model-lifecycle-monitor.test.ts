import { describe, expect, it, vi, beforeEach } from "vitest";

// RATECON-3 — the monitor that turns the next model retirement into a 60-day warning instead of an outage.
const { mockListModels, mockWithLuciaBypass, mockCaptureMessage, mockCaptureException } = vi.hoisted(() => ({
  mockListModels: vi.fn(),
  mockWithLuciaBypass: vi.fn(async (fn: (c: unknown) => unknown) => fn({ query: vi.fn(async () => ({ rows: [] })) })),
  mockCaptureMessage: vi.fn(),
  mockCaptureException: vi.fn(),
}));

vi.mock("../../ai/anthropic-messages.js", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, listAnthropicModels: mockListModels };
});
vi.mock("../../auth/db.js", () => ({ withLuciaBypass: mockWithLuciaBypass }));
vi.mock("@sentry/node", () => ({ captureMessage: mockCaptureMessage, captureException: mockCaptureException }));

const { runModelLifecycleCheck } = await import("../model-lifecycle-monitor.cron.js");
const { AnthropicNotConfiguredError } = await import("../../ai/anthropic-messages.js");
const { REGISTERED_MODEL_IDS } = await import("../../ai/models.js");

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;

describe("runModelLifecycleCheck", () => {
  beforeEach(() => {
    mockListModels.mockReset();
    mockCaptureMessage.mockReset();
    mockCaptureException.mockReset();
  });

  it("all registered models present → no alert", async () => {
    mockListModels.mockResolvedValue(REGISTERED_MODEL_IDS.map((id) => ({ id })));
    const res = await runModelLifecycleCheck(log);
    expect(res).toMatchObject({ configured: true, missing: [] });
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it("a registered model MISSING from /v1/models → Sentry alert + returns it (the early-warning path)", async () => {
    mockListModels.mockResolvedValue([{ id: "claude-something-else" }]);
    const res = await runModelLifecycleCheck(log);
    expect(res.missing).toEqual([...REGISTERED_MODEL_IDS]);
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(mockCaptureMessage.mock.calls[0][1]).toMatchObject({ level: "error" });
  });

  it("Anthropic not configured → skips quietly, no alert", async () => {
    mockListModels.mockRejectedValue(new AnthropicNotConfiguredError());
    const res = await runModelLifecycleCheck(log);
    expect(res).toEqual({ configured: false, available: 0, missing: [] });
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });
});
