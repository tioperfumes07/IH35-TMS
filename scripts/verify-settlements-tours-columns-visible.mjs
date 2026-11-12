#!/usr/bin/env node
// verify-settlements-tours-columns-visible — ROUND 8.15b re-point.
// Pins Settlements-Open|Closed.dc.html exact columns (not the pre-board layered extras).
// OWNER-REMOVE 2026-11-12: Date started / Margin % / Checks passed|required / Post / per-leg Load #
// moved off the list — Margin % → TourPreSettlementTab + TourLoadRows; Post → TourPreSettlementTab;
// Tour legs EntityLinks cover per-leg loads; Ready replaces separate check-count columns.
import fs from "node:fs";
import path from "node:path";

const FILE = "apps/frontend/src/pages/driver-finance/SettlementsToursRegister.tsx";
const OPEN_KEYS = ["tour", "driver", "unit", "tour_legs", "origin_started", "origin_delivered", "revenue", "costs", "driver_pay", "margin", "miles_practical", "miles_real", "ready", "close_blockers"];
const CLOSED_KEYS = ["tour", "driver", "unit", "tour_legs", "origin_started", "origin_delivered", "closed", "revenue", "costs", "driver_pay", "margin", "net", "company"];
const REMOVED_FROM_LIST = ["started", "margin_pct", "ready_ok", "ready_total", "post"];

export function check(src) {
  const errors = [];
  for (const k of OPEN_KEYS) {
    if (!new RegExp(`\\bkey:\\s*"${k}"`).test(src)) errors.push(`open board column "${k}" not found`);
  }
  for (const k of CLOSED_KEYS) {
    if (!new RegExp(`\\bkey:\\s*"${k}"`).test(src)) errors.push(`closed board column "${k}" not found`);
  }
  for (const k of REMOVED_FROM_LIST) {
    if (new RegExp(`\\bkey:\\s*"${k}"`).test(src)) errors.push(`layered column "${k}" must stay off Settlements-Open|Closed list (home: detail / TourPreSettlementTab / TourLoadRows)`);
  }
  if (/\.\.\.tourLoadColumns\(/.test(src)) errors.push("tourLoadColumns spread must not layer per-leg Load # columns on Open/Closed boards");
  return errors;
}

if (process.argv.includes("--selftest")) {
  const good = `const c = [
  { key: "tour", label: "Settlement" },
  { key: "driver", label: "Driver" },
  { key: "unit", label: "Unit" },
  { key: "tour_legs", label: "Tour legs" },
  { key: "origin_started", label: "PU date" },
  { key: "origin_delivered", label: "DEL date" },
  { key: "closed", label: "Ended" },
  { key: "revenue", label: "Revenue" },
  { key: "costs", label: "Costs" },
  { key: "driver_pay", label: "Driver pay" },
  { key: "margin", label: "Margin" },
  { key: "miles_practical", label: "Practical mi" },
  { key: "miles_real", label: "Real mi" },
  { key: "ready", label: "Ready" },
  { key: "close_blockers", label: "Waiting on" },
  { key: "net", label: "Driver net" },
  { key: "company", label: "Company settlement" },
];`;
  const badPost = `${good}\n{ key: "post", label: "Post" }`;
  const badLegs = `${good}\n...tourLoadColumns("setl-tour-col", rows),`;
  const ok = check(good).length === 0 && check(badPost).length === 1 && check(badLegs).length === 1;
  if (!ok) { console.error("verify-settlements-tours-columns-visible --selftest FAIL"); process.exit(1); }
  console.log("verify-settlements-tours-columns-visible --selftest PASS — board columns required; layered post/tourLoadColumns FAIL");
  process.exit(0);
}

const src = fs.readFileSync(path.join(process.cwd(), FILE), "utf8");
const errors = check(src);
if (errors.length) {
  console.error(`verify-settlements-tours-columns-visible: FAIL — ${FILE}\n  - ${errors.join("\n  - ")}\n  ROUND 8.15b: Settlements-Open|Closed.dc.html exact columns.`);
  process.exit(1);
}
console.log(`verify-settlements-tours-columns-visible: PASS — Open ${OPEN_KEYS.length} + Closed ${CLOSED_KEYS.length} board columns; layered extras absent`);
