import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const drawer = fs.readFileSync(
  path.join(here, "../../../../frontend/src/components/safety/AccidentReportDrawer.tsx"),
  "utf8"
);

// ACCT-F5040 — accident with linked claim_id must reverse-mount expenses+bills (never invent FK from free text).
describe("safety/accident ACCT-F5040-CLAIM-FINANCIAL-REVERSE", () => {
  it("mounts ExpensesReverseSection and BillsReverseSection when claim_id is present", () => {
    expect(drawer).toMatch(/accident-claim-financial-reverse/);
    expect(drawer).toMatch(/ExpensesReverseSection[\s\S]{0,320}?filter=\{\{\s*insurance_claim_id:/);
    expect(drawer).toMatch(/BillsReverseSection[\s\S]{0,320}?filter=\{\{\s*insurance_claim_id:/);
  });

  it("does not invent a claim FK from free-text insurance claim number alone", () => {
    expect(drawer).toContain("accident?.claim_id");
    expect(drawer).not.toMatch(/filter=\{\{\s*insurance_claim_id:\s*insuranceClaimNumber/);
  });
});
