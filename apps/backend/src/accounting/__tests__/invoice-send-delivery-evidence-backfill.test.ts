import { describe, expect, it, vi } from "vitest";

/**
 * Lead ruling item #2 P0 (2026-09-22), "A CLOSED SETTLEMENT IS DELIVERY EVIDENCE" — mode-aware
 * ACCT-F61 delivery-evidence gate. mode='historical_backfill' is the ONLY mode where a closed/
 * locked driver settlement or an un-superseded Faro invoice line may stand in for a real stop
 * actual_departure_at, and that substitution is always RECORDED on the invoice
 * (delivery_evidence_source / delivery_evidence_recorded_at, migration 202614240000) — never a
 * silent pass. A backfill that finds no evidence anywhere still fails closed, UNCONDITIONALLY,
 * regardless of the INVOICE_SEND_REQUIRES_DELIVERY_EVIDENCE flag's enforce/warn-only setting.
 *
 * Pure unit test — every side-effecting dependency mocked (email, GL posting, QBO push enqueue,
 * revrec latch, feature flag, audit). client.query is a hand-rolled SQL router so the exact shape
 * of every statement sendDraftInvoice issues is exercised, without ever touching a real database or
 * a real production invoice — deliberately NOT run live against prod (13595) because enqueueEmail
 * and the GL/QBO writers open their OWN connections outside any caller transaction, so a live run
 * that reached "sent" would send a real email / post real GL — an irreversible side effect a
 * rolled-back transaction cannot undo. This hermetic test is the honest way to prove the gate.
 */

const {
  mockAppendCrudAudit,
  mockEnqueueEmail,
  mockPostInvoiceGlIfEnabled,
  mockEnqueueTmsInvoicePushRequested,
  mockRecomputeInvoiceTotals,
  mockFinalActiveDeliveryDepartureAt,
  mockFireRevrecLatchOnInvoiceIssued,
  mockIsEnabled,
} = vi.hoisted(() => ({
  mockAppendCrudAudit: vi.fn(async () => undefined),
  mockEnqueueEmail: vi.fn(async () => ({ queueId: "q1" })),
  mockPostInvoiceGlIfEnabled: vi.fn(async () => ({ posted: false, reason: "posting_disabled" as const })),
  mockEnqueueTmsInvoicePushRequested: vi.fn(async () => undefined),
  mockRecomputeInvoiceTotals: vi.fn(async () => undefined),
  mockFinalActiveDeliveryDepartureAt: vi.fn(async () => null as string | null),
  mockFireRevrecLatchOnInvoiceIssued: vi.fn(async () => undefined),
  mockIsEnabled: vi.fn(async () => false),
}));

// Paths below resolve relative to THIS file (apps/backend/src/accounting/__tests__/) — one
// directory deeper than invoice-send.service.ts itself, so every path needs an extra "../".
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: mockAppendCrudAudit }));
vi.mock("../../email/queue.service.js", () => ({ enqueueEmail: mockEnqueueEmail }));
vi.mock("../invoice-gl.service.js", () => ({ postInvoiceGlIfEnabled: mockPostInvoiceGlIfEnabled }));
vi.mock("../../qbo/tms-invoice-push-chain.service.js", () => ({
  enqueueTmsInvoicePushRequested: mockEnqueueTmsInvoicePushRequested,
}));
vi.mock("../shared.js", () => ({ recomputeInvoiceTotals: mockRecomputeInvoiceTotals }));
vi.mock("../revrec-delivery-posting/poster.service.js", () => ({
  finalActiveDeliveryDepartureAt: mockFinalActiveDeliveryDepartureAt,
  fireRevrecLatchOnInvoiceIssued: mockFireRevrecLatchOnInvoiceIssued,
}));
vi.mock("../../lib/feature-flags/service.js", () => ({ isEnabled: mockIsEnabled }));

const { sendDraftInvoice } = await import("../invoice-send.service.js");

const INVOICE_ID = "aaaaaaaa-1111-4111-8111-111111111111";
const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LOAD_ID = "bbbbbbbb-2222-4222-8222-222222222222";
const USER_ID = "00000000-0000-4000-8000-000000000001";

const DRAFT_INVOICE_ROW = {
  id: INVOICE_ID,
  status: "draft",
  source_load_id: LOAD_ID,
  customer_id: "cccccccc-3333-4333-8333-333333333333",
  issue_date: "2026-08-15",
};

const REVENUE_LINE_ROW = {
  id: "dddddddd-4444-4444-8444-444444444444",
  line_type: "linehaul",
  line_total_cents: 250000,
  account_id: "eeeeeeee-5555-4555-8555-555555555555",
  qbo_item_id: null,
};

type QueryFn = (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;

/** Router shared by all three tests; `settlementFound`/`faroFound` model the DB state the real
 * backfillDeliveryEvidence query would see. */
function makeClient(opts: { settlementFound: boolean; faroFound: boolean }): { query: QueryFn } {
  const query: QueryFn = vi.fn(async (sql: string) => {
    if (sql.includes("FROM accounting.invoices WHERE id")) {
      return { rows: [DRAFT_INVOICE_ROW] };
    }
    if (sql.includes("FROM accounting.invoice_lines")) {
      return { rows: [REVENUE_LINE_ROW] };
    }
    if (sql.includes("driver_finance.settlement_lines")) {
      return { rows: opts.settlementFound ? [{ id: "settlement-1" }] : [] };
    }
    if (sql.includes("factor.faro_invoice_lines")) {
      return { rows: opts.faroFound ? [{ id: "faro-1" }] : [] };
    }
    if (sql.startsWith("\n      UPDATE accounting.invoices SET delivery_evidence_source")) {
      return { rows: [] };
    }
    if (sql.includes("factoring.customer_factor_assignment")) {
      return { rows: [] }; // no factor assignment -> NOA check skipped
    }
    if (sql.includes("UPDATE accounting.invoices") && sql.includes("status = 'sent'")) {
      return { rows: [] };
    }
    if (sql.includes("FROM accounting.invoices i") && sql.includes("LEFT JOIN mdata.customers")) {
      return { rows: [{ display_id: "13595", issue_date: "2026-08-15", currency_code: "USD", total_cents: 250000, customer_notes: null, internal_notes: null, customer_name: "Test Customer", customer_email: "" }] };
    }
    return { rows: [] };
  });
  return { query };
}

describe("ACCT-F61 mode-aware delivery-evidence gate (Lead ruling item #2 P0, 2026-09-22)", () => {
  it("RED — mode omitted (fails closed as live_feed): no stop departure, flag enforced -> 409, never reaches send", async () => {
    mockFinalActiveDeliveryDepartureAt.mockResolvedValue(null);
    mockIsEnabled.mockResolvedValue(true); // enforce ON
    const client = makeClient({ settlementFound: true, faroFound: false }); // evidence EXISTS but mode never looks

    const result = await sendDraftInvoice(client as never, {
      invoiceId: INVOICE_ID,
      operatingCompanyId: OPCO,
      userId: USER_ID,
    });

    expect(result).toEqual({
      ok: false,
      code: 409,
      error: "delivery_evidence_missing",
      message: expect.stringContaining("no actual_departure_at"),
    });
    expect(mockPostInvoiceGlIfEnabled).not.toHaveBeenCalled();
    expect(mockEnqueueEmail).not.toHaveBeenCalled();
    expect(mockEnqueueTmsInvoicePushRequested).not.toHaveBeenCalled();
  });

  it("GREEN — mode=historical_backfill, closed settlement found: evidence recorded, send proceeds", async () => {
    mockFinalActiveDeliveryDepartureAt.mockResolvedValue(null);
    mockIsEnabled.mockResolvedValue(false); // irrelevant to this path -- backfill clears evidenceReason before this is even checked
    const client = makeClient({ settlementFound: true, faroFound: false });
    const queryMock = client.query as unknown as ReturnType<typeof vi.fn>;

    const result = await sendDraftInvoice(client as never, {
      invoiceId: INVOICE_ID,
      operatingCompanyId: OPCO,
      userId: USER_ID,
      mode: "historical_backfill",
    });

    expect(result).toEqual({ ok: true });

    // Evidence was RECORDED on the invoice, not just silently accepted.
    const updateCall = queryMock.mock.calls.find(([sql]: [string]) =>
      sql.includes("UPDATE accounting.invoices SET delivery_evidence_source")
    );
    expect(updateCall).toBeTruthy();
    expect(updateCall![1]).toEqual([INVOICE_ID, "closed_settlement", OPCO]);

    expect(mockAppendCrudAudit).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      "accounting.invoice.delivery_evidence_backfilled",
      expect.objectContaining({
        invoice_id: INVOICE_ID,
        load_id: LOAD_ID,
        delivery_evidence_source: "closed_settlement",
        mode: "historical_backfill",
      }),
      "info",
      "ACCT-F61-BACKFILL-EVIDENCE"
    );
    // Send actually proceeded past the gate.
    expect(mockPostInvoiceGlIfEnabled).toHaveBeenCalledTimes(1);
  });

  it("RED — mode=historical_backfill, no evidence anywhere: fails closed UNCONDITIONALLY even with the flag OFF", async () => {
    mockFinalActiveDeliveryDepartureAt.mockResolvedValue(null);
    mockIsEnabled.mockResolvedValue(false); // flag OFF/warn-only -- must NOT matter for this mode
    const client = makeClient({ settlementFound: false, faroFound: false });

    const result = await sendDraftInvoice(client as never, {
      invoiceId: INVOICE_ID,
      operatingCompanyId: OPCO,
      userId: USER_ID,
      mode: "historical_backfill",
    });

    expect(result).toEqual({
      ok: false,
      code: 409,
      error: "delivery_evidence_missing",
      message: expect.stringContaining("historical_backfill mode cannot name a delivery evidence source"),
    });
    expect(mockPostInvoiceGlIfEnabled).not.toHaveBeenCalled();
    expect(mockEnqueueEmail).not.toHaveBeenCalled();
  });
});
