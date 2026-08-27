#!/usr/bin/env node
// LISTS-DRIVERS-DOMAIN-DUPLICATE-CATALOG-TILES — guard
//
// AllCatalogsMap.tsx's "drivers" domain listed 5 catalogs TWICE each, with the identical catalogKey both
// times (CDL Endorsements/"endorsements", CDL Restrictions/"restrictions", Employment Status(es)/
// "employment-status", Medical Card Status(es)/"medical-card-status", Termination Reasons/
// "termination-reasons" — the last one byte-identical name both times). Live-confirmed on
// /lists/catalogs (Catalog Index → Drivers domain): the Lists & Catalogs hub showed each of these 5 as
// TWO separate cards, both resolving to the exact same catalogKey/data — pure UI duplication/confusion,
// not two distinct catalogs. Fix: removed the second occurrence of each, keeping one tile per catalog.
// This guard fails if any catalogKey reappears more than once anywhere in the file (the general
// invariant a duplicate tile violates), not just the 5 specific ones found.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const HUB_FILE = "apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx";

export function check(text) {
  const failures = [];
  const keys = [...text.matchAll(/catalogKey:\s*"([^"]+)"/g)].map((m) => m[1]);
  const counts = new Map();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const [key, count] of counts) {
    if (count > 1) failures.push(`${HUB_FILE} catalogKey "${key}" appears ${count} times — duplicate hub tile`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, HUB_FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: lists-drivers-domain-no-duplicate-catalog-tiles");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: every AllCatalogsMap catalogKey appears exactly once — no duplicate hub tiles");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, HUB_FILE), "utf8");
  const offender = text.replace(
    '{ name: "License Classes", description: "CDL license class reference codes", live: true, catalogKey: "license-classes" },',
    '{ name: "License Classes", description: "CDL license class reference codes", live: true, catalogKey: "license-classes" },\n      { name: "CDL Endorsements", description: "Endorsement code reference set", live: true, catalogKey: "endorsements" },'
  );
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (re-duplicated CDL Endorsements) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): planted duplicate correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
