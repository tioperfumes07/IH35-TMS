#!/usr/bin/env node
/**
 * ROUND 18.1 Item D (owner-directed re-measure against TAB-COMPLETION-STANDARD.md, 2026-09-12):
 * Customers.tsx and Vendors.tsx's "List view" toggle ALSO mounted the legacy master-detail rolodex
 * sidebar (CustomerListSidebar / VendorListSidebar — a hand-rolled, non-ParityTable list with its
 * own Name/Balance/Status/Quality columns and its own pagination) right next to the real
 * CustomersListView/VendorsListView ParityTable, live-confirmed on prod: the exact same 1,218 /
 * 604-row roster rendered twice, unsynchronized, eating ~300px of width for a panel that adds
 * nothing once the sortable/filterable/exportable table is present. "List view" and "Master-detail"
 * are alternate full layouts, not additive — the sidebar belongs to Master-detail only.
 *
 * This guard asserts the `viewMode === "list"` JSX branch of each page never mounts the sidebar
 * component, while the master-detail branch (everything after the ternary's `) : (`) still does —
 * so the sidebar isn't simply deleted outright, only kept out of List view specifically.
 *
 * Run: node scripts/verify-customers-vendors-list-view-no-duplicate-sidebar.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-customers-vendors-list-view-no-duplicate-sidebar";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

const TARGETS = [
  { file: "apps/frontend/src/pages/Customers.tsx", sidebar: "CustomerListSidebar" },
  { file: "apps/frontend/src/pages/Vendors.tsx", sidebar: "VendorListSidebar" },
];

/**
 * Pure: splits the source on the `{viewMode === "list" ? (` ... `) : (` ternary and returns the
 * List-view branch text and the Master-detail branch text separately. Returns null branches if the
 * ternary shape can't be found (fails loud rather than silently passing on a rewritten page).
 */
export function splitViewModeBranches(src) {
  const startIdx = src.indexOf('{viewMode === "list" ? (');
  if (startIdx === -1) return { listBranch: null, detailBranch: null };
  const splitMarker = "\n      ) : (\n";
  const splitIdx = src.indexOf(splitMarker, startIdx);
  if (splitIdx === -1) return { listBranch: null, detailBranch: null };
  const listBranch = src.slice(startIdx, splitIdx);
  const detailBranch = src.slice(splitIdx);
  return { listBranch, detailBranch };
}

export function auditNoDuplicateSidebar(src, sidebarComponent) {
  const failures = [];
  const { listBranch, detailBranch } = splitViewModeBranches(src);
  if (listBranch === null || detailBranch === null) {
    failures.push(`could not locate the viewMode === "list" ternary shape at all -- guard needs updating, not silently passing`);
    return failures;
  }
  if (listBranch.includes(sidebarComponent)) {
    failures.push(`the List view branch still mounts <${sidebarComponent}> -- the exact duplicate-roster regression this guard exists to catch`);
  }
  if (!detailBranch.includes(sidebarComponent)) {
    failures.push(`the Master-detail branch no longer mounts <${sidebarComponent}> -- it still needs the sidebar there, this guard only forbids it from List view`);
  }
  return failures;
}

function run() {
  const failures = [];
  for (const { file, sidebar } of TARGETS) {
    const abs = path.join(repoRoot, file);
    if (!fs.existsSync(abs)) {
      failures.push(`${file}: missing`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    for (const f of auditNoDuplicateSidebar(src, sidebar)) failures.push(`${file}: ${f}`);
  }
  if (failures.length) {
    console.error(`${LABEL} FAILED:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK -- List view renders only the ParityTable list on both Customers and Vendors; Master-detail still keeps its sidebar`);
}

function selftest() {
  const assert = { ok: (c, m) => { if (!c) throw new Error(m); } };

  for (const { file, sidebar } of TARGETS) {
    const src = fs.readFileSync(path.join(repoRoot, file), "utf8");
    assert.ok(auditNoDuplicateSidebar(src, sidebar).length === 0, `the real, fixed ${file} must pass: ${JSON.stringify(auditNoDuplicateSidebar(src, sidebar))}`);
  }

  // Plant the exact regression: sidebar reappears in the List view branch.
  const goodSrc = fs.readFileSync(path.join(repoRoot, TARGETS[0].file), "utf8");
  const { listBranch, detailBranch } = splitViewModeBranches(goodSrc);
  const regressed = listBranch.replace("<main", `<${TARGETS[0].sidebar} />\n          <main`) + detailBranch;
  assert.ok(
    auditNoDuplicateSidebar(regressed, TARGETS[0].sidebar).some((f) => f.includes("still mounts")),
    "reintroducing the sidebar into List view must be caught"
  );

  // Plant the opposite mistake: sidebar removed from Master-detail too (over-correction).
  const overCorrected = listBranch + detailBranch.replace(new RegExp(`<${TARGETS[0].sidebar}[\\s\\S]*?/>`), "");
  assert.ok(
    auditNoDuplicateSidebar(overCorrected, TARGETS[0].sidebar).some((f) => f.includes("no longer mounts")),
    "removing the sidebar from Master-detail too must be caught (it should only leave List view)"
  );

  // A source file that doesn't have the expected ternary shape at all must fail loud, not pass vacuously.
  assert.ok(
    auditNoDuplicateSidebar("export function Unrelated() { return null; }", "CustomerListSidebar").length === 1,
    "a source file missing the ternary shape entirely must fail loud, not pass vacuously"
  );

  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
