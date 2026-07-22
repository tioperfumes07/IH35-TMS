import { describe, it, expect } from "vitest";
import page from "../AccountRegisterPage.tsx?raw";
import manifest from "../../../routes/manifest.tsx?raw";
import parityTableSrc from "../../../components/parity/ParityTable.tsx?raw";

// CA-05 static guard for the QBO-parity register page: columns present, drill-through wired to REAL routes,
// cents formatting, density, honest empty state, no stubs. Locks the COMPLETE-BUILD bar against regressions.
//
// 2026-07-07: migrated from a hand-rolled <table> to the shared ParityTable (gear column-picker,
// resizable columns, page-size pager) per the approved design (docs/approved-screens/preview-register-qbo.html).
// Column labels moved from literal JSX (`>Payee<`) to a `ParityColumn[]` array (`label: "Payee"`), and
// Increase/Decrease/Running balance were relabeled Payment/Deposit/Balance per the design + the
// ACCOUNT-REGISTER-GAP-ANALYSIS "relabel per account type" gap. Assertions below were UPDATED to match
// the real rendered structure, never weakened — same coverage, new shape.
describe("AccountRegisterPage CA-05 guard", () => {
  it("uses the shared ParityTable grammar (gear column-picker, resize, pager)", () => {
    expect(page).toContain("ParityTable");
  });

  it("renders the QBO-parity columns", () => {
    for (const col of ['label: "Payee"', 'label: "Account"', 'label: "Class"', 'label: "Payment"', 'label: "Deposit"', 'label: "Balance"', 'label: "C/R"']) {
      expect(page, `missing column ${col}`).toContain(col);
    }
  });

  it("wires row drill-through to the source transaction", () => {
    expect(page).toMatch(/onRowClick=\{\(r\)\s*=>\s*navigate\(sourceRoute\(/);
  });

  it("every drill-through target route exists in the manifest", () => {
    // base paths the resolver navigates to — each must be a real <Route> in the manifest.
    const targets = [
      "/accounting/invoices/",
      "/accounting/payments/",
      "/accounting/bills",
      "/accounting/bill-payments",
      "/accounting/expenses/list",
      "/driver-finance/settlements",
      "/accounting/journal-entries",
      "/banking/transactions",
    ];
    const missing = targets.filter((t) => {
      const base = t.endsWith("/") ? t.slice(0, -1) : t; // strip the :id trailing slash
      return !(manifest.includes(`path="${base}"`) || manifest.includes(`path="${base}/:id"`));
    });
    expect(missing, `drill-through routes not in manifest: ${missing.join(", ")}`).toEqual([]);
  });

  it("maps bank_categorization register rows to the bank txn deep-link", () => {
    expect(page).toMatch(
      /t === ["']bank_categorization["'] && reference\)\s*return [`'"]\/banking\/transactions\?txn_id=\$\{reference\}[`'"]/
    );
  });

  it("formats money in cents (/100) — no 10x bug", () => {
    expect(page).toMatch(/\/\s*100/); // fmtCents divides cents by 100
    expect(page).toContain("fmtCents(");
  });

  it("has a density toggle (via ParityTable's gear) + honest empty state, no stub strings", () => {
    // Density is now provided by the shared ParityTable gear popover (regular/compact/ultra), not a
    // page-local control — asserted directly against the shared component, not duplicated per-page.
    expect(parityTableSrc).toContain("Density");
    expect(page).toContain("No transactions in this range.");
    expect(page).not.toMatch(/TODO|FIXME|coming soon|not implemented/i);
  });

  it("shows an honest C/R reconciliation banner (not a fake checkmark)", () => {
    expect(page).toContain("Reconciliation not yet available");
  });
});
