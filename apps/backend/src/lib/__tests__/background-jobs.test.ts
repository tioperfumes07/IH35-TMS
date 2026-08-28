import { describe, it, expect, vi } from "vitest";

const calls: Array<{ sql: string; values?: unknown[] }> = [];

vi.mock("../../auth/db.js", () => ({
  withLuciaBypass: vi.fn(async (fn: (client: unknown) => Promise<void>) => {
    const client = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
        return { rows: [] };
      }),
    };
    await fn(client);
  }),
}));

import { recordBackgroundJobDisabled, recordBackgroundJobRun } from "../background-jobs.js";

describe("background-jobs", () => {
  it("does not throw when ledger table is missing", async () => {
    calls.length = 0;
    // Re-mock the missing-table case for this one test.
    const { withLuciaBypass } = await import("../../auth/db.js");
    vi.mocked(withLuciaBypass).mockImplementationOnce(async (fn: (client: unknown) => Promise<void>) => {
      await fn({ query: vi.fn(async () => ({ rows: [{ ok: false }] })) });
    });
    await expect(recordBackgroundJobRun("test.job", true, null)).resolves.toBeUndefined();
  });

  // GO-0017-L3-CRON-WRITES-OUTCOME: a disabled cron's early return must record a real outcome, not
  // vanish silently. recordBackgroundJobDisabled is the helper wired into every env-var-gated cron's
  // early-return path (email.queue_processor, chat.confirmation_escalation,
  // samsara.webhook_projection_cron, fuel.fraud_detector_worker) — verify it calls the SAME
  // _system.record_job_run RPC as a normal successful tick (success=true, no error message), so
  // last_successful_run_at refreshes on every boot instead of freezing forever once disabled.
  it("recordBackgroundJobDisabled records a success outcome (not a failure, not silent)", async () => {
    calls.length = 0;
    await recordBackgroundJobDisabled("chat.confirmation_escalation");
    const recordCall = calls.find((c) => c.sql.includes("_system.record_job_run"));
    expect(recordCall).toBeDefined();
    expect(recordCall!.values).toEqual(["chat.confirmation_escalation", true, null]);
  });
});
