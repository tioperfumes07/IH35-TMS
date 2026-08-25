import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// DISP-F6XXX -- accounting.journal_entries.source has a hard CHECK constraint,
// CHECK (source IN ('manual', 'auto')) (db/migrations/0092_p5_d4_manual_journal_entries.sql).
// postDifferenceJournalEntry (match.service.ts) used to insert the literal 'bank_reconciliation',
// which was never a valid value -- every accept-match call with a non-zero variance 500'd with
// "new row for relation journal_entries violates check constraint journal_entries_source_check".
// The existing unit test suite for this function fully mocks match.service.ts
// (accept-match-with-variance-q8.test.ts), so the real INSERT statement was never exercised
// against the real constraint. This is a plain source-text guard until a DB-integration test can
// cover the real INSERT.
const matchServicePath = fileURLToPath(new URL("../match.service.ts", import.meta.url));
const reconWorklistPath = fileURLToPath(new URL("../recon-worklist.service.ts", import.meta.url));

describe("DISP-F6XXX — bank-recon variance JE never writes an invalid journal_entries.source value", () => {
  it("postDifferenceJournalEntry's INSERT uses 'auto', not the invalid 'bank_reconciliation'", () => {
    const source = readFileSync(matchServicePath, "utf8");
    // Scope strictly to THIS insert's own VALUES(...) clause -- there are other, unrelated INSERTs
    // in this file (e.g. storeMatch's reconciliation_matches insert), and the explanatory comment
    // right above this one deliberately names the old, invalid literal for future readers, so an
    // unscoped string check would trip on either.
    const journalEntriesInsert = source.indexOf("INSERT INTO accounting.journal_entries");
    expect(journalEntriesInsert).toBeGreaterThan(-1);
    const valuesStart = source.indexOf("VALUES (", journalEntriesInsert);
    const valuesEnd = source.indexOf("$4::uuid", valuesStart);
    const insertBlock = source.slice(valuesStart, valuesEnd);
    expect(insertBlock).not.toContain("'bank_reconciliation'");
    expect(insertBlock).toContain("'auto'");
  });

  it("the worklist's variance-resolved read filters on the same valid source value", () => {
    const source = readFileSync(reconWorklistPath, "utf8");
    expect(source).not.toContain("je.source = 'bank_reconciliation'");
    expect(source).toContain("je.source = 'auto'");
  });
});
