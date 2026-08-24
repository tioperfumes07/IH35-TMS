#!/usr/bin/env node
/**
 * verify-cash-gl-setup-mutation-error-surfaced.mjs (BANK-F6321, verify-step 4648)
 *
 * Root cause: `apps/frontend/src/pages/banking/CashGlSetupPage.tsx` (Owner/Administrator-only
 * setup page mapping each bank account to its COA cash GL account) had a `mutation` with
 * `onSettled` only, no `onError`. On a rejected write, `onSettled` still fires (clears
 * `savingId`, refetches), so the `ReferenceSelect` silently reverted to the prior/unmapped value
 * with zero explanation — indistinguishable from a successful save that happened not to stick.
 *
 * Fix: added `onError: (err) => pushToast(userFacingApiError(err, "..."), "error")`, matching the
 * convention already used by sibling banking pages (BankAccountVisibilityPage.tsx,
 * BankingHome.tsx, BankAccountDetail.tsx).
 *
 * Usage:
 *   node scripts/verify-cash-gl-setup-mutation-error-surfaced.mjs            # scan
 *   node scripts/verify-cash-gl-setup-mutation-error-surfaced.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const FILE = "apps/frontend/src/pages/banking/CashGlSetupPage.tsx";

const IMPORTS_TOAST_RE = /import\s*\{\s*useToast\s*\}\s*from\s*["']\.\.\/\.\.\/components\/Toast["']/;
const IMPORTS_ERROR_HELPER_RE = /import\s*\{[^}]*\buserFacingApiError\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/lib\/api-error-message["']/;
const ON_ERROR_RE = /onError:\s*\(err\)\s*=>\s*pushToast\(userFacingApiError\(err,/;

export function checkCashGlSetupMutationError(src) {
  const offenders = [];
  if (!IMPORTS_TOAST_RE.test(src)) {
    offenders.push(`${FILE}: does not import useToast — BANK-F6321 regression.`);
  }
  if (!IMPORTS_ERROR_HELPER_RE.test(src)) {
    offenders.push(`${FILE}: does not import userFacingApiError from ../../lib/api-error-message — BANK-F6321 regression.`);
  }
  if (!ON_ERROR_RE.test(src)) {
    offenders.push(`${FILE}: mutation has no onError — a failed Cash GL mapping save will silently revert the picker with no explanation again.`);
  }
  return offenders;
}

export function run() {
  const src = fs.readFileSync(path.join(repoRoot, FILE), "utf8");
  const offenders = checkCashGlSetupMutationError(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    const mutation = useMutation({
      mutationFn: (vars) => setBankAccountCashGl(companyId, vars.bankAccountId, vars.ledgerAccountId),
      onSettled: () => {
        setSavingId(null);
        void qc.invalidateQueries({ queryKey: ["banking", "cash-gl-mapping", companyId] });
      },
    });
  `;
  const fixed = fs.readFileSync(path.join(repoRoot, FILE), "utf8");

  const buggyOffenders = checkCashGlSetupMutationError(buggy);
  const fixedOffenders = checkCashGlSetupMutationError(fixed);

  if (buggyOffenders.length >= 3 && fixedOffenders.length === 0) {
    console.log("verify-cash-gl-setup-mutation-error-surfaced selftest OK");
    process.exit(0);
  }
  console.error("verify-cash-gl-setup-mutation-error-surfaced selftest FAILED", {
    buggyOffenders,
    fixedOffenders,
  });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-cash-gl-setup-mutation-error-surfaced FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-cash-gl-setup-mutation-error-surfaced OK — the Cash GL setup mutation surfaces failures via toast, never a silent picker revert",
  );
}
