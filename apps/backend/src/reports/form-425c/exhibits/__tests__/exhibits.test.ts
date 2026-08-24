import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildExhibitD, calculateUsTrusteeQuarterlyFeeCents, calendarQuarterContaining } from "../exhibit-d-quarterly-fees.js";
import { billReference, buildExhibitF } from "../exhibit-f-supporting-docs.js";
import { buildAllExhibits, getBuiltExhibits } from "../exhibits-builder.service.js";
import { registerForm425cExhibitsRoutes } from "../routes.js";
import { buildExhibitC } from "../exhibit-c-bank-reconciliation.js";

const companyId = "44444444-4444-4444-8444-444444444444";

vi.mock("../../../shared.js", async () => {
  const actual = await vi.importActual<typeof import("../../../shared.js")>("../../../shared.js");
  return {
    ...actual,
    currentAuthUser: vi.fn(() => ({ uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", role: "Owner" })),
    withCompanyScope: vi.fn(async (_userId: string, _companyId: string, fn: (client: any) => Promise<any>) => {
      const client = {
        query: vi.fn(async (sql: string) => {
          // Real schema (0072/0073): amount_cents (bigint), is_credit direction flag. These mocks match
          // the REAL identifiers the fix now emits — the phantom `bt.amount`/`bt.txn_date` are gone.
          // Exhibit A — receipts (is_credit = true), amounts in CENTS.
          if (sql.includes("banking.bank_transactions") && sql.includes("bt.is_credit = true")) {
            return {
              rows: [
                { description: "Customer payment", counterparty: "ACME Freight", amount_cents: "150025" },
                { description: "Factor advance", counterparty: "Triumph", amount_cents: "80000" },
              ],
            };
          }
          // Exhibit D — quarterly-fee disbursements base (is_credit = false), summed to *_cents.
          if (sql.includes("banking.bank_transactions") && sql.includes("disbursements_cents")) {
            return { rows: [{ disbursements_cents: "25000000" }] };
          }
          // Exhibit B — disbursements detail (is_credit = false), amounts in CENTS.
          if (sql.includes("banking.bank_transactions") && sql.includes("bt.is_credit = false")) {
            return {
              rows: [{ description: "Fuel purchase", counterparty: "Pilot", amount_cents: "42050" }],
            };
          }
          // Exhibit C — per-account reconciliation (inflows/outflows via CASE WHEN bt.is_credit).
          if (sql.includes("banking.bank_accounts")) {
            return {
              rows: [
                {
                  id: "11111111-1111-4111-8111-111111111111",
                  name: "DIP Operating",
                  mask: "3500",
                  inflows: "500000",
                  outflows: "200000",
                  beginning_balance_cents: "900000",
                  reconciliation_session_id: "22222222-2222-4222-8222-222222222222",
                },
              ],
            };
          }
          if (sql.includes("accounting.invoices")) return { rows: [] };
          if (sql.includes("accounting.bills")) return { rows: [] };
          return { rows: [] };
        }),
      };
      return fn(client);
    }),
  };
});

vi.mock("../exhibit-e-statements-summary.js", () => ({
  buildExhibitE: vi.fn(async () => ({
    letter: "e",
    title: "Exhibit E — Statements summary (P&L, BS, CF)",
    period_start: "2026-05-01",
    period_end: "2026-05-31",
    snapshots: [],
  })),
}));

describe("form-425c exhibits", () => {
  describe("calculateUsTrusteeQuarterlyFeeCents", () => {
    it("matches statute tiers exactly", () => {
      expect(calculateUsTrusteeQuarterlyFeeCents(1_000_000)).toEqual({
        fee_cents: 32_500,
        tier_label: "≤ $14,999.99 → $325",
      });
      expect(calculateUsTrusteeQuarterlyFeeCents(5_000_000)).toEqual({
        fee_cents: 55_000,
        tier_label: "$15,000–$74,999.99 → $550",
      });
      expect(calculateUsTrusteeQuarterlyFeeCents(50_000_000)).toEqual({
        fee_cents: 272_500,
        tier_label: "$500,000–$999,999.99 → $2,725",
      });
      expect(calculateUsTrusteeQuarterlyFeeCents(150_000_000).fee_cents).toBe(987_500);
    });
  });

  describe("calendarQuarterContaining — F425C-EXHIBIT-D-NOT-A-REAL-QUARTER", () => {
    it("snaps a mid-quarter month to the full calendar quarter it falls in", () => {
      expect(calendarQuarterContaining("2026-08-15")).toEqual({
        period_start: "2026-07-01",
        period_end: "2026-09-30",
      });
    });

    it("handles the first and last months of a quarter identically to the middle month", () => {
      expect(calendarQuarterContaining("2026-01-31")).toEqual({
        period_start: "2026-01-01",
        period_end: "2026-03-31",
      });
      expect(calendarQuarterContaining("2026-12-01")).toEqual({
        period_start: "2026-10-01",
        period_end: "2026-12-31",
      });
    });
  });

  describe("buildExhibitD — must never compute the statutory fee over a partial quarter", () => {
    it("queries the full calendar quarter even when the shared exhibits period is a single month", async () => {
      const client = {
        query: vi.fn(async () => ({ rows: [{ disbursements_cents: "14297341" }] })),
      };
      // The exhibits UI defaults to (and normally passes) one calendar month — August only here.
      const exhibit = await buildExhibitD(client, {
        operating_company_id: companyId,
        period_start: "2026-08-01",
        period_end: "2026-08-31",
      });
      const queryArgs = client.query.mock.calls[0]?.[1] as unknown[];
      expect(queryArgs[1]).toBe("2026-07-01");
      expect(queryArgs[2]).toBe("2026-09-30");
      expect(exhibit.period_start).toBe("2026-07-01");
      expect(exhibit.period_end).toBe("2026-09-30");
    });
  });

  describe("buildAllExhibits", () => {
    it("builds all six exhibits sequentially", async () => {
      const client = { query: vi.fn(async () => ({ rows: [] })) };
      const built = await buildAllExhibits(client, {
        userId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        operating_company_id: companyId,
        period_start: "2026-05-01",
        period_end: "2026-05-31",
      });
      expect(built.exhibits.a).toBeTruthy();
      expect(built.exhibits.b).toBeTruthy();
      expect(built.exhibits.c).toBeTruthy();
      expect(built.exhibits.d).toBeTruthy();
      expect(built.exhibits.e).toBeTruthy();
      expect(built.exhibits.f).toBeTruthy();
      expect(getBuiltExhibits(built.filing_uuid)).toEqual(built);
    });
  });

  describe("Exhibit C statement chain", () => {
    it("uses the exact-period reconciliation opening balance and exposes its source", async () => {
      const client = {
        query: vi.fn(async () => ({
          rows: [{
            id: "11111111-1111-4111-8111-111111111111",
            name: "DIP Operating",
            mask: "3500",
            inflows: "500000",
            outflows: "200000",
            beginning_balance_cents: "900000",
            reconciliation_session_id: "22222222-2222-4222-8222-222222222222",
          }],
        })),
      };
      const exhibit = await buildExhibitC(client, {
        operating_company_id: companyId,
        period_start: "2026-05-01",
        period_end: "2026-05-31",
      });
      expect(exhibit.accounts[0]).toMatchObject({
        opening_balance_cents: 900000,
        closing_balance_cents: 1200000,
        opening_balance_source: "reconciliation_session",
        reconciliation_session_id: "22222222-2222-4222-8222-222222222222",
      });
      expect(String(client.query.mock.calls[0]?.[0])).toContain("banking.reconciliation_sessions");
    });
  });

  describe("billReference — a court schedule must never label a document 'null' or a uuid", () => {
    it("uses the vendor's bill_number when present", () => {
      expect(
        billReference({
          bill_number: "13401-5723",
          vendor_name: "Pilot Travel Centers",
          total_cents: "60956",
          bill_date: "2026-06-30",
        })
      ).toBe("13401-5723");
    });

    it("falls back to vendor + date + amount — never 'null', never a uuid", () => {
      const ref = billReference({
        bill_number: null,
        vendor_name: "Pilot Travel Centers",
        total_cents: "60956",
        bill_date: "2026-06-30",
      });
      expect(ref).toContain("Pilot Travel Centers");
      expect(ref).toContain("2026-06-30");
      expect(ref).toContain("$609.56");
      expect(ref).not.toMatch(/null|undefined/);
      expect(ref).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/); // no uuid
    });

    it("stays honest when the vendor is missing too — no fabricated reference", () => {
      const ref = billReference({
        bill_number: "   ", // whitespace-only must not count as a real reference
        vendor_name: null,
        total_cents: "9500000",
        bill_date: null,
      });
      expect(ref).toContain("vendor not recorded");
      expect(ref).toContain("date not recorded");
      expect(ref).toContain("$95,000.00");
      expect(ref).not.toMatch(/null|undefined/);
    });
  });

  describe("buildExhibitF — court schedule must be complete and must fail loud", () => {
    const period = {
      operating_company_id: companyId,
      period_start: "2023-08-01",
      period_end: "2023-08-31",
    };

    it("returns every document for the period — no silent LIMIT cap", async () => {
      // Prod 2026-07-31: 29 invoice-months and 22 bill-months exceeded the old LIMIT 200
      // (worst 345 invoices / 342 bills). 250 rows per source reproduces a real breaching month.
      const invoiceRows = Array.from({ length: 250 }, (_, i) => ({
        id: `inv-${i}`,
        display_id: `INV-${i}`,
        total_cents: "1000",
        invoice_date: "2023-08-15",
      }));
      const billRows = Array.from({ length: 250 }, (_, i) => ({
        id: `bill-${i}`,
        bill_number: `13401-${i}`,
        vendor_name: "Pilot Travel Centers",
        total_cents: "2000",
        bill_date: "2023-08-15",
      }));
      const client = {
        query: vi.fn(async (sql: string) => {
          // The independent completeness counts must agree with the materialised rows.
          if (sql.includes("count(*)") && sql.includes("accounting.invoices"))
            return { rows: [{ n: String(invoiceRows.length) }] };
          if (sql.includes("count(*)") && sql.includes("accounting.bills"))
            return { rows: [{ n: String(billRows.length) }] };
          if (sql.includes("accounting.invoices")) return { rows: invoiceRows };
          if (sql.includes("accounting.bills")) return { rows: billRows };
          return { rows: [] };
        }),
      };

      const exhibit = await buildExhibitF(client as any, period);

      expect(exhibit.documents).toHaveLength(500);
      // document_count must be the TRUE count, not a truncated length reported as fact.
      expect(exhibit.document_count).toBe(500);
      expect(exhibit.invoice_count).toBe(250);
      expect(exhibit.bill_count).toBe(250);
      expect(exhibit.documents.filter((d) => d.doc_type === "invoice")).toHaveLength(250);
      expect(exhibit.documents.filter((d) => d.doc_type === "bill")).toHaveLength(250);
      // The emitted SQL must carry no cap.
      for (const call of client.query.mock.calls) {
        expect(String(call[0])).not.toMatch(/\bLIMIT\s+\d+/i);
      }
    });

    it("throws when fewer rows materialise than the database reports — document_count can never under-report", async () => {
      // Simulates a cap/pagination being reintroduced: DB says 345, only 200 come back.
      const capped = Array.from({ length: 200 }, (_, i) => ({
        id: `inv-${i}`,
        display_id: `INV-${i}`,
        total_cents: "1000",
        invoice_date: "2023-08-15",
      }));
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("count(*)") && sql.includes("accounting.invoices"))
            return { rows: [{ n: "345" }] };
          if (sql.includes("count(*)")) return { rows: [{ n: "0" }] };
          if (sql.includes("accounting.invoices")) return { rows: capped };
          return { rows: [] };
        }),
      };
      await expect(buildExhibitF(client as any, period)).rejects.toThrow(
        /INCOMPLETE[\s\S]*345 qualifying records but only 200/
      );
    });

    it("throws when a query fails — never renders a blank court exhibit", async () => {
      const client = {
        query: vi.fn(async () => {
          throw new Error('relation "accounting.invoices" does not exist');
        }),
      };
      await expect(buildExhibitF(client as any, period)).rejects.toThrow(/does not exist/);
    });
  });

  describe("routes", () => {
    let app: FastifyInstance;
    beforeEach(async () => {
      app = Fastify();
      await registerForm425cExhibitsRoutes(app);
    });
    afterEach(async () => {
      await app.close();
    });

    it("POST build returns all exhibits", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/reports/form-425c/exhibits/build",
        payload: {
          operating_company_id: companyId,
          period_start: "2026-05-01",
          period_end: "2026-05-31",
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as Record<string, any>;
      expect(body.filing_uuid).toBeTruthy();
      expect(body.exhibits.a.rows.length).toBeGreaterThan(0);
    });

    it("GET single exhibit by letter", async () => {
      const buildRes = await app.inject({
        method: "POST",
        url: "/api/v1/reports/form-425c/exhibits/build",
        payload: {
          operating_company_id: companyId,
          period_start: "2026-05-01",
          period_end: "2026-05-31",
        },
      });
      const filingUuid = (buildRes.json() as { filing_uuid: string }).filing_uuid;
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/reports/form-425c/exhibits/${filingUuid}/exhibit/d?operating_company_id=${companyId}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as Record<string, any>;
      expect(body.letter).toBe("d");
      expect(body.exhibit.fee_cents).toBe(132_500);
    });
  });
});
