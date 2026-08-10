#!/usr/bin/env node
/**
 * GUARD (LST-A-01): Driver Load Statuses must be reachable from the Lists hub map
 * (DOMAIN_CONFIG + buildCatalogPath + /lists/drivers/driver-load-statuses route).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lists-hub-driver-load-statuses";
const MAP = "apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const COUNT = "apps/backend/src/lists/lists-module-count-spec.ts";
const PAGE = "apps/frontend/src/pages/DriverLoadStatusesPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function assertHubReachability(sources) {
  const problems = [];
  const map = sources[MAP] ?? "";
  const manifest = sources[MANIFEST] ?? "";
  const count = sources[COUNT] ?? "";
  const page = sources[PAGE] ?? "";

  if (!/Driver Load Statuses/.test(map) || !/catalogKey:\s*"driver-load-statuses"/.test(map)) {
    problems.push(`${MAP}: DOMAIN_CONFIG missing Driver Load Statuses / catalogKey driver-load-statuses`);
  }
  if (!/"driver-load-statuses"\s*:\s*"\/lists\/drivers\/driver-load-statuses"/.test(map)) {
    problems.push(`${MAP}: buildCatalogPath must map driver-load-statuses → /lists/drivers/driver-load-statuses`);
  }
  if (!/path=["']\/lists\/drivers\/driver-load-statuses["']/.test(manifest)) {
    problems.push(`${MANIFEST}: missing /lists/drivers/driver-load-statuses route`);
  }
  if (!/DriverLoadStatusesPage/.test(manifest)) {
    problems.push(`${MANIFEST}: route must render DriverLoadStatusesPage`);
  }
  if (!/table:\s*"driver_load_statuses"/.test(count)) {
    problems.push(`${COUNT}: drivers count-spec must include driver_load_statuses`);
  }
  if (!/statusesQuery\.isError\s*\?\s*\(\s*<ListErrorBanner[\s\S]{0,180}statusesQuery\.refetch\(\)/.test(page)) {
    problems.push(`${PAGE}: list failure must render retryable ListErrorBanner`);
  }
  if (!/aria-label=\{`Edit \$\{status\.name\}`\}/.test(page)) {
    problems.push(`${PAGE}: icon-only edit buttons must have a status-specific accessible label`);
  }
  if (!/<Modal variant="drawer" open=\{editOpen\}/.test(page)) {
    problems.push(`${PAGE}: edit surface must use drawer chrome`);
  }
  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = { [MAP]: read(MAP), [MANIFEST]: read(MANIFEST), [COUNT]: read(COUNT), [PAGE]: read(PAGE) };
  const broken = { ...real, [MAP]: real[MAP].replace(/Driver Load Statuses/g, "REMOVED") };
  if (assertHubReachability(broken).length === 0) {
    console.error(`${LABEL} --selftest FAIL: missing hub entry not flagged`);
    process.exit(1);
  }
  const brokenError = { ...real, [PAGE]: real[PAGE].replace("statusesQuery.refetch()", "noop()") };
  if (!assertHubReachability(brokenError).some((problem) => problem.includes("retryable ListErrorBanner"))) {
    console.error(`${LABEL} --selftest FAIL: missing list retry not flagged`);
    process.exit(1);
  }
  const good = assertHubReachability(real);
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL:\n${good.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

if (IS_MAIN) {
  const sources = { [MAP]: read(MAP), [MANIFEST]: read(MANIFEST), [COUNT]: read(COUNT), [PAGE]: read(PAGE) };
  const problems = assertHubReachability(sources);
  if (problems.length) {
    console.error(`${LABEL} FAIL:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — Driver Load Statuses on Lists hub + route + count-spec.`);
}
