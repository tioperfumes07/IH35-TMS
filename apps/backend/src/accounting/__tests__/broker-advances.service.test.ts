import { describe, expect, it, vi } from "vitest";

const createJournalEntryOnClient = vi.fn(async () => ({ id: "je-1" }));
vi.mock("../journal-entries.service.js", () => ({
  createJournalEntryOnClient: (...args: unknown[]) => createJournalEntryOnClient(...args),
}));

const { BrokerAdvanceError, applyBrokerAdvanceToDriverBillInClientTx, recordBrokerAdvanceInClientTx } = await import(
  "../broker-advances.service.js"
);

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LOAD_ID = "11111111-1111-1111-1111-111111111111";
const CUSTOMER_ID = "22222222-2222-2222-2222-222222222222";
const USER_ID = "33333333-3333-3333-3333-333333333333";
const NEW_BROKER_ADVANCE_ID = "44444444-4444-4444-4444-444444444444";
const LIVE_INVOICE_ID = "55555555-5555-5555-5555-555555555555";

function makeClient(overrides: { liveInvoiceId?: string | null } = {}) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      if (/SELECT audit\.append_event/.test(sql)) return { rows: [] };
      if (/SELECT id FROM mdata\.loads WHERE/.test(sql)) return { rows: [{ id: LOAD_ID }] };
      if (/SELECT id FROM mdata\.customers WHERE/.test(sql)) return { rows: [{ id: CUSTOMER_ID }] };
      if (/INSERT INTO accounting\.broker_advances/.test(sql)) return { rows: [{ id: NEW_BROKER_ADVANCE_ID }] };
      if (/SELECT i\.id\s+FROM accounting\.invoices i/.test(sql)) {
        return { rows: overrides.liveInvoiceId ? [{ id: overrides.liveInvoiceId }] : [] };
      }
      if (/UPDATE accounting\.invoices SET broker_advance_applied_cents/.test(sql)) return { rows: [] };
      if (/UPDATE accounting\.broker_advances SET applied_to_invoice_id/.test(sql)) return { rows: [] };
      return { rows: [] };
    }),
  };
  return { client, calls };
}

const validInput = {
  operatingCompanyId: OPCO,
  loadId: LOAD_ID,
  customerId: CUSTOMER_ID,
  category: "diesel" as const,
  instrumentType: "comchek",
  instrumentReference: "CMK-88213456",
  amountCents: 50000,
  receivedAt: "2026-08-15",
  actorUserId: USER_ID,
};

describe("recordBrokerAdvanceInClientTx — SET-24", () => {
  it("rejects a missing instrument_reference -- 'required, never prefilled' enforced at the service boundary, not just the UI", async () => {
    const { client } = makeClient();
    await expect(recordBrokerAdvanceInClientTx(client as never, { ...validInput, instrumentReference: "" })).rejects.toMatchObject({
      code: "instrument_reference_required",
    });
    await expect(recordBrokerAdvanceInClientTx(client as never, { ...validInput, instrumentReference: "   " })).rejects.toMatchObject({
      code: "instrument_reference_required",
    });
  });

  it("rejects a zero or negative amount", async () => {
    const { client } = makeClient();
    await expect(recordBrokerAdvanceInClientTx(client as never, { ...validInput, amountCents: 0 })).rejects.toMatchObject({
      code: "amount_must_be_positive",
    });
    await expect(recordBrokerAdvanceInClientTx(client as never, { ...validInput, amountCents: -100 })).rejects.toMatchObject({
      code: "amount_must_be_positive",
    });
  });

  it("rejects a category outside the four allowed values", async () => {
    const { client } = makeClient();
    await expect(
      recordBrokerAdvanceInClientTx(client as never, { ...validInput, category: "fuel_bonus" as never })
    ).rejects.toBeInstanceOf(BrokerAdvanceError);
  });

  it("no live invoice yet: records the receipt, leaves it unapplied -- an honest 'received before first pickup' state, never a driver-facing write", async () => {
    const { client, calls } = makeClient({ liveInvoiceId: null });
    const result = await recordBrokerAdvanceInClientTx(client as never, validInput);
    expect(result.brokerAdvanceId).toBe(NEW_BROKER_ADVANCE_ID);
    expect(result.appliedToInvoiceId).toBeNull();
    // Never touches driver_finance.* -- this is a broker-to-receivable prepayment, never a driver
    // debt or driver pay (drivers are B1 company drivers, per the owner's own explanation).
    expect(calls.some((c) => /driver_finance\./.test(c.sql))).toBe(false);
    expect(calls.some((c) => /UPDATE accounting\.invoices/.test(c.sql))).toBe(false);
  });

  it("a live invoice already exists: applies immediately, additive, and NEVER touches rate_total_cents or any invoice line amount", async () => {
    const { client, calls } = makeClient({ liveInvoiceId: LIVE_INVOICE_ID });
    const result = await recordBrokerAdvanceInClientTx(client as never, validInput);
    expect(result.appliedToInvoiceId).toBe(LIVE_INVOICE_ID);
    const updateCall = calls.find((c) => /UPDATE accounting\.invoices SET broker_advance_applied_cents/.test(c.sql));
    expect(updateCall).toBeDefined();
    // Additive (COALESCE(...,0) + $2), never an overwrite -- confirmed by the SQL shape itself, not
    // just the call happening.
    expect(updateCall!.sql).toMatch(/COALESCE\(broker_advance_applied_cents, 0\) \+ \$2/);
    expect(updateCall!.values).toEqual([LIVE_INVOICE_ID, validInput.amountCents]);
    // The invoice face (rate_total_cents) and its lines are never referenced by any call this
    // function makes -- the only accounting.invoices column it ever writes is
    // broker_advance_applied_cents.
    expect(calls.some((c) => /rate_total_cents/.test(c.sql))).toBe(false);
    expect(calls.some((c) => /accounting\.invoice_lines/.test(c.sql))).toBe(false);
    expect(calls.some((c) => /driver_finance\./.test(c.sql))).toBe(false);
  });

  it("throws load_not_found for a load outside the caller's own company scope", async () => {
    const { client } = makeClient();
    client.query = vi.fn(async (sql: string) => {
      if (/SELECT id FROM mdata\.loads WHERE/.test(sql)) return { rows: [] };
      return { rows: [] };
    });
    await expect(recordBrokerAdvanceInClientTx(client as never, validInput)).rejects.toMatchObject({ code: "load_not_found" });
  });
});

const DRIVER_BILL_ID = "66666666-6666-6666-6666-666666666666";
const DRIVER_ID = "77777777-7777-7777-7777-777777777777";
const PAYABLE_ACCOUNT_ID = "88888888-8888-8888-8888-888888888888";
const RECEIVABLE_ACCOUNT_ID = "99999999-9999-9999-9999-999999999999";
const LIABILITY_ACCOUNT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

// LOAD-COSTS-COMPLETE item (2) (owner ruling 2026-09-04): "the broker might send the driver
// money and we apply it as a bill payment to the driver."
describe("applyBrokerAdvanceToDriverBillInClientTx — LOAD-COSTS-COMPLETE item (2)", () => {
  function makeDisburseClient(overrides: {
    columnsExist?: boolean;
    category?: string;
    advanceAmountCents?: number;
    alreadyDisbursed?: string | null;
    voided?: boolean;
    billStatus?: string;
    billLoadId?: string;
    grossAmountCents?: number;
    priorDisbursedCoveredCents?: number;
    /** LOAD-COSTS-COMPLETE item (4) -- defaults to "a posted invoice already exists" so every
     * pre-existing test above keeps its original AR-credit behavior unless it opts into the
     * pre-invoice/still-proforma scenario. */
    appliedToInvoiceId?: string | null;
    invoiceStatus?: string | null;
  } = {}) {
    const calls: { sql: string; values: unknown[] }[] = [];
    const client = {
      query: vi.fn(async (sql: string, values: unknown[] = []) => {
        calls.push({ sql, values });
        if (/information_schema\.columns/.test(sql)) return { rows: [{ ok: overrides.columnsExist ?? true }] };
        if (/FROM accounting\.broker_advances ba/.test(sql)) {
          return {
            rows: [
              {
                category: overrides.category ?? "driver_pay",
                amount_cents: String(overrides.advanceAmountCents ?? 50000),
                disbursed_amount_cents: overrides.alreadyDisbursed ?? null,
                voided_at: overrides.voided ? "2026-09-01T00:00:00Z" : null,
                load_id: LOAD_ID,
                instrument_reference: "CMK-88213456",
                received_at: "2026-09-04",
                applied_to_invoice_id: overrides.appliedToInvoiceId === undefined ? LIVE_INVOICE_ID : overrides.appliedToInvoiceId,
                invoice_status: overrides.invoiceStatus === undefined ? "sent" : overrides.invoiceStatus,
              },
            ],
          };
        }
        if (/SELECT id, driver_id::text, load_id::text, gross_amount_cents::text, status/.test(sql)) {
          return {
            rows: [
              {
                id: DRIVER_BILL_ID,
                driver_id: DRIVER_ID,
                load_id: overrides.billLoadId ?? LOAD_ID,
                gross_amount_cents: String(overrides.grossAmountCents ?? 70949),
                status: overrides.billStatus ?? "open",
              },
            ],
          };
        }
        if (/SELECT COALESCE\(SUM\(disbursed_amount_cents\)/.test(sql)) {
          return { rows: [{ covered: String(overrides.priorDisbursedCoveredCents ?? 0) }] };
        }
        if (/SELECT id FROM catalogs\.accounts WHERE.*account_number = \$2/.test(sql)) {
          const accountNumber = values[1];
          return { rows: [{ id: accountNumber === "2200" ? PAYABLE_ACCOUNT_ID : RECEIVABLE_ACCOUNT_ID }] };
        }
        if (/FROM accounting\.chart_of_accounts_roles/.test(sql)) {
          return { rows: [{ account_id: LIABILITY_ACCOUNT_ID }] };
        }
        if (/UPDATE accounting\.broker_advances\s+SET\s+disbursed_to_driver_bill_id/.test(sql)) return { rows: [] };
        return { rows: [] };
      }),
    };
    return { client, calls };
  }

  const validDisburseInput = {
    operatingCompanyId: OPCO,
    brokerAdvanceId: NEW_BROKER_ADVANCE_ID,
    driverBillId: DRIVER_BILL_ID,
    amountCents: 50000,
    actorUserId: USER_ID,
  };

  it("throws if the disbursement columns are not migrated yet (defensive pre-migration guard)", async () => {
    const { client } = makeDisburseClient({ columnsExist: false });
    await expect(applyBrokerAdvanceToDriverBillInClientTx(client as never, validDisburseInput)).rejects.toMatchObject({
      code: "disbursement_columns_not_migrated",
    });
  });

  it("rejects a category other than driver_pay", async () => {
    const { client } = makeDisburseClient({ category: "diesel" });
    await expect(applyBrokerAdvanceToDriverBillInClientTx(client as never, validDisburseInput)).rejects.toMatchObject({
      code: "wrong_category_for_driver_disbursement",
    });
  });

  it("rejects a voided advance", async () => {
    const { client } = makeDisburseClient({ voided: true });
    await expect(applyBrokerAdvanceToDriverBillInClientTx(client as never, validDisburseInput)).rejects.toMatchObject({
      code: "broker_advance_voided",
    });
  });

  it("rejects an advance already disbursed once", async () => {
    const { client } = makeDisburseClient({ alreadyDisbursed: "20000" });
    await expect(applyBrokerAdvanceToDriverBillInClientTx(client as never, validDisburseInput)).rejects.toMatchObject({
      code: "already_disbursed",
    });
  });

  it("rejects a driver bill for a different load than the advance", async () => {
    const { client } = makeDisburseClient({ billLoadId: "different-load-id" });
    await expect(applyBrokerAdvanceToDriverBillInClientTx(client as never, validDisburseInput)).rejects.toMatchObject({
      code: "load_mismatch",
    });
  });

  it("caps the disbursed amount at the bill's REMAINING balance, not the requested amount", async () => {
    const { client } = makeDisburseClient({ grossAmountCents: 70949, priorDisbursedCoveredCents: 60000 });
    const result = await applyBrokerAdvanceToDriverBillInClientTx(client as never, { ...validDisburseInput, amountCents: 50000 });
    // remaining = 70949 - 60000 = 10949, far less than the requested 50000
    expect(result.disbursedAmountCents).toBe(10949);
  });

  it("caps the disbursed amount at the advance's own remaining amount, not the requested amount", async () => {
    const { client } = makeDisburseClient({ advanceAmountCents: 15000 });
    const result = await applyBrokerAdvanceToDriverBillInClientTx(client as never, { ...validDisburseInput, amountCents: 50000 });
    expect(result.disbursedAmountCents).toBe(15000);
  });

  it("posts a real, balanced JE through journal-entries.service -- DR Driver Settlements Payable / CR Accounts Receivable, tagged to the driver", async () => {
    createJournalEntryOnClient.mockClear();
    const { client, calls } = makeDisburseClient();
    const result = await applyBrokerAdvanceToDriverBillInClientTx(client as never, validDisburseInput);
    expect(createJournalEntryOnClient).toHaveBeenCalledTimes(1);
    const [, input] = createJournalEntryOnClient.mock.calls[0]!;
    expect(input.postings).toHaveLength(2);
    const debit = input.postings.find((p: { debit_or_credit: string }) => p.debit_or_credit === "debit");
    const credit = input.postings.find((p: { debit_or_credit: string }) => p.debit_or_credit === "credit");
    expect(debit).toMatchObject({ account_id: PAYABLE_ACCOUNT_ID, amount_cents: 50000, entity_uuid: DRIVER_ID, entity_type: "driver" });
    expect(credit).toMatchObject({ account_id: RECEIVABLE_ACCOUNT_ID, amount_cents: 50000 });
    expect(result.journalEntryId).toBe("je-1");
    // Never touches driver_finance.driver_liabilities / driver_advances / settlement_lines --
    // this settles an EXISTING driver_bills row, it creates no new liability anywhere.
    expect(calls.some((c) => /driver_finance\.driver_liabilities/.test(c.sql))).toBe(false);
    expect(calls.some((c) => /driver_finance\.driver_advances/.test(c.sql))).toBe(false);
    expect(calls.some((c) => /settlement_lines/.test(c.sql))).toBe(false);
    // Links back to the SAME broker_advances row -- one instrument, two sides, one trace.
    const linkCall = calls.find((c) => /UPDATE accounting\.broker_advances\s+SET\s+disbursed_to_driver_bill_id/.test(c.sql));
    expect(linkCall!.values).toEqual([NEW_BROKER_ADVANCE_ID, DRIVER_BILL_ID, 50000, "je-1"]);
  });

  // LOAD-COSTS-COMPLETE item (4) (owner correction 2026-09-04) -- crediting Accounts Receivable
  // unconditionally, including when no invoice exists for the load yet, posted against a
  // receivable that isn't there. Pre-invoice, the credit must land on the Broker/Customer Advance
  // Liability role instead.
  it("credits the Broker/Customer Advance Liability role, not Accounts Receivable, when no invoice exists yet for the load", async () => {
    createJournalEntryOnClient.mockClear();
    const { client } = makeDisburseClient({ appliedToInvoiceId: null, invoiceStatus: null });
    await applyBrokerAdvanceToDriverBillInClientTx(client as never, validDisburseInput);
    const [, input] = createJournalEntryOnClient.mock.calls[0]!;
    const credit = input.postings.find((p: { debit_or_credit: string }) => p.debit_or_credit === "credit");
    expect(credit).toMatchObject({ account_id: LIABILITY_ACCOUNT_ID, amount_cents: 50000 });
    expect(credit.account_id).not.toBe(RECEIVABLE_ACCOUNT_ID);
  });

  // Same defect, second shape: an invoice row exists but is still a non-posting PROFORMA (ND-INV-01
  // -- "Pro Forma is NON-POSTING ... Official invoice posts A/R only after POD convert"), so there is
  // STILL no posted receivable to net against even though applied_to_invoice_id is set.
  it("credits the Broker/Customer Advance Liability role when the only invoice is still proforma (non-posting)", async () => {
    createJournalEntryOnClient.mockClear();
    const { client } = makeDisburseClient({ appliedToInvoiceId: LIVE_INVOICE_ID, invoiceStatus: "proforma" });
    await applyBrokerAdvanceToDriverBillInClientTx(client as never, validDisburseInput);
    const [, input] = createJournalEntryOnClient.mock.calls[0]!;
    const credit = input.postings.find((p: { debit_or_credit: string }) => p.debit_or_credit === "credit");
    expect(credit).toMatchObject({ account_id: LIABILITY_ACCOUNT_ID, amount_cents: 50000 });
  });
});
