import { describe, it, expect, vi } from "vitest";

vi.mock("../../auth/db.js", () => ({
  withLuciaBypass: vi.fn(async (fn: (client: unknown) => Promise<void>) => {
    const client = {
      query: vi.fn(async () => ({ rows: [{ ok: false }] })),
    };
    await fn(client);
  }),
}));

import { recordBackgroundJobRun } from "../background-jobs.js";

describe("background-jobs", () => {
  it("does not throw when ledger table is missing", async () => {
    await expect(recordBackgroundJobRun("test.job", true, null)).resolves.toBeUndefined();
  });
});
