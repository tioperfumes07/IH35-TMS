import { describe, expect, it, vi } from "vitest";

import {
  InvalidDisplayIdShapeError,
  resolveBillDisplayId,
  resolveInvoiceDisplayId,
  resolvePaymentDisplayId,
} from "../display-id.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";

function makeClient() {
  return {
    query: vi.fn(async () => ({ rows: [] })),
  };
}

// SET-25 (owner order 2026-09-04): "The owner cannot create an invoice on his first real load."
// GO-10 REV-B L3 mints plain-digit load numbers ("13508"); from-load.ts writes that value straight
// into accounting.invoices.display_id via resolveInvoiceDisplayId's autoFallback param; the live
// invoices_display_id_check constraint (widened by migration 202613650001) now accepts it. These
// tests exercise the REAL exported resolve* functions, not a re-implementation of the regex.
describe("display-id shape validation — SET-25", () => {
  it("resolveInvoiceDisplayId: the exact blocked scenario now succeeds — a plain-digit load_number via autoFallback", async () => {
    const client = makeClient();
    const result = await resolveInvoiceDisplayId(client as never, OPCO, new Date("2026-09-04"), null, "13508");
    expect(result).toBe("13508");
  });

  it("resolveInvoiceDisplayId: a manual override matching one of the four accepted shapes succeeds", async () => {
    const client = makeClient();
    await expect(resolveInvoiceDisplayId(client as never, OPCO, new Date("2026-09-04"), "INV-2026-00042", null)).resolves.toBe(
      "INV-2026-00042"
    );
  });

  it("resolveInvoiceDisplayId: a manual override that does NOT match any accepted shape throws a typed error, never a raw DB error", async () => {
    const client = makeClient();
    await expect(resolveInvoiceDisplayId(client as never, OPCO, new Date("2026-09-04"), "not-a-real-shape", null)).rejects.toBeInstanceOf(
      InvalidDisplayIdShapeError
    );
  });

  it("resolveInvoiceDisplayId: an autoFallback that does NOT match any accepted shape ALSO throws the typed error (the exact path from-load.ts's load_number write uses)", async () => {
    const client = makeClient();
    await expect(
      resolveInvoiceDisplayId(client as never, OPCO, new Date("2026-09-04"), null, "load-number-with-letters")
    ).rejects.toBeInstanceOf(InvalidDisplayIdShapeError);
  });

  it("resolvePaymentDisplayId: a manual value not matching PMT-YYYY-NNNNN throws the typed error before ever reaching the DB", async () => {
    const client = makeClient();
    await expect(resolvePaymentDisplayId(client as never, OPCO, new Date("2026-09-04"), "13508")).rejects.toBeInstanceOf(
      InvalidDisplayIdShapeError
    );
    await expect(resolvePaymentDisplayId(client as never, OPCO, new Date("2026-09-04"), "PMT-2026-00001")).resolves.toBe(
      "PMT-2026-00001"
    );
  });

  it("resolveBillDisplayId: a manual value not matching BILL-YYYY-NNNNN throws the typed error", async () => {
    const client = makeClient();
    await expect(resolveBillDisplayId(client as never, OPCO, new Date("2026-09-04"), "13508")).rejects.toBeInstanceOf(
      InvalidDisplayIdShapeError
    );
    await expect(resolveBillDisplayId(client as never, OPCO, new Date("2026-09-04"), "BILL-2026-00001")).resolves.toBe(
      "BILL-2026-00001"
    );
  });
});
