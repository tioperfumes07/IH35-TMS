import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ recentRun: false, statements: [] as string[] }));

vi.mock("../../auth/db.js", () => ({
  withLuciaBypass: vi.fn(async (fn: (client: unknown) => Promise<unknown>) =>
    fn({
      query: vi.fn(async (sql: string) => {
        state.statements.push(sql.replace(/\s+/g, " ").trim().slice(0, 40));
        if (/FROM reconciler\.runs/.test(sql) && /ran_at > now\(\)/.test(sql)) return { rows: state.recentRun ? [{ "?column?": 1 }] : [] };
        return { rows: [] };
      }),
    })
  ),
}));
vi.mock("../../org/companies.routes.js", () => ({ USMCA_COMPANY_ID: "5c854333-6ea5-4faa-af31-67cb272fef80" }));
vi.mock("../run.js", () => ({
  runReconciler: vi.fn(async (_c: unknown, co: string) => ({ operating_company_id: co, ran_at: "x", results: [], exception_count: 0, errored_invariants: [] })),
}));
vi.mock("../persist.js", () => ({
  persistReconcilerRun: vi.fn(async () => ({ operating_company_id: "co", open_count: 0, opened_count: 0, resolved_count: 0, errored_invariants: [] })),
}));

import { persistReconcilerRun } from "../persist.js";
import { reconcilerTick } from "../reconciler.cron.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

describe("reconciler cron — one recorded run per tick across instances", () => {
  beforeEach(() => {
    state.recentRun = false;
    state.statements = [];
    vi.mocked(persistReconcilerRun).mockClear();
  });

  it("takes the transaction lock before anything else, then runs and records when no recent run exists", async () => {
    const result = await reconcilerTick(USMCA);
    expect(state.statements[0]).toMatch(/pg_advisory_xact_lock/);
    expect(persistReconcilerRun).toHaveBeenCalledTimes(1);
    expect("skipped" in result).toBe(false);
  });

  it("skips, recording nothing, when another instance recorded a run in the dedup window", async () => {
    state.recentRun = true;
    const result = await reconcilerTick(USMCA);
    expect(result).toEqual({ skipped: true, reason: "a run was recorded in the last 10 minutes" });
    expect(persistReconcilerRun).not.toHaveBeenCalled();
  });

  it("refuses a malformed company id before opening a transaction", async () => {
    await expect(reconcilerTick("not-a-uuid")).rejects.toThrow(/malformed operating_company_id/);
    expect(state.statements).toEqual([]);
  });
});
