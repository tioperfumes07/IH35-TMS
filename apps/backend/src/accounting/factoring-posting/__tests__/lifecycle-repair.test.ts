/**
 * Strict already_posted repair — adversarial cases (CPA VETO 0280-05).
 * Memo alone never authorizes overwrite; ambiguous/foreign provenance fail closed.
 */
import { describe, expect, it, vi } from "vitest";
import {
  findStrictLifecycleRepairCandidate,
  attachFactoringLifecycleSourceLinksStrict,
  claimFactoringLifecyclePostingKey,
  findLiveLifecyclePostingKeyJe,
} from "../lifecycle-repair.js";

const OPCO = "11111111-1111-4111-8111-111111111111";
const ADVANCE_A = "22222222-2222-4222-8222-222222222222";
const ADVANCE_B = "33333333-3333-4333-8333-333333333333";

describe("findStrictLifecycleRepairCandidate", () => {
  it("returns unique authoritative candidate (entity + lifecycle source + advance + balanced)", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("information_schema.columns")) return { rows: [{ n: "0" }] };
      if (sql.includes("source_transaction_type = $2") && sql.includes("SELECT je.id")) {
        return { rows: [{ id: "je-auth" }] };
      }
      return { rows: [] };
    });
    const result = await findStrictLifecycleRepairCandidate(
      { query },
      {
        operating_company_id: OPCO,
        factoring_advance_id: ADVANCE_A,
        source_transaction_type: "factoring_advance",
        memo: "Factoring funding FAC-0001",
      }
    );
    expect(result).toEqual({ kind: "unique", journal_entry_id: "je-auth" });
  });

  it("ambiguous: two authoritative JEs ⇒ fail closed", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("information_schema.columns")) return { rows: [{ n: "0" }] };
      if (sql.includes("source_transaction_type = $2") && sql.includes("SELECT je.id")) {
        return { rows: [{ id: "je-1" }, { id: "je-2" }] };
      }
      return { rows: [] };
    });
    const result = await findStrictLifecycleRepairCandidate(
      { query },
      {
        operating_company_id: OPCO,
        factoring_advance_id: ADVANCE_A,
        source_transaction_type: "factoring_customer_payment",
      }
    );
    expect(result.kind).toBe("ambiguous");
    expect(result.journal_entry_id).toBeNull();
  });

  it("same memo + different advance provenance ⇒ invalid (never overwrite)", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("information_schema.columns")) return { rows: [{ n: "0" }] };
      if (sql.includes("source_transaction_type = $2") && sql.includes("SELECT je.id")) {
        return { rows: [] };
      }
      if (sql.includes("je.memo = $2") && sql.includes("source_transaction_id IS NOT NULL")) {
        return { rows: [] }; // unlinked path empty
      }
      if (sql.includes("je.memo = $2") && sql.includes("status <> 'voided'")) {
        return { rows: [{ id: "je-foreign" }] };
      }
      return { rows: [] };
    });
    const result = await findStrictLifecycleRepairCandidate(
      { query },
      {
        operating_company_id: OPCO,
        factoring_advance_id: ADVANCE_A,
        source_transaction_type: "factoring_advance",
        memo: "Factoring funding FAC-SHARED",
      }
    );
    expect(result.kind).toBe("invalid");
    expect(result.reason).toMatch(/memo_collision/);
  });

  it("manual JE same memo with foreign source id ⇒ invalid", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("information_schema.columns")) return { rows: [{ n: "0" }] };
      if (sql.includes("source_transaction_type = $2")) return { rows: [] };
      if (sql.includes("source_transaction_id IS NOT NULL")) return { rows: [] };
      if (sql.includes("je.memo = $2")) return { rows: [{ id: "je-manual" }] };
      return { rows: [] };
    });
    const result = await findStrictLifecycleRepairCandidate(
      { query },
      {
        operating_company_id: OPCO,
        factoring_advance_id: ADVANCE_B,
        source_transaction_type: "factoring_advance",
        memo: "Manual adjustment FAC",
      }
    );
    expect(result.kind).toBe("invalid");
  });
});

// R-159.2 (Claude-Lead ruling): a reversed claim allows a revision claim under a NEW event_key
// ("<base>#revN") instead of permanently blocking re-post. An unreversed (still live) claim still
// refuses exactly as before -- idempotency is unchanged.
describe("claimFactoringLifecyclePostingKey", () => {
  it("first claim on a fresh event_key succeeds", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO accounting.factoring_lifecycle_posting_keys") && !sql.includes("reversal_of")) {
        return { rows: [{ journal_entry_id: "je-new" }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    const result = await claimFactoringLifecyclePostingKey(
      { query },
      {
        operating_company_id: OPCO,
        factoring_advance_id: ADVANCE_A,
        source_transaction_type: "factoring_advance",
        event_key: "funding",
        journal_entry_id: "je-new",
      }
    );
    expect(result).toBe("claimed");
  });

  it("conflict + prior claim still LIVE (unreversed) => already_claimed, no revision attempted", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO accounting.factoring_lifecycle_posting_keys") && !sql.includes("reversal_of")) {
        return { rows: [] }; // ON CONFLICT DO NOTHING -- no row back
      }
      if (sql.includes("(je.reversed_by_je_id IS NOT NULL) AS reversed")) {
        return { rows: [{ id: "prior-claim-1", reversed: false }] };
      }
      throw new Error(`unexpected query (should never reach revision logic): ${sql}`);
    });
    const result = await claimFactoringLifecyclePostingKey(
      { query },
      {
        operating_company_id: OPCO,
        factoring_advance_id: ADVANCE_A,
        source_transaction_type: "factoring_advance",
        event_key: "funding",
        journal_entry_id: "je-attempt",
      }
    );
    expect(result).toBe("already_claimed");
  });

  it("conflict + prior claim's JE was REVERSED => claims a #rev1 revision key, records reversal_of", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO accounting.factoring_lifecycle_posting_keys") && sql.includes("reversal_of")) {
        return { rows: [{ journal_entry_id: "je-revised" }] };
      }
      if (sql.includes("INSERT INTO accounting.factoring_lifecycle_posting_keys")) {
        return { rows: [] }; // original conflicting insert
      }
      if (sql.includes("(je.reversed_by_je_id IS NOT NULL) AS reversed")) {
        return { rows: [{ id: "prior-claim-1", reversed: true }] };
      }
      if (sql.includes("event_key LIKE")) {
        return { rows: [] }; // no existing revisions yet -> next is #rev1
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    const result = await claimFactoringLifecyclePostingKey(
      { query },
      {
        operating_company_id: OPCO,
        factoring_advance_id: ADVANCE_A,
        source_transaction_type: "factoring_advance",
        event_key: "funding",
        journal_entry_id: "je-revised",
      }
    );
    expect(result).toBe("claimed");
    const revisionInsert = query.mock.calls.find(
      (c) => String(c[0]).includes("INSERT INTO accounting.factoring_lifecycle_posting_keys") && String(c[0]).includes("reversal_of")
    );
    expect(revisionInsert).toBeDefined();
    const params = revisionInsert![1] as unknown[];
    expect(params[3]).toBe("funding#rev1"); // event_key
    expect(params[5]).toBe("prior-claim-1"); // reversal_of
  });

  it("picks #rev2 when #rev1 already exists", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO accounting.factoring_lifecycle_posting_keys") && sql.includes("reversal_of")) {
        return { rows: [{ journal_entry_id: "je-revised-2" }] };
      }
      if (sql.includes("INSERT INTO accounting.factoring_lifecycle_posting_keys")) {
        return { rows: [] };
      }
      if (sql.includes("(je.reversed_by_je_id IS NOT NULL) AS reversed")) {
        return { rows: [{ id: "prior-claim-2", reversed: true }] };
      }
      if (sql.includes("event_key LIKE")) {
        return { rows: [{ event_key: "funding#rev1" }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    const result = await claimFactoringLifecyclePostingKey(
      { query },
      {
        operating_company_id: OPCO,
        factoring_advance_id: ADVANCE_A,
        source_transaction_type: "factoring_advance",
        event_key: "funding",
        journal_entry_id: "je-revised-2",
      }
    );
    expect(result).toBe("claimed");
    const revisionInsert = query.mock.calls.find(
      (c) => String(c[0]).includes("INSERT INTO accounting.factoring_lifecycle_posting_keys") && String(c[0]).includes("reversal_of")
    );
    expect((revisionInsert![1] as unknown[])[3]).toBe("funding#rev2");
  });
});

describe("findLiveLifecyclePostingKeyJe", () => {
  it("returns the JE id when the claimed JE is still live (unreversed)", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("information_schema.columns")) return { rows: [{ n: "2" }] };
      if (sql.includes("FROM accounting.factoring_lifecycle_posting_keys k")) return { rows: [{ journal_entry_id: "je-live" }] };
      throw new Error(`unexpected query: ${sql}`);
    });
    const result = await findLiveLifecyclePostingKeyJe(
      { query },
      {
        operating_company_id: OPCO,
        factoring_advance_id: ADVANCE_A,
        source_transaction_type: "factoring_advance",
        event_key: "funding",
      }
    );
    expect(result).toBe("je-live");
  });

  it("returns null when the claimed JE has been reversed (the SQL's own AND-filter excludes it)", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("information_schema.columns")) return { rows: [{ n: "2" }] };
      if (sql.includes("FROM accounting.factoring_lifecycle_posting_keys k")) return { rows: [] };
      throw new Error(`unexpected query: ${sql}`);
    });
    const result = await findLiveLifecyclePostingKeyJe(
      { query },
      {
        operating_company_id: OPCO,
        factoring_advance_id: ADVANCE_A,
        source_transaction_type: "factoring_advance",
        event_key: "funding",
      }
    );
    expect(result).toBeNull();
  });
});

describe("attachFactoringLifecycleSourceLinksStrict", () => {
  it("throws on contradictory TSL / foreign provenance — never rewrite", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT jep.id") && sql.includes("LIMIT 1")) {
        return { rows: [{ id: "conflict-line" }] };
      }
      return { rows: [] };
    });
    await expect(
      attachFactoringLifecycleSourceLinksStrict(
        { query },
        {
          operating_company_id: OPCO,
          journal_entry_id: "je-1",
          factoring_advance_id: ADVANCE_A,
          source_transaction_type: "factoring_advance",
        }
      )
    ).rejects.toThrow("factoring_lifecycle_source_link_conflict");
    expect(query.mock.calls.some((c) => String(c[0]).includes("UPDATE"))).toBe(false);
  });
});
