#!/usr/bin/env node
/**
 * verify-maintenance-module-mutation-errors-surfaced.mjs (MAINT-F6336, verify-step 6620)
 *
 * Root cause: a precise-scanner sweep of apps/frontend/src/pages (useMutation blocks with no
 * `onError:` AND no nearby `.isError` render or try/catch at any call site) surfaced 5 real,
 * live `/maintenance/*` write paths across 5 files with zero error handling, each sitting beside
 * a SIBLING mutation in the same file that already correctly wires onError — proving the
 * pushToast/userFacingApiError convention was established in each file but just not applied
 * consistently:
 *   - DriverReportsQueuePage.tsx `mut` (Under review / Resolve / Dismiss buttons)
 *   - FaultRulesPage.tsx `archiveMutation` (Archive button) — sibling saveMutation has onError
 *   - MaintenanceAlertsCard.tsx `scheduleMutation` (Schedule button) — sibling ackMutation has onError
 *   - PartsInventoryTable.tsx `purchaseMutation` + `adjustMutation` (Save Purchase / Apply Adjustment)
 *   - PmSchedulePage.tsx `generateM` (Generate WO button) — had NEITHER onSuccess NOR onError,
 *     so even a successful generate left the row's Status column stale until a manual reload
 *
 * Fix: added `onError` (reusing pushToast/userFacingApiError, importing them where the file
 * didn't already) to all 5 mutations, and gave PmSchedulePage's generateM a matching onSuccess
 * (toast + invalidate) since it previously updated nothing on success either.
 *
 * Usage:
 *   node scripts/verify-maintenance-module-mutation-errors-surfaced.mjs            # scan
 *   node scripts/verify-maintenance-module-mutation-errors-surfaced.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const TARGETS = [
  { file: "apps/frontend/src/pages/maintenance/DriverReportsQueuePage.tsx", mutations: ["mut"] },
  { file: "apps/frontend/src/pages/maintenance/FaultRulesPage.tsx", mutations: ["archiveMutation"] },
  { file: "apps/frontend/src/pages/maintenance/components/MaintenanceAlertsCard.tsx", mutations: ["scheduleMutation"] },
  { file: "apps/frontend/src/pages/maintenance/components/PartsInventoryTable.tsx", mutations: ["purchaseMutation", "adjustMutation"] },
  { file: "apps/frontend/src/pages/maintenance/pm-schedule/PmSchedulePage.tsx", mutations: ["generateM"] },
];

function extractMutationBlock(src, mutationName) {
  const startRe = new RegExp(`const ${mutationName} = useMutation\\(\\{`);
  const m = startRe.exec(src);
  if (!m) return null;
  const closeIdx = src.indexOf("\n  });", m.index);
  if (closeIdx === -1) return null;
  return src.slice(m.index, closeIdx);
}

export function checkMaintenanceModuleMutationErrors(file, src, mutationNames) {
  const offenders = [];
  for (const name of mutationNames) {
    const block = extractMutationBlock(src, name);
    if (!block || !/onError:/.test(block)) {
      offenders.push(`${file}: ${name} has no onError — a rejected write will silently do nothing.`);
    }
  }
  return offenders;
}

export function run() {
  const offenders = [];
  for (const t of TARGETS) {
    const src = fs.readFileSync(path.join(repoRoot, t.file), "utf8");
    offenders.push(...checkMaintenanceModuleMutationErrors(t.file, src, t.mutations));
  }
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    const mut = useMutation({
      mutationFn: (id) => doSomething(id),
      onSuccess: async () => { await invalidate(); },
    });
  `;
  const buggyOffenders = checkMaintenanceModuleMutationErrors("test-file.tsx", buggy, ["mut"]);

  let fixedOffenders = [];
  for (const t of TARGETS) {
    const src = fs.readFileSync(path.join(repoRoot, t.file), "utf8");
    fixedOffenders.push(...checkMaintenanceModuleMutationErrors(t.file, src, t.mutations));
  }

  if (buggyOffenders.length >= 1 && fixedOffenders.length === 0) {
    console.log("verify-maintenance-module-mutation-errors-surfaced selftest OK");
    process.exit(0);
  }
  console.error("verify-maintenance-module-mutation-errors-surfaced selftest FAILED", {
    buggyOffenders,
    fixedOffenders,
  });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-maintenance-module-mutation-errors-surfaced FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-maintenance-module-mutation-errors-surfaced OK — all 6 maintenance-module mutations across 5 files surface failures, never a silent no-op",
  );
}
