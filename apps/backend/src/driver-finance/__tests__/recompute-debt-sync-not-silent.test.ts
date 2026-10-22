// LEAD 443.219 G-ERR (audit F-s1) — a failed driver-debt recompute is never a silent success. On origin/main recomputeDebtSync
// returned null (the list showed stale debt with no signal, the lock read "not stale" and proceeded).
import { describe, expect, it, vi } from "vitest";

describe("443.219 — recomputeDebtSync names its failure", () => {
  it("a failing recompute returns a named failure and rolls back its savepoint", async () => {
    const mod = (await import("../settlements.routes.js")) as Record<string, unknown>;
    const recompute = mod.recomputeDebtSync as ((c: unknown, d: string) => Promise<unknown>) | undefined;
    const named = mod.debtRecomputeError as ((d: unknown) => string | null) | undefined;
    expect(typeof recompute).toBe("function");
    expect(typeof named).toBe("function");
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        calls.push(sql.trim().split(/\s+/).slice(0, 3).join(" "));
        if (sql.includes("recompute_driver_debt")) throw new Error("function driver_finance.recompute_driver_debt(uuid) does not exist");
        return { rows: [] };
      }),
    };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const out = await recompute!(client, "d1");
    expect(out).not.toBeNull();
    expect(named!(out)).toMatch(/recompute_driver_debt/);
    expect(calls).toContain("ROLLBACK TO SAVEPOINT");
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("a successful recompute is not a failure", async () => {
    const mod = (await import("../settlements.routes.js")) as Record<string, any>;
    const client = {
      query: vi.fn(async (sql: string) =>
        sql.includes("recompute_driver_debt") ? { rows: [{ total_active_debt: "0", computed_at: "2026-10-22T00:00:00Z" }] } : { rows: [] }),
    };
    const out = await mod.recomputeDebtSync(client, "d1");
    expect(mod.debtRecomputeError(out)).toBeNull();
  });
});
