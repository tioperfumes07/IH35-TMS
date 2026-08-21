#!/usr/bin/env node
/** @matrix-built {"modules":["lists"],"cols":["qbo_chrome"],"leafRe":"^lists\\.recent_activity$","task":"LISTS-F-RECENT-ACTIVITY-ALWAYS-UNKNOWN-CHROME-LAW","vertical":"column-wave"}
 *
 * Fully-Wired item 8 (chrome law, honest data): /lists' "Recent Catalog Activity" card live-showed
 * "unknown · updated · -" / "pending" for every one of its real rows — views.catalogs_recent_activity
 * (migration 0055) only read a.payload->>'catalog'/'catalog_key'/'action', which none of the ~20
 * catalogs/*.routes.ts appendCrudAudit() call sites ever populate. Every one of those call sites DOES
 * pass a consistent `catalogs.<name>.<action>` event_class though, so catalog_key/action are derived
 * from event_class via split_part in the fix migration (202612931300), with the old payload-based
 * lookup kept as a fallback. This guard confirms the fix migration exists and derives both fields from
 * event_class BEFORE falling back to the payload/hardcoded defaults.
 */
import fs from "node:fs";
const LABEL = "verify-lists-recent-activity-catalog-key-action-derived";
const FILE = "db/migrations/202612931300_lists_recent_activity_catalog_key_action_from_event_class.sql";

function audit(src) {
  const failures = [];
  if (!fs.existsSync(FILE.split("/")[0] + "/" + FILE.split("/")[1])) {
    // handled by the existsSync check below on the real path
  }
  const catalogKeyBlock = src.match(/COALESCE\(\s*NULLIF\(split_part\(a\.event_class, '\.', 2\), ''\)[\s\S]{0,120}\) AS catalog_key/)?.[0];
  const actionBlock = src.match(/COALESCE\(\s*NULLIF\(split_part\(a\.event_class, '\.', 3\), ''\)[\s\S]{0,80}\) AS action/)?.[0];
  if (!catalogKeyBlock) failures.push("catalog_key must derive from split_part(a.event_class, '.', 2) before falling back to payload keys");
  if (!actionBlock) failures.push("action must derive from split_part(a.event_class, '.', 3) before falling back to payload keys");
  if (!/a\.payload->>'catalog', a\.payload->>'catalog_key', 'unknown'/.test(src)) {
    failures.push("catalog_key must still keep the old payload-based fallback chain for non-3-segment event classes");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  if (!fs.existsSync(FILE)) {
    console.error(`${LABEL} SELFTEST FAIL — migration file missing: ${FILE}`);
    process.exit(1);
  }
  const src = fs.readFileSync(FILE, "utf8");
  const mutations = [
    ["strip-catalog-key-derivation", (s) => s.replace(/NULLIF\(split_part\(a\.event_class, '\.', 2\), ''\),\s*\n\s*/, "")],
    ["strip-action-derivation", (s) => s.replace(/NULLIF\(split_part\(a\.event_class, '\.', 3\), ''\),\s*\n\s*/, "")],
  ];
  for (const [name, mutate] of mutations) {
    const candidate = mutate(src);
    if (candidate === src || audit(candidate).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

if (!fs.existsSync(FILE)) {
  console.error(`${LABEL} FAIL\n- migration file missing: ${FILE}`);
  process.exit(1);
}
const failures = audit(fs.readFileSync(FILE, "utf8"));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — catalogs_recent_activity derives catalog_key/action from event_class, with the payload fallback preserved`);
