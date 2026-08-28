#!/usr/bin/env node
/**
 * Ratchet for LINK-F5171's entity-column honesty follow-on: customer guards may only award
 * Built credit to the exact leaves their assertions inspect. Aggregate census guards remain
 * useful verification, but must not paint the whole customer column green.
 */
import fs from "node:fs";

const targets = {
  "scripts/verify-wave-a-customer-all-modules.mjs": null,
  "scripts/verify-wave-a-customer-column.mjs":
    '"leafRe":"^(role\\\\.dispatcher|report\\\\.dispatch_margin|submit\\\\.queue)$"',
  "scripts/verify-wave-a-customer-remainder-column.mjs":
    '"leaves":["hub.names_search","cargo_claims.list","cargo_claims.create","complaints.list"]',
};
const feedFile = "docs/specs/scoreboard/wire-sprint-built.json";

export function audit(sources) {
  const failures = [];
  for (const [file, exactLeafRe] of Object.entries(targets)) {
    const source = sources[file] ?? "";
    if (/@matrix-built[^\n]*"cols":\[[^\]]*"customer"[^\]]*\][^\n]*"leafRe":"\.\*"/.test(source)) {
      failures.push(`${file}: customer Built claim still uses the whole-column .* blanket`);
    }
    if (exactLeafRe === null) {
      if (/@matrix-built[^\n]*"cols":\[[^\]]*"customer"/.test(source)) {
        failures.push(`${file}: aggregate census must not award customer Built credit`);
      }
    } else if (!source.includes(exactLeafRe)) {
      failures.push(`${file}: exact leaf-specific customer Built claim is missing`);
    }
  }
  const feed = JSON.parse(sources[feedFile] ?? '{"entries":[]}');
  if ((feed.entries ?? []).some((entry) => entry.task === "WAVE-A-customer-all-modules")) {
    failures.push(`${feedFile}: disproven all-module customer Built feed entry must stay removed`);
  }
  return failures;
}

const files = [...Object.keys(targets), feedFile];
const sources = Object.fromEntries(files.map((file) => [file, fs.readFileSync(file, "utf8")]));
if (process.argv.includes("--selftest")) {
  const blanket = structuredClone(sources);
  blanket["scripts/verify-wave-a-customer-column.mjs"] = blanket["scripts/verify-wave-a-customer-column.mjs"]
    .replace(/"leafRe":"[^"]+"/, '"leafRe":".*"');
  if (!audit(blanket).some((failure) => failure.includes("blanket"))) {
    console.error("verify-wave-a-customer-built-claims-leaf-specific SELFTEST FAIL — blanket mutation escaped");
    process.exit(1);
  }
  const aggregate = structuredClone(sources);
  aggregate["scripts/verify-wave-a-customer-all-modules.mjs"] =
    '/** @matrix-built {"modules":["accounting"],"cols":["customer"],"leafRe":"^payments$"} */\n' +
    aggregate["scripts/verify-wave-a-customer-all-modules.mjs"];
  if (!audit(aggregate).some((failure) => failure.includes("aggregate census"))) {
    console.error("verify-wave-a-customer-built-claims-leaf-specific SELFTEST FAIL — aggregate-credit mutation escaped");
    process.exit(1);
  }
  const exactLeaves = structuredClone(sources);
  exactLeaves["scripts/verify-wave-a-customer-remainder-column.mjs"] =
    exactLeaves["scripts/verify-wave-a-customer-remainder-column.mjs"].replace('"complaints.list"', '"complaints.list.removed"');
  if (!audit(exactLeaves).some((failure) => failure.includes("exact leaf-specific"))) {
    console.error("verify-wave-a-customer-built-claims-leaf-specific SELFTEST FAIL — exact-leaves mutation escaped");
    process.exit(1);
  }
  const feed = structuredClone(sources);
  const parsedFeed = JSON.parse(feed[feedFile]);
  parsedFeed.entries.push({ task: "WAVE-A-customer-all-modules", cols: ["customer"], leafRe: ".*" });
  feed[feedFile] = JSON.stringify(parsedFeed);
  if (!audit(feed).some((failure) => failure.includes("feed entry"))) {
    console.error("verify-wave-a-customer-built-claims-leaf-specific SELFTEST FAIL — feed-entry mutation escaped");
    process.exit(1);
  }
  console.log("verify-wave-a-customer-built-claims-leaf-specific SELFTEST PASS — blanket, exact-leaves, aggregate-credit, and feed-entry mutations detected");
  process.exit(0);
}

const failures = audit(sources);
if (failures.length) {
  console.error(`verify-wave-a-customer-built-claims-leaf-specific FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log("verify-wave-a-customer-built-claims-leaf-specific PASS — customer Built credit is exact-leaf only");
