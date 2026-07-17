#!/usr/bin/env node
/**
 * 0441-mod8-reconciliation-workspace-no-refetch
 *
 * After match/unmatch in ReconciliationWorkspace, variance summary must stay
 * in sync with the server. Local-only setLocalTransactions patches drift when
 * matched sets / candidates differ from the workspace payload.
 *
 * This guard asserts that both matchReconciliationTransaction and
 * unmatchReconciliationTransaction success paths call workspaceQuery.refetch()
 * and/or invalidate the reconciliation-workspace query key.
 *
 * Self-test: node scripts/verify-banking-recon-workspace-refetch.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-banking-recon-workspace-refetch";
const TARGET = "apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx";

const REFETCH_OR_INVALIDATE =
  /workspaceQuery\.refetch\s*\(|invalidateQueries\s*\(\s*\{[^}]*reconciliation-workspace/;

/**
 * Extract the `.then(() => { ... })` body that immediately follows `callName(...)`.
 * Brace-balanced so nested objects/maps inside the then-handler are OK.
 */
function thenBodyAfterCall(source, callName) {
  const callRe = new RegExp(`${callName}\\s*\\(`);
  const callMatch = callRe.exec(source);
  if (!callMatch) return null;

  let i = callMatch.index + callMatch[0].length;
  let depth = 1;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    i += 1;
  }
  const afterCall = source.slice(i);
  const thenMatch = /^\s*\.then\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{/.exec(afterCall);
  if (!thenMatch) return null;

  const bodyStart = i + thenMatch[0].length;
  let j = bodyStart;
  let brace = 1;
  while (j < source.length && brace > 0) {
    const ch = source[j];
    if (ch === "{") brace += 1;
    else if (ch === "}") brace -= 1;
    j += 1;
  }
  return source.slice(bodyStart, j - 1);
}

export function assertGuard({ file, source }) {
  const errors = [];

  for (const callName of ["matchReconciliationTransaction", "unmatchReconciliationTransaction"]) {
    if (!source.includes(callName)) {
      errors.push(`${file}: must call ${callName}`);
      continue;
    }
    const body = thenBodyAfterCall(source, callName);
    if (body === null) {
      errors.push(`${file}: ${callName} must have a .then(() => { ... }) success handler`);
      continue;
    }
    if (!REFETCH_OR_INVALIDATE.test(body)) {
      errors.push(
        `${file}: ${callName} success handler must call workspaceQuery.refetch() ` +
          `and/or invalidateQueries({ queryKey: [...reconciliation-workspace...] }) ` +
          `so variance summary stays server-synced (local-only patch drifts)`
      );
    }
  }

  return errors;
}

function selftest() {
  const cases = [
    {
      n: "both match+unmatch refetch → 0",
      file: "Fixture.tsx",
      src: `
        void matchReconciliationTransaction(sessionId, companyId, payload)
          .then(() => {
            setLocalTransactions(prev => prev);
            void workspaceQuery.refetch();
            pushToast("matched", "success");
          });
        void unmatchReconciliationTransaction(sessionId, companyId, { transaction_id: id })
          .then(() => {
            void workspaceQuery.refetch();
            pushToast("unmatched", "success");
          });
      `,
      want: 0,
    },
    {
      n: "invalidateQueries with reconciliation-workspace → 0",
      file: "Fixture.tsx",
      src: `
        void matchReconciliationTransaction(a, b, c)
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: ["banking", "reconciliation-workspace", sessionId] });
          });
        void unmatchReconciliationTransaction(a, b, c)
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: ["banking", "reconciliation-workspace"] });
          });
      `,
      want: 0,
    },
    {
      n: "planted failure: local patch only, no refetch → 2",
      file: "Fixture.tsx",
      src: `
        void matchReconciliationTransaction(sessionId, companyId, payload)
          .then(() => {
            setLocalTransactions((prev) => prev.map((tx) => tx));
            pushToast("Transaction matched", "success");
          });
        void unmatchReconciliationTransaction(sessionId, companyId, { transaction_id: id })
          .then(() => {
            setLocalTransactions((prev) => prev.map((tx) => tx));
            pushToast("Transaction unmatched", "success");
          });
      `,
      want: 2,
    },
    {
      n: "match refetches but unmatch does not → 1",
      file: "Fixture.tsx",
      src: `
        void matchReconciliationTransaction(a, b, c)
          .then(() => { void workspaceQuery.refetch(); });
        void unmatchReconciliationTransaction(a, b, c)
          .then(() => { pushToast("ok", "success"); });
      `,
      want: 1,
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const n = assertGuard({ file: c.file, source: c.src }).length;
    const ok = n === c.want;
    if (!ok) failed += 1;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n}, want=${c.want})`);
  }
  if (failed) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const abs = path.join(ROOT, TARGET);
if (!fs.existsSync(abs)) {
  console.error(`[${LABEL}] FAILED — target file not found: ${TARGET}`);
  process.exit(1);
}
const source = fs.readFileSync(abs, "utf8");
const errors = assertGuard({ file: TARGET, source });

if (errors.length > 0) {
  console.error(`[${LABEL}] FAILED — ${errors.length} reconciliation workspace refetch violation(s).`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(
  `[${LABEL}] OK — match/unmatch success paths refetch (or invalidate) reconciliation workspace.`
);
