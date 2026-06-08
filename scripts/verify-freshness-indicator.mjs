#!/usr/bin/env node
/**
 * GAP-24-FRESHNESS-INDICATOR: CI guard — component exists with required props.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      fail(`${relativePath}: missing ${check.label}`);
    }
  }
}

const componentPath = "apps/frontend/src/components/dispatch/FreshnessIndicator.tsx";
const component = read(componentPath);
contains(componentPath, component, [
  { pattern: /export function FreshnessIndicator/, label: "FreshnessIndicator export" },
  { pattern: /lastFetchedAt:\s*string\s*\|\s*null/, label: "lastFetchedAt prop" },
  { pattern: /cacheTier:\s*FreshnessCacheTier\s*\|\s*null/, label: "cacheTier prop" },
  { pattern: /export function freshnessColor/, label: "freshnessColor helper" },
  { pattern: /green.*amber.*red|FreshnessColor/, label: "green/amber/red color coding" },
  { pattern: /L\$\{cacheTier\}|tierLabel/, label: "L1-L4 tier label" },
]);

read("apps/frontend/src/components/dispatch/FreshnessIndicator.test.tsx");
read("apps/frontend/src/components/dispatch/FreshnessIndicator.usage.example.tsx");

const manifest = read(".block-ready/GAP-24-FRESHNESS-INDICATOR.json");
contains(".block-ready/GAP-24-FRESHNESS-INDICATOR.json", manifest, [
  { pattern: /"block_id":\s*"GAP-24-FRESHNESS-INDICATOR"/, label: "block_id" },
  { pattern: /verify:freshness-indicator/, label: "extra_gates verify script" },
  { pattern: /FreshnessIndicator\.tsx/, label: "component allowed file" },
]);

const pkg = read("package.json");
contains("package.json", pkg, [
  { pattern: /"verify:freshness-indicator":\s*"node scripts\/verify-freshness-indicator\.mjs"/, label: "npm script" },
]);

const ci = read(".github/workflows/ci.yml");
contains(".github/workflows/ci.yml", ci, [
  { pattern: /verify:freshness-indicator/, label: "CI workflow step" },
]);

if (failures.length) {
  console.error("verify:freshness-indicator FAIL:");
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}

console.log("verify:freshness-indicator OK");
