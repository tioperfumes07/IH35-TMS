#!/usr/bin/env node
/** Unit-column Built honesty: aggregate census earns no matrix credit; the child claim is exact. */
import fs from "node:fs";

const aggregateFile = "scripts/verify-wave-a-unit-all-modules.mjs";
const exactFile = "scripts/verify-wave-a-unit-column.mjs";
const exactLeafRe = '"leafRe":"^(report\\\\.(fuel_reconciliation|profit_per_truck)|fleet\\\\.hos_board|profiles\\\\.detail|dispatch\\\\.wizard\\\\.border_crossing_wizard_page|maintenance\\\\.modal\\\\.road_service_ticket|insurance\\\\.wizard\\\\.policy_create|safety_events\\\\.list)$"';
const feedFile = "docs/specs/scoreboard/wire-sprint-built.json";

export function audit(sources) {
  const failures = [];
  for (const [file, source] of Object.entries(sources)) {
    if (/@matrix-built[^\n]*"cols":\[[^\]]*"unit"[^\]]*\][^\n]*"leafRe":"\.\*"/.test(source)) {
      failures.push(`${file}: unit Built claim still uses the whole-column .* blanket`);
    }
  }
  if (/@matrix-built[^\n]*"cols":\[[^\]]*"unit"/.test(sources[aggregateFile] ?? "")) {
    failures.push(`${aggregateFile}: aggregate census must not award unit Built credit`);
  }
  if (!(sources[exactFile] ?? "").includes(exactLeafRe)) {
    failures.push(`${exactFile}: exact leaf-specific unit Built claim is missing`);
  }
  const feed = JSON.parse(sources[feedFile] ?? '{"entries":[]}');
  if ((feed.entries ?? []).some((entry) => entry.task === "WAVE-A-unit-all-modules")) failures.push(`${feedFile}: disproven all-module unit Built feed entry must stay removed`);
  return failures;
}

const sources = {
  [aggregateFile]: fs.readFileSync(aggregateFile, "utf8"),
  [exactFile]: fs.readFileSync(exactFile, "utf8"),
  [feedFile]: fs.readFileSync(feedFile, "utf8"),
};
if (process.argv.includes("--selftest")) {
  const blanket = structuredClone(sources);
  blanket[exactFile] = blanket[exactFile].replace(/"leafRe":"[^"]+"/, '"leafRe":".*"');
  if (!audit(blanket).some((failure) => failure.includes("blanket"))) {
    console.error("verify-wave-a-unit-built-claims-leaf-specific SELFTEST FAIL — blanket mutation escaped");
    process.exit(1);
  }
  const aggregate = structuredClone(sources);
  aggregate[aggregateFile] = '/** @matrix-built {"modules":["fleet"],"cols":["unit"],"leafRe":"^home.roster$"} */\n' + aggregate[aggregateFile];
  if (!audit(aggregate).some((failure) => failure.includes("aggregate census"))) {
    console.error("verify-wave-a-unit-built-claims-leaf-specific SELFTEST FAIL — aggregate-credit mutation escaped");
    process.exit(1);
  }
  const feed = structuredClone(sources);
  const parsedFeed = JSON.parse(feed[feedFile]);
  parsedFeed.entries.push({ task: "WAVE-A-unit-all-modules", cols: ["unit"], leafRe: ".*" });
  feed[feedFile] = JSON.stringify(parsedFeed);
  if (!audit(feed).some((failure) => failure.includes("feed entry"))) { console.error("verify-wave-a-unit-built-claims-leaf-specific SELFTEST FAIL — feed-entry mutation escaped"); process.exit(1); }
  console.log("verify-wave-a-unit-built-claims-leaf-specific SELFTEST PASS — blanket, aggregate-credit, and feed-entry mutations detected");
  process.exit(0);
}

const failures = audit(sources);
if (failures.length) {
  console.error(`verify-wave-a-unit-built-claims-leaf-specific FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log("verify-wave-a-unit-built-claims-leaf-specific PASS — unit Built credit is exact-leaf only");
