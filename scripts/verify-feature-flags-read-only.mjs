#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/pages/admin/feature-flags/FeatureFlagsManager.tsx";
const source = fs.readFileSync(file, "utf8");
const required = [
  'data-testid="feature-flags-read-only"',
  "Display only.",
  "fetchAllFeatureFlags",
];
const forbidden = [
  "createFeatureFlag",
  "updateFeatureFlag",
  "setFeatureFlagOverride",
  "deleteFeatureFlagOverride",
  "useMutation",
  "Create flag",
  "Tenant override ON",
];

for (const token of required) {
  if (!source.includes(token)) throw new Error(`feature flags read-only guard: missing ${token}`);
}
for (const token of forbidden) {
  if (source.includes(token)) throw new Error(`feature flags read-only guard: forbidden mutation token ${token}`);
}

console.log("verify-feature-flags-read-only: PASS");
