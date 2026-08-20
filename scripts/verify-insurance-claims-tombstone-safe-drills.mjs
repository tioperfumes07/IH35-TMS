#!/usr/bin/env node
/** @matrix-built {"modules":["insurance"],"cols":["driver","unit","trailer","load","connectivity","reverse_link"],"leafRe":"^claims\\.list$","task":"ACCT-F5664-insurance-claim-tombstones","vertical":"column-wave"} */
import fs from "node:fs";
import process from "node:process";
const file = "apps/frontend/src/pages/insurance/ClaimsTab.tsx";
const source = fs.readFileSync(file, "utf8");
const bindings = [
  ['<EntityLinkOrTombstone kind="insurance_policy" id={claim.policy_id} name={claim.policy_display_id} noun="Policy"', "list policy"],
  ['<EntityLinkOrTombstone kind="unit" id={claim.unit_id} name={claim.unit_display_id} noun="Unit"', "list unit"],
  ['<EntityLinkOrTombstone kind="trailer" id={claim.trailer_id} name={claim.trailer_display_id} noun="Trailer"', "list trailer"],
  ['<EntityLinkOrTombstone kind="driver" id={claim.driver_id} name={claim.driver_display_name} noun="Driver"', "list driver"],
  ['<EntityLinkOrTombstone kind="load" id={claim.load_id} name={claim.load_display_id} noun="Load"', "list load"],
  ['<EntityLinkOrTombstone kind="driver" id={graph.claim.driver_id} name={graph.claim.driver_display_name} noun="Driver"', "graph driver"],
  ['<EntityLinkOrTombstone kind="load" id={graph.claim.load_id} name={graph.claim.load_display_id} noun="Load"', "graph load"],
  ['<EntityLinkOrTombstone kind="unit" id={graph.claim.unit_id} name={graph.claim.unit_display_id} noun="Unit"', "graph unit"],
  ['<EntityLinkOrTombstone kind="trailer" id={graph.claim.trailer_id} name={graph.claim.trailer_display_id} noun="Trailer"', "graph trailer"],
];
function verify(text) {
  const failures = [];
  if (!text.includes('import { EntityLinkOrTombstone }')) failures.push("governed tombstone primitive is not imported");
  for (const [binding, label] of bindings) if (!text.includes(binding)) failures.push(`${label} is not tombstone-safe`);
  return failures;
}
if (process.argv.includes("--selftest")) {
  bindings.forEach(([binding], index) => { if (verify(source.replace(binding, binding.replace("EntityLinkOrTombstone", "EntityLink"))).length === 0) throw new Error(`mutation ${index + 1} escaped`); });
  const mutation = source.replace(bindings[1][0], '<EntityLink kind="unit" id={claim.unit_id} label={entityLabel(claim.unit_display_id, claim.unit_id, "Unit")}');
  if (verify(mutation).length === 0) throw new Error("active tombstone mutation escaped");
  console.log(`verify-insurance-claims-tombstone-safe-drills SELFTEST PASS (${bindings.length + 1}/${bindings.length + 1})`);
  process.exit(0);
}
const failures = verify(source);
if (failures.length) { failures.forEach((failure) => console.error(`FAIL: ${failure}`)); process.exit(1); }
console.log("verify-insurance-claims-tombstone-safe-drills PASS — list and graph identities reject active unresolved links");
