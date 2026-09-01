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
  // B-A3: honest non-navigable tiles must be expressible (no dead inert cards without disabled).
  if (!/disabled\?:\s*boolean/.test(kpi)) failures.push("KpiCard.tsx: must accept optional `disabled` for honest no-destination KPIs");
  if (!/data-kpi-disabled/.test(kpi)) failures.push("KpiCard.tsx: disabled state must set data-kpi-disabled for a11y/guard cues");
  // LAY-04 — tiles size to content; flex-1 forces identical widths and overflows long labels.
  if (/\bflex-1\b/.test(kpi)) failures.push("KpiCard.tsx: LAY-04 — must not use flex-1 (identical forced widths)");
  if (!/\bshrink-0\b/.test(kpi)) failures.push("KpiCard.tsx: LAY-04 — must use shrink-0 so width follows content");
}

const driverProfile = read("apps/frontend/src/pages/drivers/DriverProfilePage.tsx");
if (driverProfile) {
  // LAY-05 — Expiry alerts must not dump a prose sentence into the 14px number slot.
  if (/label="Expiry alerts"[\s\S]{0,120}red · .*amber/.test(driverProfile)) {
    failures.push("DriverProfilePage: LAY-05 — Expiry alerts number must be compact (e.g. 0R · 0A), not 'red · amber' prose");
  }
  if (!/label="Expiry alerts"[\s\S]{0,160}redExpiryCount\}R · \$\{summary\.amberExpiryCount\}A/.test(driverProfile)) {
    failures.push("DriverProfilePage: LAY-05 — Expiry alerts must use compact R/A number format");
  }
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
