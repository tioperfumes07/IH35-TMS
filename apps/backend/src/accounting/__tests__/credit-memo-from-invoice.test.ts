// ACCT-F11101 (owner 11-04 08:44 CT: "7-ok folow qb") — a SENT invoice is never rewritten; a credit memo corrects it.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAudit, mockLink } = vi.hoisted(() => ({ mockAudit: vi.fn(), mockLink: vi.fn() }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: mockAudit }));
vi.mock("../accounting-spine-emit.js", () => ({ writeTransactionSourceLink: mockLink }));

import {
  INVOICE_NOT_DRAFT_MESSAGE,
  creditMemoTargetInvoiceRefusal,
  invoiceNotDraftMessage,
  recordFactoredInvoiceCreditMemoLink,
} from "../credit-memo-from-invoice.service.js";
import { ensureDraftInvoice } from "../invoice-line-create.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";

function invClient(row: Record<string, unknown> | null) {
  return { query: vi.fn(async () => ({ rows: row ? [row] : [] })) };
}

beforeEach(() => {
  mockAudit.mockReset();
  mockLink.mockReset();
});

describe("sent invoice amount writers refuse and point at the credit memo", () => {
  it("ensureDraftInvoice on a SENT invoice refuses with the credit-memo message", async () => {
    const c = invClient({ id: "inv-1", status: "sent" });
    const r = await ensureDraftInvoice(c as never, "inv-1", OPCO);
    expect(r).toMatchObject({ ok: false, code: 409, error: "invoice_not_draft" });
    expect((r as { message?: string }).message).toBe(INVOICE_NOT_DRAFT_MESSAGE);
    expect(INVOICE_NOT_DRAFT_MESSAGE).toMatch(/Create credit memo/);
  });
  it("a draft stays editable; void and proforma get their own message", async () => {
    expect(await ensureDraftInvoice(invClient({ id: "inv-1", status: "draft" }) as never, "inv-1", OPCO)).toMatchObject({ ok: true });
    expect(invoiceNotDraftMessage("void")).toMatch(/void/);
    expect(invoiceNotDraftMessage("proforma")).not.toMatch(/credit memo/);
    for (const s of ["sent", "partial", "paid", "factored"]) expect(invoiceNotDraftMessage(s)).toBe(INVOICE_NOT_DRAFT_MESSAGE);
  });
});

describe("creditMemoTargetInvoiceRefusal — the invoice a credit memo is created from", () => {
  const base = { operatingCompanyId: OPCO, invoiceId: "inv-1", customerId: "cust-1", amountCents: 5000, applyToInvoice: true };
  it("a sent invoice of the same customer with room is accepted", async () => {
    expect(await creditMemoTargetInvoiceRefusal(invClient({ status: "sent", customer_id: "cust-1", display_id: "13693", remaining: "150000" }) as never, base)).toBeNull();
  });
  it("draft / proforma refused (edit the draft), void refused", async () => {
    expect(await creditMemoTargetInvoiceRefusal(invClient({ status: "draft", customer_id: "cust-1", display_id: "1", remaining: "1" }) as never, base)).toMatchObject({ code: 409, error: "invoice_not_issued" });
    expect(await creditMemoTargetInvoiceRefusal(invClient({ status: "proforma", customer_id: "cust-1", display_id: "1", remaining: "1" }) as never, base)).toMatchObject({ error: "invoice_not_issued" });
    expect(await creditMemoTargetInvoiceRefusal(invClient({ status: "void", customer_id: "cust-1", display_id: "1", remaining: "0" }) as never, base)).toMatchObject({ error: "invoice_voided" });
    expect(await creditMemoTargetInvoiceRefusal(invClient(null) as never, base)).toMatchObject({ code: 404 });
  });
  it("another customer's invoice is refused", async () => {
    expect(await creditMemoTargetInvoiceRefusal(invClient({ status: "sent", customer_id: "cust-2", display_id: "1", remaining: "99999" }) as never, base)).toMatchObject({ code: 422, error: "invoice_customer_mismatch" });
  });
  it("applied now: more than the open balance is refused; unapplied (customer credit) is not capped", async () => {
    const row = { status: "paid", customer_id: "cust-1", display_id: "1", remaining: "0" };
    expect(await creditMemoTargetInvoiceRefusal(invClient(row) as never, base)).toMatchObject({ code: 422, error: "applied_cents_exceeds_invoice_balance" });
    expect(await creditMemoTargetInvoiceRefusal(invClient(row) as never, { ...base, applyToInvoice: false })).toBeNull();
  });
});

describe("factored invoice — the credit memo is linked to the Faro purchase, no Faro posting", () => {
  function factClient(pos: Record<string, unknown>) {
    return {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM accounting.invoices i")) return { rows: [pos] };
        if (sql.includes("FROM accounting.journal_entry_postings")) return { rows: [{ id: "p1" }, { id: "p2" }] };
        return { rows: [] };
      }),
    };
  }
  it("links every credit-memo leg to the purchase and audits the Faro invoice number; never INSERTs a posting", async () => {
    const c = factClient({ purchase_id: "pur-1", purchase_display_id: "FP-0007", faro_invoice_number: "012", factoring_advance_id: null });
    const r = await recordFactoredInvoiceCreditMemoLink(c as never, { operatingCompanyId: OPCO, creditMemoId: "cm-1", invoiceId: "inv-1", journalEntryId: "je-1", amountCents: 5000, userId: "u" });
    expect(r).toMatchObject({ factored: true, purchase_id: "pur-1", faro_invoice_number: "012", links_written: 2 });
    expect(mockLink.mock.calls.map((x) => `${x[1].linked_object_type}:${x[1].linked_object_id}`)).toEqual(["factoring_purchase:pur-1", "factoring_purchase:pur-1"]);
    expect(mockAudit.mock.calls[0]![2]).toBe("accounting.credit_memos.factored_invoice_credit_memo");
    expect(c.query.mock.calls.some((x) => /INSERT INTO accounting\.(journal_entr|faro_reserve|factoring)/.test(String(x[0])))).toBe(false);
  });
  it("an invoice that is not factored writes nothing", async () => {
    const c = factClient({ purchase_id: null, purchase_display_id: null, faro_invoice_number: null, factoring_advance_id: null });
    const r = await recordFactoredInvoiceCreditMemoLink(c as never, { operatingCompanyId: OPCO, creditMemoId: "cm-1", invoiceId: "inv-1", journalEntryId: "je-1", amountCents: 5000, userId: "u" });
    expect(r.factored).toBe(false);
    expect(mockLink).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });
});
