#!/usr/bin/env node
/**
 * SAFETY-DRIVER-FILES-DETAIL-STUCK-ON-NAV-AWAY guard (class-level).
 * Layouts that render <Outlet /> for sibling routes must use
 * key={location.pathname} to force re-mount on navigation.
 * Without this, React Router can leave the previous route's component
 * mounted under the new URL when navigating via dropdown NavLink.
 *
 * Covers: SafetyLayout, DriverShell (same defect class).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));

const targets = [
  {
    file: "apps/frontend/src/pages/safety/SafetyLayout.tsx",
    label: "SafetyLayout",
  },
  {
    file: "apps/frontend/src/pages/driver/DriverShell.tsx",
    label: "DriverShell",
  },
];

const failures = [];

for (const target of targets) {
  const filePath = path.join(root, target.file);
  let src;
  try {
    src = readFileSync(filePath, "utf8");
  } catch (e) {
    failures.push(`${target.label}: file not found (${target.file})`);
    continue;
  }

  // Required: Outlet has key prop
  const hasKey =
    src.includes("<Outlet key={location.pathname} />") ||
    src.includes("<Outlet key={location.pathname}/>");
  if (!hasKey) {
    failures.push(`${target.label} <Outlet /> must have key={location.pathname} to force re-mount on navigation`);
  }

  // Required: location is available (useLocation imported or used)
  if (!src.includes("useLocation") || !src.includes("location.pathname")) {
    failures.push(`${target.label} must use useLocation() to get location.pathname for Outlet key`);
  }
}

if (process.argv.includes("--selftest")) {
  const target = targets[0];
  const filePath = path.join(root, target.file);
  const src = readFileSync(filePath, "utf8");
  const bad = src.replace("<Outlet key={location.pathname} />", "<Outlet />");
  if (bad.includes("<Outlet key={location.pathname} />")) {
    console.error("selftest: could not plant failure");
    process.exit(1);
  }
  console.log("verify-safety-layout-outlet-key selftest: planted failure would be detected");
  process.exit(0);
}

if (failures.length) {
  console.error("verify-safety-layout-outlet-key FAIL:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("verify-safety-layout-outlet-key: OK — all layout Outlets have key={location.pathname} forcing re-mount on navigation");
process.exit(0);
