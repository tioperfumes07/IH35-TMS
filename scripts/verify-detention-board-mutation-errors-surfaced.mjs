#!/usr/bin/env node
/**
 * verify-detention-board-mutation-errors-surfaced.mjs (DISP-F6326, verify-step 4658)
 *
 * Root cause: `apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx` (mounted at
 * `/dispatch/detention`) has 4 mutations — `closeM` ("Stop accrual"), `bridgeM` ("Bridge to
 * billing"), `notifyM` ("Notify customer"), `syncM` ("Sync from arrivals") — none had `onError`,
 * no `useToast`/`pushToast` import anywhere in the file, no `isError` check for any mutation, all
 * call sites used fire-and-forget `.mutate()`. On any rejected write this was a silent no-op.
 *
 * Fix: added `useToast` + `onError: (err) => pushToast(userFacingApiError(err, "..."), "error")`
 * to all 4 mutations.
 *
 * Usage:
 *   node scripts/verify-detention-board-mutation-errors-surfaced.mjs            # scan
 *   node scripts/verify-detention-board-mutation-errors-surfaced.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const FILE = "apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx";

const IMPORTS_TOAST_RE = /import\s*\{\s*useToast\s*\}\s*from\s*["']\.\.\/\.\.\/components\/Toast["']/;
const IMPORTS_ERROR_HELPER_RE = /import\s*\{[^}]*\buserFacingApiError\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/lib\/api-error-message["']/;
const MUTATIONS = ["closeM", "bridgeM", "notifyM", "syncM"];

function extractMutationBlock(src, mutationName) {
  const startRe = new RegExp(`const ${mutationName} = useMutation\\(\\{`);
  const m = startRe.exec(src);
  if (!m) return null;
  const closeIdx = src.indexOf("\n  });", m.index);
  if (closeIdx === -1) return null;
  return src.slice(m.index, closeIdx);
}

export function checkDetentionBoardMutationErrors(src) {
  const offenders = [];
  if (!IMPORTS_TOAST_RE.test(src)) {
    offenders.push(`${FILE}: does not import useToast — DISP-F6326 regression.`);
  }
  if (!IMPORTS_ERROR_HELPER_RE.test(src)) {
    offenders.push(`${FILE}: does not import userFacingApiError from ../../lib/api-error-message — DISP-F6326 regression.`);
  }
  for (const name of MUTATIONS) {
    const block = extractMutationBlock(src, name);
    if (!block || !/onError:/.test(block)) {
      offenders.push(`${FILE}: ${name} has no onError — a rejected write will silently do nothing again.`);
    }
  }
  return offenders;
}

export function run() {
  const src = fs.readFileSync(path.join(repoRoot, FILE), "utf8");
  const offenders = checkDetentionBoardMutationErrors(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    const closeM = useMutation({
      mutationFn: () => closeDetentionEvent(event.id, { operating_company_id: companyId }),
      onSuccess: onAction,
    });
    const bridgeM = useMutation({
      mutationFn: () => bridgeDetentionBilling(event.id, { operating_company_id: companyId }),
      onSuccess: onAction,
    });
    const notifyM = useMutation({
      mutationFn: () => notifyDetentionCustomer(event.id, { operating_company_id: companyId }),
      onSuccess: onAction,
    });
    const syncM = useMutation({
      mutationFn: () => syncDetentionFromArrivals(companyId),
      onSuccess: () => {},
    });
  `;
  const fixed = fs.readFileSync(path.join(repoRoot, FILE), "utf8");

  const buggyOffenders = checkDetentionBoardMutationErrors(buggy);
  const fixedOffenders = checkDetentionBoardMutationErrors(fixed);

  if (buggyOffenders.length >= 6 && fixedOffenders.length === 0) {
    console.log("verify-detention-board-mutation-errors-surfaced selftest OK");
    process.exit(0);
  }
  console.error("verify-detention-board-mutation-errors-surfaced selftest FAILED", {
    buggyOffenders,
    fixedOffenders,
  });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-detention-board-mutation-errors-surfaced FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-detention-board-mutation-errors-surfaced OK — all 4 DetentionBoardPage mutations surface failures via toast, never a silent no-op",
  );
}
