/**
 * Strict already_posted repair — adversarial cases (CPA VETO 0280-05).
 * Memo alone never authorizes overwrite; ambiguous/foreign provenance fail closed.
 */
import { describe, expect, it, vi } from "vitest";
import {
  findStrictLifecycleRepairCandidate,
  attachFactoringLifecycleSourceLinksStrict,
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
