#!/usr/bin/env node
/**
 * verify-bank-automatch-button-wired.mjs  (0441-mod8-auto-match-button-dead)
 *
 * Root cause: ReconciliationWorkspace rendered
 *   <ActionButton disabled>Auto-Match Suggestions</ActionButton>
 * with no onClick — permanently dead, never reaching the existing
 * auto_matched_candidates worklist (BankReconciliationPage / getBankReconWorklist).
 *
 * Fix (no new scoring/GL): button navigates to /banking/reconciliation with
 * account_id + period_start + period_end from the open session; BankReconciliationPage
 * seeds those from useSearchParams and loads auto_matched_candidates.
 *
 * Usage:
 *   node scripts/verify-bank-automatch-button-wired.mjs            # scan
 *   node scripts/verify-bank-automatch-button-wired.mjs --selftest # planted-bug harness
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-automatch-button-wired";
const WORKSPACE = "apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx";
const RECON_PAGE = "apps/frontend/src/pages/banking/BankReconciliationPage.tsx";

/** Pure checks — takes text so --selftest can inject fixtures. */
export function check({ workspace, reconPage }) {
  const f = [];

  if (!workspace) {
    f.push(`${WORKSPACE}: missing`);
  } else {
    if (/Auto-Match stays disabled until the reconcile engine is proven safe/.test(workspace)) {
      f.push(`${WORKSPACE}: must not keep Auto-Match permanently gated/disabled title`);
    }
    // Permanently dead pattern: disabled ActionButton with Auto-Match label and no onClick nearby.
    if (
      /<ActionButton\s+disabled>\s*Auto-Match Suggestions\s*<\/ActionButton>/.test(workspace) ||
      /<ActionButton disabled>\s*\n\s*Auto-Match Suggestions/.test(workspace)
    ) {
      f.push(`${WORKSPACE}: Auto-Match Suggestions must not be a permanently disabled ActionButton`);
    }
    if (!/Auto-Match Suggestions/.test(workspace)) {
      f.push(`${WORKSPACE}: must retain Auto-Match Suggestions button label`);
    }
    if (!/\/banking\/reconciliation\?/.test(workspace) && !/`\/banking\/reconciliation\?\$\{/.test(workspace)) {
      f.push(`${WORKSPACE}: Auto-Match must navigate to /banking/reconciliation?… (auto_matched_candidates worklist)`);
    }
    if (!/account_id/.test(workspace) || !/period_start/.test(workspace) || !/period_end/.test(workspace)) {
      f.push(`${WORKSPACE}: deep link must pass account_id, period_start, and period_end`);
    }
  }

  if (!reconPage) {
    f.push(`${RECON_PAGE}: missing`);
    return f;
  }
  if (!/useSearchParams/.test(reconPage)) {
    f.push(`${RECON_PAGE}: must use useSearchParams to honor Auto-Match deep link`);
  }
  if (!/searchParams\.get\(\s*["']account_id["']\s*\)/.test(reconPage)) {
    f.push(`${RECON_PAGE}: must seed accountId from searchParams.get("account_id")`);
  }
  if (!/searchParams\.get\(\s*["']period_start["']\s*\)/.test(reconPage)) {
    f.push(`${RECON_PAGE}: must seed periodStart from searchParams.get("period_start")`);
  }
  if (!/searchParams\.get\(\s*["']period_end["']\s*\)/.test(reconPage)) {
    f.push(`${RECON_PAGE}: must seed periodEnd from searchParams.get("period_end")`);
  }
  if (!/getBankReconWorklist/.test(reconPage) || !/auto_matched_candidates/.test(reconPage)) {
    f.push(`${RECON_PAGE}: must keep getBankReconWorklist / auto_matched_candidates worklist flow`);
  }

  return f;
}

export function run() {
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      return null;
    }
  };
  return check({ workspace: read(WORKSPACE), reconPage: read(RECON_PAGE) });
}

if (process.argv.includes("--selftest")) {
  const goodWorkspace = `
    const canOpenAutoMatchSuggestions = Boolean(sessionId && companyId && session?.bank_account_id);
    <ActionButton
      disabled={!canOpenAutoMatchSuggestions}
      onClick={() => {
        const qs = new URLSearchParams({
          account_id: session.bank_account_id,
          period_start: session.period_start,
          period_end: session.period_end,
        });
        navigate(\`/banking/reconciliation?\${qs.toString()}\`);
      }}
    >
      Auto-Match Suggestions
    </ActionButton>
  `;
  const goodRecon = `
    import { useSearchParams } from "react-router-dom";
    const [searchParams] = useSearchParams();
    const [accountId, setAccountId] = useState(() => searchParams.get("account_id") ?? "");
    const [periodStart, setPeriodStart] = useState(() => searchParams.get("period_start") ?? "");
    const [periodEnd, setPeriodEnd] = useState(() => searchParams.get("period_end") ?? "");
    getBankReconWorklist(...);
    worklistQuery.data?.auto_matched_candidates
  `;
  const badWorkspace = `
    <span title="Auto-Match stays disabled until the reconcile engine is proven safe on this workspace">
      <ActionButton disabled>
        Auto-Match Suggestions
      </ActionButton>
    </span>
  `;
  const badRecon = `
    const [accountId, setAccountId] = useState("");
    const [periodStart, setPeriodStart] = useState("");
    const [periodEnd, setPeriodEnd] = useState("");
    getBankReconWorklist(...);
    auto_matched_candidates
  `;
  const checks = [
    ["wired workspace+recon passes", check({ workspace: goodWorkspace, reconPage: goodRecon }).length === 0],
    ["dead disabled button fails", check({ workspace: badWorkspace, reconPage: goodRecon }).length > 0],
    ["missing searchParams seed fails", check({ workspace: goodWorkspace, reconPage: badRecon }).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const msg of failures) console.error("  ✗ " + msg);
    process.exit(1);
  }
  console.log(`${LABEL} PASS (Auto-Match Suggestions wired to auto_matched_candidates worklist)`);
}
