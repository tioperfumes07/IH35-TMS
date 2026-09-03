#!/usr/bin/env node
/**
 * verify-bank-recon-loadtransaction-excludes-voided.mjs
 *
 * BANK-F9998 finding F2 (BLOCKER) — accounting/bank-recon/match.service.ts:loadTransaction is the
 * single read both findCandidates() (Match drawer candidate fetch) and acceptMatchWithResolveDifference()
 * (Match drawer Confirm) use to load the bank_transactions row being matched. It never filtered
 * bt.voided_at, so a voided row -- including one voided as a confirmed duplicate (BANK-F9997, PR
 * #20142, 48 rows) -- was still reachable: it would return live match candidates and could still be
 * matched/posted through, silently undoing the void.
 *
 * Static guard: loadTransaction's own SQL must exclude voided rows. Read-only, no DB connection
 * required — degrade-safe by construction (pure source-text check).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = path.join(ROOT, "apps/backend/src/accounting/bank-recon/match.service.ts");

/** Mirror of the exact snippet loadTransaction's SQL must contain — pure string match, no live DB. */
function checkSource(source) {
  const failures = [];
  const fnMatch = source.match(/async function loadTransaction\(([\s\S]*?)\n\}/);
  if (!fnMatch) {
    failures.push("loadTransaction function not found in match.service.ts (renamed/moved?)");
    return failures;
  }
  const fnBody = fnMatch[0];
  if (!/bt\.voided_at\s+IS\s+NULL/i.test(fnBody)) {
    failures.push(
      "loadTransaction's SQL does not exclude bt.voided_at IS NULL — a voided/duplicate bank " +
        "transaction (e.g. one of the 48 rows BANK-F9997 voided as a confirmed duplicate) is still " +
        "loadable by both findCandidates() and acceptMatchWithResolveDifference(), so it can still be " +
        "offered match candidates and matched/posted through the Match drawer, silently undoing the void."
    );
  }
  return failures;
}

function runSelftest() {
  const passing = `
async function loadTransaction(
  client,
  operatingCompanyId,
  bankTransactionId,
  forUpdate = false
) {
  const txn = await client.query(
    \`
      SELECT bt.id
      FROM banking.bank_transactions bt
      WHERE bt.id = $1::uuid
        AND bt.operating_company_id = $2::uuid
        AND bt.voided_at IS NULL
      LIMIT 1
    \`,
    [bankTransactionId, operatingCompanyId]
  );
  return txn.rows[0] ?? null;
}
`;
  const failing = `
async function loadTransaction(
  client,
  operatingCompanyId,
  bankTransactionId,
  forUpdate = false
) {
  const txn = await client.query(
    \`
      SELECT bt.id
      FROM banking.bank_transactions bt
      WHERE bt.id = $1::uuid
        AND bt.operating_company_id = $2::uuid
      LIMIT 1
    \`,
    [bankTransactionId, operatingCompanyId]
  );
  return txn.rows[0] ?? null;
}
`;
  if (checkSource(passing).length !== 0) {
    throw new Error("selftest: expected the voided-excluding fixture to PASS, it FAILED");
  }
  if (checkSource(failing).length === 0) {
    throw new Error("selftest: expected the voided-blind fixture to FAIL, it PASSED — guard is not detecting the defect");
  }
  console.log("[verify-bank-recon-loadtransaction-excludes-voided] --selftest OK (passing + failing fixtures both behave as expected)");
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

let source;
try {
  source = fs.readFileSync(SERVICE, "utf8");
} catch (err) {
  console.error(`verify-bank-recon-loadtransaction-excludes-voided — FAILED: cannot read ${SERVICE}: ${err?.message ?? err}`);
  process.exit(1);
}

const failures = checkSource(source);
if (failures.length) {
  console.error("verify-bank-recon-loadtransaction-excludes-voided — FAILED");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log("[verify-bank-recon-loadtransaction-excludes-voided] OK — loadTransaction excludes voided bank_transactions rows");
