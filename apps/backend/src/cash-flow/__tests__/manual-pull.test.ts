import { describe, expect, it } from "vitest";
import { MANUAL_PULL_SOURCES_SQL, planManualPull, type PullSource } from "../manual-pull.service.js";

const source = (id: string, kind: PullSource["kind"] = "bill"): PullSource => ({
  id,kind,direction:kind === "invoice" ? "income" : "expense",amount_cents:"5000",
  invoice_no:"same-number",party_name:null,party_ref_id:null,party_ref_kind:null,
  category:kind === "bill" ? "Bill (software)" : kind === "invoice" ? "Invoice (software)" : "Expense (software)",
});
describe("manual transaction pull", () => {
  it("does not cap any of the four document families at 100", () => {
    const rows = (["bill","expense","payment","invoice"] as const).flatMap(kind =>
      Array.from({length:201},(_,i)=>source(`${kind}-${i}`,kind)));
    expect(planManualPull(rows,[]).create).toHaveLength(804);
    expect(MANUAL_PULL_SOURCES_SQL).not.toMatch(/\bLIMIT\b|\bOFFSET\b/);
    expect(MANUAL_PULL_SOURCES_SQL).not.toMatch(/i\.issue_date|b\.bill_date/);
  });
  it("includes both partial bill spellings with live status/timestamp predicates", () => {
    expect(MANUAL_PULL_SOURCES_SQL).toContain("'partial','partially_paid'");
    expect(MANUAL_PULL_SOURCES_SQL).toContain("b.voided_at IS NULL");
    expect(MANUAL_PULL_SOURCES_SQL).toContain("b.revoked_at IS NULL");
    expect(MANUAL_PULL_SOURCES_SQL).toContain("e.voided_at IS NULL");
    expect(MANUAL_PULL_SOURCES_SQL).toContain("i.voided_at IS NULL");
  });
  it("uses the full bill balance net of credits and applications", () => {
    expect(MANUAL_PULL_SOURCES_SQL).toContain("accounting.vendor_credit_applications");
    expect(MANUAL_PULL_SOURCES_SQL).toContain("accounting.payment_applications");
    expect(MANUAL_PULL_SOURCES_SQL).toContain("pa.unapplied_at IS NULL");
    expect(MANUAL_PULL_SOURCES_SQL).toContain("vca.voided_at IS NULL");
  });
  it("excludes noncash settlement payment rows", () => {
    expect(MANUAL_PULL_SOURCES_SQL).toContain("bp.settlement_deduction_noncash IS NOT TRUE");
    expect(MANUAL_PULL_SOURCES_SQL).toContain("bp.voided_at IS NULL");
    expect(MANUAL_PULL_SOURCES_SQL).toContain("COALESCE(bp.status,'') NOT IN ('void','voided')");
  });
  it("binds the company in every source", () => {
    for (const alias of ["b","e","bp","i"]) expect(MANUAL_PULL_SOURCES_SQL).toContain(`${alias}.operating_company_id=$1::uuid`);
  });
  it("retry uses source kind/id even if the document number changes", () => {
    const row=source("bill-a");
    expect(planManualPull([row],[{...row,id:"snapshot",invoice_no:"old-number",memo:"[transaction:bill:bill-a] Pulled document snapshot"}]).create).toHaveLength(0);
  });
  it("different document families sharing a number do not collide", () => {
    const bill=source("bill-a"), expense=source("expense-a","expense");
    expect(planManualPull([bill,expense],[{...bill,id:"snapshot",memo:"Pulled from unpaid bills"}]).create).toEqual([expense]);
  });
  it("never silently counts one legacy same-check snapshot as two source payments", () => {
    const first={...source("pay-a","payment"),category:"Payment (check)"};
    const second={...first,id:"pay-b"};
    const plan=planManualPull([first,second],[{...first,id:"old-snapshot",memo:"Pulled from bill payments / card"}]);
    expect(plan.create).toHaveLength(0);
    expect(plan.issues).toEqual([{id:"old-snapshot",reason:"Ambiguous historical snapshot matches multiple source documents; preserved, requires review"}]);
  });
  it("preserves and reports a changed old snapshot instead of silently replacing it", () => {
    const row=source("bill-a");
    const plan=planManualPull([row],[{...row,id:"snapshot",amount_cents:"8000",memo:"Pulled from unpaid bills"}]);
    expect(plan.create).toHaveLength(0);
    expect(plan.issues).toEqual([{id:"snapshot",reason:"Snapshot amount differs from current source; preserved"}]);
  });
  it("reports a previously pulled now-voided or missing source, leaving manual rows alone", () => {
    expect(planManualPull([],[{...source("old"),memo:"Pulled from unpaid bills"},
      {...source("manual"),category:"Manual plan",memo:null}]).issues).toHaveLength(1);
  });
  it("rejects duplicate source identity and unsafe numeric values", () => {
    expect(()=>planManualPull([source("a"),source("a")],[])).toThrow("Duplicate source identity");
    expect(()=>planManualPull([{...source("a"),amount_cents:"NaN"}],[])).toThrow("Invalid source amount");
  });
});
