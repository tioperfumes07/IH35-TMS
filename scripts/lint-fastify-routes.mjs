#!/usr/bin/env node
/**
 * Static duplicate-route guard for Fastify *.routes.ts modules.
 *
 * Parses literal `app.get("/path"` style registrations only (template-string routes skipped).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "apps/backend/src");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith(".routes.ts")) out.push(p);
  }
  return out;
}

const ROUTE_RE = /\bapp\.(get|post|put|patch|delete|options|head)\(\s*["']([^"']+)["']/g;

const routes = walk(ROOT);
const map = new Map();

for (const file of routes) {
  const txt = fs.readFileSync(file, "utf8");
  let match;
  while ((match = ROUTE_RE.exec(txt))) {
    const method = match[1].toUpperCase();
    const routePath = match[2];
    if (routePath.includes("${")) continue;
    const key = `${method} ${routePath}`;
    const bucket = map.get(key) ?? [];
    bucket.push(file);
    map.set(key, bucket);
  }
}

const duplicates = [...map.entries()].filter(([, files]) => files.length > 1).sort((a, b) => a[0].localeCompare(b[0]));

if (duplicates.length > 0) {
  console.error("\n[lint-fastify-routes] Duplicate literal Fastify routes detected:\n");
  for (const [key, files] of duplicates) {
    console.error(`  ${key}`);
    for (const f of files) {
      console.error(`    - ${path.relative(process.cwd(), f)}`);
    }
  }
  console.error("\nResolve collisions before merging (PR #52-style regressions).\n");
  process.exit(1);
}

console.log(`[lint-fastify-routes] OK — scanned ${routes.length} route module(s), no literal duplicates.`);
