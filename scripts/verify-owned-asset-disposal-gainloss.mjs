#!/usr/bin/env node
// FLT-05 regression guard: owned disposal must remain explicit, flag-gated, and posted through
// the shared JE spine. This is intentionally structural: no production flag is enabled.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const service = read("apps/backend/src/accounting/owned-asset-disposal.service.ts");
const routes = read("apps/backend/src/accounting/amortization-posting/amortization-posting.routes.ts");
const index = read("apps/backend/src/index.ts");

const requiredServiceTokens = [
  "accounting.fixed_asset_disposals",
  "gain_loss_on_disposal",
  "createJournalEntryOnClient",
  "AMORTIZATION_GL_POSTING_FLAG_KEY",
  "AMORTIZATION_GL_POSTING_ENABLED",
  "UPDATE accounting.fixed_assets",
  "status = 'disposed'",
  "writeTransactionSourceLink",
];
const requiredRouteTokens = [
  '"/api/v1/accounting/fixed-assets/dispose"',
  'user.role !== "Owner"',
  "postOwnedAssetDisposal",
];

// Mount law: accounting/*.routes.ts is auto-loaded by registerAccountingRoutes (autoload).
// Explicit index.ts app.register(amortization-posting) DUPLICATES prepaid/post (FST_ERR_DUPLICATED_ROUTE).
// Prove disposal is on the autoloaded routes file + accounting autoload remains mounted.
const accountingAutoloadMounted =
  index.includes("registerAccountingRoutes") && /await\s+registerAccountingRoutes\s*\(\s*app\s*\)/.test(index);
const failures = [
  ...requiredServiceTokens.filter((token) => !service.includes(token)).map((token) => `service missing ${token}`),
  ...requiredRouteTokens.filter((token) => !routes.includes(token)).map((token) => `route missing ${token}`),
  ...(accountingAutoloadMounted
    ? []
    : ["accounting disposal router not reachable — registerAccountingRoutes(app) missing from apps/backend/src/index.ts"]),
  ...(index.includes("app.register(registerAmortizationPostingRoutes)")
    ? ["FORBIDDEN: explicit app.register(registerAmortizationPostingRoutes) duplicates accounting autoload — remove it"]
    : []),
];

if (failures.length) {
  console.error(`verify-owned-asset-disposal-gainloss FAIL:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log("verify-owned-asset-disposal-gainloss PASS");
