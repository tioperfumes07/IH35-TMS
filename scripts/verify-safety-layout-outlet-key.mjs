#!/usr/bin/env node
/**
 * SAFETY-DRIVER-FILES-DETAIL-STUCK-ON-NAV-AWAY guard.
 * SafetyLayout must use key={location.pathname} on <Outlet /> to force
 * re-mount on navigation between sibling safety routes. Without this,
 * React Router can leave the previous route's component mounted under
 * the new URL when navigating via HoverDropdown NavLink.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const filePath = path.join(root, "apps/frontend/src/pages/safety/SafetyLayout.tsx");
const src = readFileSync(filePath, "utf8");

const failures = [];

// Required: Outlet has key prop
if (!src.includes("<Outlet key={location.pathname} />") && !src.includes("<Outlet key={location.pathname}/>")) {
  failures.push("SafetyLayout <Outlet /> must have key={location.pathname} to force re-mount on navigation");
}

// Required: location is available (useLocation imported or used)
if (!src.includes("useLocation") || !src.includes("location.pathname")) {
  failures.push("SafetyLayout must use useLocation() to get location.pathname for Outlet key");
}

if (process.argv.includes("--selftest")) {
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

console.log("verify-safety-layout-outlet-key: OK — SafetyLayout Outlet has key={location.pathname} forcing re-mount on navigation");
process.exit(0);
