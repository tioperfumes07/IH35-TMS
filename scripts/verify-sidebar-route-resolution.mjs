#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const sidebarPath = path.join(ROOT, "apps/frontend/src/components/layout/sidebar-config.ts");
const routesPath = path.join(ROOT, "apps/frontend/src/routes/manifest.tsx");

const sidebar = fs.readFileSync(sidebarPath, "utf8");
const routes = fs.readFileSync(routesPath, "utf8");
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const hrefs = [...sidebar.matchAll(/to:\s*"([^"]+)"/g)].map((m) => m[1]);
const unique = [...new Set(hrefs)];
const violations = [];

for (const href of unique) {
  const normalizedHref = href.split("?")[0];
  const fallbackParent = normalizedHref.startsWith("/safety/") ? "/safety" : normalizedHref;
  const escaped = escapeRegex(normalizedHref);
  const escapedParent = escapeRegex(fallbackParent);
  const routePattern = new RegExp(`path=\"${escaped}\"`);
  const parentPattern = new RegExp(`path=\"${escapedParent}\"`);
  if (!routePattern.test(routes) && !parentPattern.test(routes)) {
    violations.push(`missing route for sidebar href ${href}`);
    continue;
  }
  const redirectHomePattern = new RegExp(`path=\"${escaped}\"[\\s\\S]*?<Navigate to=\"/home\"`, "m");
  if (redirectHomePattern.test(routes)) {
    violations.push(`sidebar href ${href} resolves to /home redirect`);
  }
}

if (violations.length > 0) {
  console.error("verify:sidebar-route-resolution failed");
  for (const v of violations) console.error(v);
  process.exit(1);
}
console.log("verify:sidebar-route-resolution: ok");
