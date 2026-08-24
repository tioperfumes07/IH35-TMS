#!/usr/bin/env node
/**
 * verify-inventory-part-drawer-mutation-errors-surfaced.mjs (INV-F6323, verify-step 4652)
 *
 * Root cause: `apps/frontend/src/pages/inventory/PartCreateDrawer.tsx` ("+ Create part") and
 * `PartEditDrawer.tsx` ("Edit part") — both real, live, mounted `/inventory` drawers — had ZERO
 * error handling anywhere: no `onError`, no `isError` render, no try/catch at the
 * fire-and-forget `.mutate()` call site, and no app-wide QueryClient mutation default
 * (main.tsx sets `defaultOptions.queries` only). On any rejected write this was a silent no-op:
 * the drawer just sat there with no explanation, indistinguishable from a slow-but-working save.
 *
 * Fix: added `onError: (err) => pushToast(userFacingApiError(err, "..."), "error")` to both
 * mutations.
 *
 * Usage:
 *   node scripts/verify-inventory-part-drawer-mutation-errors-surfaced.mjs            # scan
 *   node scripts/verify-inventory-part-drawer-mutation-errors-surfaced.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const FILES = [
  "apps/frontend/src/pages/inventory/PartCreateDrawer.tsx",
  "apps/frontend/src/pages/inventory/PartEditDrawer.tsx",
];

const IMPORTS_TOAST_RE = /import\s*\{\s*useToast\s*\}\s*from\s*["']\.\.\/\.\.\/components\/Toast["']/;
const IMPORTS_ERROR_HELPER_RE = /import\s*\{[^}]*\buserFacingApiError\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/lib\/api-error-message["']/;
const ON_ERROR_RE = /onError:\s*\(err\)\s*=>\s*pushToast\(userFacingApiError\(err,/;

export function checkInventoryPartDrawerMutationErrors(file, src) {
  const offenders = [];
  if (!IMPORTS_TOAST_RE.test(src)) {
    offenders.push(`${file}: does not import useToast — INV-F6323 regression.`);
  }
  if (!IMPORTS_ERROR_HELPER_RE.test(src)) {
    offenders.push(`${file}: does not import userFacingApiError from ../../lib/api-error-message — INV-F6323 regression.`);
  }
  if (!ON_ERROR_RE.test(src)) {
    offenders.push(`${file}: mutation has no onError — a failed save will silently do nothing again.`);
  }
  return offenders;
}

export function run() {
  const offenders = [];
  for (const file of FILES) {
    const src = fs.readFileSync(path.join(repoRoot, file), "utf8");
    offenders.push(...checkInventoryPartDrawerMutationErrors(file, src));
  }
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    const createMutation = useMutation({
      mutationFn: async (data) => apiRequest("/api/v1/maintenance/parts", { method: "POST", body: data }),
      onSuccess: async (created) => { onCreated?.(created.id); },
    });
  `;
  const buggyOffenders = checkInventoryPartDrawerMutationErrors("test-file.tsx", buggy);

  let fixedOffenders = [];
  for (const file of FILES) {
    const src = fs.readFileSync(path.join(repoRoot, file), "utf8");
    fixedOffenders.push(...checkInventoryPartDrawerMutationErrors(file, src));
  }

  if (buggyOffenders.length >= 3 && fixedOffenders.length === 0) {
    console.log("verify-inventory-part-drawer-mutation-errors-surfaced selftest OK");
    process.exit(0);
  }
  console.error("verify-inventory-part-drawer-mutation-errors-surfaced selftest FAILED", {
    buggyOffenders,
    fixedOffenders,
  });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-inventory-part-drawer-mutation-errors-surfaced FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-inventory-part-drawer-mutation-errors-surfaced OK — both Part Create/Edit drawer mutations surface failures via toast, never a silent no-op",
  );
}
