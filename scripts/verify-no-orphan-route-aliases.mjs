#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROUTES_MANIFEST = path.join(process.cwd(), "apps", "frontend", "src", "routes", "manifest.tsx");

export function verifyNoOrphanRouteAliases() {
  if (!fs.existsSync(ROUTES_MANIFEST)) {
    throw new Error("routes manifest not found");
  }
  const text = fs.readFileSync(ROUTES_MANIFEST, "utf8");

  const hasCanonical = text.includes('path="integrity-reports"') || text.includes('path="/safety/integrity-reports"');
  if (!hasCanonical) {
    throw new Error("missing canonical integrity reports route");
  }

  const hasAliasPath = text.includes('path="/safety/integrity-alerts"');
  const hasAliasRedirect = text.includes('<Navigate to="/safety/integrity-reports" replace />');
  if (!hasAliasPath || !hasAliasRedirect) {
    throw new Error("missing integrity-alerts alias redirect to /safety/integrity-reports");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  try {
    verifyNoOrphanRouteAliases();
    console.log("verify:no-orphan-route-aliases — OK");
  } catch (error) {
    console.error(`verify:no-orphan-route-aliases — FAILED\n${String((error && error.message) || error)}`);
    process.exit(1);
  }
}
