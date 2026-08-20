#!/usr/bin/env node
/**
 * verify-lists-names-master-dead-tombstone-link.mjs
 * LV-LISTS-NAMES-MASTER-DEAD-TOMBSTONE-LINK
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-lists-names-master-dead-tombstone-link";
const PAGE = "apps/frontend/src/pages/lists/names/NamesMasterHub.tsx";

function read() {
  return fs.readFileSync(path.join(process.cwd(), PAGE), "utf8");
}

function analyze(src) {
  const failures = [];
  if (!/isUnresolvedEntityTombstone/.test(src)) {
    failures.push("NamesMasterHub must gate EntityLink with isUnresolvedEntityTombstone");
  }
  if (!/names-master-record-tombstone/.test(src)) {
    failures.push("must render names-master-record-tombstone for unresolved rows");
  }
  if (!/canonicalEntityRoute\(row, kind\)/.test(src) || !/expected === row\.link_to_module_page/.test(src)) {
    failures.push("Name EntityLink must require the backend route to match the canonical entity id route");
  }
  if (!/names-master-noncanonical-record/.test(src)) {
    failures.push("unlinked QBO mirror rows must render a noninteractive name");
  }
  if (!/names-master-open-tombstone/.test(src)) {
    failures.push("unresolved identities must not retain an active Open drill");
  }
  if (/EntityLink data-testid="names-master-record-link" kind=\{kind\} id=\{row\.entity_id\} label=\{row\.display_name\}/.test(src)) {
    failures.push("must not EntityLink raw display_name without tombstone gate");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const pagePath = path.join(process.cwd(), PAGE);
  const original = fs.readFileSync(pagePath, "utf8");
  try {
    const mutations = [
      ["tombstone predicate", /isUnresolvedEntityTombstone/g, "NO_TOMBSTONE"],
      ["canonical route comparison", /expected === row\.link_to_module_page/, "true"],
      ["noncanonical marker", /names-master-noncanonical-record/g, "names-master-record-link"],
      ["Open tombstone", /names-master-open-tombstone/g, "names-master-open-link"],
    ];
    for (const [name, pattern, replacement] of mutations) {
      const bad = original.replace(pattern, replacement);
      if (bad === original) fail(`selftest mutation did not apply: ${name}`);
      fs.writeFileSync(pagePath, bad);
      const planted = analyze(read());
      if (!planted.length) fail(`selftest expected fail: ${name}`);
    }
  } finally {
    fs.writeFileSync(pagePath, original);
  }
  const good = analyze(read());
  if (good.length) fail(`selftest expected GOOD: ${good.join("; ")}`);
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = analyze(read());
if (failures.length) fail(failures.join("; "));
console.log(`${LABEL} PASS — Names Master Hub tombstones noninteractive`);
