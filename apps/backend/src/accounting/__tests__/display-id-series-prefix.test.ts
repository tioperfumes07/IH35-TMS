import { describe, expect, it, vi } from "vitest";

import {
  DuplicateDocumentNumberError,
  nextBillDisplayId,
  nextCreditMemoDisplayId,
  nextExpenseDisplayId,
  nextFactoringDisplayId,
  nextInvoiceDisplayId,
  nextPaymentDisplayId,
  nextVendorCreditDisplayId,
  resolveBillDisplayId,
  resolveInvoiceDisplayId,
  resolvePaymentDisplayId,
} from "../display-id.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";

type Call = { sql: string; values: unknown[] };

/** Records every query; answers the advisory lock with nothing, the MAX with `nextNumber`
 * (as node-pg returns a bigint: a string), and a taken-check with `takenRow`. */
function recordingClient(opts: { nextNumber?: string; takenRow?: boolean } = {}) {
  const calls: Call[] = [];
  const client = {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      if (/pg_advisory_xact_lock/.test(sql)) return { rows: [] };
      if (/next_number/.test(sql)) return { rows: [{ next_number: opts.nextNumber ?? "1" }] };
      if (/SELECT 1/.test(sql)) return { rows: opts.takenRow ? [{ "?column?": 1 }] : [] };
      return { rows: [] };
    }),
  };
  return { client, calls };
}

const lockScopes = (calls: Call[]) => calls.filter((c) => /pg_advisory_xact_lock/.test(c.sql)).map((c) => c.values[0]);
const maxQuery = (calls: Call[]) => calls.find((c) => /next_number/.test(c.sql))!;

const SERIES = [
  { name: "invoice", fn: nextInvoiceDisplayId, prefix: "INV-2026-", lock: `accounting.invoice.display_id:${OPCO}`, width: 5 },
  { name: "payment", fn: nextPaymentDisplayId, prefix: "PMT-2026-", lock: `accounting.payment.display_id:${OPCO}`, width: 5 },
  { name: "credit memo", fn: nextCreditMemoDisplayId, prefix: "CM-2026-", lock: `accounting.credit_memo.display_id:${OPCO}`, width: 4 },
  { name: "bill", fn: nextBillDisplayId, prefix: "BILL-2026-", lock: `accounting.bill.display_id:${OPCO}`, width: 5 },
  { name: "vendor credit", fn: nextVendorCreditDisplayId, prefix: "VC-2026-", lock: `accounting.vendor_credit.display_id:${OPCO}`, width: 4 },
  { name: "factoring", fn: nextFactoringDisplayId, prefix: "FAC-2026-", lock: `accounting.factoring.display_id:${OPCO}`, width: 5 },
  { name: "expense", fn: nextExpenseDisplayId, prefix: "EXP-2026-", lock: `accounting.expense.expense_number:${OPCO}`, width: 5 },
] as const;

describe("E9 — every yearly series is scanned by its prefix, never by a document date", () => {
  for (const s of SERIES) {
    it(`${s.name}: MAX filters on the ${s.prefix} prefix only; no date window; per-company lock`, async () => {
      const { client, calls } = recordingClient({ nextNumber: "16" });
      const id = await s.fn(client as never, OPCO, new Date("2026-09-23T00:00:00Z"));
      expect(id).toBe(`${s.prefix}${"16".padStart(s.width, "0")}`);

      const q = maxQuery(calls);
      expect(q.sql).not.toMatch(/make_date|_date\s*>=|_date\s*<|submitted_at\s*>=/);
      expect(q.sql).toMatch(/operating_company_id = \$1::uuid/);
      expect(q.sql).toMatch(/LIKE \$2 \|\| '%'/);
      expect(q.values).toEqual([OPCO, s.prefix]);

      expect(lockScopes(calls)).toEqual([s.lock]);
    });
  }

  it("a series past its padding width keeps counting instead of re-issuing (no fixed-width right())", async () => {
    const { client, calls } = recordingClient({ nextNumber: "10000" });
    await expect(nextCreditMemoDisplayId(client as never, OPCO, new Date("2026-09-23T00:00:00Z"))).resolves.toBe("CM-2026-10000");
    expect(maxQuery(calls).sql).toMatch(/substr\(display_id, length\(\$2\) \+ 1\)::bigint/);
    expect(maxQuery(calls).sql).not.toMatch(/right\(/);
  });
});

describe("E9 — the auto path and the operator-typed path serialize on one lock", () => {
  it("invoice: manual override and auto allocation take the same advisory lock key", async () => {
    const manual = recordingClient();
    await resolveInvoiceDisplayId(manual.client as never, OPCO, new Date("2026-09-23T00:00:00Z"), "INV-2026-00042", null);
    const auto = recordingClient({ nextNumber: "43" });
    await resolveInvoiceDisplayId(auto.client as never, OPCO, new Date("2026-09-23T00:00:00Z"), null, null);
    expect(lockScopes(manual.calls)).toEqual([`accounting.invoice.display_id:${OPCO}`]);
    expect(lockScopes(auto.calls)).toEqual([`accounting.invoice.display_id:${OPCO}`]);
  });

  it("payment: manual override and auto allocation take the same advisory lock key", async () => {
    const manual = recordingClient();
    await resolvePaymentDisplayId(manual.client as never, OPCO, new Date("2026-09-23T00:00:00Z"), "PMT-2026-00042");
    const auto = recordingClient({ nextNumber: "43" });
    await resolvePaymentDisplayId(auto.client as never, OPCO, new Date("2026-09-23T00:00:00Z"), null);
    expect(lockScopes(manual.calls)).toEqual(lockScopes(auto.calls));
  });
});

describe("E9 — a voided document's number stays taken (the unique constraints cover voided rows)", () => {
  it("invoice: the manual taken-check does not exclude voided rows, and a taken number is a typed 409, never a raw 23505", async () => {
    const { client, calls } = recordingClient({ takenRow: true });
    await expect(
      resolveInvoiceDisplayId(client as never, OPCO, new Date("2026-09-23T00:00:00Z"), "INV-2026-00009", null)
    ).rejects.toBeInstanceOf(DuplicateDocumentNumberError);
    const check = calls.find((c) => /SELECT 1/.test(c.sql))!;
    expect(check.sql).not.toMatch(/voided_at/);
    expect(check.values).toEqual([OPCO, "INV-2026-00009"]);
  });

  it("payment: the manual taken-check does not exclude voided rows", async () => {
    const { client, calls } = recordingClient({ takenRow: true });
    await expect(
      resolvePaymentDisplayId(client as never, OPCO, new Date("2026-09-23T00:00:00Z"), "PMT-2026-00009")
    ).rejects.toBeInstanceOf(DuplicateDocumentNumberError);
    expect(calls.find((c) => /SELECT 1/.test(c.sql))!.sql).not.toMatch(/voided_at/);
  });

  // R-102-B item 4 (owner, "WE WILL USE THE SAME NUMBERS" — never reused): bill was the one
  // family whose taken-check still excluded voided/revoked rows (`AND revoked_at IS NULL AND
  // voided_at IS NULL`), so a voided bill's own number read as available and could be typed
  // into a brand-new bill. Fixed to match every sibling family's pattern above.
  it("bill: the manual taken-check does not exclude voided or revoked rows", async () => {
    const { client, calls } = recordingClient({ takenRow: true });
    await expect(
      resolveBillDisplayId(client as never, OPCO, new Date("2026-09-23T00:00:00Z"), "BILL-2026-00009")
    ).rejects.toBeInstanceOf(DuplicateDocumentNumberError);
    const check = calls.find((c) => /SELECT 1/.test(c.sql))!;
    expect(check.sql).not.toMatch(/voided_at/);
    expect(check.sql).not.toMatch(/revoked_at/);
    expect(check.values).toEqual([OPCO, "BILL-2026-00009"]);
  });
});
