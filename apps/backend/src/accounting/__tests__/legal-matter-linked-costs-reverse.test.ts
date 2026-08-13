import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routes = fs.readFileSync(path.join(here, "../bills.routes.ts"), "utf8");
const api = fs.readFileSync(
  path.join(here, "../../../../frontend/src/api/accounting.ts"),
  "utf8"
);
const page = fs.readFileSync(
  path.join(here, "../../../../frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx"),
  "utf8"
);
const section = fs.readFileSync(
  path.join(here, "../../../../frontend/src/components/accounting/LegalMatterCostsReverseSection.tsx"),
  "utf8"
);

// ACCT-F5041 — linked-costs API existed; LegalMatterDetail never called it.
describe("accounting/legal-matters ACCT-F5041-LINKED-COSTS-REVERSE", () => {
  it("registers GET linked-costs with rateLimit", () => {
    expect(routes).toContain('/api/v1/accounting/legal-matters/:id/linked-costs');
    expect(routes).toContain("listLegalMatterLinkedCosts");
  });

  it("FE client calls linked-costs", () => {
    expect(api).toContain("listLegalMatterLinkedCosts");
    expect(api).toContain("/api/v1/accounting/legal-matters/${legalMatterId}/linked-costs");
  });

  it("LegalMatterDetailPage mounts LegalMatterCostsReverseSection", () => {
    expect(page).toContain("LegalMatterCostsReverseSection");
    expect(section).toContain("listLegalMatterLinkedCosts");
  });
});

describe("accounting/bills ACCT-F5042-LEGAL-MATTER-FORWARD-WRITE", () => {
  const service = fs.readFileSync(path.join(here, "../bills.service.ts"), "utf8");

  it("createBillBodySchema accepts legal_matter_id", () => {
    expect(routes).toMatch(
      /createBillBodySchema = z\.object\(\{[\s\S]*?legal_matter_id: z\.string\(\)\.uuid\(\)\.optional\(\)\.nullable\(\),/
    );
  });

  it("passes legalMatterId into createBill and UPDATE-stamps legal_matter_id", () => {
    expect(routes).toContain("legalMatterId: body.data.legal_matter_id");
    expect(service).toContain("input.legalMatterId");
    expect(service).toContain("SET legal_matter_id = $3::uuid");
  });
});

describe("accounting/bills ACCT-F5043-LEGAL-MATTER-PICKER-ON-CREATE", () => {
  const form = fs.readFileSync(
    path.join(here, "../../../../frontend/src/components/accounting/VendorBillForm.tsx"),
    "utf8"
  );
  const registry = fs.readFileSync(
    path.join(here, "../../../../frontend/src/components/parity/entityPickerRegistry.ts"),
    "utf8"
  );
  const modal = fs.readFileSync(
    path.join(here, "../../../../frontend/src/pages/maintenance/components/CreateBillModal.tsx"),
    "utf8"
  );

  it("EntityPicker registry has legal_matter kind reading legal.matters", () => {
    expect(registry).toContain('kind: "legal_matter"');
    expect(registry).toContain('readTable: "legal.matters"');
    expect(registry).toContain("legalMattersApi.list");
  });

  it("VendorBillForm stamps legal_matter_id from picker or linkedLegalMatterId", () => {
    expect(form).toContain('kind="legal_matter"');
    expect(form).toContain("legal_matter_id: resolvedLegalMatterId");
    expect(form).toContain("linkedLegalMatterId");
  });

  it("LegalMatterDetail Create Bill opens CreateBillModal with linkedLegalMatterId", () => {
    expect(page).toContain("CreateBillModal");
    expect(page).toContain("linkedLegalMatterId={id}");
    expect(page).toContain("+ Create Bill");
    expect(modal).toContain("linkedLegalMatterId");
  });
});
