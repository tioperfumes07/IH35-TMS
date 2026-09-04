#!/usr/bin/env node
/**
 * BANK-F10005 amendment (2026-09-04, owner-ordered) — `banking.bank_transactions.amount_cents`'s
 * sign runs OPPOSITE `is_credit` on this table (Plaid convention: NEGATIVE = credit/deposit,
 * POSITIVE = debit/withdrawal). Live-verified twice, cross-checked against the owner's own
 * independent reproduction: 89 `is_credit=true` rows all negative, 254 `is_credit=false` rows all
 * positive. This is a schema-level trap, not a one-off bug: any code that infers money direction
 * from `sign(amount_cents)` instead of reading `is_credit` gets the owner's money direction
 * backwards the moment that unenforced sign convention stops holding (a manual entry, a different
 * bank processor, a future QBO import). banking.routes.ts's deposits/withdrawals split was exactly
 * this shape — correct today only because it hardcoded the Plaid sign as a comment, not because it
 * consulted `is_credit`.
 *
 * This guard scans every SQL block that queries `banking.bank_transactions` for a direction-style
 * `amount_cents <op> 0` comparison and requires `is_credit` to appear in that same block. It is not
 * a blanket ban on every `amount_cents > 0` anywhere (validation checks like "amount must be
 * positive" on unrelated tables — driver_reimbursement, escrow, lumper splits — are legitimate and
 * out of scope) — only bank_transactions blocks that compare amount_cents against 0.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-transactions-direction-uses-is-credit";
const SRC = path.join(ROOT, "apps/backend/src");

const BANK_TXN_RE = /banking\.bank_transactions\b/i;
const SIGN_DIRECTION_RE = /\bamount_cents\s*[<>]=?\s*0\b/;
const IS_CREDIT_RE = /\bis_credit\b/;

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

/** Extracts every template-literal SQL block (between backticks) from source text. */
function extractSqlBlocks(source) {
  const blocks = [];
  const re = /`([^`]*)`/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    blocks.push(m[1]);
  }
  return blocks;
}

/** Pure check over a list of {relPath, source} entries, so --selftest can prove it with fixtures. */
export function checkDirectionUsesIsCredit(files) {
  const failures = [];
  for (const { relPath, source } of files) {
    for (const block of extractSqlBlocks(source)) {
      if (!BANK_TXN_RE.test(block)) continue;
      if (!SIGN_DIRECTION_RE.test(block)) continue;
      if (!IS_CREDIT_RE.test(block)) {
        failures.push(
          `${relPath}: a banking.bank_transactions query compares amount_cents against 0 for direction without reading is_credit — amount_cents's sign runs opposite is_credit on this table, this will get the owner's money direction backwards`
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
      source: "`SELECT CASE WHEN bt.is_credit THEN abs(bt.amount_cents) ELSE 0 END AS deposits FROM banking.bank_transactions bt`",
    },
  ];
  if (checkDirectionUsesIsCredit(clean).length !== 0) {
    throw new Error(`selftest: an is_credit-based query must pass with zero failures — got ${JSON.stringify(checkDirectionUsesIsCredit(clean))}`);
  }

  const unrelated = [
    {
      relPath: "apps/backend/src/driver-finance/x.ts",
      source: "`SELECT * FROM driver_finance.driver_advances WHERE amount_cents > 0`",
    },
  ];
  if (checkDirectionUsesIsCredit(unrelated).length !== 0) {
    throw new Error("selftest: a non-bank_transactions table's amount_cents > 0 validation must NOT be flagged (out of scope)");
  }

  // Planted mutation: exactly the original bug shape — sign(amount_cents) used for direction on
  // banking.bank_transactions with no is_credit anywhere in the block.
  const broken = [
    {
      relPath: "apps/backend/src/banking/banking.routes.ts",
      source: "`SELECT CASE WHEN bt.amount_cents < 0 THEN abs(bt.amount_cents) ELSE 0 END AS deposits FROM banking.bank_transactions bt`",
    },
  ];
  const brokenFailures = checkDirectionUsesIsCredit(broken);
  if (brokenFailures.length !== 1 || !brokenFailures[0].includes("banking.routes.ts")) {
    throw new Error(`selftest: the original sign-based-direction shape must be flagged — got ${JSON.stringify(brokenFailures)}`);
  }

  console.log(`[${LABEL}] --selftest OK (is_credit-based query passes; unrelated table's amount_cents>0 validation is out of scope; the original sign-based-direction shape is correctly flagged)`);
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
const failures = checkDirectionUsesIsCredit(entries);

if (failures.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`${LABEL} OK — every banking.bank_transactions query that compares amount_cents against 0 reads is_credit`);
process.exit(0);
