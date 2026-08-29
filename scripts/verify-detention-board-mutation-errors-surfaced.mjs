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
const APPROVAL_SERVICE_FILE = "apps/backend/src/dispatch/detention-approval.service.ts";

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
  if ((src.match(/mutationFn:\s*\(\)\s*=>/g) ?? []).length > 0) {
    offenders.push(`${FILE}: a detention write still closes over mutable render scope instead of accepting submitted variables.`);
  }
  for (const required of [
    "type DetentionAction = { eventId: string; companyId: string }",
    "onSuccess: (_result, variables) => onAction(variables.companyId)",
    "mutationFn: (submittedCompanyId: string) => syncDetentionFromArrivals(submittedCompanyId)",
    '["dispatch", "detention-board", submittedCompanyId]',
    "const actionPending = closeM.isPending || bridgeM.isPending || notifyM.isPending",
    "syncM.mutate(companyId)",
  ]) {
    if (!src.includes(required)) offenders.push(`${FILE}: missing scope/lifecycle invariant: ${required}`);
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

export function checkDetentionCloseLifecycle(src) {
  const offenders = [];
  const start = src.indexOf("export async function closeDetentionEvent");
  const end = src.indexOf("export async function bridgeDetentionToBillingInClientTx", start);
  const close = start >= 0 && end > start ? src.slice(start, end) : "";
  if (!close) offenders.push(`${SERVICE_FILE}: closeDetentionEvent lifecycle is missing.`);
  if (!/WHERE id = \$1[\s\S]*?operating_company_id = \$2::uuid[\s\S]*?status = 'accruing'[\s\S]*?RETURNING \*/.test(close)) {
    offenders.push(`${SERVICE_FILE}: detention close must compare-and-set the accruing state in the canonical write.`);
  }
  if (!/const closedEvent = updated\.rows\[0\];[\s\S]*?if \(!closedEvent\) return \{ ok: false as const, error: "not_accruing" as const \};/.test(close)) {
    offenders.push(`${SERVICE_FILE}: detention close must reject a lost race before publishing success.`);
  }
  if (!/return \{ ok: true as const, event: closedEvent \};/.test(close)) {
    offenders.push(`${SERVICE_FILE}: detention close must return only the proven persisted row.`);
  }
  return offenders;
}

export function checkDetentionRejectLifecycle(src) {
  const offenders = [];
  const reject = src.slice(src.indexOf("export async function rejectDetentionRequest"));
  if (!/SELECT \* FROM dispatch\.detention_requests[\s\S]*?operating_company_id = \$2::uuid FOR UPDATE/.test(reject)) {
    offenders.push(`${APPROVAL_SERVICE_FILE}: detention reject must lock the canonical request before checking pending status.`);
  }
  if (!/WHERE id = \$1 AND operating_company_id = \$4::uuid AND status = 'pending_review'[\s\S]*?RETURNING \*/.test(reject)) {
    offenders.push(`${APPROVAL_SERVICE_FILE}: detention reject UPDATE must compare-and-set pending_review.`);
  }
  if (!/const rejectedRequest = updated\.rows\[0\];[\s\S]*?if \(!rejectedRequest\) return \{ ok: false as const, error: "not_pending" as const \};[\s\S]*?appendCrudAudit/.test(reject)) {
    offenders.push(`${APPROVAL_SERVICE_FILE}: detention reject must refuse a lost race before audit/success.`);
  }
  if (!/return \{ ok: true as const, request: rejectedRequest \};/.test(reject)) {
    offenders.push(`${APPROVAL_SERVICE_FILE}: detention reject must return only a proven updated row.`);
  }
  return offenders;
}

export function run() {
  const src = fs.readFileSync(path.join(repoRoot, FILE), "utf8");
  const serviceSrc = fs.readFileSync(path.join(repoRoot, SERVICE_FILE), "utf8");
  const approvalServiceSrc = fs.readFileSync(path.join(repoRoot, APPROVAL_SERVICE_FILE), "utf8");
  const offenders = [...checkDetentionBoardMutationErrors(src), ...checkDetentionBoardCompleteRange(serviceSrc), ...checkDetentionCloseLifecycle(serviceSrc), ...checkDetentionRejectLifecycle(approvalServiceSrc)];
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
  const fixedApprovalService = fs.readFileSync(path.join(repoRoot, APPROVAL_SERVICE_FILE), "utf8");

  const buggyOffenders = checkDetentionBoardMutationErrors(buggy);
  const fixedOffenders = checkDetentionBoardMutationErrors(fixed);
  const mutableScope = fixed.replace(
    "mutationFn: (submittedCompanyId: string) => syncDetentionFromArrivals(submittedCompanyId)",
    "mutationFn: () => syncDetentionFromArrivals(companyId)",
  );
  const wrongInvalidation = fixed.replaceAll(
    '["dispatch", "detention-board", submittedCompanyId]',
    '["dispatch", "detention-board", companyId]',
  );
  const concurrentRows = fixed.replace(
    "const actionPending = closeM.isPending || bridgeM.isPending || notifyM.isPending",
    "const actionPending = closeM.isPending",
  );
  const cappedService = fixedService.replace(
    "ORDER BY de.status ASC, de.started_at ASC",
    "ORDER BY de.status ASC, de.started_at ASC LIMIT 200",
  );
  const capFails = checkDetentionBoardCompleteRange(cappedService).some((item) => item.includes("silently caps"));
  const completePasses = checkDetentionBoardCompleteRange(fixedService).length === 0;
  const rejectMutationsFail = [
    fixedApprovalService.replace("operating_company_id = $2::uuid FOR UPDATE", "operating_company_id = $2::uuid"),
    fixedApprovalService.replace("WHERE id = $1 AND operating_company_id = $4::uuid AND status = 'pending_review'", "WHERE id = $1 AND operating_company_id = $4::uuid"),
    fixedApprovalService.replace("if (!rejectedRequest) return { ok: false as const, error: \"not_pending\" as const };", "if (false) return { ok: false as const, error: \"not_pending\" as const };")
  ].every((mutant) => checkDetentionRejectLifecycle(mutant).length > 0);
  const rejectPasses = checkDetentionRejectLifecycle(fixedApprovalService).length === 0;
  const closeMutationsFail = [
    fixedService.replace("AND status = 'accruing'", "AND status = status"),
    fixedService.replace('if (!closedEvent) return { ok: false as const, error: "not_accruing" as const };', 'if (false) return { ok: false as const, error: "not_accruing" as const };'),
    fixedService.replace("return { ok: true as const, event: closedEvent };", "return { ok: true as const, event: updated.rows[0] };")
  ].every((mutant) => checkDetentionCloseLifecycle(mutant).length > 0);
  const closePasses = checkDetentionCloseLifecycle(fixedService).length === 0;

  const lifecycleMutationsFail = [mutableScope, wrongInvalidation, concurrentRows].every(
    (mutant) => checkDetentionBoardMutationErrors(mutant).length > 0,
  );

  if (buggyOffenders.length >= 6 && fixedOffenders.length === 0 && lifecycleMutationsFail && capFails && completePasses && closeMutationsFail && closePasses && rejectMutationsFail && rejectPasses) {
    console.log("verify-detention-board-mutation-errors-surfaced selftest OK (mutation errors + complete operational range)");
    process.exit(0);
  }
  console.error("verify-detention-board-mutation-errors-surfaced selftest FAILED", {
    buggyOffenders,
    fixedOffenders,
    lifecycleMutationsFail,
    capFails,
    completePasses,
    closeMutationsFail,
    closePasses,
    rejectMutationsFail,
    rejectPasses,
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
