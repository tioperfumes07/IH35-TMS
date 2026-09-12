import { describe, expect, it, vi } from "vitest";

import {
  allocateSettlementDocumentNumber,
  allocateSettlementDocumentNumberIfMissing,
} from "../settlement-document-number-allocator.js";

// P1 SETTLEMENT NUMBERING (Claude Lead, ROUND 18.3, Item A) — the AlwaysTrack document number
// (driver_finance.driver_settlements.source_document_ref) is allocated at tour close under a
// per-company pg_advisory_xact_lock BEFORE the MAX(source_document_ref::int) read, so two
// concurrent tour closes for the same company serialize instead of racing on a bare
// read-then-write and colliding against uq_driver_settlements_source_document_ref_live. Mirrors
// cash-advance-requests' own advisory-lock ordering test
// (cash-advance-request-display-id-advisory-lock.test.ts).

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";

describe("allocateSettlementDocumentNumber — advisory lock (Item A)", () => {
  it("acquires the advisory lock BEFORE running the MAX(source_document_ref) read", async () => {
    const order: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("pg_advisory_xact_lock")) {
          order.push("lock");
          return { rows: [{}] };
        }
        if (sql.includes("MAX(")) {
          order.push("max");
          return { rows: [{ next: "1" }] };
        }
        return { rows: [] };
      }),
    };

    const next = await allocateSettlementDocumentNumber(client as never, OPCO);

    expect(next).toBe("1");
    expect(order).toEqual(["lock", "max"]);
    expect(order.indexOf("lock")).toBeLessThan(order.indexOf("max"));
  });

  it("locks on a stable per-company key, not a global or per-call key", async () => {
    let lockKey: unknown = null;
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes("pg_advisory_xact_lock")) {
          lockKey = params[0];
          return { rows: [{}] };
        }
        return { rows: [{ next: "1" }] };
      }),
    };

    await allocateSettlementDocumentNumber(client as never, OPCO);

    expect(lockKey).toBe(OPCO);
  });

  it("returns MAX(source_document_ref::int) + 1, ignoring non-numeric refs via the SQL filter", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("pg_advisory_xact_lock")) return { rows: [{}] };
        expect(sql).toContain("source_document_ref ~ '^[0-9]+$'");
        return { rows: [{ next: "5811" }] };
      }),
    };

    const next = await allocateSettlementDocumentNumber(client as never, OPCO);
    expect(next).toBe("5811");
  });
});

describe("allocateSettlementDocumentNumberIfMissing — never overwrites an existing number", () => {
  it("no-ops and returns null when the settlement already has a source_document_ref", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("SELECT source_document_ref")) {
          return { rows: [{ source_document_ref: "5782" }] };
        }
        throw new Error(`unexpected query when a number already exists: ${sql}`);
      }),
    };

    const result = await allocateSettlementDocumentNumberIfMissing(client as never, "settlement-1", OPCO);
    expect(result).toBeNull();
  });

  it("allocates and writes a number when source_document_ref is NULL", async () => {
    const written: unknown[] = [];
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes("SELECT source_document_ref")) return { rows: [{ source_document_ref: null }] };
        if (sql.includes("pg_advisory_xact_lock")) return { rows: [{}] };
        if (sql.includes("MAX(")) return { rows: [{ next: "5811" }] };
        if (sql.includes("UPDATE driver_finance.driver_settlements")) {
          written.push(params);
          return { rows: [] };
        }
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    const result = await allocateSettlementDocumentNumberIfMissing(client as never, "settlement-1", OPCO);
    expect(result).toBe("5811");
    expect(written).toEqual([["settlement-1", "5811"]]);
  });
});
