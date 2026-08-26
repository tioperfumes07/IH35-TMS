#!/usr/bin/env node
/**
 * verify-settlement-pending-deductions-error-suppresses-cache.mjs
 *
 * SETL-F6464-PENDING-DEDUCTIONS-ERROR-LEAVES-CACHED-ACTIONS-ACTIVE — a rejected pending-
 * deductions refetch rendered an error banner but still mapped React Query's cached (last
 * successful) rows underneath it, with their reverse-drill EntityLinks fully active — an
 * operator could act on stale/wrong-scope deduction rows during a query failure.
 *
 * Fixed by forcing `rows` to an empty array whenever the query is in an error state (so no
 * cached data is ever rendered) and replacing the static error text with the canonical
 * ListErrorState (title/status/message/onRetry), giving the operator a real Retry instead of a
 * dead-end message.
 */
import { readFileSync } from "node:fs";

const filePath = "apps/frontend/src/pages/drivers/PendingSettlementDeductionsPanel.tsx";
const src = readFileSync(filePath, "utf8");

const failures = [];

if (!/const rows = query\.isError \? \[\] : \(query\.data\?\.deductions \?\? \[\]\);/.test(src)) {
  failures.push(`${filePath}: rows no longer forces an empty array on query.isError — a rejected refetch can render cached deduction rows again`);
}
if (!/import \{ ListErrorState \} from "\.\.\/\.\.\/components\/ListErrorState"/.test(src)) {
  failures.push(`${filePath}: no longer imports the canonical ListErrorState component`);
}
if (!/<ListErrorState\s*\n\s*title="Couldn't load pending deductions"/.test(src)) {
  failures.push(`${filePath}: the error state no longer renders ListErrorState with a Retry action`);
}
if (!/onRetry=\{\(\) => void query\.refetch\(\)\}/.test(src)) {
  failures.push(`${filePath}: the error state's Retry no longer calls query.refetch()`);
}

if (failures.length > 0) {
  console.error("verify-settlement-pending-deductions-error-suppresses-cache: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-settlement-pending-deductions-error-suppresses-cache: OK — a rejected refetch suppresses cached rows/actions and offers a real Retry"
);
