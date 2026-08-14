#!/usr/bin/env node
/** Driver-column Built honesty: aggregate census earns no credit and child claims stay exact. */
import fs from "node:fs";

const aggregateFile = "scripts/verify-wave-a-driver-all-modules.mjs";
const exactClaims = {
  "scripts/verify-wave-a-driver-column.mjs":
    '"leafRe":"^(queues\\\\.trip_pairing|escrow_record\\\\.list|driver_scheduler\\\\.list)$"',
  "scripts/verify-wave-a-lists-driver-column.mjs":
    '"leafRe":"^catalog\\\\.drivers\\\\.teams\\\\.(list|create)$"',
};
const feedFile = "docs/specs/scoreboard/wire-sprint-built.json";

export function audit(sources) {
  const failures = [];
  for (const [file, source] of Object.entries(sources)) {
    if (/@matrix-built[^\n]*"cols":\[[^\]]*"driver"[^\]]*\][^\n]*"leafRe":"\.\*"/.test(source)) {
      failures.push(`${file}: driver Built claim still uses the whole-column .* blanket`);
    }
  }
  if (/@matrix-built[^\n]*"cols":\[[^\]]*"driver"/.test(sources[aggregateFile] ?? "")) {
    failures.push(`${aggregateFile}: aggregate census must not award driver Built credit`);
  }
  for (const [file, exactLeafRe] of Object.entries(exactClaims)) {
    if (!(sources[file] ?? "").includes(exactLeafRe)) failures.push(`${file}: exact driver Built claim is missing`);
  }
  const feed = JSON.parse(sources[feedFile] ?? '{"entries":[]}');
  if ((feed.entries ?? []).some((entry) => entry.task === "WAVE-A-driver-all-modules")) failures.push(`${feedFile}: disproven all-module driver Built feed entry must stay removed`);
  return failures;
}

const files = [aggregateFile, ...Object.keys(exactClaims), feedFile];
const sources = Object.fromEntries(files.map((file) => [file, fs.readFileSync(file, "utf8")]));
if (process.argv.includes("--selftest")) {
  const blanket = structuredClone(sources);
  const target = "scripts/verify-wave-a-driver-column.mjs";
  blanket[target] = blanket[target].replace(/"leafRe":"[^"]+"/, '"leafRe":".*"');
  if (!audit(blanket).some((failure) => failure.includes("blanket"))) {
    console.error("verify-wave-a-driver-built-claims-leaf-specific SELFTEST FAIL — blanket mutation escaped");
    process.exit(1);
  }
  const aggregate = structuredClone(sources);
  aggregate[aggregateFile] = '/** @matrix-built {"modules":["drivers"],"cols":["driver"],"leafRe":"^profiles.detail$"} */\n' + aggregate[aggregateFile];
  if (!audit(aggregate).some((failure) => failure.includes("aggregate census"))) {
    console.error("verify-wave-a-driver-built-claims-leaf-specific SELFTEST FAIL — aggregate-credit mutation escaped");
    process.exit(1);
  }
  const feed = structuredClone(sources);
  const parsedFeed = JSON.parse(feed[feedFile]);
  parsedFeed.entries.push({ task: "WAVE-A-driver-all-modules", cols: ["driver"], leafRe: ".*" });
  feed[feedFile] = JSON.stringify(parsedFeed);
  if (!audit(feed).some((failure) => failure.includes("feed entry"))) { console.error("verify-wave-a-driver-built-claims-leaf-specific SELFTEST FAIL — feed-entry mutation escaped"); process.exit(1); }
  console.log("verify-wave-a-driver-built-claims-leaf-specific SELFTEST PASS — blanket, aggregate-credit, and feed-entry mutations detected");
  process.exit(0);
}

const failures = audit(sources);
if (failures.length) {
  console.error(`verify-wave-a-driver-built-claims-leaf-specific FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log("verify-wave-a-driver-built-claims-leaf-specific PASS — driver Built credit is exact-leaf only");
