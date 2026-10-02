#!/usr/bin/env node
/**
 * OWNER LAW 2026-10-02 — COMPETING-ENGINE AUDIT (Cursor lane: bank-match writer).
 *
 * Canonical accept = acceptReconMatch → acceptMatchWithResolveDifference
 * (apps/backend/src/accounting/bank-recon/match.service.ts).
 *
 * FAILS IF:
 *   1) link-suggestions-actions.routes.ts stamps matched_*_id with a bound UPDATE
 *      (retired second accept writer) OR does not call acceptReconMatch.
 *   2) reconciliation.routes.ts POST .../match stamps matched_settlement_id /
 *      matched_load_id / matched_bill_id with a bound UPDATE (must proxy settlement
 *      through acceptReconMatch; load/bill refuse).
 *   3) obligation-reconcile.routes.ts stamps matched_settlement_id / matched_bill_id /
 *      matched_load_id with a bound or COALESCE($N) UPDATE for accept (must proxy
 *      expense+settlement through acceptReconMatch; other kinds refuse).
 *   4) Any of the three proxy files lose the acceptReconMatch import/call.
 *
 * --selftest plants one mutation per check against a temp copy.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const LINK_SUGGESTIONS = "apps/backend/src/banking/link-suggestions-actions.routes.ts";
const RECONCILIATION = "apps/backend/src/banking/reconciliation.routes.ts";
const OBLIGATION = "apps/backend/src/banking/obligation-reconcile.routes.ts";
const CANONICAL_ENGINE = "apps/backend/src/accounting/bank-recon/match.service.ts";

const STAMP_COLS = ["matched_expense_id", "matched_bill_id", "matched_load_id", "matched_settlement_id"];

/** Bound stamp: `matched_X_id = $N` (not NULL). */
function hasBoundStamp(src, col) {
  return new RegExp(`${col}\\s*=\\s*\\$\\d+`, "i").test(src);
}

/** COALESCE stamp used by the retired obligation-reconcile accept path. */
function hasCoalesceStamp(src, col) {
  return new RegExp(`${col}\\s*=\\s*COALESCE\\s*\\(\\s*\\$\\d+`, "i").test(src);
}

export function checkLinkSuggestionsProxiesCanonical(source) {
  const problems = [];
  if (!/acceptReconMatch\s*\(/.test(source)) {
    problems.push(
      `${LINK_SUGGESTIONS}: must call acceptReconMatch(...) — accept is a thin proxy to the one Match engine`
    );
  }
  if (!/unmatchBankTransaction\s*\(/.test(source)) {
    problems.push(
      `${LINK_SUGGESTIONS}: undo must call unmatchBankTransaction(...) — never a local matched_* clear as the accept undo`
    );
  }
  for (const col of STAMP_COLS) {
    if (hasBoundStamp(source, col)) {
      problems.push(
        `${LINK_SUGGESTIONS}: still stamps ${col} with a bound UPDATE — second accept writer retired (OWNER LAW 2026-10-02)`
      );
    }
  }
  return problems;
}

export function checkReconciliationProxiesSettlement(source) {
  const problems = [];
  if (!/acceptReconMatch\s*\(/.test(source)) {
    problems.push(
      `${RECONCILIATION}: POST .../match must call acceptReconMatch for settlement — never stamp matched_settlement_id locally`
    );
  }
  if (!/use_match_drawer_for_kind/.test(source)) {
    problems.push(
      `${RECONCILIATION}: load/bill match must refuse with use_match_drawer_for_kind (not a second stamp path)`
    );
  }
  for (const col of ["matched_settlement_id", "matched_bill_id", "matched_load_id"]) {
    if (hasBoundStamp(source, col)) {
      problems.push(
        `${RECONCILIATION}: still stamps ${col} with a bound UPDATE on accept — competing writer`
      );
    }
  }
  return problems;
}

export function checkObligationReconcileProxiesCanonical(source) {
  const problems = [];
  if (!/acceptReconMatch\s*\(/.test(source)) {
    problems.push(
      `${OBLIGATION}: expense/settlement accept must call acceptReconMatch — never stamp matched_* locally`
    );
  }
  if (!/use_match_drawer_for_kind/.test(source)) {
    problems.push(
      `${OBLIGATION}: non-persistable kinds must refuse with use_match_drawer_for_kind`
    );
  }
  for (const col of ["matched_settlement_id", "matched_bill_id", "matched_load_id"]) {
    if (hasBoundStamp(source, col) || hasCoalesceStamp(source, col)) {
      problems.push(
        `${OBLIGATION}: still stamps ${col} on accept (bound or COALESCE($N)) — competing writer`
      );
    }
  }
  return problems;
}

export function checkCanonicalEngineExists(source) {
  const problems = [];
  if (!/export\s+(?:async\s+)?function\s+acceptMatchWithResolveDifference/.test(source)) {
    problems.push(
      `${CANONICAL_ENGINE}: acceptMatchWithResolveDifference must remain the single stamp writer`
    );
  }
  if (!/PERSISTABLE_MATCH_KINDS/.test(source)) {
    problems.push(`${CANONICAL_ENGINE}: PERSISTABLE_MATCH_KINDS must remain defined`);
  }
  return problems;
}

export function run() {
  const problems = [];
  const files = [
    [LINK_SUGGESTIONS, checkLinkSuggestionsProxiesCanonical],
    [RECONCILIATION, checkReconciliationProxiesSettlement],
    [OBLIGATION, checkObligationReconcileProxiesCanonical],
    [CANONICAL_ENGINE, checkCanonicalEngineExists],
  ];
  for (const [rel, check] of files) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      problems.push(`${rel}: file missing`);
      continue;
    }
    problems.push(...check(fs.readFileSync(abs, "utf8")));
  }
  return {
    ok: problems.length === 0,
    message:
      problems.length === 0
        ? "verify-competing-engine-bank-match-one-writer: OK — accept routes proxy acceptReconMatch; no competing matched_* stamp"
        : `verify-competing-engine-bank-match-one-writer FAILED:\n  - ${problems.join("\n  - ")}`,
  };
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ce-bank-match-"));
  let failed = 0;
  const cases = [
    {
      name: "link-suggestions loses acceptReconMatch",
      check: checkLinkSuggestionsProxiesCanonical,
      mutate: (s) => s.replace(/acceptReconMatch\s*\(/g, "retiredAccept("),
    },
    {
      name: "reconciliation reintroduces bound settlement stamp",
      check: checkReconciliationProxiesSettlement,
      mutate: (s) =>
        s +
        "\nUPDATE banking.bank_transactions SET matched_settlement_id = $4 WHERE id = $1;\n",
    },
    {
      name: "obligation-reconcile reintroduces COALESCE stamp",
      check: checkObligationReconcileProxiesCanonical,
      mutate: (s) =>
        s +
        "\nUPDATE banking.bank_transactions SET matched_settlement_id = COALESCE($6::uuid, matched_settlement_id);\n",
    },
  ];

  const sources = {
    link: fs.readFileSync(path.join(ROOT, LINK_SUGGESTIONS), "utf8"),
    recon: fs.readFileSync(path.join(ROOT, RECONCILIATION), "utf8"),
    obl: fs.readFileSync(path.join(ROOT, OBLIGATION), "utf8"),
  };

  for (const c of cases) {
    const base =
      c.name.startsWith("link") ? sources.link : c.name.startsWith("recon") ? sources.recon : sources.obl;
    const mutated = c.mutate(base);
    const problems = c.check(mutated);
    if (problems.length === 0) {
      console.error(`SELFTEST FAIL: ${c.name} — mutation not caught`);
      failed++;
    }
  }

  // Clean baseline must pass
  const baseline = run();
  if (!baseline.ok) {
    console.error("SELFTEST FAIL: baseline not green:\n" + baseline.message);
    failed++;
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  if (failed > 0) {
    console.error(`verify-competing-engine-bank-match-one-writer --selftest FAIL (${failed})`);
    process.exit(1);
  }
  console.log("verify-competing-engine-bank-match-one-writer --selftest PASS (3/3 mutations caught + baseline)");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    const result = run();
    console.log(result.message);
    process.exit(result.ok ? 0 : 1);
  }
}
