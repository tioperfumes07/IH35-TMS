#!/usr/bin/env node
/**
 * verify-banking-no-orphan-pages.mjs  (0441-mod8-pages-banking-dead-code)
 *
 * Proves banking dead-code hygiene after the orphan sweep:
 *   1. REMOVED_ORPHANS — verified-dead files (0 live importers, 0 manifest route) must NOT reappear.
 *   2. ARCHIVED_WORKFLOW_B — superseded Workflow-B chain must stay present + @archived + unmounted.
 *
 * Companion guards: verify-banking-workflow-b-archived.mjs (marker), verify-dead-forms-unmounted.mjs (live import).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const MANIFEST = path.join(repoRoot, "apps/frontend/src/routes/manifest.tsx");
const SCAN_ROOT = path.join(repoRoot, "apps/frontend/src");

/** Deleted 2026-07 — zero live importers, not sidebar/module surfaces. Re-add only when wired. */
export const REMOVED_BANKING_ORPHANS = [
  "apps/frontend/src/pages/banking/BankingTransactionsTable.tsx",
  "apps/frontend/src/pages/banking/components/BankingKpiRow.tsx",
  "apps/frontend/src/pages/banking/components/BankingReviewCenter.tsx",
  "apps/frontend/src/pages/banking/components/RegisterTable.tsx",
  "apps/frontend/src/pages/banking/components/RegisterRow.tsx",
  "apps/frontend/src/pages/banking/BankTxCategorizationPage.test.tsx",
];

/** @archived Workflow-B — audit history; must NOT be mounted as routes. */
export const ARCHIVED_BANKING_WORKFLOW_B = [
  "apps/frontend/src/pages/banking/BankTxCategorizationPage.tsx",
  "apps/frontend/src/pages/banking/components/CategorizeDrawer.tsx",
  "apps/frontend/src/pages/banking/components/forms/ApplyToBillForm.tsx",
  "apps/frontend/src/pages/banking/components/forms/BillPaymentForm.tsx",
  "apps/frontend/src/pages/banking/components/forms/CreateExpenseForm.tsx",
  "apps/frontend/src/pages/banking/components/forms/DriverSettlementForm.tsx",
  "apps/frontend/src/pages/banking/components/forms/FactoringAdvanceForm.tsx",
  "apps/frontend/src/pages/banking/components/forms/ManualJEForm.tsx",
  "apps/frontend/src/pages/banking/components/forms/SplitTransactionModal.tsx",
  "apps/frontend/src/pages/banking/components/forms/TransferForm.tsx",
];

const ARCHIVE_MARKER = "@archived — Workflow-B";

function basenameNoExt(rel) {
  return path.basename(rel, path.extname(rel));
}

function listSrc(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      listSrc(full, out);
    } else if (/\.[tj]sx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function manifestMountsBasename(manifestSrc, base) {
  const lazyRe = new RegExp(
    `React\\.lazy\\(\\(\\)\\s*=>\\s*import\\([^)]*${base}[^)]*\\)[^)]*\\)`,
  );
  const elementRe = new RegExp(`<${base}\\b`);
  return lazyRe.test(manifestSrc) || elementRe.test(manifestSrc);
}

export function run() {
  const failures = [];
  const manifestSrc = fs.readFileSync(MANIFEST, "utf8");

  for (const rel of REMOVED_BANKING_ORPHANS) {
    if (fs.existsSync(path.join(repoRoot, rel))) {
      failures.push(`${rel} — must stay deleted (verified orphan; wire before restoring)`);
    }
  }

  for (const rel of ARCHIVED_BANKING_WORKFLOW_B) {
    const full = path.join(repoRoot, rel);
    if (!fs.existsSync(full)) {
      failures.push(`${rel} — MISSING (@archived Workflow-B; archive-not-delete)`);
      continue;
    }
    const source = fs.readFileSync(full, "utf8");
    if (!source.includes(ARCHIVE_MARKER)) {
      failures.push(`${rel} — missing "${ARCHIVE_MARKER}" annotation`);
    }
    const base = basenameNoExt(rel);
    if (manifestMountsBasename(manifestSrc, base)) {
      failures.push(`${rel} — mounted in manifest (Workflow-B must stay unmounted)`);
    }
  }

  // Live surface must not import removed orphan basenames (except tests + archived cluster).
  const deadBases = new Set(REMOVED_BANKING_ORPHANS.map(basenameNoExt));
  const archivedRelSet = new Set(ARCHIVED_BANKING_WORKFLOW_B);
  for (const full of listSrc(SCAN_ROOT)) {
    const rel = path.relative(repoRoot, full);
    if (/\.test\.[tj]sx?$/.test(rel) || /(^|\/)__tests__\//.test(rel)) continue;
    if (archivedRelSet.has(rel)) continue;
    const src = fs.readFileSync(full, "utf8");
    for (const base of deadBases) {
      const importRe = new RegExp(`from\\s*["'][^"']*${base}["']|import\\(["'][^"']*${base}["']\\)`);
      if (importRe.test(src)) {
        failures.push(`${rel} — imports removed orphan "${base}"`);
      }
    }
  }

  return { ok: failures.length === 0, failures };
}

function selftest() {
  const rel = REMOVED_BANKING_ORPHANS[0];
  const full = path.join(repoRoot, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, "// selftest stub\n");
  try {
    const { ok, failures } = run();
    if (ok || !failures.some((f) => f.includes(rel))) {
      console.error("[verify-banking-no-orphan-pages] SELFTEST FAIL — did not detect restored orphan");
      process.exit(1);
    }
    console.log("[verify-banking-no-orphan-pages] SELFTEST PASS");
  } finally {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else {
    const { ok, failures } = run();
    if (!ok) {
      console.error("[verify-banking-no-orphan-pages] FAIL:");
      for (const f of failures) console.error(`  - ${f}`);
      process.exit(1);
    }
    console.log(
      `[verify-banking-no-orphan-pages] OK — ${REMOVED_BANKING_ORPHANS.length} removed orphans absent; ${ARCHIVED_BANKING_WORKFLOW_B.length} Workflow-B files archived + unmounted`,
    );
  }
}
