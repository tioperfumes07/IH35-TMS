/**
 * ROW 99 + 113 (LEAD ROUND 8.24) — when the bank RE-ISSUES a pending purchase ("… ON MM/DD"), the older pending
 * generation ("PURCHASE MM/DD …") is retired at once: void + merged_into the re-issue, never DELETE.
 * Fail-old (live 2026-11-13): 5 purchases sat in Pending twice (e.g. −3,304.00 as "PURCHASE 11/10 IDCGR5EIM7J31UV"
 * and "PURCHASE RELAY … ON 11/10") until the posted line arrived.
 */
import { describe, expect, it } from "vitest";
import {
  RETIRE_ORPHAN_PENDING_GENERATION_SQL,
  RETIRE_PENDING_GENERATION_ON_REISSUE_SQL,
  retireOlderPendingGenerationOnReissue,
} from "../bank-tx-dedup.js";
import { bankLineIsFeedSupersessionArtifact } from "../bank-line-deletable.js";

describe("retireOlderPendingGenerationOnReissue", () => {
  it("uses the posted path's selection rule with its own void reason", () => {
    const strip = (s: string) => s.replace(/'replaced_by_plaid_(posted|pending_reissue):'/, "'R'");
    expect(strip(RETIRE_PENDING_GENERATION_ON_REISSUE_SQL)).toBe(strip(RETIRE_ORPHAN_PENDING_GENERATION_SQL));
    expect(RETIRE_PENDING_GENERATION_ON_REISSUE_SQL).toContain("voided_reason = 'replaced_by_plaid_pending_reissue:' || $3::text");
    expect(RETIRE_PENDING_GENERATION_ON_REISSUE_SQL).toContain("merged_into_bank_transaction_id = $2::uuid");
    expect(RETIRE_PENDING_GENERATION_ON_REISSUE_SQL).toContain("AND o.matched_journal_entry_id IS NULL");
    expect(RETIRE_PENDING_GENERATION_ON_REISSUE_SQL).not.toMatch(/DELETE\s+FROM/i);
  });

  it("the re-issued pending is both the anchor and the survivor; matches move to it", async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    const client = {
      query: async (sql: string, values: unknown[] = []) => {
        calls.push({ sql, values });
        if (sql === RETIRE_PENDING_GENERATION_ON_REISSUE_SQL) return { rows: [{ id: "gen1" }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
    };
    const ids = await retireOlderPendingGenerationOnReissue(client, {
      reissuedPendingId: "gen2", reissuedPlaidTransactionId: "plaid_gen2", operatingCompanyId: "c", bankAccountId: "bofa",
    });
    expect(ids).toEqual(["gen1"]);
    expect(calls[0].values).toEqual(["gen2", "gen2", "plaid_gen2", "c", "bofa"]);
    expect(calls.length).toBeGreaterThan(1); // reconciliation matches repointed to the survivor
  });

  it("a row retired on re-issue is a feed-supersession artifact, not an operator void", () => {
    expect(bankLineIsFeedSupersessionArtifact("bt")).toContain("bt.voided_reason LIKE 'replaced_by_plaid_pending_reissue:%'");
  });
});
