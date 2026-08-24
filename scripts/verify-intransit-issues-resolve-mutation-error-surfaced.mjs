#!/usr/bin/env node
/**
 * verify-intransit-issues-resolve-mutation-error-surfaced.mjs (DISP-F6329, verify-step 4664)
 *
 * Root cause: `apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx` (mounted at
 * `/dispatch/in-transit-issues`) has `resolveMutation` (backing the "Resolve" button on every
 * open/acknowledged issue row) with no `onError` at all — unlike its sibling `createMutation`,
 * which DOES have `onError: () => setError("Failed to create issue.")`. But that `error` state
 * is only rendered inside the "Create In-Transit Issue" modal, invisible from the table row
 * where "Resolve" lives — so even copying that pattern would not actually surface anything. On a
 * rejected resolve this was a silent no-op with zero visible feedback anywhere.
 *
 * Fix: added `useToast` + `onError: (err) => pushToast(userFacingApiError(err, "..."), "error")`
 * to resolveMutation specifically (createMutation's existing setError pattern is left untouched
 * since it already works correctly for its own visible context).
 *
 * Usage:
 *   node scripts/verify-intransit-issues-resolve-mutation-error-surfaced.mjs            # scan
 *   node scripts/verify-intransit-issues-resolve-mutation-error-surfaced.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const FILE = "apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx";

const IMPORTS_TOAST_RE = /import\s*\{\s*useToast\s*\}\s*from\s*["']\.\.\/\.\.\/components\/Toast["']/;
const IMPORTS_ERROR_HELPER_RE = /import\s*\{[^}]*\buserFacingApiError\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/lib\/api-error-message["']/;

function extractMutationBlock(src, mutationName) {
  const startRe = new RegExp(`const ${mutationName} = useMutation\\(\\{`);
  const m = startRe.exec(src);
  if (!m) return null;
  const closeIdx = src.indexOf("\n  });", m.index);
  if (closeIdx === -1) return null;
  return src.slice(m.index, closeIdx);
}

export function checkIntransitIssuesResolveMutationError(src) {
  const offenders = [];
  if (!IMPORTS_TOAST_RE.test(src)) {
    offenders.push(`${FILE}: does not import useToast — DISP-F6329 regression.`);
  }
  if (!IMPORTS_ERROR_HELPER_RE.test(src)) {
    offenders.push(`${FILE}: does not import userFacingApiError from ../../lib/api-error-message — DISP-F6329 regression.`);
  }
  const block = extractMutationBlock(src, "resolveMutation");
  if (!block || !/onError:/.test(block)) {
    offenders.push(`${FILE}: resolveMutation has no onError — a rejected Resolve will silently do nothing again.`);
  }
  return offenders;
}

export function run() {
  const src = fs.readFileSync(path.join(repoRoot, FILE), "utf8");
  const offenders = checkIntransitIssuesResolveMutationError(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    const resolveMutation = useMutation({
      mutationFn: (issueId) => resolveDispatchIntransitIssue(issueId, { operating_company_id: companyId }),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["dispatch", "intransit-issues", companyId] }),
    });
  `;
  const fixed = fs.readFileSync(path.join(repoRoot, FILE), "utf8");

  const buggyOffenders = checkIntransitIssuesResolveMutationError(buggy);
  const fixedOffenders = checkIntransitIssuesResolveMutationError(fixed);

  if (buggyOffenders.length >= 3 && fixedOffenders.length === 0) {
    console.log("verify-intransit-issues-resolve-mutation-error-surfaced selftest OK");
    process.exit(0);
  }
  console.error("verify-intransit-issues-resolve-mutation-error-surfaced selftest FAILED", {
    buggyOffenders,
    fixedOffenders,
  });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-intransit-issues-resolve-mutation-error-surfaced FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-intransit-issues-resolve-mutation-error-surfaced OK — resolveMutation surfaces failures via toast, never a silent no-op",
  );
}
