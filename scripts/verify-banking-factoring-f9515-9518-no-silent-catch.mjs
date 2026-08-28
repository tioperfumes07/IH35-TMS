#!/usr/bin/env node
/**
 * BANK-F9515 / BANK-F9516 / BANK-F9517 / BANK-F9518 — the same fake-empty-200 / misread-as-not-found
 * silent-catch class as BANK-F9514 (#17030), found across four more banking/factoring sites by
 * Cascade's METER3 sweep (GO-0009, docs/bus/FEED/NOW-CC-2.md):
 *
 *   F9515  escrow-visualizer.routes.ts   — both list/timeline reads swallowed into { rows: [] }
 *   F9516  banking.routes.ts /register   — all 4 branches (factoring/escrow/advance_pool/real bank
 *                                          account) swallowed into { rows: [] }
 *   F9517  banking.routes.ts             — undo-categorization's UPDATE...RETURNING swallowed a real
 *                                          query failure into the SAME shape as "row not found", so a
 *                                          genuine error after reverseJournalEntryNoFlip had already
 *                                          run returned a plain 404 instead of failing the transaction
 *   F9518  factoring.routes.ts           — 4 view reads (summary/recourse-pipeline/chargebacks-fees x2/
 *                                          statements-settings) swallowed into { rows: [] }; /summary's
 *                                          fallback additionally paints hardcoded $0.00 balances over a
 *                                          real query failure
 *
 * All four sites read/write foundational, unconditionally-migrated tables/views — no legitimate
 * "might not exist yet" case, matching BANK-F9514's own reasoning. Guard checks each site by its own
 * distinguishing SQL anchor so a genuine reappearance is caught precisely, not by a blanket regex that
 * would also flag legitimate catches elsewhere in these files (the KPI handler's 4 lower-stakes count
 * catches are OUT OF SCOPE — see verify-bank-kpi-authoritative-cash-no-fake-zero.mjs's own header).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const ESCROW_VIS_FILE = "apps/backend/src/banking/escrow-visualizer.routes.ts";
const BANKING_FILE = "apps/backend/src/banking/banking.routes.ts";
const FACTORING_FILE = "apps/backend/src/factoring/factoring.routes.ts";

const FAKE_EMPTY_CATCH = /\.catch\(\s*\(\)\s*=>\s*\(\{\s*rows:\s*\[\]/;

// Strip // line comments so the explanatory "this used to .catch(...)" prose these fixes leave behind
// (which quotes the old pattern verbatim, on purpose, for the next reader) can never itself trip the
// regex checks below. Template-literal SQL bodies never contain `//`, so this is safe for these files.
function stripLineComments(src) {
  return src
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

export function check(escrowVisSrcRaw, bankingSrcRaw, factoringSrcRaw) {
  const escrowVisSrc = stripLineComments(escrowVisSrcRaw);
  const bankingSrc = stripLineComments(bankingSrcRaw);
  const factoringSrc = stripLineComments(factoringSrcRaw);
  const failures = [];

  // F9515
  if (FAKE_EMPTY_CATCH.test(escrowVisSrc)) {
    failures.push(`${ESCROW_VIS_FILE}: a fake-empty .catch() reappeared (BANK-F9515)`);
  }
  if (!/FROM mdata\.drivers d/.test(escrowVisSrc) || !/FROM accounting\.escrow_accounts ea/.test(escrowVisSrc)) {
    failures.push(`${ESCROW_VIS_FILE}: expected query anchors not found — guard out of sync`);
  }

  // F9516 — anchor on each of the 4 branches individually so a partial reintroduction is still caught.
  const registerBranchAnchors = [
    /FROM accounting\.factoring_advances fa[\s\S]{0,400}?\.catch\(\s*\(\)\s*=>\s*\(\{\s*rows:\s*\[\]/,
    /FROM accounting\.escrow_postings ep[\s\S]{0,1600}?\.catch\(\s*\(\)\s*=>\s*\(\{\s*rows:\s*\[\]/,
    /FROM driver_finance\.driver_advances da[\s\S]{0,400}?\.catch\(\s*\(\)\s*=>\s*\(\{\s*rows:\s*\[\]/,
    /FROM banking\.bank_transactions bt[\s\S]{0,400}?\.catch\(\s*\(\)\s*=>\s*\(\{\s*rows:\s*\[\]/,
  ];
  if (registerBranchAnchors.some((re) => re.test(bankingSrc))) {
    failures.push(`${BANKING_FILE}: a fake-empty .catch() reappeared in the /register handler (BANK-F9516)`);
  }

  // F9517
  if (/RETURNING id\s*`,\s*\[params\.data\.id, companyId\]\s*\)\s*\.catch\(\s*\(\)\s*=>\s*\(\{\s*rows:\s*\[\]/.test(bankingSrc)) {
    failures.push(`${BANKING_FILE}: undo-categorization's UPDATE...RETURNING .catch() reappeared (BANK-F9517)`);
  }
  if (!/if \(!res\.rows\[0\]\) return false;/.test(bankingSrc)) {
    failures.push(`${BANKING_FILE}: undo-categorization not-found branch not found — guard out of sync`);
  }

  // F9518 — 4 view reads.
  const factoringViewAnchors = [
    /FROM views\.factoring_summary[\s\S]{0,200}?\.catch\(\s*\(\)\s*=>\s*\(\{\s*rows:\s*\[\]/,
    /FROM views\.factoring_recourse_at_risk rr[\s\S]{0,1000}?\.catch\(\s*\(\)\s*=>\s*\(\{\s*rows:\s*\[\]/,
    /FROM views\.factoring_chargebacks_fees cf[\s\S]{0,1200}?\.catch\(\s*\(\)\s*=>\s*\(\{\s*rows:\s*\[\]/,
    /GROUP BY statement_month[\s\S]{0,200}?\.catch\(\s*\(\)\s*=>\s*\(\{\s*rows:\s*\[\]/,
    /FROM views\.factoring_statements_settings[\s\S]{0,200}?\.catch\(\s*\(\)\s*=>\s*\(\{\s*rows:\s*\[\]/,
  ];
  if (factoringViewAnchors.some((re) => re.test(factoringSrc))) {
    failures.push(`${FACTORING_FILE}: a fake-empty .catch() reappeared on a views.factoring_* read (BANK-F9518)`);
  }

  return failures;
}

function readAll() {
  return {
    escrowVisSrc: fs.readFileSync(path.join(root, ESCROW_VIS_FILE), "utf8"),
    bankingSrc: fs.readFileSync(path.join(root, BANKING_FILE), "utf8"),
    factoringSrc: fs.readFileSync(path.join(root, FACTORING_FILE), "utf8"),
  };
}

function run() {
  const { escrowVisSrc, bankingSrc, factoringSrc } = readAll();
  const failures = check(escrowVisSrc, bankingSrc, factoringSrc);
  if (failures.length > 0) {
    console.error("FAIL: banking-factoring-f9515-9518-no-silent-catch");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: BANK-F9515/F9516/F9517/F9518 silent-catch / misread-as-not-found sites stay fixed");
}

function selftest() {
  const { escrowVisSrc, bankingSrc, factoringSrc } = readAll();
  const baseline = check(escrowVisSrc, bankingSrc, factoringSrc);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  // Offender A: reintroduce F9515's list-handler catch.
  const offenderA = escrowVisSrc.replace(
    "ORDER BY driver_name\n          `,\n        [q.operating_company_id]\n      );",
    "ORDER BY driver_name\n          `,\n        [q.operating_company_id]\n      ).catch(() => ({ rows: [] }));"
  );
  if (offenderA === escrowVisSrc) {
    console.error("FAIL(selftest): offender A mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderA, bankingSrc, factoringSrc);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender A (escrow-visualizer catch reintroduced) was NOT caught");
    process.exit(1);
  }

  // Offender B: reintroduce F9516's escrow branch catch in /register.
  const offenderB = bankingSrc.replace(
    "ORDER BY ep.posted_at DESC\n              LIMIT $2 OFFSET $3\n            `,\n          [q.operating_company_id, q.limit, q.offset]\n        );",
    "ORDER BY ep.posted_at DESC\n              LIMIT $2 OFFSET $3\n            `,\n          [q.operating_company_id, q.limit, q.offset]\n        ).catch(() => ({ rows: [] }));"
  );
  if (offenderB === bankingSrc) {
    console.error("FAIL(selftest): offender B mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(escrowVisSrc, offenderB, factoringSrc);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender B (/register escrow branch catch reintroduced) was NOT caught");
    process.exit(1);
  }

  // Offender C: reintroduce F9517's undo-categorization catch.
  const offenderC = bankingSrc.replace(
    "RETURNING id\n        `,\n        [params.data.id, companyId]\n      );",
    "RETURNING id\n        `,\n        [params.data.id, companyId]\n      ).catch(() => ({ rows: [] }));"
  );
  if (offenderC === bankingSrc) {
    console.error("FAIL(selftest): offender C mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresC = check(escrowVisSrc, offenderC, factoringSrc);
  if (failuresC.length === 0) {
    console.error("FAIL(selftest): planted offender C (undo-categorization catch reintroduced) was NOT caught");
    process.exit(1);
  }

  // Offender D: reintroduce F9518's /summary catch.
  const offenderD = factoringSrc.replace(
    "LIMIT 1\n          `,\n        [companyId]\n      );",
    "LIMIT 1\n          `,\n        [companyId]\n      ).catch(() => ({ rows: [] }));"
  );
  if (offenderD === factoringSrc) {
    console.error("FAIL(selftest): offender D mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresD = check(escrowVisSrc, bankingSrc, offenderD);
  if (failuresD.length === 0) {
    console.error("FAIL(selftest): planted offender D (/summary catch reintroduced) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): all four planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
