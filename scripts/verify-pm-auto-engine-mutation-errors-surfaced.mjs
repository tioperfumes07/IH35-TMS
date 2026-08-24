#!/usr/bin/env node
/**
 * verify-pm-auto-engine-mutation-errors-surfaced.mjs (MAINT-F6333, verify-step 5620)
 *
 * Root cause: `apps/frontend/src/pages/maintenance/PmAutoEnginePage.tsx` (mounted at
 * `/maintenance/pm-auto-engine`) has `settingsM` ("Pause engine"/"Resume engine") and `runNowM`
 * ("Run now") both with `pushToast` wired for success only, no `onError`. `useToast`/`pushToast`
 * are already imported and used in this exact file. On a rejected pause/resume or manual-run
 * request this was a silent no-op — on a control that automatically creates real work orders and
 * alerts, silently failing to pause it (or to report a failed manual run) carries real
 * operational risk.
 *
 * Fix: added `onError: (err) => pushToast(userFacingApiError(err, "..."), "error")` to both.
 *
 * Usage:
 *   node scripts/verify-pm-auto-engine-mutation-errors-surfaced.mjs            # scan
 *   node scripts/verify-pm-auto-engine-mutation-errors-surfaced.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const FILE = "apps/frontend/src/pages/maintenance/PmAutoEnginePage.tsx";

const IMPORTS_ERROR_HELPER_RE = /import\s*\{[^}]*\buserFacingApiError\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/lib\/api-error-message["']/;
const MUTATIONS = ["settingsM", "runNowM"];

function extractMutationBlock(src, mutationName) {
  const startRe = new RegExp(`const ${mutationName} = useMutation\\(\\{`);
  const m = startRe.exec(src);
  if (!m) return null;
  const closeIdx = src.indexOf("\n  });", m.index);
  if (closeIdx === -1) return null;
  return src.slice(m.index, closeIdx);
}

export function checkPmAutoEngineMutationErrors(src) {
  const offenders = [];
  if (!IMPORTS_ERROR_HELPER_RE.test(src)) {
    offenders.push(`${FILE}: does not import userFacingApiError from ../../lib/api-error-message — MAINT-F6333 regression.`);
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
  const offenders = checkPmAutoEngineMutationErrors(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    const settingsM = useMutation({
      mutationFn: (isPaused) => updateMaintenancePmAutoEngineSettings({ operating_company_id: companyId, is_paused: isPaused }),
      onSuccess: async (_data, isPaused) => {
        pushToast(isPaused ? "PM auto-engine paused" : "PM auto-engine resumed", "success");
      },
    });
    const runNowM = useMutation({
      mutationFn: () => runMaintenancePmAutoEngineNow(companyId),
      onSuccess: async (result) => {
        pushToast("Run complete", "success");
      },
    });
  `;
  const fixed = fs.readFileSync(path.join(repoRoot, FILE), "utf8");

  const buggyOffenders = checkPmAutoEngineMutationErrors(buggy);
  const fixedOffenders = checkPmAutoEngineMutationErrors(fixed);

  if (buggyOffenders.length >= 3 && fixedOffenders.length === 0) {
    console.log("verify-pm-auto-engine-mutation-errors-surfaced selftest OK");
    process.exit(0);
  }
  console.error("verify-pm-auto-engine-mutation-errors-surfaced selftest FAILED", {
    buggyOffenders,
    fixedOffenders,
  });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-pm-auto-engine-mutation-errors-surfaced FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-pm-auto-engine-mutation-errors-surfaced OK — settingsM and runNowM both surface failures via toast, never a silent no-op",
  );
}
