/**
 * DRIVER-ESCROW-VISUALIZER-BALANCES-AVAILABLE-LABEL-MISLEADING-COUNT (residual):
 * countDriverEscrowKpis()'s `drivers_with_escrow_balance` count must never silently exclude a
 * deactivated driver who still holds a real nonzero escrow balance — a terminated driver's
 * outstanding escrow is a real liability the company still owes/holds
 * (escrow-separation.service.ts), and dropping it from this KPI undercounts real liability
 * exposure. This must match escrow-visualizer.routes.ts's own documented inclusion policy: every
 * active driver, plus any deactivated driver with a real escrow account row.
 */
import { describe, expect, it } from "vitest";
import { countDriverEscrowKpis } from "../driver-escrow-counts.js";

function fakeClient(rows: { count: number }[]) {
  const calls: { sql: string; values: unknown[] | undefined }[] = [];
  let i = 0;
  return {
    calls,
    client: {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        const row = rows[i] ?? rows[rows.length - 1];
        i += 1;
        return { rows: [row] };
      },
    },
  };
}

describe("countDriverEscrowKpis", () => {
  it("issues 3 queries: active drivers, drivers-with-balance, drivers-with-active-account", async () => {
    const { client, calls } = fakeClient([{ count: 5 }, { count: 2 }, { count: 1 }]);
    const result = await countDriverEscrowKpis(client, "11111111-1111-1111-1111-111111111111");
    expect(calls).toHaveLength(3);
    expect(result).toEqual({
      active_drivers: 5,
      drivers_with_escrow_balance: 2,
      drivers_with_active_escrow_account: 1,
    });
  });

  it("the drivers-with-balance query does NOT exclude deactivated drivers from the count", async () => {
    const { client, calls } = fakeClient([{ count: 0 }, { count: 0 }, { count: 0 }]);
    await countDriverEscrowKpis(client, "11111111-1111-1111-1111-111111111111");
    const withBalanceSql = calls[1].sql;
    // The bug: this clause used to sit alongside the balance filter and would drop a real,
    // nonzero-balance escrow liability the moment its driver was deactivated.
    expect(withBalanceSql).not.toMatch(/d\.deactivated_at\s+IS\s+NULL/i);
    // The real scoping mechanism stays: only a driver with an actual escrow account row and a
    // real nonzero balance is counted — dropping the deactivated filter must not turn this into
    // an unscoped count of every driver.
    expect(withBalanceSql).toMatch(/COALESCE\(ea\.balance_cents,\s*0\)\s*<>\s*0/i);
    expect(withBalanceSql).toMatch(/JOIN accounting\.escrow_accounts/i);
  });

  it("active_drivers and drivers_with_active_escrow_account still scope to active drivers only (unchanged)", async () => {
    const { client, calls } = fakeClient([{ count: 0 }, { count: 0 }, { count: 0 }]);
    await countDriverEscrowKpis(client, "11111111-1111-1111-1111-111111111111");
    expect(calls[0].sql).toMatch(/deactivated_at\s+IS\s+NULL/i);
    expect(calls[2].sql).toMatch(/d\.deactivated_at\s+IS\s+NULL/i);
  });
});
