import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

// FIN-19 read-only guard. The financial-statement surfaces (Profit & Loss, Balance Sheet,
// Trial Balance) must compute purely from reads against accounting.journal_entry_postings +
// catalogs.accounts. This guard fails if any write SQL (INSERT/UPDATE/DELETE/MERGE/TRUNCATE/
// DROP) is ever introduced into their route or service files, locking the statements as
// strictly read-only. `SELECT set_config(...)` for RLS scoping is a read and is allowed.

const HERE = dirname(fileURLToPath(import.meta.url));

const STATEMENT_FILES = [
  "profit-loss.routes.ts",
  "profit-loss.service.ts",
  "balance-sheet.routes.ts",
  "balance-sheet.service.ts",
  "trial-balance.routes.ts",
  "trial-balance.service.ts",
];

// Match write verbs only as standalone SQL keywords (word boundaries, case-insensitive).
const WRITE_SQL = /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP)\s+(INTO\b|FROM\b|TABLE\b|SET\b|[A-Za-z_."]+)/i;

describe("FIN-19 — financial statements are read-only", () => {
  for (const file of STATEMENT_FILES) {
    it(`${file} contains no write SQL`, () => {
      const source = readFileSync(join(HERE, file), "utf8");
      const offending = source
        .split("\n")
        .map((line, i) => ({ line: line.trim(), n: i + 1 }))
        .filter(({ line }) => WRITE_SQL.test(line));
      expect(offending, `write SQL found in ${file}: ${JSON.stringify(offending)}`).toEqual([]);
    });
  }
});
