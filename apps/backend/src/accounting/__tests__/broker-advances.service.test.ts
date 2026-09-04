import { describe, expect, it, vi } from "vitest";

import { BrokerAdvanceError, recordBrokerAdvanceInClientTx } from "../broker-advances.service.js";

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
