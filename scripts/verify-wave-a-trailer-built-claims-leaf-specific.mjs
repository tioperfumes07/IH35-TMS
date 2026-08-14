#!/usr/bin/env node
/** Trailer-column Built honesty: aggregate census earns no credit and child credit stays exact. */
import fs from "node:fs";

const aggregateFile = "scripts/verify-wave-a-trailer-all-modules.mjs";
const exactFile = "scripts/verify-wave-a-trailer-column.mjs";
const exactLeafRe = '"leafRe":"^(dispatch\\\\.modal\\\\.(book_load_modal_v4|quick_assign)|damage_reports\\\\.(list|create)|cargo_claims\\\\.create)$"';
const feedFile = "docs/specs/scoreboard/wire-sprint-built.json";

export function audit(sources) {
  const failures = [];
  for (const [file, source] of Object.entries(sources)) {
    if (/@matrix-built[^\n]*"cols":\[[^\]]*"trailer"[^\]]*\][^\n]*"leafRe":"\.\*"/.test(source)) failures.push(`${file}: trailer Built claim still uses the whole-column .* blanket`);
  }
  if (/@matrix-built[^\n]*"cols":\[[^\]]*"trailer"/.test(sources[aggregateFile] ?? "")) failures.push(`${aggregateFile}: aggregate census must not award trailer Built credit`);
  if (!(sources[exactFile] ?? "").includes(exactLeafRe)) failures.push(`${exactFile}: exact trailer Built claim is missing`);
  const feed = JSON.parse(sources[feedFile] ?? '{"entries":[]}');
  if ((feed.entries ?? []).some((entry) => entry.task === "WAVE-A-trailer-all-modules")) failures.push(`${feedFile}: disproven all-module trailer Built feed entry must stay removed`);
  return failures;
}

const sources = { [aggregateFile]: fs.readFileSync(aggregateFile, "utf8"), [exactFile]: fs.readFileSync(exactFile, "utf8"), [feedFile]: fs.readFileSync(feedFile, "utf8") };
if (process.argv.includes("--selftest")) {
  const blanket = structuredClone(sources);
  blanket[exactFile] = blanket[exactFile].replace(/"leafRe":"[^"]+"/, '"leafRe":".*"');
  if (!audit(blanket).some((failure) => failure.includes("blanket"))) { console.error("verify-wave-a-trailer-built-claims-leaf-specific SELFTEST FAIL — blanket mutation escaped"); process.exit(1); }
  const aggregate = structuredClone(sources);
  aggregate[aggregateFile] = '/** @matrix-built {"modules":["fleet"],"cols":["trailer"],"leafRe":"^trailer.profile.assignment$"} */\n' + aggregate[aggregateFile];
  if (!audit(aggregate).some((failure) => failure.includes("aggregate census"))) { console.error("verify-wave-a-trailer-built-claims-leaf-specific SELFTEST FAIL — aggregate-credit mutation escaped"); process.exit(1); }
  const feed = structuredClone(sources);
  const parsedFeed = JSON.parse(feed[feedFile]);
  parsedFeed.entries.push({ task: "WAVE-A-trailer-all-modules", cols: ["trailer"], leafRe: ".*" });
  feed[feedFile] = JSON.stringify(parsedFeed);
  if (!audit(feed).some((failure) => failure.includes("feed entry"))) { console.error("verify-wave-a-trailer-built-claims-leaf-specific SELFTEST FAIL — feed-entry mutation escaped"); process.exit(1); }
  console.log("verify-wave-a-trailer-built-claims-leaf-specific SELFTEST PASS — blanket, aggregate-credit, and feed-entry mutations detected"); process.exit(0);
}
const failures = audit(sources);
if (failures.length) { console.error(`verify-wave-a-trailer-built-claims-leaf-specific FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`); process.exit(1); }
console.log("verify-wave-a-trailer-built-claims-leaf-specific PASS — trailer Built credit is exact-leaf only");
