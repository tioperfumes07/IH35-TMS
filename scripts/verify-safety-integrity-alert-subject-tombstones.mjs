#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["driver","unit","vendor","connectivity","reverse_link"],"leafRe":"^safety\\.(drawer|parity)\\.integrity_alert_detail$","task":"ACCT-F5666-SAFETY-INTEGRITY-SUBJECT-TOMBSTONES","vertical":"column-wave"} */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/safety/components/IntegrityAlertDetailDrawer.tsx";
const live = fs.readFileSync(FILE, "utf8");

function failures(src) {
  const problems = [];
  for (const [kind, id, name, noun] of [
    ["driver", "subject_driver_id", "subject_driver_name", "Driver"],
    ["unit", "subject_unit_id", "subject_unit_number", "Unit"],
    ["vendor", "subject_vendor_id", "subject_vendor_name", "Vendor"],
  ]) {
    const binding = new RegExp(
      `<EntityLinkOrTombstone[\\s\\S]{0,180}kind="${kind}"[\\s\\S]{0,180}id=\\{alert\\.${id} == null \\? null : String\\(alert\\.${id}\\)\\}[\\s\\S]{0,180}name=\\{alert\\.${name}\\}[\\s\\S]{0,100}noun="${noun}"`,
    );
    if (!binding.test(src)) problems.push(`${kind} subject does not bind its exact company-scoped id/name pair through EntityLinkOrTombstone`);
  }
  if (/label=\{entityLabel\(alert\.subject_(driver_name|unit_number|vendor_name)/.test(src)) {
    problems.push("integrity subjects still use active UUID-fallback EntityLinks");
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    live.replace('kind="driver"', 'kind="unit"'),
    live.replace("name={alert.subject_unit_number}", "name={alert.subject_driver_name}"),
    live.replace('noun="Vendor"', 'noun="Driver"'),
  ];
  const missed = mutations.filter((src) => failures(src).length === 0).length;
  if (missed) throw new Error(`selftest missed ${missed}/3 planted defects`);
  console.log("verify-safety-integrity-alert-subject-tombstones selftest PASS (3/3)");
  process.exit(0);
}

const problems = failures(live);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("verify-safety-integrity-alert-subject-tombstones PASS");
