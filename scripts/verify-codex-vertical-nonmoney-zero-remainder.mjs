#!/usr/bin/env node
/**
 * CODEX-VERTICAL-NONMONEY-ZERO-REMAINDER-RATCHET
 *
 * Class/census guard only — intentionally carries no Box-3 Built tag. It derives every non-money,
 * non-Chrome, non-scenario column from the module maps (canonical identities plus work_order,
 * claim, accident, policy, settlement, legal_matter, and future relationship columns) and proves
 * every cell outside explicitly itemized protected lanes has leaf-specific evidence. A new
 * Required leaf or removed exact guard therefore becomes red instead of silently reopening the queue.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MATRIX_DIR = path.join(ROOT, "docs/specs/scoreboard/modules");
const WORKORDERS = path.join(ROOT, "docs/audit/GUARD-WORKORDERS.md");
const SELFTEST = process.argv.includes("--selftest");
const EXCLUDED_COLUMNS = new Set(["ap_bill", "expense", "gl_je", "inventory", "invoice", "bank", "liability", "picker_law", "qbo_chrome"]);
const TAG_RE = /@matrix-built\s+(\{[^\n]*\})/g;
const SHORTHAND_RE = /@matrix-built\s+modules=([^\s]+)(?:\s+cols=([^\s]+))?(?:\s+leafRe=([^\s]+))?/g;
const CSV_RE = /@matrix-built\s+(?!modules=|\{)([a-z][a-z0-9_-]*(?:,[a-z][a-z0-9_-]*)+)(?=\s|\*|\/|$)/gi;

function isLeafSpecific(leafRe) {
  const value = String(leafRe ?? "").trim();
  return Boolean(value) &&
    !/^\^?\.[*+]\$?$/.test(value) &&
    !/\|\.\*|\.\*\|/.test(value) &&
    !/\.\*\([^)]*(?:create|modal|drawer|wizard|picker)[^)]*\)/i.test(value) &&
    !(/^\.\*.*\.\*$/.test(value) && !/^\^\(/.test(value));
}

/** Exact JSON `leaves` arrays and narrow `leafRe` expressions are the two canonical tag shapes. */
export function entryCoversLeaf(entry, leafId) {
  if (Array.isArray(entry?.leaves)) {
    return entry.leaves.length > 0 &&
      entry.leaves.every((leaf) => typeof leaf === "string" && leaf.length > 0) &&
      entry.leaves.includes(leafId);
  }
  return isLeafSpecific(entry?.leafRe) && new RegExp(entry.leafRe).test(leafId);
}

function loadEntries() {
  const entries = [];
  const feed = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/specs/scoreboard/wire-sprint-built.json"), "utf8"));
  for (const entry of feed.entries ?? []) {
    entries.push({ ...entry, file: entry.guard });
  }
  for (const name of fs.readdirSync(path.join(ROOT, "scripts")).filter((name) => name.startsWith("verify-") && name.endsWith(".mjs"))) {
    const file = `scripts/${name}`;
    const header = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const match of header.matchAll(TAG_RE)) {
      try {
        const entry = JSON.parse(match[1]);
        entries.push({ ...entry, file });
      } catch {
        // Malformed tags are owned by verify-matrix-built-tag-present; never count them as evidence here.
      }
    }
    for (const match of header.matchAll(SHORTHAND_RE)) {
      entries.push({
        modules: match[1].split(",").filter(Boolean),
        cols: String(match[2] ?? "connectivity,reverse_link").split(",").filter(Boolean),
        leafRe: String(match[3] ?? ".*"),
        file,
      });
    }
    for (const match of header.matchAll(CSV_RE)) {
      entries.push({
        modules: match[1].split(",").filter(Boolean),
        cols: ["connectivity", "reverse_link"],
        leafRe: ".*",
        file,
      });
    }
  }
  return entries;
}

// These are exact, shrinking lane boundaries—not exemptions and never Built credit. CC-1 owns the
// accounting/banking money surfaces; Cursor owns toolbar chrome. Removing a completed key is safe.
const PROTECTED = new Set([
  // Accounting create/parity connectivity closed ACCT-F5209 (invoice/expense/vendor_bill/
  // payment_methods matrix-built on wave-c + payment-methods guards). Escrow reverse closed
  // ACCT-F5313 (verify-accounting-escrow-holder-reverse-link) — CODEX-ZERO-REMAINDER-PROTECTED-MONEY-20
  // is now fully drained.
  // CLASS-F5973 parser correction exposed these exact, genuine owner-lane gaps. They remain visible
  // here (and stale protections fail) while their owning atomic PRs drain them; they grant no Built.
  // CLASS-F5973-TRUE-REMAINDER-FUEL drained 2026-08-23 (CC-2): all 5 fuel keys live-confirmed wired
  // on prod and covered by verify-fuel-class-f5973-remainder-wired.mjs — removed from PROTECTED.
  "connectivity\tmaintenance:maintenance.modal.fault_rule",
  "connectivity\tmaintenance:maintenance.modal.triage",
  "connectivity\tmaintenance:maintenance.panel.road_service_active",
  "connectivity\tmaintenance:maintenance.panel.wotime_tracking",
  // CLASS-F5973-TRUE-REMAINDER-ACCOUNTING-UNIT-FINANCE — retired. accounting:unit.detail.
  // finance_linkage:reverse_link is now exact-owned: verify-unit-finance-gl-je-reverse.mjs checks
  // BOTH fleet.required.json's and accounting.required.json's copies of this cross-module leaf
  // (same real implementation, same GET endpoint — never a second, duplicate build).
]);

const CLOSED_CLAIM_IDS = [
  "tasks:tasks.drawer.task",
  "compliance:tab.hos_tracker",
  "inventory:assignments.wo_link",
  "safety:training_records.list",
  "LINK-F5153/55/56/57/58/59-CONNECTIVITY-GUARD-MATRIX-DRIFT",
  "lists:lists.modal.oem_parts_create",
  "drivers:teams.create",
  "maintenance:master.vehicles.create",
  "VERTICAL-LOAD-ALL-MODULES-REMAINDER",
  "VERTICAL-CONNECTIVITY-NONMONEY-CREATE-REMAINDER",
  "VERTICAL-CONNECTIVITY-USER-VENDOR-REMAINDER",
  "REVERSE-GUARD-RED-SWEEP-150",
  "WAVE-A-GUARD-RED-SWEEP-143",
  "OPERATIONAL-MODULE-DOOR-BUILT-INFLATION",
  "PICKER-EXACT-GUARD-RED-SWEEP-368",
  "CODEX-VERTICAL-NONMONEY-ZERO-REMAINDER-RATCHET",
  "CODEX-VERTICAL-ALL-NONMONEY-ZERO-REMAINDER",
];

export function collectStaleClaimProblems(board = fs.readFileSync(WORKORDERS, "utf8")) {
  const claimingRows = board.split("\n").filter((line) => line.startsWith("| **CLAIMING:**"));
  const fixedIds = new Set(board.split("\n")
    .filter((line) => /^\| \*\*FIXED/.test(line))
    .map((line) => line.match(/`([^`]+)`/)?.[1])
    .filter(Boolean));
  const closedIds = new Set([...CLOSED_CLAIM_IDS, ...fixedIds]);
  return [...closedIds]
    .filter((id) => claimingRows.some((line) => line.includes(`\`${id}\``)))
    .map((id) => `merged Codex work remains CLAIMING: ${id}`);
}

function loadSpecs() {
  return fs.readdirSync(MATRIX_DIR)
    .filter((name) => name.endsWith(".required.json"))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(MATRIX_DIR, name), "utf8")));
}

function hasBuilt(entries, moduleId, leafId, column) {
  return entries.some((entry) =>
    entryCoversLeaf(entry, leafId) &&
    entry.modules.includes(moduleId) &&
    entry.cols.includes(column) &&
    fs.existsSync(path.join(ROOT, entry.file)),
  );
}

export function collectGaps(specs = loadSpecs(), entries = loadEntries()) {
  const governedColumns = new Set(specs.flatMap((spec) => spec.columns ?? [])
    .map((column) => column.id)
    .filter((column) => !EXCLUDED_COLUMNS.has(column) && !column.startsWith("scenario.")));
  const gaps = [];
  for (const spec of specs) {
    const moduleId = spec.module;
    for (const leaf of spec.leaves ?? []) {
      for (const column of leaf.required ?? []) {
        if (!governedColumns.has(column) || hasBuilt(entries, moduleId, leaf.id, column)) continue;
        gaps.push(`${column}\t${moduleId}:${leaf.id}`);
      }
    }
  }
  return gaps.sort();
}

export function collectProblems(specs = loadSpecs(), entries = loadEntries()) {
  return collectGaps(specs, entries).filter((gap) => !PROTECTED.has(gap));
}

export function collectStaleProtectedProblems(gaps = collectGaps(), protectedKeys = PROTECTED) {
  const liveGaps = new Set(gaps);
  return [...protectedKeys]
    .filter((key) => !liveGaps.has(key))
    .sort()
    .map((key) => `stale protected owner-lane key: ${key}`);
}

if (SELFTEST) {
  const specs = loadSpecs();
  const entries = loadEntries();
  const planted = structuredClone(specs);
  planted.find((spec) => spec.module === "safety").leaves.push({
    id: "selftest.unowned_connectivity_gap",
    tab: "Selftest",
    required: ["work_order"],
  });
  const problems = collectProblems(planted, entries);
  if (!problems.includes("work_order\tsafety:selftest.unowned_connectivity_gap")) {
    console.error("verify-codex-vertical-nonmoney-zero-remainder SELFTEST FAIL — planted unowned gap escaped");
    process.exit(1);
  }
  const stripped = entries.filter((entry) => !(
    entry.modules.includes("safety") &&
    entry.cols.includes("vendor") &&
    entryCoversLeaf(entry, "accidents.create")
  ));
  const removedEvidenceProblems = collectProblems(specs, stripped);
  if (!removedEvidenceProblems.includes("vendor\tsafety:accidents.create")) {
    console.error("verify-codex-vertical-nonmoney-zero-remainder SELFTEST FAIL — removed exact evidence escaped");
    process.exit(1);
  }
  const board = fs.readFileSync(WORKORDERS, "utf8");
  const regressedBoard = board.replace("| **FIXED (#6912):** `WAVE-A-GUARD-RED-SWEEP-143`", "| **CLAIMING:** `WAVE-A-GUARD-RED-SWEEP-143`");
  if (!collectStaleClaimProblems(regressedBoard).some((problem) => problem.includes("WAVE-A-GUARD-RED-SWEEP-143"))) {
    console.error("verify-codex-vertical-nonmoney-zero-remainder SELFTEST FAIL — reopened merged claim escaped");
    process.exit(1);
  }
  const duplicateClaimBoard = `${board}\n| **CLAIMING:** \`SELFTEST-DUPLICATE-CLAIM\` | x | B | Codex | x | none | CLAIMING |\n| **FIXED:** \`SELFTEST-DUPLICATE-CLAIM\` | x | B | Codex | x | #1 | FIXED |`;
  if (!collectStaleClaimProblems(duplicateClaimBoard).some((problem) => problem.includes("SELFTEST-DUPLICATE-CLAIM"))) {
    console.error("verify-codex-vertical-nonmoney-zero-remainder SELFTEST FAIL — duplicate fixed/claim row escaped");
    process.exit(1);
  }
  const staleProtection = collectStaleProtectedProblems(["connectivity\tsafety:still_open"], new Set([
    "connectivity\tsafety:still_open",
    "connectivity\tbanking:selftest_completed_leaf",
  ]));
  if (staleProtection.length !== 1 || !staleProtection[0].includes("selftest_completed_leaf")) {
    console.error("verify-codex-vertical-nonmoney-zero-remainder SELFTEST FAIL — stale protected key escaped");
    process.exit(1);
  }
  const jsonLeavesEntry = {
    modules: ["customers"],
    cols: ["reverse_link"],
    leaves: ["list.view_list"],
  };
  if (!entryCoversLeaf(jsonLeavesEntry, "list.view_list") || entryCoversLeaf(jsonLeavesEntry, "list.view_master_detail")) {
    console.error("verify-codex-vertical-nonmoney-zero-remainder SELFTEST FAIL — exact JSON leaves parser drifted");
    process.exit(1);
  }
  const shorthandEntry = { leafRe: "^list\\.view_(list|master_detail)$" };
  if (!entryCoversLeaf(shorthandEntry, "list.view_master_detail") || entryCoversLeaf(shorthandEntry, "home.roster")) {
    console.error("verify-codex-vertical-nonmoney-zero-remainder SELFTEST FAIL — shorthand leafRe parser drifted");
    process.exit(1);
  }
  console.log("verify-codex-vertical-nonmoney-zero-remainder SELFTEST PASS — new leaf, removed evidence, reopened claim, stale protection, JSON leaves, and leafRe caught");
  process.exit(0);
}

const gaps = collectGaps();
const problems = [
  ...gaps.filter((gap) => !PROTECTED.has(gap)),
  ...collectStaleProtectedProblems(gaps),
  ...collectStaleClaimProblems(),
];
if (problems.length) {
  console.error("verify-codex-vertical-nonmoney-zero-remainder FAIL — unowned canonical-column gaps:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`verify-codex-vertical-nonmoney-zero-remainder PASS — all non-money/non-Chrome columns across every module map have Codex remainder=0; protected gaps visible=${gaps.length}`);
