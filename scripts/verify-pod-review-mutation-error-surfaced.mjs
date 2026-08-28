#!/usr/bin/env node
/**
 * verify-pod-review-mutation-error-surfaced.mjs (DISP-F6328, verify-step 4662)
 *
 * Root cause: `apps/frontend/src/pages/dispatch/PodReviewPage.tsx` (mounted at
 * `/dispatch/pod-review`) has `reviewMutation` (backing both "Approve" and "Reject" buttons) with
 * no `onError`, no `useToast`/`pushToast` import anywhere in the file, no `isError` check,
 * fire-and-forget `.mutate()`. On any rejected review write this was a silent no-op: the button
 * just went back to enabled with zero feedback.
 *
 * Fix: added `useToast` + `onError: (err) => pushToast(userFacingApiError(err, "..."), "error")`.
 *
 * Usage:
 *   node scripts/verify-pod-review-mutation-error-surfaced.mjs            # scan
 *   node scripts/verify-pod-review-mutation-error-surfaced.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const FILE = "apps/frontend/src/pages/dispatch/PodReviewPage.tsx";
const BACKEND_FILE = "apps/backend/src/dispatch/pod.routes.ts";

const IMPORTS_TOAST_RE = /import\s*\{\s*useToast\s*\}\s*from\s*["']\.\.\/\.\.\/components\/Toast["']/;
const IMPORTS_ERROR_HELPER_RE = /import\s*\{[^}]*\buserFacingApiError\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/lib\/api-error-message["']/;
const ON_ERROR_RE = /onError:\s*\(err, input\)[\s\S]*?pushToast\(userFacingApiError\(err,/;
const IMMUTABLE_INPUT_RE = /reviewMutation\.mutate\(\{[\s\S]*?companyId,[\s\S]*?documentId:\s*doc\.id,[\s\S]*?generation:\s*generationRef\.current,[\s\S]*?scopeKey:\s*scopeKeyRef\.current,[\s\S]*?status,/;
const STALE_SUCCESS_RE = /onSuccess:\s*\(_result, input\)[\s\S]*?input\.generation !== generationRef\.current[\s\S]*?input\.scopeKey !== scopeKeyRef\.current[\s\S]*?onReviewed\(input\.companyId\)/;
const STALE_ERROR_RE = /onError:\s*\(err, input\)[\s\S]*?input\.generation !== generationRef\.current[\s\S]*?input\.scopeKey !== scopeKeyRef\.current[\s\S]*?pushToast/;
const SCOPED_INVALIDATION_RE = /invalidateQueries\(\{ queryKey: \["pod-documents", submittedCompanyId\] \}\)/;
const DUPLICATE_LOCK_RE = /if \(reviewMutation\.isPending\) return;/;

export function checkPodReviewMutationError(src) {
  const offenders = [];
  if (!IMPORTS_TOAST_RE.test(src)) {
    offenders.push(`${FILE}: does not import useToast — DISP-F6328 regression.`);
  }
  if (!IMPORTS_ERROR_HELPER_RE.test(src)) {
    offenders.push(`${FILE}: does not import userFacingApiError from ../../lib/api-error-message — DISP-F6328 regression.`);
  }
  if (!ON_ERROR_RE.test(src)) {
    offenders.push(`${FILE}: reviewMutation has no onError — a rejected Approve/Reject will silently do nothing again.`);
  }
  if (!IMMUTABLE_INPUT_RE.test(src)) offenders.push(`${FILE}: POD review must submit one immutable company/document/generation/status snapshot.`);
  if (!STALE_SUCCESS_RE.test(src)) offenders.push(`${FILE}: stale POD review success can refresh a replacement company/document scope.`);
  if (!STALE_ERROR_RE.test(src)) offenders.push(`${FILE}: stale POD review failure can disclose itself in a replacement company/document scope.`);
  if (!SCOPED_INVALIDATION_RE.test(src)) offenders.push(`${FILE}: review completion must invalidate only the submitted company POD roster.`);
  if (!DUPLICATE_LOCK_RE.test(src)) offenders.push(`${FILE}: duplicate POD review writes must be refused while one is pending.`);
  return offenders;
}

export function checkPodReviewBackendLifecycle(src) {
  const offenders = [];
  const route = src.match(/app\.post\(\s*"\/api\/v1\/dispatch\/pod-documents\/:id\/review"[\s\S]*?(?=\n  app\.get\("\/api\/v1\/dispatch\/loads\/:loadId\/pod-bol")/)?.[0] ?? "";
  if (!/FROM dispatch\.pod_documents[\s\S]*?archived_at IS NULL[\s\S]*?LIMIT 1[\s\S]*?FOR UPDATE/.test(route)) {
    offenders.push(`${BACKEND_FILE}: POD review must lock the canonical row before checking its lifecycle status.`);
  }
  if (!/const reviewedPod = res\.rows\[0\];[\s\S]*?if \(!reviewedPod\) return \{ error: "pod_review_conflict" as const \};[\s\S]*?appendCrudAudit/.test(route)) {
    offenders.push(`${BACKEND_FILE}: POD review must fail closed on a zero-row UPDATE before audit or downstream success.`);
  }
  if (!/return \{ pod: reviewedPod \};/.test(route)) {
    offenders.push(`${BACKEND_FILE}: POD review must return only the update row proven to exist.`);
  }
  return offenders;
}

export function run() {
  const src = fs.readFileSync(path.join(repoRoot, FILE), "utf8");
  const backendSrc = fs.readFileSync(path.join(repoRoot, BACKEND_FILE), "utf8");
  const offenders = [...checkPodReviewMutationError(src), ...checkPodReviewBackendLifecycle(backendSrc)];
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    const reviewMutation = useMutation({
      mutationFn: (status) => reviewPodDocument(doc.id, { operating_company_id: companyId, status }),
      onSuccess: onReviewed,
    });
  `;
  const fixed = fs.readFileSync(path.join(repoRoot, FILE), "utf8");
  const fixedBackend = fs.readFileSync(path.join(repoRoot, BACKEND_FILE), "utf8");
  const unlockedBackend = fixedBackend.replace(/\n\s*FOR UPDATE\n/, "\n");
  const uncheckedBackend = fixedBackend.replace(/\n\s*const reviewedPod = res\.rows\[0\];\n\s*if \(!reviewedPod\) return \{ error: "pod_review_conflict" as const \};/, "");

  const buggyOffenders = checkPodReviewMutationError(buggy);
  const fixedOffenders = checkPodReviewMutationError(fixed);

  const backendMutations = [unlockedBackend, uncheckedBackend].map(checkPodReviewBackendLifecycle);
  if (buggyOffenders.length >= 8 && fixedOffenders.length === 0 && checkPodReviewBackendLifecycle(fixedBackend).length === 0 && backendMutations.every((result) => result.length > 0)) {
    console.log("verify-pod-review-mutation-error-surfaced selftest OK");
    process.exit(0);
  }
  console.error("verify-pod-review-mutation-error-surfaced selftest FAILED", { buggyOffenders, fixedOffenders });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-pod-review-mutation-error-surfaced FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-pod-review-mutation-error-surfaced OK — POD review snapshots company/document scope, suppresses stale completion, scopes refresh, and surfaces current failures",
  );
}
