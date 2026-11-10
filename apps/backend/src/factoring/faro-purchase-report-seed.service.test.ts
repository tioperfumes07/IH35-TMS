import { beforeEach, describe, expect, it, vi } from "vitest";

const createPurchaseDraft = vi.fn();
const postPurchase = vi.fn();
const runPurchaseFeedGate = vi.fn();
const enrichFaroPreviewLines = vi.fn();

vi.mock("../accounting/db-scope.js", () => ({ withCompanyScope: vi.fn() }));
vi.mock("../dispatch/load-billing-lifecycle.service.js", () => ({ syncLoadsForFactoringAdvance: vi.fn() }));
vi.mock("./purchase-candidates.service.js", () => ({ runPurchaseFeedGate: (...a: unknown[]) => runPurchaseFeedGate(...a) }));
vi.mock("./purchase.service.js", () => ({
  createPurchaseDraft: (...a: unknown[]) => createPurchaseDraft(...a),
  postPurchase: (...a: unknown[]) => postPurchase(...a),
  FactoringPurchaseError: class extends Error {
    constructor(readonly code: string, readonly statusCode: number, readonly details?: unknown) {
      super(code);
    }
  },
}));
vi.mock("./faro-csv-import.js", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, enrichFaroPreviewLines: (...a: unknown[]) => enrichFaroPreviewLines(...a) };
});

import { seedFaroPurchaseReport } from "./faro-purchase-report-seed.service.js";

const HEAD = "Debtor,Date,Inv #,PO,Other Ref,Purchase,Escrow Rsv,Cash Rsv,Discount,Fees,Dispatch,Net Adv,Receipts,Sch Fee,ChgBack (Refund),,Non-purchased";
// Three real rows of the owner's 11-09 export: two on 10/16 (one wire), one on 10/15.
const CSV = [
  HEAD,
  'Gampac Express Inc,10/15/2026,152,31408-59454,,"2,300.00",0.00,34.50,34.50,10.00,0.00,"2,221.00","2,300.00",0.00,0.00,,',
  'JEAR LOGISTICS,10/16/2026,153,1186296,,"4,000.00",60.00,0.00,60.00,0.00,0.00,"3,880.00",0.00,0.00,0.00,,',
  'ES Logistics,10/16/2026,155,ES6921,,"4,400.00",66.00,0.00,66.00,0.00,0.00,"4,268.00",0.00,0.00,0.00,,',
].join("\n");

const INV: Record<string, string> = { "31408-59454": "inv-152", "1186296": "inv-160", ES6921: "inv-157" };

function client(present: Record<string, string> = {}) {
  return {
    query: async (sql: string) => {
      if (sql.includes("FROM mdata.vendors")) return { rows: [{ id: "vendor-faro" }] };
      if (sql.includes("faro_invoice_number = ANY")) return { rows: Object.entries(present).map(([n, d]) => ({ faro_invoice_number: n, display_id: d })) };
      if (sql.includes("FROM accounting.invoices")) return { rows: Object.values(INV).map((id) => ({ id, display_id: id.toUpperCase() })) };
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
}

const run = (commit: boolean, present: Record<string, string> = {}, csv = CSV) =>
  seedFaroPurchaseReport({
    actorUserId: "owner-1",
    operatingCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80",
    csvText: csv,
    sourceFilename: "faro purchase report.csv",
    commit,
    scope: async (fn) => fn(client(present) as never),
    syncLoads: async () => {},
  });

describe("ACCT-F11108 Faro purchase report seed", () => {
  beforeEach(() => {
    enrichFaroPreviewLines.mockReset().mockImplementation(async (_c: unknown, _o: string, lines: Array<{ invoice_number: string; match_key?: string }>) =>
      lines.map((l) => ({ ...l, invoice_id: l.invoice_number ? "WRONG-PATH" : INV[l.match_key ?? ""] ?? null })),
    );
    let n = 0;
    createPurchaseDraft.mockReset().mockImplementation(async (_c: unknown, input: { lines: Array<{ gross_cents: number; escrow_reserve_cents: number; cash_reserve_cents: number; fee_cents: number }>; wireFeeCents: number }) => {
      n += 1;
      const s = (k: "gross_cents" | "escrow_reserve_cents" | "cash_reserve_cents" | "fee_cents") => input.lines.reduce((a, l) => a + l[k], 0);
      return { id: `p-${n}`, display_id: `FP-2026-0010${n}`, net_to_company_cents: s("gross_cents") - s("escrow_reserve_cents") - s("fee_cents") - s("cash_reserve_cents") - input.wireFeeCents };
    });
    postPurchase.mockReset().mockResolvedValue({ detail: {}, factoringAdvanceId: "adv-1" });
    runPurchaseFeedGate.mockReset().mockImplementation(async (_c: unknown, _o: string, ids: string[]) => ids.map((id) => ({ invoice_id: id, passed: true, reds: [] })));
  });

  it("posts one purchase per Faro date through the engine, Faro's own figures per line, tied to Net Adv", async () => {
    const out = await run(true);
    expect(out.posted).toEqual({ count: 3, gross_cents: 1070000, purchases: 2 });
    expect(createPurchaseDraft).toHaveBeenCalledTimes(2);
    const d16 = createPurchaseDraft.mock.calls[1]![1] as Record<string, unknown>;
    expect(d16).toMatchObject({ purchaseDate: "2026-10-16", factoringCompanyVendorId: "vendor-faro", wireFeeCents: 0, docsOverrideCode: null });
    expect((d16.lines as unknown[])[0]).toEqual({ invoice_id: "inv-160", gross_cents: 400000, escrow_reserve_cents: 6000, cash_reserve_cents: 0, fee_cents: 6000, faro_invoice_number: "153" });
    const d15 = createPurchaseDraft.mock.calls[0]![1] as Record<string, unknown>;
    expect(d15).toMatchObject({ purchaseDate: "2026-10-15", wireFeeCents: 1000 });
    expect(out.dates.find((d) => d.purchase_date === "2026-10-15")).toMatchObject({ outcome: "posted", engine_net_cents: 222100, faro_net_advance_cents: 222100 });
    expect(postPurchase).toHaveBeenCalledTimes(2);
  });

  it("matches by PO only — Faro's Inv # never reaches the invoice-number path", async () => {
    await run(false);
    const passed = enrichFaroPreviewLines.mock.calls[0]![2] as Array<{ invoice_number: string }>;
    expect(passed.every((l) => l.invoice_number === "")).toBe(true);
  });

  it("delta only: a Faro Inv # already on a live purchase is already_present; a partly-present date is held whole", async () => {
    const out = await run(true, { "152": "FP-2026-00026", "153": "FP-2026-00027" });
    expect(out.already_present.count).toBe(2);
    expect(out.dates.find((d) => d.purchase_date === "2026-10-15")!.outcome).toBe("already_present");
    expect(out.dates.find((d) => d.purchase_date === "2026-10-16")).toMatchObject({ outcome: "held" });
    expect(createPurchaseDraft).not.toHaveBeenCalled();
  });

  it("an unmatched PO holds its whole date and names the PO", async () => {
    enrichFaroPreviewLines.mockImplementation(async (_c: unknown, _o: string, lines: Array<{ match_key?: string }>) =>
      lines.map((l) => ({ ...l, invoice_id: l.match_key === "ES6921" ? null : INV[l.match_key ?? ""] ?? null })),
    );
    const out = await run(true);
    expect(out.lines.find((l) => l.faro_invoice_number === "155")!.reason).toMatch(/no_invoice_for_po.*ES6921/);
    expect(out.lines.find((l) => l.faro_invoice_number === "153")!.outcome).toBe("held");
    expect(createPurchaseDraft).toHaveBeenCalledTimes(1);
  });

  it("refuses a wire that does not tie to Faro's Net Adv (never posts)", async () => {
    createPurchaseDraft.mockImplementation(async () => ({ id: "p", display_id: "FP", net_to_company_cents: 1 }));
    const out = await run(true);
    expect(out.posted.count).toBe(0);
    expect(out.dates.every((d) => /faro_wire_tie_out|engine net/.test(String(d.reason)))).toBe(true);
    expect(postPurchase).not.toHaveBeenCalled();
  });

  it("preview runs the engine and rolls back: nothing posted; the feed gate runs inside a rolled-back scope", async () => {
    runPurchaseFeedGate.mockReset().mockImplementation(async (_c: unknown, _o: string, ids: string[]) => ids.map((id) => ({ invoice_id: id, passed: true })));
    const rolledBack: string[] = [];
    const out = await seedFaroPurchaseReport({
      actorUserId: "owner-1",
      operatingCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80",
      csvText: CSV,
      sourceFilename: "faro purchase report.csv",
      commit: false,
      scope: async (fn) => {
        try {
          return await fn(client() as never);
        } catch (e) {
          rolledBack.push((e as Error).message);
          throw e;
        }
      },
      syncLoads: async () => {},
    });
    expect(out.dates.map((d) => d.outcome)).toEqual(["would_post", "would_post"]);
    expect(postPurchase).not.toHaveBeenCalled();
    expect(runPurchaseFeedGate).toHaveBeenCalledTimes(2);
    expect(rolledBack.filter((m) => m === "preview_gate_rollback")).toHaveLength(2);
  });

  it("preview answers what the commit does: a red feed gate holds the date in the preview too (real 10-15 / 152-13680)", async () => {
    runPurchaseFeedGate.mockReset().mockImplementation(async (_c: unknown, _o: string, ids: string[]) =>
      ids.map((id) => ({ invoice_id: id, passed: false, error: "feed_gate_blocked", reds: [{ check_key: "purchase.invoice_billing_docs" }] })),
    );
    const out = await run(false);
    expect(out.posted.count).toBe(0);
    expect(out.dates.every((d) => String(d.reason).startsWith("feed_gate_blocked"))).toBe(true);
    expect(createPurchaseDraft).not.toHaveBeenCalled();
  });

  it("a red feed gate holds the date (no owner override is ever supplied)", async () => {
    runPurchaseFeedGate.mockImplementation(async (_c: unknown, _o: string, ids: string[], _u: string, override: unknown) => {
      expect(override).toBeNull();
      return ids.map((id) => ({ invoice_id: id, passed: false, error: "feed_gate_blocked", reds: ["pod_missing"] }));
    });
    const out = await run(true);
    expect(out.posted.count).toBe(0);
    expect(out.held.count).toBe(3);
    expect(createPurchaseDraft).not.toHaveBeenCalled();
  });
});
