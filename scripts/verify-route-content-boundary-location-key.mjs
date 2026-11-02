#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const manifestPath = path.join(root, "apps/frontend/src/routes/manifest.tsx");
const mainPath = path.join(root, "apps/frontend/src/main.tsx");

function verify(source, mainSource) {
  const failures = [];
  const boundary = source.match(
    /function RouteContentBoundary[\s\S]*?\n}\n/
  )?.[0] ?? "";

  if (!boundary.includes("const location = useLocation()")) {
    failures.push("route content boundary must read the current location");
  }
  // Pathname ONLY — including search remounts on every filter/preset URL write and wipes staged draft
  // (Codex Round 7.6 P&L Last month). Path changes still remount for cold lazy destinations (DRV-F7317).
  if (!boundary.includes("key={location.pathname}")) {
    failures.push("route content Suspense must remount on pathname changes (key={location.pathname})");
  }
  if (boundary.includes("location.search")) {
    failures.push("route content Suspense must NOT key on location.search (staged filters / report presets)");
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
  if (!/<BrowserRouter\s+useTransitions=\{false\}>/.test(mainSource)) {
    failures.push("BrowserRouter must synchronously commit route state so a pending transition cannot retain stale route DOM");
  }
  return failures;
}

const source = fs.readFileSync(manifestPath, "utf8");
const mainSource = fs.readFileSync(mainPath, "utf8");
const failures = verify(source, mainSource);
if (failures.length) {
  console.error(`verify-route-content-boundary-location-key: FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["remove location read", source.replace("const location = useLocation();", "const location = { pathname: '', search: '' };" ), mainSource],
    ["remove location key", source.replace(" key={location.pathname}", ""), mainSource],
    ["reintroduce search key", source.replace("key={location.pathname}", "key={`${location.pathname}${location.search}`}"), mainSource],
    ["remove fallback", source.replace(" fallback={<RouteFallback />}", ""), mainSource],
    ["restore one unkeyed wrapper", source.replace("<RouteContentBoundary>{children}</RouteContentBoundary>", "<React.Suspense fallback={<RouteFallback />}>{children}</React.Suspense>"), mainSource],
    ["restore transition-wrapped router updates", source, mainSource.replace("<BrowserRouter useTransitions={false}>", "<BrowserRouter>")],
    ["enable transition-wrapped router updates", source, mainSource.replace("useTransitions={false}", "useTransitions={true}")],
  ];
  for (const [name, mutatedSource, mutatedMainSource] of mutations) {
    if (verify(mutatedSource, mutatedMainSource).length === 0) {
      console.error(`verify-route-content-boundary-location-key: selftest FAIL — mutation survived: ${name}`);
      process.exit(1);
    }
  }
  console.log(`verify-route-content-boundary-location-key: selftest PASS (${mutations.length}/${mutations.length})`);
} else {
  console.log("verify-route-content-boundary-location-key: PASS");
}
