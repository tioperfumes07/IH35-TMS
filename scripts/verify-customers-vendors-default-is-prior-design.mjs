#!/usr/bin/env node
/**
 * CLOSURE-31 recurrence guard.
 *
 * Jorge's /customers and /vendors pages were silently changed in AUDIT-FIX-3
 * (#531): the new tabular "list" view became the DEFAULT, replacing the prior
 * "master-detail" design he was using. That was an unrequested wholesale change.
 *
 * This guard fails the build if anyone flips the DEFAULT view back to "list"
 * (or to anything other than the prior "master-detail" design) without explicit
 * Jorge sign-off. The "list" view itself remains available as an opt-in toggle;
 * this guard only protects the DEFAULT.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const PRIOR_DESIGN = "master-detail";
const NEW_VIEW = "list";

const failures = [];

function read(rel) {
  const full = path.join(repoRoot, rel);
  if (!fs.existsSync(full)) {
    failures.push(`${rel} (missing)`);
    return null;
  }
  return fs.readFileSync(full, "utf8");
}

// 1) The shared hook must fall back to the prior design, never to the new view.
const hookRel = "apps/frontend/src/hooks/useViewModePref.ts";
const hook = read(hookRel);
if (hook) {
  if (/\?\?\s*["']list["']/.test(hook)) {
    failures.push(`${hookRel}: default fallback is hardcoded to "${NEW_VIEW}" (must be "${PRIOR_DESIGN}")`);
  }
  if (!new RegExp(`DEFAULT_VIEW_MODE[^\\n]*["']${PRIOR_DESIGN}["']`).test(hook)) {
    failures.push(`${hookRel}: DEFAULT_VIEW_MODE must be "${PRIOR_DESIGN}"`);
  }
  if (!/\?\?\s*defaultMode/.test(hook)) {
    failures.push(`${hookRel}: initial state must fall back to the defaultMode parameter`);
  }
}

// 2) Each page must explicitly request the prior design as its default.
const pages = [
  { rel: "apps/frontend/src/pages/Customers.tsx", entity: "customers" },
  { rel: "apps/frontend/src/pages/Vendors.tsx", entity: "vendors" },
];
for (const { rel, entity } of pages) {
  const src = read(rel);
  if (!src) continue;
  const callRe = new RegExp(`useViewModePref\\(\\s*["']${entity}["']\\s*,\\s*["']([^"']+)["']\\s*\\)`);
  const m = src.match(callRe);
  if (!m) {
    failures.push(`${rel}: useViewModePref("${entity}", ...) must pass an explicit default of "${PRIOR_DESIGN}"`);
  } else if (m[1] !== PRIOR_DESIGN) {
    failures.push(`${rel}: default view is "${m[1]}" (must be "${PRIOR_DESIGN}")`);
  }
  // The opt-in toggle must still exist (additive-only: do not delete the list view).
  if (!src.includes(`data-view-mode-toggle="${entity}"`)) {
    failures.push(`${rel}: opt-in view-mode toggle is missing (list view must remain available)`);
  }
}

if (failures.length > 0) {
  console.error("[verify-customers-vendors-default-is-prior-design] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  console.error(
    `\nThe DEFAULT /customers and /vendors view must remain the prior "${PRIOR_DESIGN}" design (CLOSURE-31).`
  );
  process.exit(1);
}

console.log(
  `[verify-customers-vendors-default-is-prior-design] OK (default = "${PRIOR_DESIGN}", list view still opt-in)`
);
