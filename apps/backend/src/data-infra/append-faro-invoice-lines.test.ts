import { beforeEach, describe, expect, it, vi } from "vitest";
import { appendFaroInvoiceLinesOnClient } from "./data-infra.service.js";

// ROUND29.6 — append-only sibling to upsertFaroDailyImportOnClient: inserts only new
// invoice_numbers under an existing daily_import_id, never touches already-present rows, then
// recomputes the header totals as sum(all lines, old + new).

function makeClient(opts: {
  importExists?: boolean;
  existingInvoiceNumbers?: Set<string>;
  existingSumCents?: { gross: number; advance: number; reserve: number; fee: number; chargeback: number };
}) {
  const importExists = opts.importExists ?? true;
  const existing = opts.existingInvoiceNumbers ?? new Set<string>();
  let sums = opts.existingSumCents ?? { gross: 0, advance: 0, reserve: 0, fee: 0, chargeback: 0 };
  const inserted: Array<{ invoice_number: string; gross: number; advance: number; reserve: number; fee: number; chargeback: number }> = [];
  const updateCalls: unknown[][] = [];
  const auditCalls: unknown[][] = [];

  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes("FROM factor.faro_daily_imports WHERE id")) {
      return { rows: importExists ? [{ id: (values as unknown[])[0] }] : [] };
    }
    if (sql.includes("SELECT 1 AS exists FROM factor.faro_invoice_lines")) {
      const invoiceNumber = (values as unknown[])[1] as string;
      return { rows: existing.has(invoiceNumber) ? [{ exists: true }] : [] };
    }
    if (sql.trim().startsWith("INSERT INTO factor.faro_invoice_lines")) {
      const v = values as unknown[];
      const invoice_number = v[2] as string;
      const gross = Number(v[5]);
      const advance = Number(v[6]);
      const reserve = Number(v[7]);
      const fee = Number(v[8]);
      const chargeback = Number(v[9]);
      inserted.push({ invoice_number, gross, advance, reserve, fee, chargeback });
      sums = {
        gross: sums.gross + gross,
        advance: sums.advance + advance,
        reserve: sums.reserve + reserve,
        fee: sums.fee + fee,
        chargeback: sums.chargeback + chargeback,
      };
      return { rows: [] };
    }
    if (sql.includes("COALESCE(sum(gross_amount_cents), 0)")) {
      return {
        rows: [
          {
            gross_total_cents: String(sums.gross),
            advance_total_cents: String(sums.advance),
            reserve_total_cents: String(sums.reserve),
            fee_total_cents: String(sums.fee),
            chargeback_total_cents: String(sums.chargeback),
          },
        ],
      };
    }
    if (sql.trim().startsWith("UPDATE factor.faro_daily_imports")) {
      updateCalls.push(values ?? []);
      return { rows: [] };
    }
    if (sql.includes("audit.append_event")) {
      auditCalls.push(values ?? []);
      return { rows: [] };
    }
    if (sql.includes("set_config")) {
      return { rows: [] };
    }
    return { rows: [] };
  });

  return { query, inserted, updateCalls, auditCalls, getSums: () => sums };
}

const BASE_LINE = {
  invoice_number: "13999",
  customer_name: "Test Debtor",
  gross_amount_cents: 100000,
  advance_amount_cents: 97000,
  reserve_amount_cents: 1500,
  fee_amount_cents: 1500,
  chargeback_amount_cents: 0,
  net_amount_cents: 97000,
  due_on: "2026-09-08",
};

describe("appendFaroInvoiceLinesOnClient", () => {
  it("throws if the daily_import_id does not exist", async () => {
    const client = makeClient({ importExists: false });
    await expect(
      appendFaroInvoiceLinesOnClient(client, "user-1", {
        operatingCompanyId: "11111111-1111-4111-8111-111111111111",
        dailyImportId: "22222222-2222-4222-8222-222222222222",
        lines: [BASE_LINE],
      })
    ).rejects.toThrow("faro_daily_import_not_found");
  });

  it("inserts a genuinely new line and recomputes the header total including it", async () => {
    const client = makeClient({
      existingInvoiceNumbers: new Set(["039"]),
      existingSumCents: { gross: 350000, advance: 339500, reserve: 5250, fee: 5250, chargeback: 0 },
    });
    const result = await appendFaroInvoiceLinesOnClient(client, "user-1", {
      operatingCompanyId: "11111111-1111-4111-8111-111111111111",
      dailyImportId: "22222222-2222-4222-8222-222222222222",
      lines: [BASE_LINE],
    });
    expect(result.inserted_invoice_numbers).toEqual(["13999"]);
    expect(result.skipped_already_present).toEqual([]);
    // 350000 (existing) + 100000 (new) = 450000
    expect(result.header.gross_total_cents).toBe(450000);
    expect(client.updateCalls).toHaveLength(1);
  });

  // ROUND29.6 core guarantee: a line whose invoice_number is already present (non-superseded)
  // is SKIPPED, never re-inserted, never counted twice in the header.
  it("skips an already-present invoice_number instead of inserting a duplicate", async () => {
    const client = makeClient({
      existingInvoiceNumbers: new Set(["13999"]),
      existingSumCents: { gross: 100000, advance: 97000, reserve: 1500, fee: 1500, chargeback: 0 },
    });
    const result = await appendFaroInvoiceLinesOnClient(client, "user-1", {
      operatingCompanyId: "11111111-1111-4111-8111-111111111111",
      dailyImportId: "22222222-2222-4222-8222-222222222222",
      lines: [BASE_LINE],
    });
    expect(result.inserted_invoice_numbers).toEqual([]);
    expect(result.skipped_already_present).toEqual(["13999"]);
    expect(client.inserted).toHaveLength(0);
    // header unchanged, still the pre-existing sum — no duplicate counted
    expect(result.header.gross_total_cents).toBe(100000);
    // idempotent re-run: no header UPDATE fired when nothing was inserted
    expect(client.updateCalls).toHaveLength(0);
  });

  it("inserts multiple new lines and skips a mixed-in already-present one in the same call", async () => {
    const client = makeClient({
      existingInvoiceNumbers: new Set(["13500"]),
      existingSumCents: { gross: 200000, advance: 194000, reserve: 3000, fee: 3000, chargeback: 0 },
    });
    const result = await appendFaroInvoiceLinesOnClient(client, "user-1", {
      operatingCompanyId: "11111111-1111-4111-8111-111111111111",
      dailyImportId: "22222222-2222-4222-8222-222222222222",
      lines: [
        { ...BASE_LINE, invoice_number: "13500" }, // already present -> skip
        { ...BASE_LINE, invoice_number: "13501" }, // new
        { ...BASE_LINE, invoice_number: "13502" }, // new
      ],
    });
    expect(result.inserted_invoice_numbers).toEqual(["13501", "13502"]);
    expect(result.skipped_already_present).toEqual(["13500"]);
    expect(client.inserted).toHaveLength(2);
    // 200000 existing + 100000 + 100000 new = 400000
    expect(result.header.gross_total_cents).toBe(400000);
  });
});
