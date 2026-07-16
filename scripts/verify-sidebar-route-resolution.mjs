#!/usr/bin/env node
/**
 * Ensures every sidebar `to` href has a matching route in manifest.tsx, and that
 * the matched route is not itself a bare Navigate → /home (dead-end / wrong home).
 *
 * Scope the redirect check to the single Route block for that path — do not scan
 * unbounded across later routes (e.g. sibling `/app/homepage` must not false-fail
 * sidebar `/home`, `/program`, `/system`).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const sidebarPath = path.join(ROOT, "apps/frontend/src/components/layout/sidebar-config.ts");
const routesPath = path.join(ROOT, "apps/frontend/src/routes/manifest.tsx");

const sidebar = fs.readFileSync(sidebarPath, "utf8");
const routes = fs.readFileSync(routesPath, "utf8");
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Slice of manifest for one `path="..."` Route (until the next sibling `<Route`). */
function routeBlockForPath(src, routePath) {
  const marker = `path="${routePath}"`;
  const idx = src.indexOf(marker);
  if (idx === -1) return null;
  const after = src.slice(idx, idx + 800);
  // Cut at the next Route opening — not at the next `path=` (single-line Routes put
  // path= on the same line as <Route, so a path=-only cut leaks sibling aliases).
  const nextRouteRel = after.search(/\n\s*<Route[\s>]/);
  return nextRouteRel === -1 ? after : after.slice(0, nextRouteRel);
}

function isBareHomeRedirect(block) {
  if (!block) return false;
  return /element=\{\s*<Navigate\s+to="\/home"/.test(block);
}

const hrefs = [...sidebar.matchAll(/to:\s*"([^"]+)"/g)].map((m) => m[1]);
const unique = [...new Set(hrefs)];
const violations = [];

for (const href of unique) {
  const normalizedHref = href.split("?")[0];
  const fallbackParent = normalizedHref.startsWith("/safety/") ? "/safety" : normalizedHref;
  const escaped = escapeRegex(normalizedHref);
  const escapedParent = escapeRegex(fallbackParent);
  const routePattern = new RegExp(`path="${escaped}"`);
  const parentPattern = new RegExp(`path="${escapedParent}"`);
  if (!routePattern.test(routes) && !parentPattern.test(routes)) {
    violations.push(`missing route for sidebar href ${href}`);
    continue;
  }
  const block =
    routeBlockForPath(routes, normalizedHref) ?? routeBlockForPath(routes, fallbackParent);
  // Canonical /home is the training surface — never treat it as a bad redirect target.
  if (normalizedHref === "/home" || fallbackParent === "/home") {
    continue;
  }
  if (isBareHomeRedirect(block)) {
    violations.push(`sidebar href ${href} resolves to /home redirect`);
  }
}

if (violations.length > 0) {
  console.error("verify:sidebar-route-resolution failed");
  for (const v of violations) console.error(v);
  process.exit(1);
}
console.log("verify:sidebar-route-resolution: ok");
