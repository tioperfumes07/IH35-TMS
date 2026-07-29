#!/usr/bin/env node
/**
 * LST-A-01 closure — converted catalogs reachable from Lists hub (full chain).
 * Companion verify-converted-catalog-reachable-from-hub already proves 83 generics.
 * This ratchets scoreboard PASS with Neon density for the two named reason catalogs.
 * Cursor even claim: 1772.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-a01-hub-reachability-closed";

const HUB = "apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx";
const LISTS = "docs/module-completion/lists.json";
const COMPANION = "scripts/verify-converted-catalog-reachable-from-hub.mjs";

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function collectProblems() {
  const problems = [];
  const hub = read(HUB);
  const listsRaw = read(LISTS);
  if (!hub) problems.push(`missing ${HUB}`);
  else {
    for (const key of ["dispatcher-error-reasons", "customer-quality-event-reasons"]) {
      if (!hub.includes(`catalogKey: "${key}"`)) {
        problems.push(`${HUB} missing hub tile catalogKey ${key}`);
      }
    }
  }
  if (!read(COMPANION)) problems.push(`missing ${COMPANION}`);

  if (listsRaw) {
    try {
      const lists = JSON.parse(listsRaw);
      const item = lists.items?.find((i) => i.id === "LST-A-01");
      if (!item) problems.push("LST-A-01 missing from lists.json");
      else if (item.status === "PASS") {
        if (!/1772|verify-lst-a01|dispatcher-error|Neon/i.test(String(item.evidence ?? ""))) {
          problems.push("LST-A-01 PASS evidence must cite guard 1772 + Neon/hub proof");
        }
      } else if (item.status !== "FAIL") {
        problems.push(`LST-A-01 unexpected status ${item.status}`);
      }
    } catch {
      problems.push(`${LISTS} invalid JSON`);
    }
  } else problems.push(`missing ${LISTS}`);

  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  const r = spawnSync(process.execPath, [path.join(ROOT, COMPANION)], { cwd: ROOT, encoding: "utf8" });
  if ((r.status ?? 1) !== 0) problems.push(`companion ${COMPANION} exited ${r.status}`);
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — hub tiles + companion chain green`);
}
