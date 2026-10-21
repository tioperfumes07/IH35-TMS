import { describe, expect, it } from "vitest";
import { getDailyPrediction } from "../cash-flow.service.js";
import { liveSettlement, openDriverBill } from "../../accounting/live-document-predicates.sql.js";
import { canonicalHappenedNotVoidedLoadClause } from "../../dispatch/canonical-active-load-set.js";

/** Exercises the public reader's generated queries, not a copied calculation.
 * SQL execution and ledger invariance are separately proven on the isolated fork.
 */
describe("443.213 cash-flow canonical document queries", () => {
  for (const cashFollowsEta of [false, true]) {
    it(`uses canonical sources without treating driver-pay closure as receipt (ETA=${cashFollowsEta})`, async () => {
      const queries: string[] = [];
      const client = { query: async (sql: string) => { queries.push(sql); return { rows: [] }; } };
      await getDailyPrediction(client as never, "11111111-1111-4111-8111-111111111111", "2030-01-01", cashFollowsEta);
      const income = queries.filter(sql => sql.includes("FROM mdata.loads l") || sql.includes("JOIN mdata.loads l"));
      expect(income.length).toBeGreaterThan(2);
      for (const sql of income) {
        expect(sql).toContain(canonicalHappenedNotVoidedLoadClause("l"));
        expect(sql).not.toContain("l.rate_total_cents");
        expect(sql).toContain("dispatch.load_charge_lines");
        expect(sql).toContain("issued.document_count");
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
