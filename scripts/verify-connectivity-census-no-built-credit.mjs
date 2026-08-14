#!/usr/bin/env node
/** Route/surface census must never award the deeper connectivity column Built credit. */
import fs from "node:fs";

const target = "scripts/verify-wave-b-connectivity-all-modules.mjs";

export function audit(source) {
  const failures = [];
  if (/@matrix-built[^\n]*"cols":\[[^\]]*"connectivity"/.test(source)) failures.push(`${target}: route/surface census must not award connectivity Built credit`);
  if (!/export function auditConnectivity\(/.test(source) || !source.includes("surface://") || !source.includes("matchAll(/\\bpath\\s*[:=]")) failures.push(`${target}: dynamic route/surface census contract was weakened`);
  return failures;
}

const source = fs.readFileSync(target, "utf8");
if (process.argv.includes("--selftest")) {
  const planted = '/** @matrix-built {"modules":["dispatch"],"cols":["connectivity"],"leafRe":".*"} */\n' + source;
  if (!audit(planted).some((failure) => failure.includes("must not award"))) { console.error("verify-connectivity-census-no-built-credit SELFTEST FAIL — Built-credit mutation escaped"); process.exit(1); }
  const weakened = source.replace("export function auditConnectivity(", "function auditConnectivity(");
  if (!audit(weakened).some((failure) => failure.includes("weakened"))) { console.error("verify-connectivity-census-no-built-credit SELFTEST FAIL — census mutation escaped"); process.exit(1); }
  console.log("verify-connectivity-census-no-built-credit SELFTEST PASS — Built-credit and census mutations detected"); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`verify-connectivity-census-no-built-credit FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`); process.exit(1); }
console.log("verify-connectivity-census-no-built-credit PASS — route existence remains a census, not connectivity Built proof");
