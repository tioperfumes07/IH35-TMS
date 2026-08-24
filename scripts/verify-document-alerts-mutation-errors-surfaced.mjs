#!/usr/bin/env node
/**
 * verify-document-alerts-mutation-errors-surfaced.mjs (ALERTS-F6325, verify-step 4656)
 *
 * Root cause: `apps/frontend/src/pages/alerts/DocumentAlertsPage.tsx` (mounted at
 * `/drivers/alerts` — CDL/medical/training/DQF/uploads/permits expiry alerts inbox) has 3
 * mutations: `saveMutation` ("Save rule"), `ackMutation` ("Acknowledge"), `evaluateMutation`
 * ("Run evaluator") — none had `onError`, all call sites used fire-and-forget `.mutate()`, and
 * there was no `useToast`/`pushToast` import anywhere in the file. On any rejected write this was
 * a silent no-op: no toast, no explanation.
 *
 * Fix: added `useToast` + `onError: (err) => pushToast(userFacingApiError(err, "..."), "error")`
 * to all 3 mutations.
 *
 * Usage:
 *   node scripts/verify-document-alerts-mutation-errors-surfaced.mjs            # scan
 *   node scripts/verify-document-alerts-mutation-errors-surfaced.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const FILE = "apps/frontend/src/pages/alerts/DocumentAlertsPage.tsx";

const IMPORTS_TOAST_RE = /import\s*\{\s*useToast\s*\}\s*from\s*["']\.\.\/\.\.\/components\/Toast["']/;
const IMPORTS_ERROR_HELPER_RE = /import\s*\{[^}]*\buserFacingApiError\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/lib\/api-error-message["']/;
const MUTATIONS = ["saveMutation", "ackMutation", "evaluateMutation"];

function extractMutationBlock(src, mutationName) {
  const startRe = new RegExp(`const ${mutationName} = useMutation\\(\\{`);
  const m = startRe.exec(src);
  if (!m) return null;
  const closeIdx = src.indexOf("\n  });", m.index);
  if (closeIdx === -1) return null;
  return src.slice(m.index, closeIdx);
}

export function checkDocumentAlertsMutationErrors(src) {
  const offenders = [];
  if (!IMPORTS_TOAST_RE.test(src)) {
    offenders.push(`${FILE}: does not import useToast — ALERTS-F6325 regression.`);
  }
  if (!IMPORTS_ERROR_HELPER_RE.test(src)) {
    offenders.push(`${FILE}: does not import userFacingApiError from ../../lib/api-error-message — ALERTS-F6325 regression.`);
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
  const offenders = checkDocumentAlertsMutationErrors(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    const saveMutation = useMutation({
      mutationFn: () => updateDocumentAlertRule(rule.id, operatingCompanyId, {}),
      onSuccess: onSaved,
    });
    const ackMutation = useMutation({
      mutationFn: () => acknowledgeDocumentAlert(event.id, operatingCompanyId, "x"),
      onSuccess: onAcknowledged,
    });
    const evaluateMutation = useMutation({
      mutationFn: () => evaluateDocumentAlerts(companyId),
      onSuccess: () => {},
    });
  `;
  const fixed = fs.readFileSync(path.join(repoRoot, FILE), "utf8");

  const buggyOffenders = checkDocumentAlertsMutationErrors(buggy);
  const fixedOffenders = checkDocumentAlertsMutationErrors(fixed);

  if (buggyOffenders.length >= 5 && fixedOffenders.length === 0) {
    console.log("verify-document-alerts-mutation-errors-surfaced selftest OK");
    process.exit(0);
  }
  console.error("verify-document-alerts-mutation-errors-surfaced selftest FAILED", {
    buggyOffenders,
    fixedOffenders,
  });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-document-alerts-mutation-errors-surfaced FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-document-alerts-mutation-errors-surfaced OK — all 3 DocumentAlertsPage mutations surface failures via toast, never a silent no-op",
  );
}
