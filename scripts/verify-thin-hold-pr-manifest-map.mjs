#!/usr/bin/env node
/** @independent-input docs/module-completion/accounting.json — map entries must bind real manifest ids. */
/**
 * GUARD: ACCT-F10 — thin HOLD PRs #3423–#3429 must map to real accounting.json items;
 * credited_for_n requires neon_economics_applied + applied proof (MERGED≠APPLIED).
 *
 * Machine map: docs/trackers/ACCT-F10-THIN-HOLD-PR-MANIFEST-MAP-2026-07-25.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifests } from "./verify-module-completion.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAP_PATH = path.join(
  ROOT,
  "docs/trackers/ACCT-F10-THIN-HOLD-PR-MANIFEST-MAP-2026-07-25.json"
);
const REQUIRED_PRS = [3423, 3424, 3425, 3426, 3427, 3428, 3429];
const LABEL = "verify-thin-hold-pr-manifest-map";
const SELFTEST = process.argv.includes("--selftest");

export function loadMap(mapPath = MAP_PATH) {
  if (!fs.existsSync(mapPath)) {
    throw new Error(`missing map file: ${path.relative(ROOT, mapPath)}`);
  }
  return JSON.parse(fs.readFileSync(mapPath, "utf8"));
}

export function accountingItemIds(dir) {
  const acct = loadManifests(dir).find((m) => m.data.module === "accounting");
  if (!acct) throw new Error("docs/module-completion/accounting.json missing");
  return new Set((acct.data.items || []).map((it) => it.id));
}

export function assertThinHoldPrManifestMap(map, itemIds = null) {
  const failures = [];
  const ids = itemIds ?? accountingItemIds();

  if (!map || typeof map !== "object") {
    failures.push("map must be an object");
    return failures;
  }
  if (!Array.isArray(map.entries)) {
    failures.push("map.entries[] required");
    return failures;
  }

  const seen = new Set();
  for (const entry of map.entries) {
    const pr = entry?.pr;
    if (typeof pr !== "number") {
      failures.push("entry missing numeric pr");
      continue;
    }
    if (seen.has(pr)) failures.push(`duplicate pr ${pr}`);
    seen.add(pr);

    const itemId = entry.manifest_item_id;
    if (itemId != null) {
      if (typeof itemId !== "string" || !ids.has(itemId)) {
        failures.push(`PR #${pr}: manifest_item_id ${itemId} not in accounting.json`);
      }
    } else if (!entry.cross_module_bind?.item) {
      failures.push(`PR #${pr}: null manifest_item_id requires cross_module_bind.item`);
    }

    if (entry.credited_for_n === true) {
      if (entry.neon_economics_applied !== true) {
        failures.push(`PR #${pr}: credited_for_n without neon_economics_applied`);
      }
      const proof =
        entry.neon_evidence ||
        entry.applied_proof ||
        (entry.structural_on_prod_sha === true ? null : null);
      if (!proof || String(proof).trim().length < 8) {
        failures.push(`PR #${pr}: credited_for_n without APPLIED neon evidence`);
      }
    }

    if (entry.credited_for_n === true && entry.manifest_status_at_map === "FAIL") {
      failures.push(`PR #${pr}: credited_for_n illegal while manifest item still FAIL`);
    }
  }

  for (const pr of REQUIRED_PRS) {
    if (!seen.has(pr)) failures.push(`missing required PR #${pr} in map.entries`);
  }

  if (map.summary?.credited_for_n > 0) {
    const credited = map.entries.filter((e) => e.credited_for_n === true).length;
    if (credited !== map.summary.credited_for_n) {
      failures.push(
        `summary.credited_for_n=${map.summary.credited_for_n} but entries show ${credited}`
      );
    }
  }

  return failures;
}

if (SELFTEST) {
  const ids = accountingItemIds();
  const realMap = loadMap();
  const passFailures = assertThinHoldPrManifestMap(realMap, ids);
  if (passFailures.length) {
    console.error(`${LABEL} --selftest FAIL: real map should pass`);
    for (const f of passFailures) console.error(`  - ${f}`);
    process.exit(1);
  }

  const uncreditedBad = JSON.parse(JSON.stringify(realMap));
  const target = uncreditedBad.entries.find((e) => e.pr === 3423);
  target.credited_for_n = true;
  target.neon_economics_applied = false;
  const uncreditedFailures = assertThinHoldPrManifestMap(uncreditedBad, ids);
  if (!uncreditedFailures.some((f) => f.includes("3423") && f.includes("neon_economics_applied"))) {
    console.error(`${LABEL} --selftest FAIL: expected uncredited PR credit to be flagged`);
    process.exit(1);
  }

  const appliedGood = JSON.parse(JSON.stringify(realMap));
  const appliedEntry = appliedGood.entries.find((e) => e.pr === 3427);
  appliedEntry.credited_for_n = true;
  appliedEntry.neon_economics_applied = true;
  appliedEntry.neon_evidence =
    "Neon lucia 2026-07-25: bill_payments reverse drill density verified TRANSP+USMCA";
  appliedEntry.manifest_status_at_map = "PASS";
  const appliedFailures = assertThinHoldPrManifestMap(appliedGood, ids);
  if (appliedFailures.some((f) => f.includes("3427"))) {
    console.error(`${LABEL} --selftest FAIL: applied+mapped shape should NOT flag`);
    for (const f of appliedFailures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(`${LABEL} --selftest: PASS`);
  process.exit(0);
}

try {
  const map = loadMap();
  const failures = assertThinHoldPrManifestMap(map);
  if (failures.length) {
    console.error(`${LABEL}: FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  const bound = map.entries.filter((e) => e.manifest_item_id).length;
  const credited = map.entries.filter((e) => e.credited_for_n).length;
  console.log(
    `${LABEL}: PASS (${map.entries.length} PRs mapped; ${bound} accounting binds; ${credited} credited for N)`
  );
} catch (error) {
  console.error(`${LABEL}: FAIL — ${error.message}`);
  process.exit(1);
}
