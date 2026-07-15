#!/usr/bin/env node
// #3 GUARD — internal-labor WO close must NEVER insert an accounting.journal_entries HEADER without balanced
// posting LINES. It previously wrote a status='posted' JE header with NO journal_entry_postings — an
// unbalanced, empty JE that corrupts the ledger. The fix removed that write; this guard fails if any lineless
// JE insert is re-introduced in the file (either post through the existing engine WITH journal_entry_postings,
// or don't post — never a bare header).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FILE = "apps/backend/src/maintenance/internal-labor.routes.ts";

export function run() {
  const failures = [];
  let src = "";
  try {
    src = fs.readFileSync(FILE, "utf8");
  } catch {
    failures.push(`missing file: ${FILE}`);
    return failures;
  }
  const insertsHeader = /INSERT\s+INTO\s+accounting\.journal_entries/i.test(src);
  const insertsLines = /journal_entry_postings/i.test(src) || /postSourceTransaction|createJournalEntry|buildBalancedJe|postBalancedJe/i.test(src);
  if (insertsHeader && !insertsLines) {
    failures.push(
      `${FILE}: inserts an accounting.journal_entries HEADER with no journal_entry_postings (lineless/unbalanced JE). Post a BALANCED entry via the existing posting engine, or do not post — never a bare header.`
    );
  }
  return failures;
}

function main() {
  const failures = run();
  if (failures.length) {
    console.error("\nFAIL verify-internal-labor-no-lineless-je:");
    failures.forEach((f) => console.error(`  • ${f}`));
    process.exit(1);
  }
  console.log("\nPASS verify-internal-labor-no-lineless-je — no lineless journal-entry header in internal-labor.");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
