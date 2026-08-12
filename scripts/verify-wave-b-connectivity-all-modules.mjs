#!/usr/bin/env node
/** @matrix-built {"modules":["*"],"cols":["connectivity"],"leafRe":".*","task":"WAVE-B-connectivity-all-modules","vertical":"column-wave"} */
/**
 * Full-product connectivity contract.
 * Every leaf that requires connectivity declares route_hint in its required.json. This guard proves
 * that hint resolves to a mounted route (absolute, nested, parameterized, or explicit redirect).
 * It scans the inventory dynamically, so adding a module/leaf without a real route fails the wave.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_DIR = path.join(ROOT, "docs/specs/scoreboard/modules");
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const ROUTE_SOURCES = [MANIFEST, "apps/frontend/src/routes/collections.routes.ts", "apps/frontend/src/router/route-manifest.ts"];

function normalize(value) {
  const route = String(value || "").split("?")[0].replace(/\/$/, "") || "/";
  return route.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ":param");
}

function routePatternMatches(pattern, target) {
  const p = normalize(pattern);
  const t = normalize(target);
  if (p === t) return true;
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:param/g, "[^/]+").replace(/\\\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(t.replace(/:param/g, "value"));
}

export function collectRequiredConnectivity(readDir = fs.readdirSync, read = fs.readFileSync) {
  const leaves = [];
  for (const file of readDir(MODULE_DIR).filter((name) => name.endsWith(".required.json")).sort()) {
    const spec = JSON.parse(read(path.join(MODULE_DIR, file), "utf8"));
    for (const leaf of spec.leaves || []) {
      if (!(leaf.required || []).includes("connectivity")) continue;
      leaves.push({ module: spec.module || file.replace(".required.json", ""), id: leaf.id, route: leaf.route_hint });
    }
  }
  return leaves;
}

export function auditConnectivity(manifestSource, leaves) {
  const failures = [];
  // A navigation `to=` is not connectivity proof: it can point at a 404. Only mounted Route paths
  // count here; Navigate aliases are represented by their own Route path.
  const mounted = [...manifestSource.matchAll(/\bpath\s*[:=]\s*["']([^"']+)["']/g)]
    .map((match) => match[1])
    // Catch-alls prove only that an unknown URL redirects somewhere; they do not mount the leaf.
    .filter((route) => route !== "*" && route !== "/*");
  const absoluteParents = mounted.filter((route) => route.startsWith("/") && !route.includes("?"));
  for (const leaf of leaves) {
    if (!leaf.route || !String(leaf.route).startsWith("/")) {
      failures.push(`${leaf.module}:${leaf.id}: missing absolute route_hint`);
      continue;
    }
    const target = String(leaf.route).split("?")[0];
    let wired = mounted.some((route) => routePatternMatches(route, target));
    if (!wired) {
      wired = absoluteParents.some((parent) => {
        const prefix = normalize(parent);
        if (prefix === "/" || !normalize(target).startsWith(`${prefix}/`)) return false;
        const child = target.slice(parent.length).replace(/^\//, "");
        return mounted.some((route) => !route.startsWith("/") && routePatternMatches(route, child));
      });
    }
    if (!wired) failures.push(`${leaf.module}:${leaf.id}: ${leaf.route} has no mounted route or redirect`);
  }
  if (leaves.length < 800) failures.push(`inventory unexpectedly shrank to ${leaves.length} connectivity leaves`);
  return failures;
}

const leaves = collectRequiredConnectivity();
const manifest = ROUTE_SOURCES.map((file) => fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n");

if (process.argv.includes("--selftest")) {
  const target = leaves.find((leaf) => normalize(leaf.route) === "/users");
  if (!target) {
    console.error("verify-wave-b-connectivity-all-modules SELFTEST FAIL — /users fixture missing");
    process.exit(1);
  }
  const mutated = manifest.replace('path="/users"', 'path="/users-removed"');
  const caught = auditConnectivity(mutated, [target, ...leaves.filter((leaf) => leaf !== target)]);
  if (!caught.some((failure) => failure.startsWith(`${target.module}:${target.id}:`))) {
    console.error("verify-wave-b-connectivity-all-modules SELFTEST FAIL — removed /users route was not detected");
    process.exit(1);
  }
  console.log("verify-wave-b-connectivity-all-modules SELFTEST PASS — removed route detected");
  process.exit(0);
}

const failures = auditConnectivity(manifest, leaves);
if (failures.length) {
  console.error(`verify-wave-b-connectivity-all-modules FAIL (${failures.length}/${leaves.length}):\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`verify-wave-b-connectivity-all-modules PASS — ${leaves.length} connectivity leaves resolve across the full module inventory`);
