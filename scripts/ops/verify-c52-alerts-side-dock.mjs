#!/usr/bin/env node
/**
 * C-52 — alert messages side-docked, smaller, no layout shift.
 * Self-test: node scripts/ops/verify-c52-alerts-side-dock.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function check(sources) {
  const f = [];
  if (!/data-c52-alert-dock="1"/.test(sources.toast)) f.push("ToastProvider missing data-c52-alert-dock");
  if (!/pointer-events-none fixed/.test(sources.toast)) f.push("Toast dock must be fixed + pointer-events-none container");
  // House: toasts sit top-14 right-3 so they clear the topbar. C-65 banking attention
  // already owns bottom-3 right-3 — stacking both in the same corner is a collision.
  if (!/top-14 right-3/.test(sources.toast)) f.push("Toast dock must be top-right side dock (top-14 right-3)");
  if (/bottom-3 right-3/.test(sources.toast)) f.push("Toast dock must not sit on C-65 bottom-3 right-3");
  if (!/rounded-sm/.test(sources.toast)) f.push("Toast chips must use rounded-sm (SQUARE-EDGES)");
  if (/rounded-md/.test(sources.toast)) f.push("Toast must not use rounded-md");
  if (!/toast-dismiss/.test(sources.toast)) f.push("Toast must expose dismiss control");
  if (!/data-c52-alert-dock="page"/.test(sources.customers)) {
    f.push("Customers view-mode save error must side-dock (data-c52-alert-dock=page)");
  }
  if (!/data-c52-alert-dock="page"/.test(sources.vendors)) {
    f.push("Vendors view-mode save error must side-dock (data-c52-alert-dock=page)");
  }
  if (/data-view-mode-save-error="customers"[^>]*className="flex items-center/.test(sources.customers)) {
    f.push("Customers view-mode error still in document flow (layout shift)");
  }
  return f;
}

const sources = {
  toast: read("apps/frontend/src/components/Toast.tsx"),
  customers: read("apps/frontend/src/pages/Customers.tsx"),
  vendors: read("apps/frontend/src/pages/Vendors.tsx"),
};

if (process.argv.includes("--selftest")) {
  const good = { ...sources };
  const badRadius = { ...sources, toast: sources.toast.replace("rounded-sm", "rounded-md") };
  const badCorner = { ...sources, toast: sources.toast.replace("top-14 right-3", "bottom-3 right-3") };
  const checks = [
    ["good passes", check(good).length === 0],
    ["rounded-md fails", check(badRadius).some((m) => /rounded-md/.test(m))],
    ["C-65 collision fails", check(badCorner).some((m) => /C-65|top-right/.test(m))],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify-c52 --selftest FAIL");
    for (const [n] of failed) console.error(" ✗", n);
    process.exit(1);
  }
  console.log(`verify-c52-alerts-side-dock --selftest PASS (${checks.length})`);
  process.exit(0);
}

const failures = check(sources);
if (failures.length) {
  console.error("verify-c52-alerts-side-dock FAILED");
  for (const x of failures) console.error(" ✗", x);
  process.exit(1);
}
console.log("verify-c52-alerts-side-dock OK (side-dock toast + page alerts, no in-flow layout shift)");
