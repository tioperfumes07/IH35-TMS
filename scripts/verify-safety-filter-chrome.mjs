#!/usr/bin/env node
/**
 * CHROME-01 — Safety filter chrome must stay QBO-collapsed (Dispatch FilterBar pattern).
 * Fails if SafetyDashboardFilter paints always-on "Activity window:" / "Status:" strips again.
 *
 * CHROME-02: SafetyDashboardFilter now DELEGATES to the shared `CollapsedListFilters` gold
 * pattern (components/table/CollapsedListFilters.tsx) instead of re-forking its own
 * filtersOpen/ref/popover chrome. The filtersOpen gate + Filters icon + toggle/panel test ids
 * therefore live in the shared component's own source — verify them there so a future edit to
 * either file still trips this guard.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const file = resolve(ROOT, "apps/frontend/src/components/safety/SafetyDashboardFilter.tsx");
const src = readFileSync(file, "utf8");
const sharedFile = resolve(ROOT, "apps/frontend/src/components/table/CollapsedListFilters.tsx");
const shared = readFileSync(sharedFile, "utf8");

const failures = [];

if (!src.includes('data-safety-filter-toolbar="collapsed"')) {
  failures.push("missing data-safety-filter-toolbar=\"collapsed\" marker");
}
if (!src.includes("CollapsedListFilters")) {
  failures.push("must delegate to the shared CollapsedListFilters gold pattern, not a bespoke popover");
}
if (!/testIdPrefix=["']safety["']/.test(src)) {
  failures.push('missing testIdPrefix="safety" — Filters toggle/panel test ids must stay safety-filters-toggle/panel');
}
// Always-on chrome anti-pattern: permanent Activity window: / Status: labels outside the panel.
if (/Activity window:\s*</.test(src) || /Status:\s*</.test(src)) {
  failures.push("always-on 'Activity window:' / 'Status:' labels detected — collapse behind Filters");
}
// The shared component itself must still gate every consumer behind a real Filters popover.
if (!shared.includes("filtersOpen")) {
  failures.push("CollapsedListFilters: missing filtersOpen gate — controls must live behind Filters popover");
}
if (!shared.includes('data-testid={`${testIdPrefix}-filters-toggle`}')) {
  failures.push("CollapsedListFilters: missing templated filters-toggle test id");
}
if (!shared.includes("SlidersHorizontal")) {
  failures.push("CollapsedListFilters: expected SlidersHorizontal Filters icon (Dispatch FilterBar parity)");
}

if (failures.length) {
  console.error("FAIL verify-safety-filter-chrome:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("PASS verify-safety-filter-chrome — Safety filters collapsed behind Filters toggle");
