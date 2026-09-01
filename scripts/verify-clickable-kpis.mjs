#!/usr/bin/env node
// Guard (CLICKABLE-KPIS): the shared KpiCard must support a `to` drill-down (clickable
// global behavior), and dashboards must actually wire KPIs to filtered/detail views.
import { readFileSync } from "node:fs";

function verify(read = (p) => readFileSync(p, "utf8")) {
  const failures = [];
  const readOrFail = (p) => {
    try { return read(p); } catch { failures.push(`${p}: missing`); return ""; }
  };

  const kpi = readOrFail("apps/frontend/src/components/layout/KpiCard.tsx");
  if (kpi) {
    if (!/to\?:\s*string/.test(kpi)) failures.push("KpiCard.tsx: must accept an optional `to` drill-down route");
    if (!/<Link/.test(kpi)) failures.push("KpiCard.tsx: must render a <Link> when `to` is set");
    // B-A3: honest non-navigable tiles must be expressible (no dead inert cards without disabled).
    if (!/disabled\?:\s*boolean/.test(kpi)) failures.push("KpiCard.tsx: must accept optional `disabled` for honest no-destination KPIs");
    if (!/data-kpi-disabled/.test(kpi)) failures.push("KpiCard.tsx: disabled state must set data-kpi-disabled for a11y/guard cues");
    // LAY-04 — tiles size to content; flex-1 / w-full wrappers force identical full widths.
    if (/\bflex-1\b/.test(kpi)) failures.push("KpiCard.tsx: LAY-04 — must not use flex-1 (identical forced widths)");
    if (!/\bshrink-0\b/.test(kpi)) failures.push("KpiCard.tsx: LAY-04 — must use shrink-0 so width follows content");
    if (!/\binline-flex\b/.test(kpi)) failures.push("KpiCard.tsx: LAY-04 — card shell must be inline-flex so width follows content");
    if (/type="button"[\s\S]{0,160}className="[^"]*\bw-full\b/.test(kpi)) {
      failures.push("KpiCard.tsx: LAY-04 — onClick wrapper must not use w-full (forces equal full-width tiles)");
    }
  }

  const driverProfile = readOrFail("apps/frontend/src/pages/drivers/DriverProfilePage.tsx");
  if (driverProfile) {
    // LAY-05 — Expiry alerts must not dump a prose sentence into the 14px number slot.
    if (/label="Expiry alerts"[\s\S]{0,120}red · .*amber/.test(driverProfile)) {
      failures.push("DriverProfilePage: LAY-05 — Expiry alerts number must be compact (e.g. 0R · 0A), not 'red · amber' prose");
    }
    if (!/label="Expiry alerts"[\s\S]{0,160}redExpiryCount\}R · \$\{summary\.amberExpiryCount\}A/.test(driverProfile)) {
      failures.push("DriverProfilePage: LAY-05 — Expiry alerts must use compact R/A number format");
    }
  }

  const home = readOrFail("apps/frontend/src/pages/home/roles/DefaultHome.tsx");
  if (home) {
    const wired = (home.match(/to="\/[^"]+"/g) ?? []).length;
    if (wired < 4) failures.push(`DefaultHome.tsx: expected dashboard KPIs wired to drill-down routes (found ${wired})`);
  }

  if (failures.length) {
    const err = new Error("verify:clickable-kpis — FAIL");
    err.failures = failures;
    throw err;
  }
  return true;
}

if (process.argv.includes("--selftest")) {
  const base = (p) => readFileSync(p, "utf8");
  verify(base);
  const cases = [
    ["flex-1 on card", "apps/frontend/src/components/layout/KpiCard.tsx", (s) => s.replace("inline-flex min-w-[150px]", "flex min-w-[150px] flex-1")],
    ["w-full onClick wrapper", "apps/frontend/src/components/layout/KpiCard.tsx", (s) => s.replace("inline-block shrink-0 rounded-sm text-left", "block w-full shrink-0 rounded-sm text-left")],
    ["prose expiry alerts", "apps/frontend/src/pages/drivers/DriverProfilePage.tsx", (s) => s.replace(
      "number={`${summary.redExpiryCount}R · ${summary.amberExpiryCount}A`}",
      'number={`${summary.redExpiryCount} red · ${summary.amberExpiryCount} amber`}'
    )],
    ["missing compact expiry format", "apps/frontend/src/pages/drivers/DriverProfilePage.tsx", (s) => s.replace(
      "number={`${summary.redExpiryCount}R · ${summary.amberExpiryCount}A`}",
      "number={String(summary.redExpiryCount + summary.amberExpiryCount)}"
    )],
  ];
  let detected = 0;
  for (const [, file, mutate] of cases) {
    try {
      verify((p) => (p === file ? mutate(base(p)) : base(p)));
    } catch {
      detected += 1;
    }
  }
  if (detected !== cases.length) {
    console.error(`verify:clickable-kpis selftest detected ${detected}/${cases.length} planted defects`);
    process.exit(1);
  }
  console.log(`verify:clickable-kpis selftest PASS (${detected}/${cases.length})`);
} else {
  try {
    verify();
    console.log("verify:clickable-kpis — OK (KpiCard supports `to`; dashboard KPIs drill down)");
  } catch (error) {
    console.error(error.message);
    for (const f of error.failures ?? []) console.error("  - " + f);
    process.exit(1);
  }
}
