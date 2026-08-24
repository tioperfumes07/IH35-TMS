#!/usr/bin/env node
/**
 * verify-portal-users-archive-error-surfaced.mjs (CUST-F6339, verify-step 7020)
 *
 * Root cause: `PortalUsersTab.tsx` (real live "Portal users" tab on the customer detail page —
 * shipper logins scoped to a customer's loads) has `archiveMutation` (the Archive button on each
 * portal-user row) with no `onError`, while the sibling `createMutation` in the same file
 * already correctly wires onError to pushToast. A rejected archive silently did nothing.
 *
 * Fix: added `onError` to archiveMutation, reusing pushToast (already imported/used by
 * createMutation) — no new UI, matching the file's own established convention.
 *
 * Usage:
 *   node scripts/verify-portal-users-archive-error-surfaced.mjs            # scan
 *   node scripts/verify-portal-users-archive-error-surfaced.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const TARGET = "apps/frontend/src/pages/customers/components/PortalUsersTab.tsx";

function extractMutationBlock(src, mutationName) {
  const startRe = new RegExp(`const ${mutationName} = useMutation\\(\\{`);
  const m = startRe.exec(src);
  if (!m) return null;
  const closeIdx = src.indexOf("\n  });", m.index);
  if (closeIdx === -1) return null;
  return src.slice(m.index, closeIdx);
}

export function checkPortalUsersArchiveError(src) {
  const offenders = [];
  const block = extractMutationBlock(src, "archiveMutation");
  if (!block || !/onError:/.test(block)) {
    offenders.push(`${TARGET}: archiveMutation has no onError — a rejected archive will silently do nothing.`);
  }
  return offenders;
}

export function run() {
  const src = fs.readFileSync(path.join(repoRoot, TARGET), "utf8");
  const offenders = checkPortalUsersArchiveError(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    const archiveMutation = useMutation({
      mutationFn: (id) => archiveSomething(id),
      onSuccess: async () => { await invalidate(); },
    });
  `;
  const buggyOffenders = checkPortalUsersArchiveError(buggy);

  const src = fs.readFileSync(path.join(repoRoot, TARGET), "utf8");
  const fixedOffenders = checkPortalUsersArchiveError(src);

  if (buggyOffenders.length >= 1 && fixedOffenders.length === 0) {
    console.log("verify-portal-users-archive-error-surfaced selftest OK");
    process.exit(0);
  }
  console.error("verify-portal-users-archive-error-surfaced selftest FAILED", { buggyOffenders, fixedOffenders });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-portal-users-archive-error-surfaced FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-portal-users-archive-error-surfaced OK — PortalUsersTab archiveMutation surfaces failures via pushToast, never a silent no-op",
  );
}
