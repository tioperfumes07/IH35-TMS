#!/usr/bin/env node
/**
 * CHROME-01 — Safety filter chrome must stay QBO-collapsed (Dispatch FilterBar pattern).
 * Fails if SafetyDashboardFilter paints always-on "Activity window:" / "Status:" strips again.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const file = resolve(ROOT, "apps/frontend/src/components/safety/SafetyDashboardFilter.tsx");
const src = readFileSync(file, "utf8");

const failures = [];

if (!src.includes('data-safety-filter-toolbar="collapsed"')) {
  failures.push("missing data-safety-filter-toolbar=\"collapsed\" marker");
}
if (!src.includes('data-testid="safety-filters-toggle"')) {
  failures.push("missing safety-filters-toggle (Filters button)");
}
if (!src.includes("filtersOpen")) {
  failures.push("missing filtersOpen gate — controls must live behind Filters popover");
}
// Always-on chrome anti-pattern: permanent Activity window: / Status: labels outside the panel.
if (/Activity window:\s*</.test(src) || /Status:\s*</.test(src)) {
  failures.push("always-on 'Activity window:' / 'Status:' labels detected — collapse behind Filters");
}
if (!src.includes("SlidersHorizontal")) {
  failures.push("expected SlidersHorizontal Filters icon (Dispatch FilterBar parity)");
}

if (failures.length) {
  console.error("FAIL verify-safety-filter-chrome:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("PASS verify-safety-filter-chrome — Safety filters collapsed behind Filters toggle");
