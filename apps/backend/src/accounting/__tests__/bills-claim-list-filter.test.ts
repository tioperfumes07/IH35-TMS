import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routes = fs.readFileSync(path.join(here, "../bills.routes.ts"), "utf8");
const service = fs.readFileSync(path.join(here, "../bills.service.ts"), "utf8");
const claimsTab = fs.readFileSync(
  path.join(here, "../../../../frontend/src/pages/insurance/ClaimsTab.tsx"),
  "utf8"
);
const reverse = fs.readFileSync(
  path.join(here, "../../../../frontend/src/components/accounting/BillsReverseSection.tsx"),
  "utf8"
);

// ACCT-F5035 — bills.insurance_claim_id create existed; list filter + ClaimsTab reverse were missing.
describe("accounting/bills ACCT-F5035-CLAIM-LIST-FILTER-REVERSE", () => {
  it("GET list accepts optional insurance_claim_id", () => {
    expect(routes).toMatch(
      /listBillsQuerySchema = companyQuerySchema\.extend\(\{[\s\S]*?insurance_claim_id: z\.string\(\)\.uuid\(\)\.optional\(\),/
    );
  });

  it("passes insuranceClaimId into listBills", () => {
    expect(routes).toContain("insuranceClaimId: query.data.insurance_claim_id");
  });

  it("listBillsByVendor and listAllBillsForCompany filter on b.insurance_claim_id", () => {
    expect(service).toContain("if (options.insuranceClaimId) {");
    expect(service).toContain("where.push(`b.insurance_claim_id = $${values.length}::uuid`);");
    const hits = service.split("if (options.insuranceClaimId) {").length - 1;
    expect(hits).toBeGreaterThanOrEqual(2);
  });

  it("ClaimsTab mounts BillsReverseSection with insurance_claim_id filter", () => {
    expect(claimsTab).toMatch(/BillsReverseSection[\s\S]{0,280}?filter=\{\{\s*insurance_claim_id:/);
  });

  it("BillsReverseSection calls listBills with the filter", () => {
    expect(reverse).toMatch(/listBills\(operatingCompanyId,\s*\{\s*\.\.\.filter/);
  });
});
