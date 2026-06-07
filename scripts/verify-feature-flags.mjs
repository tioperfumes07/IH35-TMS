#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

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

const migration = read("db/migrations/0408_feature_flags.sql");
contains("db/migrations/0408_feature_flags.sql", migration, [
  { pattern: /lib\.feature_flags/, label: "feature_flags table" },
  { pattern: /lib\.feature_flag_overrides/, label: "feature_flag_overrides table" },
  { pattern: /rollout_pct/, label: "rollout_pct column" },
]);

const service = read("apps/backend/src/lib/feature-flags/service.ts");
contains("apps/backend/src/lib/feature-flags/service.ts", service, [
  { pattern: /export async function isEnabled/, label: "isEnabled export" },
  { pattern: /resolveFlagEnabled/, label: "override precedence resolver" },
  { pattern: /isRolloutEnabled/, label: "rollout pct helper" },
]);

const routes = read("apps/backend/src/lib/feature-flags/routes.ts");
contains("apps/backend/src/lib/feature-flags/routes.ts", routes, [
  { pattern: /\/api\/feature-flags\/check/, label: "check route" },
  { pattern: /\/api\/feature-flags"/, label: "admin list route" },
  { pattern: /\/api\/feature-flags\/overrides/, label: "override routes" },
  { pattern: /registerFeatureFlagRoutes/, label: "route register export" },
]);

const hook = read("apps/frontend/src/hooks/useFeatureFlag.ts");
contains("apps/frontend/src/hooks/useFeatureFlag.ts", hook, [
  { pattern: /export function useFeatureFlag/, label: "useFeatureFlag hook" },
  { pattern: /refreshFeatureFlag/, label: "client refresh wired" },
]);

const manager = read("apps/frontend/src/pages/admin/feature-flags/FeatureFlagsManager.tsx");
contains("apps/frontend/src/pages/admin/feature-flags/FeatureFlagsManager.tsx", manager, [
  { pattern: /FeatureFlagsManager/, label: "manager export" },
  { pattern: /feature-flags-manager/, label: "manager test id" },
  { pattern: /rollout_pct|Rollout/, label: "rollout slider" },
]);

const index = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", index, [
  { pattern: /registerFeatureFlagRoutes/, label: "backend route registration" },
]);

const manifest = read("apps/frontend/src/routes/manifest.tsx");
contains("apps/frontend/src/routes/manifest.tsx", manifest, [
  { pattern: /\/admin\/feature-flags/, label: "admin route" },
  { pattern: /FeatureFlagsManager/, label: "manager import" },
]);

const blockReady = read(".block-ready/GAP-92-FEATURE-FLAG-SYSTEM.json");
contains(".block-ready/GAP-92-FEATURE-FLAG-SYSTEM.json", blockReady, [
  { pattern: /GAP-92-FEATURE-FLAG-SYSTEM/, label: "GAP-92 block id" },
  { pattern: /verify:feature-flags/, label: "extra gate" },
]);

const pkg = read("package.json");
contains("package.json", pkg, [
  { pattern: /verify:feature-flags/, label: "package script" },
]);

if (failures.length > 0) {
  console.error("verify:feature-flags — FAILED");
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log("verify:feature-flags — OK");
