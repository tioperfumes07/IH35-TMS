import * as client from "./client";
import { matchAccountingReconciliation, unmatchAccountingReconciliation } from "./accounting";
import { bulkUpdateClasses } from "./catalogs-accounting";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression: money-path api clients must pass a RAW OBJECT body to apiRequest
// (apiRequest does the single JSON.stringify). A pre-stringified body double-encodes
// to '"{...}"' and the server rejects with 400 "expected object, received string".
describe("money-path api clients send a raw object body (double-stringify regression)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("matchAccountingReconciliation POSTs a raw object body", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ ok: true, result: {} } as never);
    const input = {
      operating_company_id: "co-1",
      bank_transaction_id: "bt-1",
      ledger_entry_kind: "payment" as const,
      ledger_entry_id: "le-1",
    };
    await matchAccountingReconciliation(input);
    const [path, options] = spy.mock.calls[0];
    expect(path).toBe("/api/v1/accounting/reconciliation/match");
    expect(options?.method).toBe("POST");
    expect(typeof options?.body).toBe("object");
    expect(options?.body).toEqual(input);
  });

  it("unmatchAccountingReconciliation PATCHes a raw object body", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ ok: true } as never);
    const input = {
      operating_company_id: "co-1",
      bank_transaction_id: "bt-1",
      ledger_entry_kind: "je" as const,
      ledger_entry_id: "le-2",
    };
    await unmatchAccountingReconciliation(input);
    const [, options] = spy.mock.calls[0];
    expect(options?.method).toBe("PATCH");
    expect(typeof options?.body).toBe("object");
    expect(options?.body).toEqual(input);
  });

  it("bulkUpdateClasses POSTs a raw object body", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ updated: 2 } as never);
    const payload = { op: "deactivate" as const, ids: ["c1", "c2"] };
    await bulkUpdateClasses(payload);
    const [path, options] = spy.mock.calls[0];
    expect(path).toBe("/api/v1/catalogs/classes/bulk");
    expect(typeof options?.body).toBe("object");
    expect(options?.body).toEqual(payload);
  });
});
