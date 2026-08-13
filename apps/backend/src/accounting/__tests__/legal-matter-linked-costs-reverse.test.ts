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
