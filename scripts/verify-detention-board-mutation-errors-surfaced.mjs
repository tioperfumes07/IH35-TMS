#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["driver","customer","unit","load","connectivity","reverse_link"],"leaves":["queues.detention"],"task":"DSP-F7070-DETENTION-COMPLETE-OPERATIONAL-QUEUE","vertical":"class-sweep"} */
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
const SERVICE_FILE = "apps/backend/src/dispatch/detention.service.ts";

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

function extractDetentionBoardReader(src) {
  const start = src.indexOf("export async function listDetentionBoard");
  const end = src.indexOf("export async function closeDetentionEvent", start);
  return start >= 0 && end > start ? src.slice(start, end) : "";
}

export function checkDetentionBoardCompleteRange(src) {
  const reader = extractDetentionBoardReader(src);
  const offenders = [];
  if (!reader) offenders.push(`${SERVICE_FILE}: listDetentionBoard reader is missing`);
  if (!/WHERE de\.operating_company_id = \$1::uuid/.test(reader)) offenders.push(`${SERVICE_FILE}: detention board lost exact company scope`);
  if (!/de\.status IN \('accruing', 'closed'\)/.test(reader)) offenders.push(`${SERVICE_FILE}: detention board lost its operational status boundary`);
  if (!/ORDER BY de\.status ASC, de\.started_at ASC/.test(reader)) offenders.push(`${SERVICE_FILE}: detention board lost deterministic operational ordering`);
  if (/\bLIMIT\s+\d+/i.test(reader)) offenders.push(`${SERVICE_FILE}: detention board silently caps the canonical operational queue`);
  return offenders;
}

export function run() {
  const src = fs.readFileSync(path.join(repoRoot, FILE), "utf8");
  const serviceSrc = fs.readFileSync(path.join(repoRoot, SERVICE_FILE), "utf8");
  const offenders = [...checkDetentionBoardMutationErrors(src), ...checkDetentionBoardCompleteRange(serviceSrc)];
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
  const fixedService = fs.readFileSync(path.join(repoRoot, SERVICE_FILE), "utf8");

  const buggyOffenders = checkDetentionBoardMutationErrors(buggy);
  const fixedOffenders = checkDetentionBoardMutationErrors(fixed);
  const cappedService = fixedService.replace(
    "ORDER BY de.status ASC, de.started_at ASC",
    "ORDER BY de.status ASC, de.started_at ASC LIMIT 200",
  );
  const capFails = checkDetentionBoardCompleteRange(cappedService).some((item) => item.includes("silently caps"));
  const completePasses = checkDetentionBoardCompleteRange(fixedService).length === 0;

  if (buggyOffenders.length >= 6 && fixedOffenders.length === 0 && capFails && completePasses) {
    console.log("verify-detention-board-mutation-errors-surfaced selftest OK (mutation errors + complete operational range)");
    process.exit(0);
  }
  console.error("verify-detention-board-mutation-errors-surfaced selftest FAILED", {
    buggyOffenders,
    fixedOffenders,
    capFails,
    completePasses,
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
    "verify-detention-board-mutation-errors-surfaced OK — all 4 mutations surface failures and the scoped detention operational queue is complete",
  );
}
