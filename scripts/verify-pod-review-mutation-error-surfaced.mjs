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

const IMPORTS_TOAST_RE = /import\s*\{\s*useToast\s*\}\s*from\s*["']\.\.\/\.\.\/components\/Toast["']/;
const IMPORTS_ERROR_HELPER_RE = /import\s*\{[^}]*\buserFacingApiError\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/lib\/api-error-message["']/;
const ON_ERROR_RE = /onError:\s*\(err\)\s*=>\s*pushToast\(userFacingApiError\(err,/;

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
  return offenders;
}

export function run() {
  const src = fs.readFileSync(path.join(repoRoot, FILE), "utf8");
  const offenders = checkPodReviewMutationError(src);
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

  const buggyOffenders = checkPodReviewMutationError(buggy);
  const fixedOffenders = checkPodReviewMutationError(fixed);

  if (buggyOffenders.length >= 3 && fixedOffenders.length === 0) {
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
    "verify-pod-review-mutation-error-surfaced OK — reviewMutation surfaces failures via toast, never a silent no-op",
  );
}
