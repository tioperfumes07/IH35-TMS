import { describe, it, expect } from "vitest";
import page from "../PostingLineagePage.tsx?raw";

// GLOBAL-COLS-01 (Phase A adoption): PostingLineagePage traces a source transaction to its GL
// posting rows + linked objects — a high-value accounting audit surface. It previously rendered
// a hand-rolled <table> with no sort/resize/column-picker. Migrated to the shared ParityTable
// (the same "global column resize/sort" grammar every other list surface inherits) so this
// surface gets sort, drag/keyboard/touch column resize, density, and CSV export for free.
// Locks the migration against regressing back to a raw <table>.
describe("PostingLineagePage GLOBAL-COLS-01 guard", () => {
  it("uses the shared ParityTable grammar (sort, resize, gear column-picker)", () => {
    expect(page).toContain("ParityTable");
    expect(page).toContain("components/parity/ParityTable");
  });

  it("does not fall back to a hand-rolled <table>", () => {
    expect(page).not.toMatch(/<table[\s>]/);
    expect(page).not.toMatch(/<thead[\s>]/);
  });

  it("keeps every lineage column from the pre-migration table", () => {
    for (const col of [
      'label: "Occurred"',
      'label: "JE"',
      'label: "Posting batch"',
      'label: "Account"',
      'label: "Side"',
      'label: "Amount"',
      'label: "Linked object"',
    ]) {
      expect(page, `missing column ${col}`).toContain(col);
    }
  });

  it("keeps the honest empty state and no stub strings", () => {
    expect(page).toContain("No posting lineage rows found for this source transaction.");
    expect(page).not.toMatch(/TODO|FIXME|coming soon|not implemented/i);
  });

  it("still submits source_transaction_type/source_transaction_id via getAccountingSourceLineage (contract guard invariant)", () => {
    expect(page).toContain("getAccountingSourceLineage");
    expect(page).toContain("source_transaction_type");
    expect(page).toContain("source_transaction_id");
  });

  it("maps UI type payment to canonical customer_payment (PMT lineage 0-row)", () => {
    expect(page).toContain('=== "payment"');
    expect(page).toContain('"customer_payment"');
  });
});
