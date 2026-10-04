#!/usr/bin/env node
// ROUND-20.4 — TRUCK LINE: REMOVE DRIVERS FROM ROW LABELS. Owner ruling 2026-09-12: Truck Line
// is a UNIT board — units only in the rendered row label.
//
// ROUND 255 Item 7 supersedes the old "search must exclude drivers" half: the universal combo
// filter MUST narrow across unit, driver, customer, status, tour and date together. Driver names
// in the haystack are required. Still forbidden: rendering a driver name into a row label.
//
// Fails when TruckLineBoard.tsx:
//   A) renders a driver name into the unit column or the available-truck row's label
//   B) drops the universal combo filter
//   C) reintroduces the pale #E5E7EB row separator instead of LOCKED_BORDER
//
// --selftest plants mutations against an in-memory copy of the real source and requires FAIL.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BOARD_FILE = "apps/frontend/src/pages/dispatch/TruckLineBoard.tsx";

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

const DRIVER_NAME_RENDER_RE = /\{r\.drivers(\[\d+\]\?\.name|\.map\(\(d\) => d\.name)/;

function auditNoDriverNamesRendered(src) {
  const failures = [];
  const m = DRIVER_NAME_RENDER_RE.exec(src);
  if (m) failures.push(`${BOARD_FILE}: a driver-name expression ("${m[0]}") is still rendered into row label text — Truck Line is a UNIT board`);
  return failures;
}

function auditUniversalFilter(src) {
  const failures = [];
  if (!/truck-line-universal-filter/.test(src)) {
    failures.push(`${BOARD_FILE}: universal combo filter (truck-line-universal-filter) missing — ROUND 255 Item 7`);
  }
  return failures;
}

function auditRowBorderVisible(src) {
  const failures = [];
  const m = /\.truck-line-v4-row\s*\{[^}]*border-bottom:\s*1px solid (\$\{LOCKED_BORDER\}|#[0-9A-Fa-f]{6})/.exec(src);
  if (!m) {
    failures.push(`${BOARD_FILE}: .truck-line-v4-row's border-bottom rule not found at all — fixture/guard out of sync with real source`);
  } else if (m[1].toUpperCase() === "#E5E7EB") {
    failures.push(`${BOARD_FILE}: .truck-line-v4-row border-bottom is back to the pale #E5E7EB — the owner cannot see where one unit's row ends and the next begins`);
  }
  return failures;
}

function leftoverHits(src) {
  const hits = [];
  if (/fontSize:\s*11\b/.test(src)) hits.push(`${BOARD_FILE}: leftover fontSize: 11 — use text-section-header`);
  // BANK-F91525 — Clear-button leftover border only. SVG fill="#CBD5E1" stays locked illustration.
  if (src.includes("border-[#CBD5E1]") || src.includes("border-[#cbd5e1]")) {
    hits.push(`${BOARD_FILE}: leftover border-[#CBD5E1] — use house #E5E7EB`);
  }
  return hits;
}

function auditAll(src) {
  return [...auditNoDriverNamesRendered(src), ...auditUniversalFilter(src), ...auditRowBorderVisible(src), ...leftoverHits(src)];
}

function run() {
  const src = read(BOARD_FILE);
  const failures = auditAll(src);
  if (failures.length > 0) {
    console.error("verify-truck-line-units-only FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify-truck-line-units-only OK — no driver names in row labels; universal filter present; row border not pale #E5E7EB.");
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  const realSrc = read(BOARD_FILE);
  assert.equal(auditAll(realSrc).length, 0, "all three audits should pass on real source");

  const availNeedle = '<div className="truck-line-v4-sub text-[#6B7280]">available truck</div>';
  assert.ok(realSrc.includes(availNeedle), "selftest fixture out of sync with the real available-row label");
  const mutated1 = realSrc.replace(availNeedle, '<div className="truck-line-v4-sub text-[#6B7280]">{r.drivers[0]?.name ?? "Driver"}</div>');
  assert.notEqual(mutated1, realSrc, "mutation 1 did not change the source");
  assert.ok(auditAll(mutated1).length > 0, "MUTATION 1 (driver name reintroduced on available row) escaped detection");

  const mutated2 = realSrc.replace(/data-testid="truck-line-universal-filter"/g, 'data-testid="truck-line-search-REMOVED"');
  assert.notEqual(mutated2, realSrc, "mutation 2 did not change the source");
  assert.ok(auditAll(mutated2).length > 0, "MUTATION 2 (universal filter removed) escaped detection");

  const rowBorderNeedle = "border-bottom: 1px solid ${LOCKED_BORDER};\n          min-height: 40px;";
  assert.ok(realSrc.includes(rowBorderNeedle), "selftest fixture out of sync with the real row border rule");
  const mutated3 = realSrc.replace(rowBorderNeedle, "border-bottom: 1px solid #E5E7EB;\n          min-height: 40px;");
  assert.notEqual(mutated3, realSrc, "mutation 3 did not change the source");
  assert.ok(auditAll(mutated3).length > 0, "MUTATION 3 (row border regressed to #E5E7EB) escaped detection");

  const leftoverPlant = `${realSrc}\n<span style={{ fontSize: 11 }} className="border-[#CBD5E1]">plant</span>`;
  assert.ok(leftoverHits(leftoverPlant).some((e) => e.includes("leftover fontSize: 11")), "leftover fontSize: 11 plant escaped");
  assert.ok(leftoverHits(leftoverPlant).some((e) => e.includes("leftover border-[#CBD5E1]")), "leftover border-[#CBD5E1] plant escaped");

  console.log("verify-truck-line-units-only --selftest PASS (3/3 mutations caught + leftover plant)");
  process.exit(0);
}

run();
