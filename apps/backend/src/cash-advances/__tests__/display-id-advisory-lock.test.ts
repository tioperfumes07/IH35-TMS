import { describe, expect, it, vi } from "vitest";

import { nextCashAdvanceDisplayId } from "../display-id.js";

// H6-2: the cash-advance number generator must acquire pg_advisory_xact_lock BEFORE the
// MAX(display_id)+1 read, so two concurrent transactions serialize and can't mint the same
// number (dup-number race). Mirrors accounting/display-id.ts (invoice/payment generators).

const OPCO = "11111111-1111-4111-8111-111111111111";
const REF = new Date(Date.UTC(2026, 0, 15));

describe("nextCashAdvanceDisplayId — advisory lock (H6-2)", () => {
  it("acquires the advisory lock BEFORE running the MAX(display_id) read", async () => {
    const order: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("pg_advisory_xact_lock")) {
          order.push("lock");
          return { rows: [{ pg_advisory_xact_lock: "" }] };
        }
        if (sql.includes("MAX(")) {
          order.push("max");
          return { rows: [{ next_number: 1 }] };
        }
        return { rows: [] };
      }),
    };

    const id = await nextCashAdvanceDisplayId(client, OPCO, REF);

    expect(id).toBe("CA-2026-0001");
    // Lock must be first, and it must precede the MAX read.
    expect(order).toEqual(["lock", "max"]);
    expect(order.indexOf("lock")).toBeLessThan(order.indexOf("max"));
  });

  it("locks on a stable per-(company, year) key", async () => {
    let lockKey: unknown = null;
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes("pg_advisory_xact_lock")) {
          lockKey = params[0];
          return { rows: [] };
        }
        if (sql.includes("MAX(")) return { rows: [{ next_number: 7 }] };
        return { rows: [] };
      }),
    };

    const id = await nextCashAdvanceDisplayId(client, OPCO, REF);
    expect(id).toBe("CA-2026-0007");
    expect(lockKey).toBe(`driver_finance.cash_advance.display_id:${OPCO}:2026`);
  });

  it("serializes concurrent generators via a mutex on the shared lock key (no dup number)", async () => {
    // Model the DB advisory lock as a single-holder mutex keyed by the lock string. Two
    // generators sharing the same (company, year) key must run their read-and-mint
    // strictly one-at-a-time; the second sees the first's committed row and gets +1.
    const committed: number[] = [];
    const holders = new Map<string, Promise<void>>();

    function makeClient() {
      let release: (() => void) | null = null;
      return {
        query: vi.fn(async (sql: string, params: unknown[] = []) => {
          if (sql.includes("pg_advisory_xact_lock")) {
            const key = String(params[0]);
            // Wait for any current holder of this key, then become the holder.
            const prior = holders.get(key);
            if (prior) await prior;
            let done!: () => void;
            const held = new Promise<void>((res) => {
              done = res;
            });
            holders.set(key, held);
            release = done;
            return { rows: [] };
          }
          if (sql.includes("MAX(")) {
            const next = (committed.length === 0 ? 0 : Math.max(...committed)) + 1;
            // Simulate the read/insert window by yielding before committing.
            await Promise.resolve();
            committed.push(next);
            // Release the advisory lock at "commit" (xact end).
            release?.();
            return { rows: [{ next_number: next }] };
          }
          return { rows: [] };
        }),
      };
    }

    const [a, b] = await Promise.all([
      nextCashAdvanceDisplayId(makeClient(), OPCO, REF),
      nextCashAdvanceDisplayId(makeClient(), OPCO, REF),
    ]);

    // Distinct numbers — the race is gone.
    expect(new Set([a, b]).size).toBe(2);
    expect([a, b].sort()).toEqual(["CA-2026-0001", "CA-2026-0002"]);
  });
});
