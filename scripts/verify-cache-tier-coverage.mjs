#!/usr/bin/env node
/**
 * GAP-23: Samsara 4-tier cache hierarchy — CI guard.
 * Ensures tier modules exist, warmer is wired, and legacy direct Samsara calls stay allowlisted.
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

const cacheTiers = read("apps/backend/src/lib/cache-tiers.ts");
contains("apps/backend/src/lib/cache-tiers.ts", cacheTiers, [
  { pattern: /TIER_1_REALTIME_MAX_AGE_MS = 5_000/, label: "tier1 max age" },
  { pattern: /TIER_2_30S_MAX_AGE_MS = 30_000/, label: "tier2 max age" },
  { pattern: /TIER_3_5MIN_MAX_AGE_MS = 300_000/, label: "tier3 max age" },
  { pattern: /TIER_4_15MIN_MAX_AGE_MS = 900_000/, label: "tier4 max age" },
  { pattern: /export function maxAgeForTier/, label: "maxAgeForTier export" },
]);

read("apps/backend/src/integrations/samsara/cache/tier1-realtime.ts");
read("apps/backend/src/integrations/samsara/cache/tier2-30s.ts");
read("apps/backend/src/integrations/samsara/cache/tier3-5min.ts");
read("apps/backend/src/integrations/samsara/cache/tier4-15min.ts");

const warmer = read("apps/backend/src/integrations/samsara/cache/cache-warmer.ts");
contains("apps/backend/src/integrations/samsara/cache/cache-warmer.ts", warmer, [
  { pattern: /export function initializeSamsaraCacheWarmer/, label: "cache warmer initializer" },
  { pattern: /warmTier3Caches/, label: "tier3 warm tick" },
  { pattern: /warmTier4Caches/, label: "tier4 warm tick" },
]);

read("apps/backend/src/integrations/samsara/cache/__tests__/cache.test.ts");

const index = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", index, [
  { pattern: /initializeSamsaraCacheWarmer/, label: "index wires cache warmer" },
]);

const archDesign = read("docs/specs/IH35_ARCHITECTURAL_DESIGN.md");
contains("docs/specs/IH35_ARCHITECTURAL_DESIGN.md", archDesign, [
  { pattern: /verify:cache-tier-coverage/, label: "arch design references verify:cache-tier-coverage" },
]);

/** Legacy direct SamsaraClient consumers — grandfathered until CAP consumers adopt tiers (GAP-24). */
const LEGACY_DIRECT_SAMSARA = new Set([
  "apps/backend/src/integrations/samsara/samsara.service.ts",
  "apps/backend/src/integrations/samsara/samsara-positions.service.ts",
  "apps/backend/src/integrations/samsara/samsara-master-sync.service.ts",
  "apps/backend/src/integrations/samsara/remote-count-collector.ts",
  "apps/backend/src/integrations/samsara/samsara-client.ts",
  "apps/backend/src/telematics/dashcam.service.ts",
]);

function walkTsFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "__tests__" && entry.name !== "cache") {
      walkTsFiles(full, acc);
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      acc.push(full);
    }
  }
  return acc;
}

const samsaraRoot = path.join(ROOT, "apps/backend/src/integrations/samsara");
for (const filePath of walkTsFiles(samsaraRoot)) {
  const rel = path.relative(ROOT, filePath).split(path.sep).join("/");
  if (LEGACY_DIRECT_SAMSARA.has(rel)) continue;
  const content = fs.readFileSync(filePath, "utf8");
  if (/new SamsaraClient\(/.test(content) && !/fetchTier[1-4]/.test(content)) {
    fail(`${rel}: direct SamsaraClient usage must route through cache tier accessor`);
  }
}

if (failures.length) {
  console.error("verify:cache-tier-coverage FAIL:");
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}

console.log("verify:cache-tier-coverage OK");
