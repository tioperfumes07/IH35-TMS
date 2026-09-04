#!/usr/bin/env node
/**
 * MATCHED-STATE INVARIANT (owner-ordered 2026-09-04) — review_state = 'matched' on
 * banking.bank_transactions must REQUIRE at least one matched_*_id to be non-null. A row that says
 * "matched" but points at nothing is exactly the orphaned shape ACC-20 (BANK-F10008) fixed on the
 * unmatch side; this guards the WRITE side — every place review_state gets SET to 'matched'.
 *
 * Live-audited 2026-09-04 (bypass_rls, run twice, USMCA): 0 violating rows exist today. Both live
 * write sites are already atomically safe BY CONSTRUCTION — match.service.ts's confirm-match UPDATE
 * and bank-feed-gl-posting.service.ts's GL-post UPDATE both set a matched_*_id column in the SAME
 * statement as review_state = 'matched'. This guard is the regression-proof: it fails the moment a
 * future UPDATE sets review_state = 'matched' without also setting a matched_*_id column in that
 * same statement.
 *
 * The DB-level half (a CHECK constraint making this impossible even outside application code) needs
 * a migration and is routed to CC-1 — CC-2's chrome-only lane is hard-barred from authoring
 * migrations by verify-migration-lane-band.mjs. Ready-to-apply DDL is filed in GUARD-WORKORDERS.md.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-matched-state-requires-matched-id";
const SRC = path.join(ROOT, "apps/backend/src");

const MATCHED_ID_COLUMNS = [
  "matched_load_id",
  "matched_bill_id",
  "matched_settlement_id",
  "matched_expense_id",
  "matched_transfer_id",
  "matched_journal_entry_id",
];

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(full, out);
    } else if (/\.ts$/.test(entry.name) && !entry.name.includes(".test.")) {
      out.push(full);
    }
  }
}

function extractSqlBlocks(source) {
  const blocks = [];
  const re = /`([^`]*)`/g;
  let m;
  while ((m = re.exec(source)) !== null) blocks.push(m[1]);
  return blocks;
}

// A dynamic column name via template-literal interpolation, e.g. `${matchedColumn} = $3::uuid`
// (match.service.ts's whitelist-driven UPDATE) — the literal column name isn't in the SQL source
// text, but a variable whose own name contains "matched" immediately followed by `=` is strong
// enough evidence the statement sets a matched_*_id-shaped column dynamically.
const DYNAMIC_MATCHED_COLUMN_RE = /\$\{[a-zA-Z0-9_]*[Mm]atched[a-zA-Z0-9_]*\}\s*=/;

/** Pure check over a list of {relPath, source} entries, so --selftest can prove it with fixtures. */
export function checkMatchedStateRequiresMatchedId(files) {
  const failures = [];
  for (const { relPath, source } of files) {
    for (const block of extractSqlBlocks(source)) {
      if (!/UPDATE\s+banking\.bank_transactions\b/i.test(block)) continue;
      if (!/review_state\s*=\s*'matched'/.test(block)) continue;
      const setsMatchedId =
        MATCHED_ID_COLUMNS.some((col) => new RegExp(`\\b${col}\\s*=`).test(block)) ||
        DYNAMIC_MATCHED_COLUMN_RE.test(block);
      if (!setsMatchedId) {
        failures.push(
          `${relPath}: an UPDATE sets review_state = 'matched' without also setting a matched_*_id column in the same statement — this can leave the row "matched" with nothing actually matched`
        );
      }
    }
  }
  return failures;
}

function runSelftest() {
  const clean = [
    {
      relPath: "apps/backend/src/banking/x.ts",
      source: "`UPDATE banking.bank_transactions SET review_state = 'matched', matched_journal_entry_id = $1::uuid WHERE id = $2`",
    },
  ];
  if (checkMatchedStateRequiresMatchedId(clean).length !== 0) {
    throw new Error(`selftest: an UPDATE that sets a matched_*_id alongside review_state='matched' must pass — got ${JSON.stringify(checkMatchedStateRequiresMatchedId(clean))}`);
  }

  // match.service.ts's real shape: a whitelist-driven dynamic column name, ${matchedColumn} — the
  // literal column name never appears in the SQL source text.
  const dynamic = [
    {
      relPath: "apps/backend/src/accounting/bank-recon/match.service.ts",
      source: "`UPDATE banking.bank_transactions SET review_state = 'matched', reviewed_at = now(), ${matchedColumn} = $3::uuid WHERE id = $1`",
    },
  ];
  if (checkMatchedStateRequiresMatchedId(dynamic).length !== 0) {
    throw new Error(`selftest: a whitelist-driven dynamic \${matchedColumn} assignment must pass — got ${JSON.stringify(checkMatchedStateRequiresMatchedId(dynamic))}`);
  }

  const unrelated = [
    {
      relPath: "apps/backend/src/banking/y.ts",
      source: "`UPDATE banking.bank_transactions SET review_state = 'categorized' WHERE id = $1`",
    },
  ];
  if (checkMatchedStateRequiresMatchedId(unrelated).length !== 0) {
    throw new Error("selftest: an UPDATE that never sets review_state='matched' must not be flagged");
  }

  // Planted mutation: the exact regression this guard exists to catch.
  const broken = [
    {
      relPath: "apps/backend/src/banking/z.ts",
      source: "`UPDATE banking.bank_transactions SET review_state = 'matched', reviewed_at = now() WHERE id = $1`",
    },
  ];
  const brokenFailures = checkMatchedStateRequiresMatchedId(broken);
  if (brokenFailures.length !== 1 || !brokenFailures[0].includes("z.ts")) {
    throw new Error(`selftest: setting review_state='matched' with no matched_*_id must be flagged — got ${JSON.stringify(brokenFailures)}`);
  }

  console.log(`[${LABEL}] --selftest OK (matched-id-alongside-matched-state passes; unrelated review_state values ignored; the bare review_state='matched' regression is correctly flagged)`);
}

if (process.argv.includes("--selftest")) {
  try {
    runSelftest();
  } catch (err) {
    console.error(String(err?.message ?? err));
    process.exit(1);
  }
  process.exit(0);
}

const files = [];
walk(SRC, files);
const entries = files.map((f) => ({
  relPath: path.relative(ROOT, f).split(path.sep).join("/"),
  source: fs.readFileSync(f, "utf8"),
}));
const failures = checkMatchedStateRequiresMatchedId(entries);

if (failures.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`${LABEL} OK — every UPDATE setting banking.bank_transactions.review_state = 'matched' also sets a matched_*_id column in the same statement`);
process.exit(0);
