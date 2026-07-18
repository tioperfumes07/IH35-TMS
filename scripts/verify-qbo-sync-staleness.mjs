#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const paths = {
  helper: "apps/backend/src/qbo/sync-freshness.ts",
  route: "apps/backend/src/qbo/sync-health.routes.ts",
  api: "apps/frontend/src/api/home.ts",
  card: "apps/frontend/src/components/home/QboSyncHealthCard.tsx",
};

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function inspect(source) {
  const failures = [];
  if (!/QBO_SYNC_STALE_AFTER_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(source.helper)) {
    failures.push("canonical 24-hour QBO freshness threshold is missing");
  }
  if (!/computeQboSyncFreshness/.test(source.route)) failures.push("sync-health route does not compute freshness");
  if (!/status\s*=\s*'success'/.test(source.route)) failures.push("route does not query successful qbo.sync_runs");
  if (!/error_message IS NULL/.test(source.route)) failures.push("route does not require successful master-data CDC runs");
  for (const field of [
    "last_success_at",
    "last_success_source",
    "last_success_age_seconds",
    "stale_after_seconds",
    "freshness_status",
    "is_stale",
  ]) {
    if (!source.api.includes(field)) failures.push(`frontend API contract is missing ${field}`);
  }
  if (!/health\.is_stale/.test(source.card)) failures.push("health pill ignores backend staleness");
  if (!/Last successful sync/.test(source.card)) failures.push("card does not display last-success age");
  if (!/Success source/.test(source.card)) failures.push("card does not display the successful source");
  return failures;
}

const source = Object.fromEntries(Object.entries(paths).map(([key, relativePath]) => [key, read(relativePath)]));
const failures = inspect(source);

// Planted regressions prove this guard fails closed if the threshold or UI stale-state consumption is removed.
const plantedThreshold = inspect({
  ...source,
  helper: source.helper.replace("24 * 60 * 60 * 1000", "0"),
});
if (!plantedThreshold.some((failure) => failure.includes("24-hour"))) {
  failures.push("self-test failed: planted threshold regression was not detected");
}
const plantedCard = inspect({
  ...source,
  card: source.card.replaceAll("health.is_stale", "false"),
});
if (!plantedCard.some((failure) => failure.includes("ignores backend staleness"))) {
  failures.push("self-test failed: planted card regression was not detected");
}

if (failures.length > 0) {
  console.error("verify:qbo-sync-staleness — FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const vitest = path.join(root, "node_modules/vitest/vitest.mjs");
const backend = spawnSync(
  process.execPath,
  [vitest, "run", "--config", "apps/backend/vitest.config.ts", "apps/backend/src/qbo/sync-freshness.test.ts"],
  { cwd: root, stdio: "inherit" }
);
if (backend.status !== 0) process.exit(backend.status ?? 1);

const frontend = spawnSync(
  process.execPath,
  [vitest, "run", "src/components/home/__tests__/QboSyncHealthCard.test.tsx"],
  { cwd: path.join(root, "apps/frontend"), stdio: "inherit" }
);
if (frontend.status !== 0) process.exit(frontend.status ?? 1);

console.log("verify:qbo-sync-staleness — OK");
