#!/usr/bin/env node
// REG-036 (owner fan-out 2026-09-09/10, "Banking: running balance wrong (received $100 on
// 12/08/25 shows -$13,062.53, oldest->newest)"). Live-verified on Neon (br-fancy-credit-akjnd07a,
// account e83028a5-...-b660-5b9923b3d39c): the running-balance ARITHMETIC in
// BankingTransactionsDesignView.tsx (spentReceived sign resolution + compareTxNewestFirst sort +
// the anchor-and-walk-backward from current_balance_cents) is internally consistent -- no
// sign/sort bug. The real defect is a $6,708.14 gap between SUM(all 314 synced signed deltas) =
// +$8,797.84 and the account's live current_balance_cents = +$2,089.70. Root cause: the backend's
// Plaid /transactions/sync call (plaid.service.ts) has no start_date -- there is no code-side
// truncation; the sync window is whatever Plaid's Item makes "available" (earliest returned here
// is 2025-12-08, but the Item wasn't linked until 2026-06-30), so this real bank account almost
// certainly has pre-2025-12-08 real-world activity we have zero transaction-level visibility into.
// The fix is NOT a different arithmetic (a forward walk from an assumed $0 would be confidently
// WRONG whenever pre-sync history exists) -- it is the LAW.md "zero is a claim" honesty: the
// balance on the earliest-synced row must carry a caveat instead of being presented with the same
// unqualified confidence as every other row.
//
// STATIC (always runs, no DB/browser needed): asserts, by reading the real source file, that:
//   1. An `earliestSyncedTransactionId` is computed from the full synced history (oldest row by
//      the same compareTxNewestFirst ordering the balance column itself uses).
//   2. The Balance column's render(tx) flags that one row (title tooltip + testid + marker) without
//      changing the computed dollar value (`bal == null ? "—" : USD.format(bal / 100)` stays
//      byte-for-byte, so the caveat is additive-only, never a second/different number).
//   3. A visible legend (not hover-only) renders near the table when that row is in view.
import fs from "node:fs";
import path from "node:path";

const SRC_REL = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";

const BALANCE_VALUE_EXPR = 'bal == null ? "—" : USD.format(bal / 100)';

export function auditSource(src) {
  const failures = [];

  if (src === null) {
    failures.push(`${SRC_REL}: missing`);
    return failures;
  }

  if (!/const\s+earliestSyncedTransactionId\s*=\s*useMemo/.test(src)) {
    failures.push(`${SRC_REL}: no earliestSyncedTransactionId useMemo -- nothing identifies the earliest-synced row to caveat`);
  }

  if (!src.includes(BALANCE_VALUE_EXPR)) {
    failures.push(`${SRC_REL}: Balance column's computed dollar value expression changed or is missing -- the caveat must be additive-only, never a second/different number`);
  }

  if (!/isEarliestSynced\s*=\s*tx\.id\s*===\s*earliestSyncedTransactionId/.test(src)) {
    failures.push(`${SRC_REL}: Balance column render(tx) does not check tx.id === earliestSyncedTransactionId -- the caveat isn't wired to the flagged row`);
  }

  if (!/data-testid=\{isEarliestSynced[^}]*"banking-balance-earliest-synced-caveat"/.test(src)) {
    failures.push(`${SRC_REL}: no data-testid="banking-balance-earliest-synced-caveat" on the earliest-synced cell -- caveat isn't testable`);
  }

  if (!/title=\{[\s\S]{0,200}isEarliestSynced/.test(src)) {
    failures.push(`${SRC_REL}: no title tooltip gated on isEarliestSynced -- the caveat has no explanation on hover`);
  }

  if (!/data-testid="banking-balance-earliest-synced-legend"/.test(src)) {
    failures.push(`${SRC_REL}: no visible legend (data-testid="banking-balance-earliest-synced-legend") -- a hover-only tooltip is not discoverable enough for an honest caveat on real money`);
  }

  return failures;
}

function readOrNull(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

if (process.argv.includes("--selftest")) {
  const good = `
  const earliestSyncedTransactionId = useMemo(() => {
    const historyRows = fullHistoryQuery.data?.transactions ?? [];
    const ordered = [...historyRows].sort(compareTxNewestFirst);
    return ordered[ordered.length - 1]?.id ?? null;
  }, [fullHistoryQuery.data]);

  {earliestSyncedTransactionId != null && pagedRows.some((tx) => tx.id === earliestSyncedTransactionId) ? (
    <p data-testid="banking-balance-earliest-synced-legend">caveat text</p>
  ) : null}

  render: (tx) => {
    const bal = runningBalanceById.get(tx.id);
    const isEarliestSynced = tx.id === earliestSyncedTransactionId;
    return (
      <span
        title={
          isEarliestSynced
            ? "Earliest transaction available."
            : undefined
        }
        data-testid={isEarliestSynced ? "banking-balance-earliest-synced-caveat" : undefined}
      >
        {bal == null ? "—" : USD.format(bal / 100)}
        {isEarliestSynced && <sup>†</sup>}
      </span>
    );
  },
  `;

  const pass = auditSource(good);
  if (pass.length) throw new Error("SELFTEST FAIL (should be clean): " + JSON.stringify(pass));

  const noMemo = good.replace(/const\s+earliestSyncedTransactionId\s*=\s*useMemo/, "const somethingElse = useMemo");
  if (auditSource(noMemo).length === 0) {
    throw new Error("SELFTEST FAIL: missing earliestSyncedTransactionId useMemo went undetected");
  }

  const changedValueExpr = good.replace(BALANCE_VALUE_EXPR, 'bal == null ? "-" : USD.format((bal + 1) / 100)');
  if (auditSource(changedValueExpr).length === 0) {
    throw new Error("SELFTEST FAIL: a changed/second balance value expression went undetected");
  }

  const noRowCheck = good.replace("const isEarliestSynced = tx.id === earliestSyncedTransactionId;", "const isEarliestSynced = false;");
  if (auditSource(noRowCheck).length === 0) {
    throw new Error("SELFTEST FAIL: Balance render no longer checking tx.id === earliestSyncedTransactionId went undetected");
  }

  const noTestId = good.replace(
    'data-testid={isEarliestSynced ? "banking-balance-earliest-synced-caveat" : undefined}',
    ""
  );
  if (auditSource(noTestId).length === 0) {
    throw new Error("SELFTEST FAIL: missing caveat data-testid went undetected");
  }

  const noTooltip = good.replace(
    /title=\{[\s\S]*?\}\n/,
    ""
  );
  if (auditSource(noTooltip).length === 0) {
    throw new Error("SELFTEST FAIL: missing title tooltip went undetected");
  }

  const noLegend = good.replace(/\{earliestSyncedTransactionId[\s\S]*?\) : null\}\n/, "");
  if (auditSource(noLegend).length === 0) {
    throw new Error("SELFTEST FAIL: missing visible legend went undetected");
  }

  console.log("verify-banking-earliest-synced-balance-caveat: SELFTEST PASS (6/6)");
  process.exit(0);
}

const root = process.cwd();
const failures = auditSource(readOrNull(root, SRC_REL));
if (failures.length) {
  console.error("verify-banking-earliest-synced-balance-caveat FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "verify-banking-earliest-synced-balance-caveat: OK -- the earliest-synced row's running balance " +
    "carries an honest, visible + hover caveat (additive-only, no computed value changed)"
);
