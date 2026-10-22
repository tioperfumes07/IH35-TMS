import { describe, expect, it } from "vitest";
import { cashFlowReceiptsSql } from "../cash-flow-receipts.sql.js";
import { issuedInvoice, liveInvoice } from "../../accounting/live-document-predicates.sql.js";
import { loadServiceMembershipSql } from "../../dispatch/load-service.js";

describe("canonical cash receipt SQL", () => {
  for (const eta of [false, true]) {
    const sql = cashFlowReceiptsSql(eta);
    const unbilled = sql.split("), proforma_receipts AS (")[0]!;
    const proforma = sql.split("), proforma_receipts AS (")[1]!.split("), invoice_receipts AS (")[0]!;
    const invoice = sql.split("), invoice_receipts AS (")[1]!;
    it(`gates only unbilled forecasts on canonical load membership (ETA=${eta})`, () => {
      expect(unbilled).toContain(loadServiceMembershipSql("l", "live", "$1::uuid"));
      expect(proforma).not.toContain("views.live_loads");
      expect(invoice).not.toContain("views.live_loads");
      expect(invoice).not.toContain("driver_settlements");
      expect(invoice).toContain("LEFT JOIN mdata.loads");
    });
    it(`keeps the three sources disjoint and uses canonical amounts (ETA=${eta})`, () => {
      expect(unbilled).toContain(issuedInvoice("issued"));
      expect(unbilled).toContain("pf.status = 'proforma'");
      expect(proforma).toContain(issuedInvoice("issued"));
      expect(proforma).toContain("SELECT DISTINCT ON (l.id)");
      expect(proforma).toContain("i.broker_advance_applied_cents");
      expect(invoice).toContain("i.amount_open_cents::bigint");
      expect(invoice).toContain("i.status IN ('sent', 'partial')");
      expect(invoice).toContain("= 'not_factored'");
      expect(invoice).toContain(liveInvoice("i"));
      expect(sql).not.toContain("l.rate_total_cents");
    });
    it(`reads only the last active delivery stop and scopes every source (ETA=${eta})`, () => {
      expect(sql.match(/ORDER BY sequence_number DESC LIMIT 1/g)).toHaveLength(3);
      expect(sql.match(/stop_type = 'delivery' AND soft_deleted_at IS NULL/g)).toHaveLength(3);
      expect(unbilled).toContain("l.operating_company_id = $1::uuid");
      expect(proforma).toContain("i.operating_company_id = $1::uuid");
      expect(invoice).toContain("i.operating_company_id = $1::uuid");
    });
  }
  it("flags change forecasts, never invoice due-date semantics", () => {
    const on = cashFlowReceiptsSql(true), off = cashFlowReceiptsSql(false);
    expect(on).toContain("l.predicted_delivery_date");
    expect(off).not.toContain("l.predicted_delivery_date");
    expect(on.split("), invoice_receipts AS (")[1]).toBe(off.split("), invoice_receipts AS (")[1]);
  });
});
