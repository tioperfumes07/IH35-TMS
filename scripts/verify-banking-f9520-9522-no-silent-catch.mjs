#!/usr/bin/env node
/**
 * BANK-F9520 / BANK-F9521 / BANK-F9522 — continuing the Cascade METER3 silent-catch sweep (GO-0009)
 * that started with BANK-F9514-9518.
 *
 *   F9520  reconciliation.routes.ts   — the reconciliation workspace's `loads`/`bills`/`settlements`
 *                                        reads swallowed a real query failure into `[]`. `loads` never
 *                                        had a relationExists() guard (mdata.loads is foundational, no
 *                                        "might not exist" case ever existed); bills/settlements DO
 *                                        gate on relationExists() first, so their .catch() after a
 *                                        passed existence check was only ever masking a genuine error
 *                                        on a table already confirmed present.
 *   F9521  banking.routes.ts          — the transaction-suggestions endpoint's 3 reads swallowed with
 *                                        NO log line at all. Fixed differently on purpose: suggestions
 *                                        are a deliberate best-effort enhancement with no error UI
 *                                        anywhere in the frontend, so "fail loud" here means loud IN
 *                                        THE LOGS (req.log.warn), not a hard 500 with nothing to catch
 *                                        it — this guard checks for the log call, not an absence of
 *                                        .catch().
 *   F9522  settlements.routes.ts      — the settlement detail route's driver_settlement_gl_bills read
 *                                        swallowed into `[]`; that table is foundational and populated
 *                                        whenever SETTLEMENT_GL_POSTING_ENABLED is on (it is, for all 3
 *                                        entities). SettlementDetailPage.tsx's detailQuery.isError
 *                                        already exists for exactly this failure class.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const RECON_FILE = "apps/backend/src/banking/reconciliation.routes.ts";
const BANKING_FILE = "apps/backend/src/banking/banking.routes.ts";
const SETTLEMENTS_FILE = "apps/backend/src/driver-finance/settlements.routes.ts";

function stripLineComments(src) {
  return src
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

export function check(reconSrcRaw, bankingSrcRaw, settlementsSrcRaw) {
  const reconSrc = stripLineComments(reconSrcRaw);
  const bankingSrc = stripLineComments(bankingSrcRaw);
  const settlementsSrc = stripLineComments(settlementsSrcRaw);
  const failures = [];

  // F9520 — loads/bills/settlements reads in the reconciliation workspace.
  const reconAnchors = [
    /FROM mdata\.loads[\s\S]{0,300}?\.catch\(\s*\(\)\s*=>\s*\[\]/,
    /FROM accounting\.bills[\s\S]{0,300}?\.catch\(\s*\(\)\s*=>\s*\[\]/,
    /FROM driver_pay\.settlements[\s\S]{0,300}?\.catch\(\s*\(\)\s*=>\s*\[\]/,
    /FROM driver_finance\.driver_settlements[\s\S]{0,300}?\.catch\(\s*\(\)\s*=>\s*\[\]/,
  ];
  if (reconAnchors.some((re) => re.test(reconSrc))) {
    failures.push(`${RECON_FILE}: a fake-empty .catch() reappeared in the reconciliation workspace's loads/bills/settlements read (BANK-F9520)`);
  }
  if (!/FROM mdata\.loads/.test(reconSrc)) {
    failures.push(`${RECON_FILE}: expected mdata.loads read not found — guard out of sync`);
  }

  // F9521 — suggestions endpoint must still log (req.log.warn) on each of its 3 catches. Checking for
  // the log calls by their distinct message names (not absence of .catch()) since these are a
  // deliberate best-effort degrade, not a hard-fail class.
  if (!/\/api\/v1\/banking\/transactions\/:id\/suggestions/.test(bankingSrc)) {
    failures.push(`${BANKING_FILE}: /transactions/:id/suggestions route not found — guard out of sync`);
  }
  const suggestionsLogMessages = [
    "banking_suggestions_target_lookup_failed",
    "banking_suggestions_similar_txn_lookup_failed",
    "banking_suggestions_rules_lookup_failed",
  ];
  const missingLogs = suggestionsLogMessages.filter((msg) => !bankingSrc.includes(msg));
  if (missingLogs.length > 0) {
    failures.push(
      `${BANKING_FILE}: /transactions/:id/suggestions is missing req.log.warn call(s) for: ${missingLogs.join(", ")} (BANK-F9521)`
    );
  }

  // F9522 — driver_settlement_gl_bills read.
  if (/FROM driver_finance\.driver_settlement_gl_bills[\s\S]{0,300}?\.catch\(\s*\(\)\s*=>\s*\(\{\s*rows:\s*\[\]/.test(settlementsSrc)) {
    failures.push(`${SETTLEMENTS_FILE}: a fake-empty .catch() reappeared on the driver_settlement_gl_bills read (BANK-F9522)`);
  }

  return failures;
}

function readAll() {
  return {
    reconSrc: fs.readFileSync(path.join(root, RECON_FILE), "utf8"),
    bankingSrc: fs.readFileSync(path.join(root, BANKING_FILE), "utf8"),
    settlementsSrc: fs.readFileSync(path.join(root, SETTLEMENTS_FILE), "utf8"),
  };
}

function run() {
  const { reconSrc, bankingSrc, settlementsSrc } = readAll();
  const failures = check(reconSrc, bankingSrc, settlementsSrc);
  if (failures.length > 0) {
    console.error("FAIL: banking-f9520-9522-no-silent-catch");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: BANK-F9520/F9521/F9522 silent-catch sites stay fixed");
}

function selftest() {
  const { reconSrc, bankingSrc, settlementsSrc } = readAll();
  const baseline = check(reconSrc, bankingSrc, settlementsSrc);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  // Offender A: reintroduce F9520's loads catch.
  const offenderA = reconSrc.replace(
    "LIMIT 500\n          `,\n          [companyId, session.period_start, session.period_end]\n        )\n        .then((res) => res.rows);",
    "LIMIT 500\n          `,\n          [companyId, session.period_start, session.period_end]\n        )\n        .then((res) => res.rows)\n        .catch(() => []);"
  );
  if (offenderA === reconSrc) {
    console.error("FAIL(selftest): offender A mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderA, bankingSrc, settlementsSrc);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender A (reconciliation loads catch reintroduced) was NOT caught");
    process.exit(1);
  }

  // Offender B: strip a req.log.warn call from the suggestions handler.
  const offenderB = bankingSrc.replace(
    'req.log.warn({ err, companyId }, "banking_suggestions_rules_lookup_failed");',
    "/* removed */"
  );
  if (offenderB === bankingSrc) {
    console.error("FAIL(selftest): offender B mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(reconSrc, offenderB, settlementsSrc);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender B (suggestions rules-lookup log removed) was NOT caught");
    process.exit(1);
  }

  // Offender C: reintroduce F9522's driver_settlement_gl_bills catch.
  const offenderC = settlementsSrc.replace(
    "ORDER BY created_at ASC\n          `,\n        [params.data.id, companyId]\n      );",
    "ORDER BY created_at ASC\n          `,\n        [params.data.id, companyId]\n      ).catch(() => ({ rows: [] }));"
  );
  if (offenderC === settlementsSrc) {
    console.error("FAIL(selftest): offender C mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresC = check(reconSrc, bankingSrc, offenderC);
  if (failuresC.length === 0) {
    console.error("FAIL(selftest): planted offender C (settlement gl_bills catch reintroduced) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): all three planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
