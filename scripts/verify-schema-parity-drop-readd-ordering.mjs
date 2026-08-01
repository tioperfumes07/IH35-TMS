#!/usr/bin/env node
/**
 * ACCT-F83 — the schema-parity DDL parser must apply ADD/DROP COLUMN in SOURCE ORDER, so a legitimate
 * drop-and-re-add keeps the column.
 *
 * WHY (verified on prod br-fancy-credit-akjnd07a, 2026-08-01):
 * The parser ran two passes per file — every ADD, then every DROP — which is the reverse of Postgres
 * for a drop-and-re-add. Migration 0213 does exactly that on the QBO mirrors:
 *     ALTER TABLE mdata.qbo_vendors DROP COLUMN IF EXISTS raw_payload, DROP COLUMN IF EXISTS last_seen_at;
 *     ALTER TABLE mdata.qbo_vendors ADD  COLUMN IF NOT EXISTS raw_payload jsonb, ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
 * so the baseline lost raw_payload on 8 mirror tables while prod has it NOT NULL on all 8. A second bug
 * masked the first: the old DROP regex anchored on `ALTER TABLE <rel> DROP COLUMN <col>` and matched
 * only the FIRST column of a multi-column DROP, so last_seen_at (second) survived by accident. Fixing
 * the multi-drop miss ALONE would have made it worse — both columns would have been dropped. Ordering
 * is the real fix.
 *
 * The damage was not theoretical: verify-sql-column-existence (verify-step 142) flagged a
 * verified-correct reference as a phantom column, and an entry had already been filed in its allowlist
 * — a file whose own contract says "every key is a live defect until removed". A baseline that
 * understates prod converts working code into recorded defects.
 *
 * TWO INVARIANTS:
 *   1. STRUCTURAL — the parser collects ADD/DROP as positioned events and applies them sorted by
 *      position. Two unordered passes cannot express drop-and-re-add.
 *   2. OUTCOME — the regenerated baseline carries raw_payload on every qbo_* mirror that has it in
 *      prod. This is the invariant that actually protects step 142, and it fails if the parser
 *      regresses in any way, not just the one shape guarded above.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PARSER = "scripts/verify-schema-parity.mjs";
const BASELINE = "docs/schema-parity-baseline.json";
const LABEL = "verify-schema-parity-drop-readd-ordering";

// Verified present NOT NULL on prod 2026-08-01 via information_schema.
const MIRRORS_WITH_RAW_PAYLOAD = [
  "accounting.qbo_accounts",
  "accounting.qbo_customers",
  "accounting.qbo_vendors",
  "mdata.qbo_accounts",
  "mdata.qbo_classes",
  "mdata.qbo_customers",
  "mdata.qbo_items",
  "mdata.qbo_vendors",
];

export function auditParser(src) {
  const problems = [];
  if (!/columnEvents\s*\.\s*sort\s*\(/.test(src)) {
    problems.push(
      `${PARSER}: ADD/DROP COLUMN events are not sorted before being applied. Without source ordering a ` +
        `drop-and-re-add loses the column (every DROP lands after every ADD), which silently removes ` +
        `real prod columns from the baseline and turns correct SQL into reported phantom columns.`
    );
  }
  if (!/kind:\s*"drop"/.test(src) || !/kind:\s*"add"/.test(src)) {
    problems.push(`${PARSER}: expected positioned {kind:"add"} and {kind:"drop"} column events; the ordered-apply model is gone.`);
  }
  // The multi-column DROP scan must be window-based, not anchored to the ALTER TABLE head.
  if (/DROP\\s\+COLUMN\\s\+\(\?:IF\\s\+EXISTS\\s\+\)\?"\?\(\[A-Za-z_\]/.test(src) && !/dropColFragRe/.test(src)) {
    problems.push(`${PARSER}: DROP COLUMN is matched only at the ALTER TABLE head — a multi-column DROP loses every column after the first.`);
  }
  return problems;
}

export function auditBaseline(json) {
  const problems = [];
  const tables = json.tables ?? {};
  for (const rel of MIRRORS_WITH_RAW_PAYLOAD) {
    const cols = tables[rel];
    if (!cols) {
      problems.push(`${BASELINE}: ${rel} is absent from the baseline entirely.`);
      continue;
    }
    if (!cols.includes("raw_payload")) {
      problems.push(
        `${BASELINE}: ${rel}.raw_payload is missing, but prod has it NOT NULL. The DDL parser has ` +
          `regressed on drop-and-re-add (migration 0213) — fix the parser and regenerate, never allowlist.`
      );
    }
  }
  return problems;
}

function realParser() {
  return readFileSync(join(ROOT, PARSER), "utf8");
}
function realBaseline() {
  return JSON.parse(readFileSync(join(ROOT, BASELINE), "utf8"));
}

function mutate(src, from, to, label) {
  const out = src.replace(from, to);
  if (out === src) {
    throw new Error(
      `mutation "${label}" did not apply — the selftest fixture no longer matches ${PARSER}. ` +
        `The negative case is UNTESTED; fix the fixture rather than trusting this guard.`
    );
  }
  return out;
}

function selftest() {
  const failures = [];
  const parser = realParser();

  const cleanP = auditParser(parser);
  if (cleanP.length !== 0) failures.push(`case0a FAIL — real parser flagged: ${cleanP.join(" | ")}`);
  const cleanB = auditBaseline(realBaseline());
  if (cleanB.length !== 0) failures.push(`case0b FAIL — real baseline flagged: ${cleanB.join(" | ")}`);

  // NEGATIVE — ordering removed (the exact ACCT-F83 defect).
  try {
    const noSort = mutate(parser, /columnEvents\s*\.\s*sort\s*\([\s\S]*?\);/, "", "remove event sort");
    if (!auditParser(noSort).some((p) => p.includes("not sorted before being applied"))) {
      failures.push("FAIL — parser with unordered ADD/DROP was NOT caught");
    }
  } catch (err) {
    failures.push(`FAIL — ordering mutation: ${err.message}`);
  }

  // NEGATIVE — a baseline that lost raw_payload must be rejected.
  const stripped = JSON.parse(JSON.stringify(realBaseline()));
  const before = (stripped.tables["mdata.qbo_vendors"] || []).length;
  stripped.tables["mdata.qbo_vendors"] = (stripped.tables["mdata.qbo_vendors"] || []).filter((c) => c !== "raw_payload");
  if (stripped.tables["mdata.qbo_vendors"].length === before) {
    failures.push("FAIL — baseline fixture did not change; mdata.qbo_vendors.raw_payload was already absent");
  } else if (!auditBaseline(stripped).some((p) => p.includes("raw_payload is missing"))) {
    failures.push("FAIL — baseline missing raw_payload was NOT caught");
  }

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: selftest PASS — real parser and baseline clean; unordered-apply and a baseline that lost ` +
      `raw_payload are both rejected. Every mutation verified to have applied.`
  );
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = [...auditParser(realParser()), ...auditBaseline(realBaseline())];
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — ADD/DROP COLUMN apply in source order, and every qbo_* mirror carries raw_payload as prod does.`
  );
}

main();
