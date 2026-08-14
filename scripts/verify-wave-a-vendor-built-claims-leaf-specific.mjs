#!/usr/bin/env node
/** Vendor-column Built honesty: aggregate census earns no credit and child credit stays exact. */
import fs from "node:fs";

const aggregateFile = "scripts/verify-wave-a-vendor-all-modules.mjs";
const exactFile = "scripts/verify-wave-a-vendor-column.mjs";
const exactLeafRe = '"leafRe":"^(home\\\\.vendor_merges|nav\\\\.ar_ap_aging|report\\\\.ap_aging|bills\\\\.create\\\\.vendor|maintenance\\\\.modal\\\\.create_work_order)$"';

export function audit(sources) {
  const failures = [];
  for (const [file, source] of Object.entries(sources)) {
    if (/@matrix-built[^\n]*"cols":\[[^\]]*"vendor"[^\]]*\][^\n]*"leafRe":"\.\*"/.test(source)) {
      failures.push(`${file}: vendor Built claim still uses the whole-column .* blanket`);
    }
  }
  if (/@matrix-built[^\n]*"cols":\[[^\]]*"vendor"/.test(sources[aggregateFile] ?? "")) {
    failures.push(`${aggregateFile}: aggregate census must not award vendor Built credit`);
  }
  if (!(sources[exactFile] ?? "").includes(exactLeafRe)) failures.push(`${exactFile}: exact vendor Built claim is missing`);
  return failures;
}

const sources = {
  [aggregateFile]: fs.readFileSync(aggregateFile, "utf8"),
  [exactFile]: fs.readFileSync(exactFile, "utf8"),
};
if (process.argv.includes("--selftest")) {
  const blanket = structuredClone(sources);
  blanket[exactFile] = blanket[exactFile].replace(/"leafRe":"[^"]+"/, '"leafRe":".*"');
  if (!audit(blanket).some((failure) => failure.includes("blanket"))) {
    console.error("verify-wave-a-vendor-built-claims-leaf-specific SELFTEST FAIL — blanket mutation escaped");
    process.exit(1);
  }
  const aggregate = structuredClone(sources);
  aggregate[aggregateFile] = '/** @matrix-built {"modules":["vendors"],"cols":["vendor"],"leafRe":"^home.roster$"} */\n' + aggregate[aggregateFile];
  if (!audit(aggregate).some((failure) => failure.includes("aggregate census"))) {
    console.error("verify-wave-a-vendor-built-claims-leaf-specific SELFTEST FAIL — aggregate-credit mutation escaped");
    process.exit(1);
  }
  console.log("verify-wave-a-vendor-built-claims-leaf-specific SELFTEST PASS — blanket and aggregate-credit mutations detected");
  process.exit(0);
}

const failures = audit(sources);
if (failures.length) {
  console.error(`verify-wave-a-vendor-built-claims-leaf-specific FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log("verify-wave-a-vendor-built-claims-leaf-specific PASS — vendor Built credit is exact-leaf only");
