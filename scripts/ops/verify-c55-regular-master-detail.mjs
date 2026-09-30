#!/usr/bin/env node
/**
 * C-55 — Regular + Master-detail toggle on every entity list.
 * Asserts: Regular label (not List view), data-c55-view-toggle / EntityViewModeToggle,
 * Customers/Vendors/Drivers/Fleet/Users wired, useViewModePref entities include units+users.
 * Self-test: node scripts/ops/verify-c55-regular-master-detail.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function check(s) {
  const f = [];
  if (!/label:\s*"Regular"/.test(s.toggle)) {
    f.push('EntityViewModeToggle must label Regular (not List view)');
  }
  if (!/Master-detail/.test(s.toggle)) f.push("EntityViewModeToggle must label Master-detail");
  if (!/data-c55-view-toggle/.test(s.toggle)) f.push("toggle missing data-c55-view-toggle");
  for (const [name, src] of [
    ["customers", s.customers],
    ["vendors", s.vendors],
    ["drivers", s.drivers],
  ]) {
    if (!/"Regular"/.test(src)) f.push(`${name} must use Regular label`);
    if (/label:\s*"List view"/.test(src) || /\{ value: "list", label: "List view"/.test(src)) {
      f.push(`${name} still says List view — rename to Regular`);
    }
    if (!/data-c55-view-toggle/.test(src)) f.push(`${name} missing data-c55-view-toggle`);
  }
  if (!/EntityViewModeToggle/.test(s.fleet)) f.push("FleetHomePage must mount EntityViewModeToggle");
  if (!/MasterDetailShell/.test(s.fleet)) f.push("FleetHomePage must mount MasterDetailShell in MD mode");
  if (!/data-c55-fleet-view/.test(s.fleet)) f.push("Fleet missing data-c55-fleet-view");
  if (!/EntityViewModeToggle/.test(s.users)) f.push("Users must mount EntityViewModeToggle");
  if (!/users-master-detail-shell/.test(s.users)) f.push("Users must mount MD shell");
  if (!/"units"/.test(s.pref) || !/"users"/.test(s.pref)) {
    f.push("useViewModePref must admit units and users entities");
  }
  return f;
}

const sources = {
  toggle: read("apps/frontend/src/components/EntityViewModeToggle.tsx"),
  pref: read("apps/frontend/src/hooks/useViewModePref.ts"),
  customers: read("apps/frontend/src/pages/Customers.tsx"),
  vendors: read("apps/frontend/src/pages/Vendors.tsx"),
  drivers: read("apps/frontend/src/pages/Drivers.tsx"),
  fleet: read("apps/frontend/src/pages/fleet/FleetHomePage.tsx"),
  users: read("apps/frontend/src/pages/Users.tsx"),
};

if (process.argv.includes("--selftest")) {
  const good = { ...sources };
  const bad = {
    ...sources,
    toggle: sources.toggle.replace('{ value: "list", label: "Regular"', '{ value: "list", label: "List view"'),
  };
  const checks = [
    ["good passes", check(good).length === 0],
    ["List view label fails", check(bad).some((m) => /Regular/.test(m))],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify-c55 --selftest FAIL");
    for (const [n] of failed) console.error(" ✗", n);
    process.exit(1);
  }
  console.log(`verify-c55-regular-master-detail --selftest PASS (${checks.length})`);
  process.exit(0);
}

const failures = check(sources);
if (failures.length) {
  console.error("verify-c55-regular-master-detail FAILED");
  for (const x of failures) console.error(" ✗", x);
  process.exit(1);
}
console.log("verify-c55-regular-master-detail OK (Regular+MD on customers/vendors/drivers/fleet/users)");
