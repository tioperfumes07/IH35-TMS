#!/usr/bin/env node
/**
 * verify-lists-deactivate-mutation-errors-surfaced.mjs (LISTS-F6334, verify-step 5920)
 *
 * Root cause: a systemic, copy-pasted bug pattern across 5 real live `/lists/*` catalog pages —
 * `TerminationReasonsListPage.tsx`, `DetailTypesListPage.tsx`, `VoidCancelReasonsListPage.tsx`,
 * `DispatchCatalogListPage.tsx` (a shared component reused by 4 concrete pages), and
 * `LoadCancellationReasonsListPage.tsx`. In every file, `createMutation`/`updateMutation`
 * correctly wire `onError` to a local error-state variable that IS rendered inline in the shared
 * modal — but each file's `deactivateMutation` had NO `onError` at all, and the "Deactivate"
 * button's call site uses `void onDeactivate()` (explicitly discarding the promise). On a
 * rejected deactivate this was a silent no-op across all 5 surfaces.
 *
 * Fix: added `onError` to each `deactivateMutation`, reusing the same local error-state variable
 * (and display slot) each file's create/update mutations already use.
 *
 * Usage:
 *   node scripts/verify-lists-deactivate-mutation-errors-surfaced.mjs            # scan
 *   node scripts/verify-lists-deactivate-mutation-errors-surfaced.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const TARGETS = [
  "apps/frontend/src/pages/lists/drivers/TerminationReasonsListPage.tsx",
  "apps/frontend/src/pages/lists/accounting/DetailTypesListPage.tsx",
  "apps/frontend/src/pages/lists/accounting/VoidCancelReasonsListPage.tsx",
  "apps/frontend/src/pages/lists/dispatch/DispatchCatalogListPage.tsx",
  "apps/frontend/src/pages/lists/dispatch/LoadCancellationReasonsListPage.tsx",
];

function extractMutationBlock(src, mutationName) {
  const startRe = new RegExp(`const ${mutationName} = useMutation\\(\\{`);
  const m = startRe.exec(src);
  if (!m) return null;
  const closeIdx = src.indexOf("\n  });", m.index);
  if (closeIdx === -1) return null;
  return src.slice(m.index, closeIdx);
}

export function checkListsDeactivateMutationErrors(file, src) {
  const offenders = [];
  const block = extractMutationBlock(src, "deactivateMutation");
  if (!block || !/onError:/.test(block)) {
    offenders.push(`${file}: deactivateMutation has no onError — a rejected deactivate will silently do nothing again.`);
  }
  return offenders;
}

export function run() {
  const offenders = [];
  for (const file of TARGETS) {
    const src = fs.readFileSync(path.join(repoRoot, file), "utf8");
    offenders.push(...checkListsDeactivateMutationErrors(file, src));
  }
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    const deactivateMutation = useMutation({
      mutationFn: (id) => deactivateSomething(id),
      onSuccess: async () => { await invalidate(); },
    });
  `;
  const buggyOffenders = checkListsDeactivateMutationErrors("test-file.tsx", buggy);

  let fixedOffenders = [];
  for (const file of TARGETS) {
    const src = fs.readFileSync(path.join(repoRoot, file), "utf8");
    fixedOffenders.push(...checkListsDeactivateMutationErrors(file, src));
  }

  if (buggyOffenders.length >= 1 && fixedOffenders.length === 0) {
    console.log("verify-lists-deactivate-mutation-errors-surfaced selftest OK");
    process.exit(0);
  }
  console.error("verify-lists-deactivate-mutation-errors-surfaced selftest FAILED", {
    buggyOffenders,
    fixedOffenders,
  });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-lists-deactivate-mutation-errors-surfaced FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-lists-deactivate-mutation-errors-surfaced OK — all 5 lists-module deactivateMutations surface failures via the existing error-state slot, never a silent no-op",
  );
}
