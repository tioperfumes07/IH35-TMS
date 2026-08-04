#!/usr/bin/env node
/**
 * VEND-LINK-01 — Bills/allocations EntityLink uses mdata_vendor_id (canonical uuid), not legacy
 * TEXT QBO vendor_id / vendor_uuid.
 *
 * Composes verify-bill-vendor-link-canonical-uuid (ACCT-F84 / ACCT-F603 sibling) and locks the
 * vendors module-completion row.
 *
 *   node scripts/verify-vend-link-01-vendor-uuid-entitylink.mjs
 *   node scripts/verify-vend-link-01-vendor-uuid-entitylink.mjs --selftest
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditSurface, auditBackend } from "./verify-bill-vendor-link-canonical-uuid.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-vend-link-01-vendor-uuid-entitylink";
const MANIFEST = "docs/module-completion/vendors.json";

const SURFACES = [
  "apps/frontend/src/pages/accounting/BillsPage.tsx",
  "apps/frontend/src/pages/accounting/BillDetailPage.tsx",
  "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx",
  "apps/frontend/src/pages/accounting/BillPaymentDetailPage.tsx",
  "apps/frontend/src/pages/accounting/AllocationsPage.tsx",
];

const BACKEND_SOURCES = [
  { file: "apps/backend/src/accounting/bills.service.ts", needs: ["mdata_vendor_id"] },
  { file: "apps/backend/src/accounting/allocations.service.ts", needs: ["mdata_vendor_id"] },
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function collectProblems(overrides = {}) {
  const problems = [];
  const manifestRaw = overrides.manifest ?? read(MANIFEST);

  for (const rel of SURFACES) {
    problems.push(...auditSurface(rel, overrides[rel] ?? read(rel)));
  }
  for (const { file, needs } of BACKEND_SOURCES) {
    problems.push(...auditBackend(file, overrides[file] ?? read(file), needs));
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch {
    problems.push(`${MANIFEST}: invalid JSON`);
    return problems;
  }

  const item = manifest.items?.find((i) => i.id === "VEND-LINK-01");
  if (!item) {
    problems.push(`${MANIFEST}: missing VEND-LINK-01 item`);
  } else if (item.status !== "PASS") {
    problems.push(`${MANIFEST}: VEND-LINK-01 must be PASS (got ${item.status})`);
  }

  if (overrides.checkComplete !== false) {
    if (manifest.complete !== true) {
      problems.push(`${MANIFEST}: complete must be true when VEND-LINK-01 closes the module`);
    }
    if (manifest.pass_count !== manifest.total_count) {
      problems.push(
        `${MANIFEST}: pass_count ${manifest.pass_count} must equal total_count ${manifest.total_count}`
      );
    }
  }

  if (overrides.runSibling !== false) {
    const sibling = spawnSync(
      process.execPath,
      [path.join(ROOT, "scripts/verify-bill-vendor-link-canonical-uuid.mjs")],
      { cwd: ROOT, encoding: "utf8" }
    );
    if (sibling.status !== 0) {
      problems.push(
        `verify-bill-vendor-link-canonical-uuid failed:\n${(sibling.stdout || "") + (sibling.stderr || "")}`.trim()
      );
    }
  }

  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const failures = [];

  const good = collectProblems({ checkComplete: false, runSibling: false });
  if (good.length) {
    failures.push(`tip unclean: ${good.join(" | ")}`);
  }

  const legacyBug = `<EntityLink kind="vendor" id={bill.vendor_id} label={bill.vendor_name} />`;
  if (!auditSurface("x.tsx", legacyBug).some((p) => p.includes("legacy TEXT"))) {
    failures.push("legacy vendor_id EntityLink id not caught");
  }

  const canonical = `<EntityLink kind="vendor" id={bill.mdata_vendor_id} label={bill.vendor_name || bill.vendor_id} />`;
  if (auditSurface("x.tsx", canonical).length !== 0) {
    failures.push("canonical mdata_vendor_id EntityLink wrongly flagged");
  }

  const brokenManifest = JSON.stringify({
    complete: false,
    pass_count: 6,
    total_count: 7,
    items: [{ id: "VEND-LINK-01", status: "OPEN" }],
  });
  const manifestProblems = collectProblems({
    manifest: brokenManifest,
    checkComplete: false,
    runSibling: false,
  });
  if (!manifestProblems.some((p) => /VEND-LINK-01 must be PASS/.test(p))) {
    failures.push("OPEN VEND-LINK-01 manifest row not caught");
  }

  const sibling = spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts/verify-bill-vendor-link-canonical-uuid.mjs"), "--selftest"],
    { cwd: ROOT, encoding: "utf8" }
  );
  if (sibling.status !== 0) {
    failures.push("verify-bill-vendor-link-canonical-uuid sibling selftest failed");
  }

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — legacy id caught, canonical passes, manifest row enforced`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = collectProblems();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — bill/allocation vendor EntityLink uses mdata_vendor_id; VEND-LINK-01 module row PASS`
  );
}
