/**
 * ACCT-F11100 — QuickBooks bank-feed parity: pending lines never count; a posted line replaces BOTH
 * generations of its pending.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { clearedBankLine, pendingBankLine } from "./cleared-bank-line.sql.js";
import {
  RETIRE_ORPHAN_PENDING_GENERATION_SQL,
  retireOrphanPendingGenerations,
  retirePlaidPendingPredecessor,
} from "./bank-tx-dedup.js";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => readFileSync(join(here, rel), "utf8");

describe("clearedBankLine / pendingBankLine", () => {
  it("cleared excludes pending, voided, merged and sample lines", () => {
    const sql = clearedBankLine("bt");
    expect(sql).toContain("bt.voided_at IS NULL");
    expect(sql).toContain("bt.merged_into_bank_transaction_id IS NULL");
    expect(sql).toContain("COALESCE(bt.pending, false) = false");
    expect(sql).toContain("COALESCE(bt.is_sample_data, false) = false");
  });

  it("pending is the disjoint complement on the pending flag only", () => {
    const cleared = clearedBankLine("x");
    const pending = pendingBankLine("x");
    expect(pending).toContain("COALESCE(x.pending, false) = true");
    expect(pending.replace("= true)", "= false)")).toBe(cleared);
  });

  it("rejects an unsafe alias", () => {
    expect(() => clearedBankLine("bt; DROP")).toThrow();
  });

  it("every Banking total, balance, register, review list and the cash pulse read the one predicate", () => {
    const readers = [
      "./money-map.routes.ts",
      "./pending-categorization.ts",
      "./banking-kpi.service.ts",
      "./bank-tieout.service.ts",
      "./internal-wallet-balance.ts",
      "./banking.routes.ts",
      "../integrations/plaid/link.routes.ts",
      "../integrations/plaid/plaid.service.ts",
      "../cash-flow/cash-flow-bank-actuals.sql.ts",
    ];
    for (const r of readers) expect(src(r), r).toMatch(/clearedBankLine\(/);
    const mm = src("./money-map.routes.ts");
    expect(mm).toContain("pendingBankLine(");
    expect(mm).toContain("pending_lines");
    // the old filter that let pending lines into the tiles is gone
    expect(mm).not.toMatch(/AND bt\.voided_at IS NULL\s*\n\s*AND bt\.is_sample_data IS NOT TRUE/);
  });
});

describe("retireOrphanPendingGenerations (Plaid ingest root cause)", () => {
  it("is void + merged_into, never DELETE, and never touches a financially linked row", () => {
    const sql = RETIRE_ORPHAN_PENDING_GENERATION_SQL;
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).toContain("merged_into_bank_transaction_id = $2::uuid");
    expect(sql).toContain("o.pending = true");
    expect(sql).toContain("o.matched_journal_entry_id IS NULL");
    expect(sql).toContain("o.reconciled_obligation_id IS NULL");
    expect(sql).toContain("o.categorization_gl_account_id IS NULL");
    expect(sql).toContain("o.created_at < r.created_at");
    expect(sql).toContain("o.amount_cents = r.amount_cents");
    expect(sql).toContain("LIMIT 1");
  });

  it("repoints matches onto the posted survivor for each orphan it retires", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      async query(sql: string, values?: unknown[]) {
        calls.push({ sql, values });
        if (sql === RETIRE_ORPHAN_PENDING_GENERATION_SQL) return { rows: [{ id: "gen1" }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
    };
    const ids = await retireOrphanPendingGenerations(client, {
      retiredPendingId: "gen2",
      postedRowId: "posted",
      postedPlaidTransactionId: "plaid-posted",
      operatingCompanyId: "co",
      bankAccountId: "acct",
    });
    expect(ids).toEqual(["gen1"]);
    expect(calls[0]?.values).toEqual(["gen2", "posted", "plaid-posted", "co", "acct"]);
    expect(calls.some((c) => c.sql.includes("UPDATE banking.reconciliation_matches") || c.sql.includes("survivor"))).toBe(true);
  });

  it("a posted line that retires its named pending also retires the older generation (fails on old code)", async () => {
    const calls: string[] = [];
    const client = {
      async query(sql: string) {
        calls.push(sql);
        if (sql === RETIRE_ORPHAN_PENDING_GENERATION_SQL) return { rows: [{ id: "b9470c21" }], rowCount: 1 };
        if (sql.includes("WHERE plaid_transaction_id = $1::text")) {
          return {
            rows: [{ id: "0bd89507", matched_journal_entry_id: null, reconciled_obligation_id: null, categorization_gl_account_id: null }],
          };
        }
        if (sql.includes("replaced_by_plaid_posted") && sql.includes("RETURNING id")) return { rows: [{ id: "0bd89507" }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
    };
    const res = await retirePlaidPendingPredecessor(client, {
      postedRowId: "05e4f91a",
      postedPlaidTransactionId: "MV43O989vkIYvXZB3ZwNCVAOg5gZrKf5yeA9e",
      pendingPlaidTransactionId: "A4POEnrn6dIYvMwmNw64ugPnY9JYNYuMN0bOD",
      operatingCompanyId: "co",
      bankAccountId: "acct",
    });
    expect(res).toEqual({ retired: true, pending_id: "0bd89507", orphan_pending_ids: ["b9470c21"] });
    expect(calls).toContain(RETIRE_ORPHAN_PENDING_GENERATION_SQL);
  });
});
