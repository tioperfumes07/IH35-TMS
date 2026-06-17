#!/usr/bin/env node
// Guard (CLICKABLE-KPIS): the shared KpiCard must support a `to` drill-down (clickable
// global behavior), and dashboards must actually wire KPIs to filtered/detail views.
import { readFileSync } from "node:fs";

const failures = [];
const read = (p) => {
  try { return readFileSync(p, "utf8"); } catch { failures.push(`${p}: missing`); return ""; }
};

const kpi = read("apps/frontend/src/components/layout/KpiCard.tsx");
if (kpi) {
  if (!/to\?:\s*string/.test(kpi)) failures.push("KpiCard.tsx: must accept an optional `to` drill-down route");
  if (!/<Link/.test(kpi)) failures.push("KpiCard.tsx: must render a <Link> when `to` is set");
}

const home = read("apps/frontend/src/pages/home/roles/DefaultHome.tsx");
if (home) {
  const wired = (home.match(/to="\/[^"]+"/g) ?? []).length;
  if (wired < 4) failures.push(`DefaultHome.tsx: expected dashboard KPIs wired to drill-down routes (found ${wired})`);
}

if (failures.length) {
  console.error("verify:clickable-kpis — FAIL");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("verify:clickable-kpis — OK (KpiCard supports `to`; dashboard KPIs drill down)");
