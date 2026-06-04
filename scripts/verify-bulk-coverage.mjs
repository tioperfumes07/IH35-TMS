#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const backendSrc = path.join(repoRoot, "apps/backend/src");

function walkRouteFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkRouteFiles(full, acc);
      continue;
    }
    if (!entry.name.endsWith(".routes.ts")) continue;
    if (entry.name.endsWith(".test.ts")) continue;
    acc.push(full);
  }
  return acc;
}

function relative(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function hasBulkUpdatePost(source) {
  return /app\.post\s*\(\s*["'`][^"'`]*\/bulk-update["'`]/.test(source);
}

function usesCanonicalFactory(source) {
  return (
    /from\s+["'][^"']*bulk-update\.factory(?:\.js)?["']/.test(source) &&
    (/registerBulkRoute/.test(source) || /appendLegacyFleetBulkAudit/.test(source))
  );
}

function hasHandRolledBulkShape(source) {
  return (
    /ids\s*:\s*z\.array/.test(source) &&
    /(?:patch|payload)\s*:/.test(source) &&
    /idempotency_key/.test(source) &&
    !usesCanonicalFactory(source)
  );
}

const routeFiles = walkRouteFiles(backendSrc);
const bulkRouteFiles = routeFiles.filter(
  (file) => file.includes("bulk-update") || /-bulk\.routes\.ts$/.test(file)
);

const failures = [];

for (const file of bulkRouteFiles) {
  const source = fs.readFileSync(file, "utf8");
  const rel = relative(file);
  const declaresBulkPost = hasBulkUpdatePost(source);

  if (!declaresBulkPost) continue;

  if (!usesCanonicalFactory(source)) {
    const match = source.match(/app\.post\s*\(\s*["'`][^"'`]*\/bulk-update["'`]/);
    const atLine = match ? lineNumber(source, match.index ?? 0) : "?";
    failures.push(
      `${rel} declares POST /bulk-update at line ${atLine} but does not import the canonical bulk-update.factory (registerBulkRoute or appendLegacyFleetBulkAudit). See docs/specs/BULK-OPS-DESIGN.md.`
    );
  }
}

for (const file of routeFiles) {
  const source = fs.readFileSync(file, "utf8");
  if (!hasHandRolledBulkShape(source)) continue;
  if (file.includes("bulk-update.factory")) continue;
  failures.push(
    `${relative(file)} registers a hand-rolled bulk POST body ({ ids, patch/idempotency_key }) outside bulk-update.factory. See docs/specs/BULK-OPS-DESIGN.md.`
  );
}

if (failures.length > 0) {
  console.error("[verify-bulk-coverage] FAIL");
  for (const message of failures) {
    console.error(`  - ${message}`);
  }
  process.exit(1);
}

console.log(`[verify-bulk-coverage] OK (${bulkRouteFiles.length} bulk route files scanned)`);
