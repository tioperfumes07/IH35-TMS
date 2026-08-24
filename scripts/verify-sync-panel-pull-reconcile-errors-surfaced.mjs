#!/usr/bin/env node
/**
 * verify-sync-panel-pull-reconcile-errors-surfaced.mjs (VEND-F6337/CUST-F6338, verify-step 6820)
 *
 * Root cause: `VendorsSyncPanel.tsx` (mounted on the real live `/vendors` page) and its literal
 * sibling `CustomersSyncPanel.tsx` (mounted on `/customers`, VendorsSyncPanel's own comment says
 * it "mirrors the CustomersSyncPanel fix") both have `pullMutation`/`reconcileMutation` backing
 * the "Refresh from QBO" / "Reconcile" buttons with NO `onError` and no toast import at all. A
 * rejected pull/reconcile (expired QBO auth, rate limit, network failure) silently returns the
 * button to idle text — indistinguishable from a fast successful sync.
 *
 * Fix: added `onError` (pushToast + userFacingApiError, matching the convention already used
 * elsewhere in both modules) to all 4 mutation instances across the 2 files.
 *
 * Usage:
 *   node scripts/verify-sync-panel-pull-reconcile-errors-surfaced.mjs            # scan
 *   node scripts/verify-sync-panel-pull-reconcile-errors-surfaced.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const TARGETS = [
  "apps/frontend/src/pages/vendors/VendorsSyncPanel.tsx",
  "apps/frontend/src/pages/customers/CustomersSyncPanel.tsx",
];
const MUTATIONS = ["pullMutation", "reconcileMutation"];

function extractMutationBlock(src, mutationName) {
  const startRe = new RegExp(`const ${mutationName} = useMutation\\(\\{`);
  const m = startRe.exec(src);
  if (!m) return null;
  const closeIdx = src.indexOf("\n  });", m.index);
  if (closeIdx === -1) return null;
  return src.slice(m.index, closeIdx);
}

export function checkSyncPanelPullReconcileErrors(file, src) {
  const offenders = [];
  for (const name of MUTATIONS) {
    const block = extractMutationBlock(src, name);
    if (!block || !/onError:/.test(block)) {
      offenders.push(`${file}: ${name} has no onError — a rejected sync will silently return to idle.`);
    }
  }
  return offenders;
}

export function run() {
  const offenders = [];
  for (const file of TARGETS) {
    const src = fs.readFileSync(path.join(repoRoot, file), "utf8");
    offenders.push(...checkSyncPanelPullReconcileErrors(file, src));
  }
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    const pullMutation = useMutation({
      mutationFn: () => doPull(),
      onSuccess: () => invalidate(),
    });
    const reconcileMutation = useMutation({
      mutationFn: () => doReconcile(),
      onSuccess: () => invalidate(),
    });
  `;
  const buggyOffenders = checkSyncPanelPullReconcileErrors("test-file.tsx", buggy);

  let fixedOffenders = [];
  for (const file of TARGETS) {
    const src = fs.readFileSync(path.join(repoRoot, file), "utf8");
    fixedOffenders.push(...checkSyncPanelPullReconcileErrors(file, src));
  }

  if (buggyOffenders.length >= 1 && fixedOffenders.length === 0) {
    console.log("verify-sync-panel-pull-reconcile-errors-surfaced selftest OK");
    process.exit(0);
  }
  console.error("verify-sync-panel-pull-reconcile-errors-surfaced selftest FAILED", {
    buggyOffenders,
    fixedOffenders,
  });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-sync-panel-pull-reconcile-errors-surfaced FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-sync-panel-pull-reconcile-errors-surfaced OK — Vendors/Customers QBO sync panels surface pull/reconcile failures, never a silent idle return",
  );
}
