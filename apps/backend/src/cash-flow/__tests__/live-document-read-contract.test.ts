import { describe, expect, it } from "vitest";
import { getDailyPrediction, getActualVsProjected } from "../cash-flow.service.js";
import { liveSettlement, openDriverBill } from "../../accounting/live-document-predicates.sql.js";
import { loadServiceMembershipSql } from "../../dispatch/load-service.js";

/** Exercises the public reader's generated queries, not a copied calculation.
 * SQL execution and ledger invariance are separately proven on the isolated fork.
 */
describe("443.213 cash-flow canonical document queries", () => {
  it("adds PostgreSQL bigint receipt results numerically", async () => {
    const client = { query: async (sql: string) => ({ rows:
      sql.includes('SUM(amount_cents)::bigint AS projected_income_cents') ? [
        { delivery_date: '2030-01-01', projected_income_cents: '10000' },
        { delivery_date: '2030-01-02', projected_income_cents: '20000' },
      ] : []
    }) };
    const result = await getActualVsProjected(client as never, '11111111-1111-4111-8111-111111111111', '2030-01-01', '2030-01-02');
    expect(result.accuracy_summary.total_projected_income_cents).toBe(30000);
  });
  for (const cashFollowsEta of [false, true]) {
    it(`uses canonical sources without treating driver-pay closure as receipt (ETA=${cashFollowsEta})`, async () => {
      const queries: string[] = [];
      const client = { query: async (sql: string) => { queries.push(sql); return { rows: [] }; } };
      await getDailyPrediction(client as never, "11111111-1111-4111-8111-111111111111", "2030-01-01", cashFollowsEta);
      const income = queries.filter(sql => sql.includes("FROM mdata.loads l") || sql.includes("JOIN mdata.loads l"));
      expect(income.length).toBeGreaterThan(2);
      for (const sql of income) {
        expect(sql).toContain(loadServiceMembershipSql("l", "live", "$1::uuid"));
        expect(sql).not.toContain("l.rate_total_cents");
        expect(sql).toContain("dispatch.load_charge_lines");
        expect(sql).toContain("issued.document_count");
        const invoiceStream = sql.split("invoice_receipts AS (")[1]?.split("SELECT * FROM unbilled_receipts")[0];
        expect(invoiceStream).toBeDefined();
        expect(invoiceStream).not.toContain("views.live_loads");
        expect(invoiceStream).toContain("i.amount_open_cents");
        // Daily strip also contains a separate driver-pay subquery. It must not
        // correlate receipt eligibility to a closed driver settlement's load.
        expect(sql).not.toContain("sl.load_id=l.id");
        expect(sql).not.toContain("db.load_id=l.id");
      }
      const pay = queries.find(sql => sql.includes("FROM driver_finance.driver_settlements s") && sql.includes("s.id::text"));
      expect(pay).toContain(liveSettlement("s"));
      const bills = queries.find(sql => sql.includes("FROM driver_finance.driver_bills db"));
      expect(bills).toContain(openDriverBill("db"));
    });
  }
});
