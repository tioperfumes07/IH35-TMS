#!/usr/bin/env node
// verify:planner-load-templates
// Guard for 0441-mod4-dispatch-load-templates-nav-dead.
//
// The Dispatch subnav "Load Templates" item deep-links to `/dispatch/planner?panel=templates`.
// PlannerCalendarPage (mounted at /dispatch/planner) MUST read that `panel` param and open the
// LoadTemplateLibrary modal, otherwise the nav link is dead (lands on the calendar, no template UI).
// This guard fails if the wiring regresses. Additive only. LINKAGE: dispatch nav -> planner page.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  selftestPlannerGridCanonical,
  verifyPlannerGridCanonical,
} from "./verify-planner-grid-canonical.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const failures = [];
const page = read("apps/frontend/src/pages/dispatch/PlannerCalendarPage.tsx");
if (!page.includes("LoadTemplateLibrary")) {
  failures.push("PlannerCalendarPage no longer imports/renders <LoadTemplateLibrary>.");
}
if (!/["']panel["']/.test(page) || !page.includes("templates")) {
  failures.push("PlannerCalendarPage no longer reads the `panel=templates` search param.");
}
if (!/get\(["']panel["']\)\s*===\s*["']templates["']/.test(page)) {
  failures.push("PlannerCalendarPage no longer gates the templates panel on panel===templates.");
}

const subnav = read("apps/frontend/src/components/dispatch/DispatchSubnav.tsx");
if (!subnav.includes("/dispatch/planner?panel=templates")) {
  failures.push('DispatchSubnav no longer links "/dispatch/planner?panel=templates".');
}

if (process.argv.includes("--selftest")) {
  const ok = /get\(["']panel["']\)\s*===\s*["']templates["']/.test('searchParams.get("panel") === "templates"');
  if (!ok) { console.error("verify:planner-load-templates --selftest FAIL"); process.exit(1); }
  selftestPlannerGridCanonical();
  console.log("verify:planner-load-templates --selftest PASS");
  process.exit(0);
}

if (failures.length > 0) {
  console.error("verify:planner-load-templates FAIL:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
if (!verifyPlannerGridCanonical()) process.exit(1);
console.log("verify:planner-load-templates PASS (Load Templates deep-link wired to PlannerCalendarPage)");
