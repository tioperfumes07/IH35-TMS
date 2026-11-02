#!/usr/bin/env node
/**
 * Codex Round 7.6 — ReportFilterBar preset must write from_date + to_date (+ preset) in ONE
 * setSearchParams call; RouteContentBoundary Suspense keys pathname only (search must not remount).
 * ProfitLoss URL-seed lives under Cascade pages/reports — this guard covers the shared remount fix.
 */
import fs from "node:fs";

const LABEL = "verify-report-preset-atomic-url";
const BAR = "apps/frontend/src/components/reports/ReportFilterBar.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

const bar = fs.readFileSync(BAR, "utf8");
const manifest = fs.readFileSync(MANIFEST, "utf8");
const fails = [];

if (!/syncUrlMany/.test(bar)) {
  fails.push(`${BAR}: must batch preset URL writes via syncUrlMany`);
}
if (!/handlePreset[\s\S]*syncUrlMany\(\[[\s\S]*from_date[\s\S]*to_date/.test(bar)) {
  fails.push(`${BAR}: handlePreset must sync from_date and to_date together`);
}
{
  const presetFn = bar.match(/const handlePreset = useCallback\([\s\S]*?\],\s*\[[^\]]*\]\s*\);/)?.[0] ?? "";
  const syncUrlCalls = (presetFn.match(/syncUrl\(/g) ?? []).length;
  if (syncUrlCalls > 0) {
    fails.push(`${BAR}: handlePreset must not call syncUrl (use syncUrlMany only)`);
  }
}

if (!/key=\{location\.pathname\}/.test(manifest)) {
  fails.push(`${MANIFEST}: RouteContentBoundary must key Suspense on pathname only`);
}
if (/key=\{`\$\{location\.pathname\}\$\{location\.search\}`\}/.test(manifest)) {
  fails.push(`${MANIFEST}: must not remount Suspense on search changes`);
}

if (process.argv.includes("--selftest")) {
  if (fails.length) {
    console.error(`${LABEL} --selftest FAIL live red:\n  ${fails.join("\n  ")}`);
    process.exit(1);
  }
  const plantBar = bar
    .replace(/syncUrlMany/g, "syncUrlGone")
    .replace(
      /const handlePreset = useCallback\([\s\S]*?\],\s*\[[^\]]*\]\s*\);/,
      `const handlePreset = useCallback(
    (preset: ReportPreset) => {
      const { from, to } = computePresetRange(preset);
      onFromDateChange(from);
      onToDateChange(to);
      onPresetSelect(preset);
      syncUrl("from_date", from);
      syncUrl("to_date", to);
    },
    [onFromDateChange, onToDateChange, onPresetSelect, syncUrl],
  );`,
    );
  const plantManifest = manifest.replace(
    "key={location.pathname}",
    "key={`${location.pathname}${location.search}`}",
  );
  const planted = [];
  if (!/syncUrlMany/.test(plantBar)) planted.push("no syncUrlMany");
  if (/location\.search/.test(plantManifest) && /key=\{`\$\{location\.pathname\}/.test(plantManifest)) {
    planted.push("search key");
  }
  if (planted.length < 2) {
    console.error(`${LABEL} --selftest FAIL plant weak`, planted);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — report preset URL atomic + pathname Suspense key`);
