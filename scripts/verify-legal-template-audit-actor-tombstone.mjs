#!/usr/bin/env node
/** @matrix-built {"modules":["legal"],"cols":["connectivity","reverse_link"],"leafRe":"^templates\\.detail$","task":"ACCT-F5665-legal-template-audit-actor","vertical":"column-wave"} */
import fs from "node:fs";
import process from "node:process";
const file = "apps/frontend/src/pages/legal/templates/LegalTemplateDetailPage.tsx";
const source = fs.readFileSync(file, "utf8");
function verify(text) {
  const failures = [];
  if (!text.includes('import { EntityLinkOrTombstone }')) failures.push("tombstone primitive missing");
  if (!text.includes('<EntityLinkOrTombstone kind="user" id={row.actor_user_id} name={row.actor_name} noun="User"')) failures.push("actor audit drill is not tombstone-safe");
  if (!text.includes('if (row.actor_user_id)')) failures.push("system/non-user audit branch missing");
  if (!text.includes('return auditActorLabel(row)')) failures.push("system actor fallback missing");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("EntityLinkOrTombstone kind=\"user\"", "EntityLink kind=\"user\""),
    source.replace("name={row.actor_name}", "name={row.actor_user_id}"),
    source.replace("return auditActorLabel(row);", 'return "User";'),
  ];
  mutations.forEach((mutation, index) => { if (verify(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`); });
  console.log("verify-legal-template-audit-actor-tombstone SELFTEST PASS (3/3)");
  process.exit(0);
}
const failures = verify(source);
if (failures.length) { failures.forEach((failure) => console.error(`FAIL: ${failure}`)); process.exit(1); }
console.log("verify-legal-template-audit-actor-tombstone PASS — resolved users drill and unresolved actors remain tombstones");
