#!/usr/bin/env node
/** Load-column Built honesty: aggregate census earns no credit and child credit stays exact. */
import fs from "node:fs";

const aggregateFile = "scripts/verify-wave-a-load-all-modules.mjs";
const exactFile = "scripts/verify-wave-a-load-column.mjs";
const entityLinkFile = "apps/frontend/src/components/shared/EntityLink.tsx";
const queuePageFile = "apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx";
const exactLeafRe = '"leafRe":"^(expenses\\\\.create|load\\\\.drawer\\\\.pre_settlement|dispatch\\\\.wizard\\\\.border_crossing_wizard_page|cargo_claims\\\\.create|report\\\\.dispatch_margin)$"';

export function audit(sources) {
  const failures = [];
  for (const [file, source] of Object.entries(sources)) {
    if (/@matrix-built[^\n]*"cols":\[[^\]]*"load"[^\]]*\][^\n]*"leafRe":"\.\*"/.test(source)) failures.push(`${file}: load Built claim still uses the whole-column .* blanket`);
  }
  if (/@matrix-built[^\n]*"cols":\[[^\]]*"load"/.test(sources[aggregateFile] ?? "")) failures.push(`${aggregateFile}: aggregate census must not award load Built credit`);
  if (!(sources[exactFile] ?? "").includes(exactLeafRe)) failures.push(`${exactFile}: exact load Built claim is missing`);
  if (!/case "factoring_queue_load":[\s\S]{0,100}\?queue_record_id=\$\{id\}/.test(sources[entityLinkFile] ?? "")) failures.push(`${entityLinkFile}: factoring queue record must use its workflow-specific query key`);
  if (!/searchParams\.get\("queue_record_id"\) \?\? searchParams\.get\("load_id"\)/.test(sources[queuePageFile] ?? "")) failures.push(`${queuePageFile}: must read canonical queue record key and legacy load_id bookmarks`);
  return failures;
}

const files = [aggregateFile, exactFile, entityLinkFile, queuePageFile];
const sources = Object.fromEntries(files.map((file) => [file, fs.readFileSync(file, "utf8")]));
if (process.argv.includes("--selftest")) {
  const blanket = structuredClone(sources);
  blanket[exactFile] = blanket[exactFile].replace(/"leafRe":"[^"]+"/, '"leafRe":".*"');
  if (!audit(blanket).some((failure) => failure.includes("blanket"))) { console.error("verify-wave-a-load-built-claims-leaf-specific SELFTEST FAIL — blanket mutation escaped"); process.exit(1); }
  const aggregate = structuredClone(sources);
  aggregate[aggregateFile] = '/** @matrix-built {"modules":["dispatch"],"cols":["load"],"leafRe":"^home.list$"} */\n' + aggregate[aggregateFile];
  if (!audit(aggregate).some((failure) => failure.includes("aggregate census"))) { console.error("verify-wave-a-load-built-claims-leaf-specific SELFTEST FAIL — aggregate-credit mutation escaped"); process.exit(1); }
  const queueKey = structuredClone(sources);
  queueKey[entityLinkFile] = queueKey[entityLinkFile].replace("?queue_record_id=${id}", "?load_id=${id}");
  if (!audit(queueKey).some((failure) => failure.includes("workflow-specific query key"))) { console.error("verify-wave-a-load-built-claims-leaf-specific SELFTEST FAIL — queue-key mutation escaped"); process.exit(1); }
  console.log("verify-wave-a-load-built-claims-leaf-specific SELFTEST PASS — blanket, aggregate-credit, and queue-key mutations detected"); process.exit(0);
}
const failures = audit(sources);
if (failures.length) { console.error(`verify-wave-a-load-built-claims-leaf-specific FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`); process.exit(1); }
console.log("verify-wave-a-load-built-claims-leaf-specific PASS — load Built credit is exact-leaf only");
