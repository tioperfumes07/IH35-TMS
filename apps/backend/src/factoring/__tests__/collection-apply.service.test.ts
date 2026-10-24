// Behavior tests for LEAD 443.304 row 77: Faro factoring collection closes invoices.
// Spec: purchase → collection → invoice open = 0, liability relieved, TB 0;
//       short-pay stays open + dispute row; re-run applies 0.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveRoleAccount: vi.fn(async () => "acc-liability-uuid"),
  insertPaymentRow: vi.fn(),
  insertPaymentApplication: vi.fn(async () => "app-uuid"),
  postPaymentOrSkip: vi.fn(async () => undefined),
  nextPaymentDisplayId: vi.fn(async () => "PMT-001"),
  appendCrudAudit: vi.fn(async () => undefined),
  emitSpineEvent: vi.fn(async () => undefined),
  openInvoiceDispute: vi.fn(async () => ({ dispute: { id: "dispute-uuid" } })),
}));

vi.mock("../../accounting/coa-roles/resolver.service.js", () => ({ resolveRoleAccount: mocks.resolveRoleAccount }));
vi.mock("../../accounting/payment-writer.service.js", () => ({
  insertPaymentRowInClientTx: mocks.insertPaymentRow,
  insertPaymentApplicationRowInClientTx: mocks.insertPaymentApplication,
  postCustomerPaymentOrRecordSkipInClientTx: mocks.postPaymentOrSkip,
}));
vi.mock("../../accounting/display-id.js", () => ({ nextPaymentDisplayId: mocks.nextPaymentDisplayId }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: mocks.appendCrudAudit }));
vi.mock("../../accounting/accounting-spine-emit.js", () => ({ emitAccountingSpineEvent: mocks.emitSpineEvent }));
vi.mock("../../accounting/invoice-disputes.service.js", () => ({ openInvoiceDispute: mocks.openInvoiceDispute }));

import { applyFaroCollectionInClientTx, CollectionApplyError } from "../collection-apply.service.js";

const OCI = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const INV_ID = "11111111-1111-4111-8111-111111111111";
const CUST_ID = "22222222-2222-4222-8222-222222222222";

function makeClient(opts: {
  dupRow?: Record<string, unknown>;
  invoiceRow?: Record<string, unknown>;
  updatesOk?: boolean;
}) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  return {
    calls,
    async query(sql: string, values: unknown[] = []) {
      calls.push({ sql, values });
      // idempotency check
      if (/payment_source_kind = 'factoring_collection'/.test(sql)) {
        return { rows: opts.dupRow ? [opts.dupRow] : [] };
      }
      // invoice load
      if (/FROM accounting\.invoices/.test(sql) && /SELECT id::text/.test(sql)) {
        return { rows: opts.invoiceRow ? [opts.invoiceRow] : [] };
      }
      // UPDATE invoices (status update)
      if (/UPDATE accounting\.invoices/.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

const baseInput = {
  operating_company_id: OCI,
  invoice_id: INV_ID,
  amount_paid_cents: 100000, // $1,000.00
  date_paid: "2026-10-24",
  remittance_ref: "FARO-REMIT-001",
  actor_user_id: ACTOR,
  actor_role: "Owner",
};

const advancedInvoice = {
  id: INV_ID,
  customer_id: CUST_ID,
  amount_open_cents: 100000,
  factoring_status: "advanced",
  voided_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insertPaymentRow.mockResolvedValue({ id: "pay-uuid", display_id: "PMT-001", amount_unapplied_cents: 0 });
});

describe("applyFaroCollectionInClientTx — full pay", () => {
  it("creates payment, applies to invoice, posts GL, marks collected", async () => {
    const client = makeClient({ invoiceRow: advancedInvoice });
    const result = await applyFaroCollectionInClientTx(client as never, baseInput);

    expect(result.already_applied).toBe(false);
    expect(result.applied_cents).toBe(100000);
    expect(result.remainder_cents).toBe(0);
    expect(result.dispute_id).toBeNull();

    // payment row written with correct source kind + liability account
    expect(mocks.insertPaymentRow).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        payment_source_kind: "factoring_collection",
        deposited_to_account_id: "acc-liability-uuid",
        amount_cents: 100000,
        reference: "FARO-REMIT-001",
      })
    );
    // GL posted
    expect(mocks.postPaymentOrSkip).toHaveBeenCalledOnce();
    // invoice status updated to 'collected'
    const updateCall = client.calls.find((c) => /UPDATE accounting\.invoices/.test(c.sql));
    expect(updateCall?.sql).toContain("'collected'");
    // no dispute opened
    expect(mocks.openInvoiceDispute).not.toHaveBeenCalled();
  });
});

describe("applyFaroCollectionInClientTx — short-pay", () => {
  it("applies partial amount, invoice stays open, opens dispute for remainder", async () => {
    const client = makeClient({ invoiceRow: { ...advancedInvoice, amount_open_cents: 150000 } });
    const result = await applyFaroCollectionInClientTx(client as never, {
      ...baseInput,
      amount_paid_cents: 100000, // $500 short
    });

    expect(result.applied_cents).toBe(100000);
    expect(result.remainder_cents).toBe(50000);
    expect(result.dispute_id).toBe("dispute-uuid");

    // no 'collected' status update for short-pay
    const updateCall = client.calls.find((c) => /UPDATE accounting\.invoices/.test(c.sql));
    expect(updateCall).toBeUndefined();

    // dispute opened with short_pay reason
    expect(mocks.openInvoiceDispute).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: "short_pay", disputedAmountCents: 50000 })
    );
  });
});

describe("applyFaroCollectionInClientTx — idempotency (re-run applies 0)", () => {
  it("returns already_applied without writing any new rows", async () => {
    const client = makeClient({
      dupRow: {
        payment_id: "pay-uuid",
        payment_display_id: "PMT-001",
        applied_cents: 100000,
      },
    });
    const result = await applyFaroCollectionInClientTx(client as never, baseInput);

    expect(result.already_applied).toBe(true);
    expect(result.payment_id).toBe("pay-uuid");
    expect(mocks.insertPaymentRow).not.toHaveBeenCalled();
    expect(mocks.postPaymentOrSkip).not.toHaveBeenCalled();
  });
});

describe("applyFaroCollectionInClientTx — guard cases", () => {
  it("throws invoice_not_found when invoice missing", async () => {
    const client = makeClient({ invoiceRow: undefined });
    await expect(applyFaroCollectionInClientTx(client as never, baseInput)).rejects.toThrow(CollectionApplyError);
  });

  it("throws invoice_not_factored_advanced when status is not_factored", async () => {
    const client = makeClient({
      invoiceRow: { ...advancedInvoice, factoring_status: "not_factored" },
    });
    await expect(applyFaroCollectionInClientTx(client as never, baseInput)).rejects.toMatchObject({
      code: expect.stringContaining("invoice_not_factored_advanced"),
    });
  });

  it("throws invoice_already_closed when open cents = 0", async () => {
    const client = makeClient({
      invoiceRow: { ...advancedInvoice, amount_open_cents: 0 },
    });
    await expect(applyFaroCollectionInClientTx(client as never, baseInput)).rejects.toMatchObject({
      code: "invoice_already_closed",
    });
  });

  it("throws invalid_amount_paid_cents for non-positive amount", async () => {
    const client = makeClient({ invoiceRow: advancedInvoice });
    await expect(
      applyFaroCollectionInClientTx(client as never, { ...baseInput, amount_paid_cents: 0 })
    ).rejects.toMatchObject({ code: "invalid_amount_paid_cents" });
  });
});
