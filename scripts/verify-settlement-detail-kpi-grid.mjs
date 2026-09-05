#!/usr/bin/env node
// L5 GUARD — driver settlement detail KPI grid transcribes the owner-approved reference exactly.
// Reference: docs/design/reference/DRIVER-SETTLEMENT-DETAIL-REFERENCE-2026-09-05.html (.kpis / .kpi).
// Owner defect (inv #11): "boxes out of proportion" on the settlement detail. The reference is a 6-column
// grid of 93px tiles on #F4F7FA / #C7D2DC. This guard locks that transcription so it cannot silently drift:
//   1. the component renders a 6-column grid (repeat(6,1fr)) with the settlement-kpi-grid testid
//   2. tiles are 93px tall on the reference surface (#F4F7FA) + rule (#C7D2DC)
//   3. all six reference labels are present (Loaded pay/Empty miles pay/Additional pay/Reimbursements/Deductions/Net pay)
//   4. the detail page mounts the grid with the S.1-sourced totals (loadedPayCents/emptyPayCents/netPayCents)
// It asserts NO posting/GL path — this is a read-only summary of already-computed settlement totals.
import { readFileSync } from "node:fs";

const GRID = "apps/frontend/src/pages/driver-finance/components/SettlementKpiGrid.tsx";
const PAGE = "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx";
const fail = (m) => { console.error(`FAIL verify-settlement-detail-kpi-grid: ${m}`); process.exit(1); };

const LABELS = ["Loaded pay", "Empty miles pay", "Additional pay", "Reimbursements", "Deductions", "Net pay"];

function verify(grid, page) {
  const f = [];
  // 1 — six-column grid + testid
  if (!/gridTemplateColumns:\s*"repeat\(6,\s*1fr\)"/.test(grid)) f.push("grid-6col");
  if (!/data-testid="settlement-kpi-grid"/.test(grid)) f.push("grid-testid");
  // 2 — 93px tiles on the reference surface + rule
  if (!/height:\s*93\b/.test(grid)) f.push("tile-93");
  if (!/background:\s*"#F4F7FA"/.test(grid)) f.push("tile-bg");
  if (!/border:\s*"1px solid #C7D2DC"/.test(grid)) f.push("tile-border");
  // 3 — all six labels
  for (const l of LABELS) {
    if (!grid.includes(`label="${l}"`)) f.push(`label:${l}`);
  }
  // 4 — page mounts the grid with the S.1-sourced totals
  if (!/<SettlementKpiGrid/.test(page)) f.push("page-mounts-grid");
  if (!/loadedPayCents=\{summary\.earningsTotal\}/.test(page)) f.push("page-loaded");
  if (!/emptyPayCents=\{summary\.deadheadTotal\}/.test(page)) f.push("page-empty");
  if (!/netPayCents=\{kpi\.netPayCents\}/.test(page)) f.push("page-net");
  return f;
}

if (process.argv.includes("--selftest")) {
  const grid = readFileSync(GRID, "utf8");
  const page = readFileSync(PAGE, "utf8");
  const baseline = verify(grid, page);
  if (baseline.length) fail(`baseline not green — real checks failing: ${baseline.join(", ")}`);
  const mutations = [
    [grid.replace('repeat(6, 1fr)', 'repeat(3, 1fr)'), page],
    [grid.replace('data-testid="settlement-kpi-grid"', 'data-testid="oops"'), page],
    [grid.replace('height: 93', 'height: 60'), page],
    [grid.replace('background: "#F4F7FA"', 'background: "#FFFFFF"'), page],
    [grid.replace('border: "1px solid #C7D2DC"', 'border: "1px solid #000000"'), page],
    [grid.replace('label="Net pay"', 'label="Net"'), page],
    [grid, page.replace('<SettlementKpiGrid', '<Nope')],
    [grid, page.replace('netPayCents={kpi.netPayCents}', 'netPayCents={0}')],
  ];
  for (const [g, p] of mutations) {
    if (g === grid && p === page) fail("a selftest mutation did not change the source — the check is stale");
    if (verify(g, p).length === 0) fail("a mutation still passed — a check is too weak");
  }
  console.log(`OK verify-settlement-detail-kpi-grid --selftest: baseline green, ${mutations.length} mutations all caught.`);
  process.exit(0);
}

const failures = verify(readFileSync(GRID, "utf8"), readFileSync(PAGE, "utf8"));
if (failures.length) fail(`KPI grid drifted from the reference: ${failures.join(", ")}`);
console.log("OK verify-settlement-detail-kpi-grid: 6×93px KPI grid transcribes the reference; mounted with S.1 totals.");
