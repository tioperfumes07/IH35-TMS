import { describe, expect, it } from "vitest";
import { buildQboInvoicePayload } from "../invoice.js";

describe("buildQboInvoicePayload", () => {
  it("POST omits Id/SyncToken/sparse", () => {
    const p = buildQboInvoicePayload({
      header: {
        display_id: "INV-2026-00001",
        issue_date: "2026-05-01",
        due_date: "2026-05-15",
        internal_notes: "priv",
        customer_facing_memo: "hello",
        total_cents: 50_000,
      },
      customerQboId: "cust-1",
      billEmail: "ar@test.example",
      lines: [
        {
          amountCents: 50_000,
          quantity: 2,
          unitPriceCents: 25_000,
          itemQboId: "item-9",
          description: "Linehaul",
        },
      ],
    });
    expect(p.Id).toBeUndefined();
    expect(p.sparse).toBeUndefined();
    expect(p.DocNumber).toBe("INV-2026-00001");
    expect(p.TotalAmt).toBe(500);
    expect((p.Line as unknown[]).length).toBe(1);
  });

  it("PATCH adds sparse update envelope", () => {
    const p = buildQboInvoicePayload({
      header: {
        display_id: "INV-2026-00001",
        issue_date: "2026-05-01",
        due_date: "2026-05-15",
        internal_notes: null,
        customer_facing_memo: null,
        total_cents: 100,
        qbo_invoice_id: "qb-77",
        qbo_sync_token: "3",
      },
      customerQboId: "cust-1",
      lines: [
        {
          amountCents: 100,
          quantity: 1,
          unitPriceCents: 100,
          itemQboId: "item-9",
          description: "Flat",
        },
      ],
    });
    expect(p.Id).toBe("qb-77");
    expect(p.SyncToken).toBe("3");
    expect(p.sparse).toBe(true);
  });
});

describe("buildQboInvoicePayload variants", () => {
  const baseHeader = {
    display_id: "INV-2026-00001",
    issue_date: "2026-05-01",
    due_date: "2026-05-15",
    internal_notes: null as string | null,
    customer_facing_memo: null as string | null,
    total_cents: 100,
  };

  it.each(
    Array.from({ length: 30 }, (_, idx) => ({
      memo: `memo-${idx}`,
      cents: 100 + idx,
    }))
  )("customer memo variant %#", ({ memo, cents }) => {
    const p = buildQboInvoicePayload({
      header: { ...baseHeader, customer_facing_memo: memo, total_cents: cents },
      customerQboId: "c",
      lines: [
        {
          amountCents: cents,
          quantity: 1,
          unitPriceCents: cents,
          itemQboId: "i",
          description: memo,
        },
      ],
    });
    expect(p.TotalAmt).toBe(cents / 100);
    expect((p as { CustomerMemo?: { value: string } }).CustomerMemo?.value).toBe(memo);
  });
});
