#!/usr/bin/env node
/**
 * verify-driver-layover-billable-mutation-error-surfaced.mjs (DRV-F6330, verify-step 4696)
 *
 * Root cause: `apps/frontend/src/pages/drivers/DriverLayoverHistory.tsx` (mounted at
 * `/dispatch/layovers/driver/:driverId`) has `billableMutation` — backing the "Billable"/"Not
 * billable" toggle button on every layover row — with no `onError`. The file imports
 * `userFacingApiError` but only wired it to the read query's error state, never to this write;
 * there was no `useToast`/`pushToast` import anywhere. On a rejected PATCH this was a silent
 * no-op: the toggle button just stayed on whatever it showed before the click.
 *
 * Fix: added `useToast` + `onError: (err) => pushToast(userFacingApiError(err, "..."), "error")`.
 *
 * Usage:
 *   node scripts/verify-driver-layover-billable-mutation-error-surfaced.mjs            # scan
 *   node scripts/verify-driver-layover-billable-mutation-error-surfaced.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const FILE = "apps/frontend/src/pages/drivers/DriverLayoverHistory.tsx";

const IMPORTS_TOAST_RE = /import\s*\{\s*useToast\s*\}\s*from\s*["']\.\.\/\.\.\/components\/Toast["']/;
const ON_ERROR_RE = /onError:\s*\(err\)\s*=>\s*pushToast\(userFacingApiError\(err,/;

export function checkDriverLayoverBillableMutationError(src) {
  const offenders = [];
  if (!IMPORTS_TOAST_RE.test(src)) {
    offenders.push(`${FILE}: does not import useToast — DRV-F6330 regression.`);
  }
  if (!ON_ERROR_RE.test(src)) {
    offenders.push(`${FILE}: billableMutation has no onError — a rejected billable-toggle will silently do nothing again.`);
  }
  return offenders;
}

export function run() {
  const src = fs.readFileSync(path.join(repoRoot, FILE), "utf8");
  const offenders = checkDriverLayoverBillableMutationError(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    import { userFacingApiError } from "../../lib/api-error-message";
    const billableMutation = useMutation({
      mutationFn: async ({ uuid, billable }) => {
        const res = await fetch(resolveApiUrl(\`/api/v1/dispatch/layovers/\${uuid}/mark-billable\`));
        if (!res.ok) throw new Error("Failed");
      },
      onSuccess: () => qc.invalidateQueries({ queryKey: ["driver-layovers"] }),
    });
  `;
  const fixed = fs.readFileSync(path.join(repoRoot, FILE), "utf8");

  const buggyOffenders = checkDriverLayoverBillableMutationError(buggy);
  const fixedOffenders = checkDriverLayoverBillableMutationError(fixed);

  if (buggyOffenders.length >= 2 && fixedOffenders.length === 0) {
    console.log("verify-driver-layover-billable-mutation-error-surfaced selftest OK");
    process.exit(0);
  }
  console.error("verify-driver-layover-billable-mutation-error-surfaced selftest FAILED", {
    buggyOffenders,
    fixedOffenders,
  });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-driver-layover-billable-mutation-error-surfaced FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-driver-layover-billable-mutation-error-surfaced OK — billableMutation surfaces failures via toast, never a silent no-op",
  );
}
