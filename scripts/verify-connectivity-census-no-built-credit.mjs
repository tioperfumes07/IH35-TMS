#!/usr/bin/env node
/** Route/surface census must never award the deeper connectivity column Built credit. */
import fs from "node:fs";

const target = "scripts/verify-wave-b-connectivity-all-modules.mjs";
const feedFile = "docs/specs/scoreboard/wire-sprint-built.json";

export function audit(source, feedSource) {
  const failures = [];
  if (/@matrix-built[^\n]*"cols":\[[^\]]*"connectivity"/.test(source)) failures.push(`${target}: route/surface census must not award connectivity Built credit`);
  if (!/export function auditConnectivity\(/.test(source) || !source.includes("surface://") || !source.includes("matchAll(/\\bpath\\s*[:=]")) failures.push(`${target}: dynamic route/surface census contract was weakened`);
  const feed = JSON.parse(feedSource ?? '{"entries":[]}');
  if ((feed.entries ?? []).some((entry) => entry.task === "WAVE-B-connectivity-all-modules")) failures.push(`${feedFile}: route-only connectivity Built feed entry must stay removed`);
  return failures;
}

const source = fs.readFileSync(target, "utf8");
const feedSource = fs.readFileSync(feedFile, "utf8");
if (process.argv.includes("--selftest")) {
  const planted = '/** @matrix-built {"modules":["dispatch"],"cols":["connectivity"],"leafRe":".*"} */\n' + source;
  if (!audit(planted, feedSource).some((failure) => failure.includes("must not award"))) { console.error("verify-connectivity-census-no-built-credit SELFTEST FAIL — Built-credit mutation escaped"); process.exit(1); }
  const weakened = source.replace("export function auditConnectivity(", "function auditConnectivity(");
  if (!audit(weakened, feedSource).some((failure) => failure.includes("weakened"))) { console.error("verify-connectivity-census-no-built-credit SELFTEST FAIL — census mutation escaped"); process.exit(1); }
  const plantedFeed = JSON.parse(feedSource);
  plantedFeed.entries.push({ task: "WAVE-B-connectivity-all-modules", cols: ["connectivity"], leafRe: ".*" });
  if (!audit(source, JSON.stringify(plantedFeed)).some((failure) => failure.includes("feed entry"))) { console.error("verify-connectivity-census-no-built-credit SELFTEST FAIL — feed-entry mutation escaped"); process.exit(1); }
  console.log("verify-connectivity-census-no-built-credit SELFTEST PASS — Built-credit, census, and feed-entry mutations detected"); process.exit(0);
}
const failures = audit(source, feedSource);
if (failures.length) { console.error(`verify-connectivity-census-no-built-credit FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`); process.exit(1); }
console.log("verify-connectivity-census-no-built-credit PASS — route existence remains a census, not connectivity Built proof");
