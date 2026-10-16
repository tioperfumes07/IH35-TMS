// LEAD 443.171 B — partial purchase (owner: "we sent an invoice to Faro for 4000, they only purchased 3000"): the purchase line
// carries the PURCHASED gross; reserves / fee default on it; a gross above the invoice open balance is refused by name.
// On the old code createPurchaseDraft had no upper cap — the "exceeds open" case fails there.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../owner-only-purchase.js", () => ({ checkFactoringPurchaseOwner: vi.fn(async () => true) }));
vi.mock("../factor.service.js", () => ({
  resolvePurchaseRate: vi.fn(async () => ({ factor_id: "f-1", factor_name: "Faro", reserve: 0.015, cash: 0, fee: 0.015, source: "customer_assignment", reason: null })),
}));
vi.mock("../../accounting/display-id.js", () => ({ nextFactoringPurchaseDisplayId: vi.fn(async () => "FP-2026-09999"), nextFactoringDisplayId: vi.fn(async () => "FAC-2026-09999") }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));

const { createPurchaseDraft, FactoringPurchaseError } = await import("../purchase.service.js");

const OCI = "5c854333-6ea5-4faa-af31-67cb272fef80";
const calls: Array<{ sql: string; values?: unknown[] }> = [];
const client = {
  query: vi.fn(async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    if (sql.includes("FROM mdata.vendors")) return { rows: [{ id: "vendor-faro" }] };
    if (sql.includes("AS pledge_cents")) return { rows: [{ id: "inv-1", display_id: "138-13658", customer_id: "cust-1", load_id: "load-1", status: "sent", factoring_status: "not_factored", pledge_cents: "400000", settlement_id: null, on_purchase: false }] };
    if (sql.includes("INSERT INTO accounting.factoring_purchases")) return { rows: [{ id: "p-1" }] };
    if (sql.includes("FROM accounting.factoring_purchases")) return { rows: [{ id: "p-1", display_id: "FP-2026-09999", status: "draft" }] }; // the detail read-back
    return { rows: [], rowCount: 1 };
  }),
};
const base = { operatingCompanyId: OCI, actorUserId: "owner", factoringCompanyVendorId: "vendor-faro", purchaseDate: "2026-10-16" };

describe("443.171 B — partial purchase", () => {
  beforeEach(() => { calls.length = 0; client.query.mockClear(); });

  it("refuses a purchased gross above the invoice open balance (purchase_line_gross_exceeds_open)", async () => {
    await expect(createPurchaseDraft(client as never, { ...base, lines: [{ invoice_id: "inv-1", gross_cents: 400001 }] })).rejects.toMatchObject({ code: "purchase_line_gross_exceeds_open", statusCode: 409 });
    expect(calls.some((c) => c.sql.includes("INSERT INTO accounting.factoring_purchases"))).toBe(false);
  });

  it("refuses a purchased gross of 0", async () => {
    await expect(createPurchaseDraft(client as never, { ...base, lines: [{ invoice_id: "inv-1", gross_cents: 0 }] })).rejects.toBeInstanceOf(FactoringPurchaseError);
  });

  it("3,000 of a 4,000 invoice: the line and the head carry 3,000; escrow / fee default on 3,000 (1.5% = 45.00 each)", async () => {
    await createPurchaseDraft(client as never, { ...base, lines: [{ invoice_id: "inv-1", gross_cents: 300000 }] });
    const head = calls.find((c) => c.sql.includes("INSERT INTO accounting.factoring_purchases"))!;
    // [oci, display, vendor, date, wire_date, ref, count, gross, escrow, cash, fee, wire, advance, net, ...]
    expect(head.values!.slice(7, 14)).toEqual([300000, 4500, 0, 4500, 0, 291000, 291000]);
    const line = calls.find((c) => c.sql.includes("INSERT INTO accounting.factoring_purchase_lines"))!;
    expect(line.values!.slice(7, 11)).toEqual([300000, 4500, 0, 4500]);
  });
});
