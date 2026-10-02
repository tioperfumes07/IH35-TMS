import { describe, expect, it, vi } from "vitest";

vi.mock("../../auth/db.js", () => ({ withLuciaBypass: vi.fn(async () => undefined) }));

describe("wrapBackgroundJobTick opts.rethrow (ROUND 330.1)", () => {
  it("records + logs the failure and swallows it by default", async () => {
    const { wrapBackgroundJobTick } = await import("../background-jobs.js");
    const error = vi.fn();
    await expect(wrapBackgroundJobTick("t.default", async () => { throw new Error("boom"); }, { error })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("re-throws after recording + logging when rethrow is set", async () => {
    const { wrapBackgroundJobTick } = await import("../background-jobs.js");
    const error = vi.fn();
    const onError = vi.fn();
    await expect(wrapBackgroundJobTick("t.rethrow", async () => { throw new Error("boom"); }, { error }, { rethrow: true, onError })).rejects.toThrow("boom");
    expect(error).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("a passing tick never throws", async () => {
    const { wrapBackgroundJobTick } = await import("../background-jobs.js");
    await expect(wrapBackgroundJobTick("t.ok", async () => undefined, undefined, { rethrow: true })).resolves.toBeUndefined();
  });
});
