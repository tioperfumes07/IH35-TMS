#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const manifestPath = path.join(root, "apps/frontend/src/routes/manifest.tsx");

function verify(source) {
  const failures = [];
  const boundary = source.match(
    /function RouteContentBoundary[\s\S]*?\n}\n/
  )?.[0] ?? "";

  if (!boundary.includes("const location = useLocation()")) {
    failures.push("route content boundary must read the current location");
  }
  if (!boundary.includes('key={`${location.pathname}${location.search}`}')) {
    failures.push("route content Suspense must remount for pathname/search changes");
  }
  if (!boundary.includes("fallback={<RouteFallback />}")) {
    failures.push("route content boundary must retain the visible loading fallback");
  }

  const consumers = source.match(/<RouteContentBoundary>{children}<\/RouteContentBoundary>/g) ?? [];
  if (consumers.length !== 4) {
    failures.push(`all four protected route wrappers must use the keyed boundary (found ${consumers.length})`);
  }
  if (/React\.Suspense fallback={<RouteFallback \/>}>{children}<\/React\.Suspense>/.test(source)) {
    failures.push("an unkeyed protected-route Suspense boundary remains");
  }
  return failures;
}

const source = fs.readFileSync(manifestPath, "utf8");
const failures = verify(source);
if (failures.length) {
  console.error(`verify-route-content-boundary-location-key: FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["remove location read", source.replace("const location = useLocation();", "const location = { pathname: '', search: '' };" )],
    ["remove location key", source.replace(' key={`${location.pathname}${location.search}`}', "")],
    ["remove fallback", source.replace(" fallback={<RouteFallback />}", "")],
    ["restore one unkeyed wrapper", source.replace("<RouteContentBoundary>{children}</RouteContentBoundary>", "<React.Suspense fallback={<RouteFallback />}>{children}</React.Suspense>")],
  ];
  for (const [name, mutated] of mutations) {
    if (verify(mutated).length === 0) {
      console.error(`verify-route-content-boundary-location-key: selftest FAIL — mutation survived: ${name}`);
      process.exit(1);
    }
  }
  console.log(`verify-route-content-boundary-location-key: selftest PASS (${mutations.length}/${mutations.length})`);
} else {
  console.log("verify-route-content-boundary-location-key: PASS");
}
