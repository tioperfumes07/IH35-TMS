#!/usr/bin/env node
/**
 * GUARD: every production INSERT into driver_finance.driver_settlements must name `is_sample_data`.
 *
 * THE DEFECT THIS EXISTS FOR: driver_finance.driver_settlements is the ONE money create type with no
 * writable free-text column (verified live on prod br-fancy-credit-akjnd07a: 54 columns, zero
 * is_sample_data, zero memo/notes/description/internal_notes). Every other type can carry a Gate-B tag
 * in an existing field — bills.memo, invoices.internal_notes, payments.reference, bill_payments.memo,
 * expenses.memo. So a sample settlement created before migration 202612350000 was an UNTAGGED live
 * financial record in the sole ledger that no purge query could find by tag.
 *
 * WHY A GUARD AND NOT JUST THE COLUMN: the column alone is decoration. There are FOUR production
 * writers of this table, not one — the sample-tag evidence doc named a single route (and named it at a
 * path that does not exist). Patching one writer leaves three writing untagged settlements while the
 * presence of the column makes everyone believe the gap is closed. That is strictly worse than no
 * column at all. This guard fails if ANY production INSERT omits it, so writer #5 cannot silently
 * reintroduce the gap.
 *
 * SCOPING: production code only. __tests__ fixtures are deliberately exempt — they construct rows
 * directly and are not a tag path.
 *
 * Run:  node scripts/verify-settlement-sample-tag-wired.mjs [--selftest]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const SRC = path.join(ROOT, "apps/backend/src");
const TABLE = "driver_finance.driver_settlements";
const REQUIRED_COLUMN = "is_sample_data";

/** Walk .ts files under a dir, skipping test dirs. */
function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules" || entry === "dist") continue;
      walk(full, out);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Find every `INSERT INTO <TABLE> ( ... )` column list in a source string and report which ones
 * omit the required column. Returns [{ index, columns }] for offenders.
 */
export function findUntaggedInserts(source, table = TABLE, requiredColumn = REQUIRED_COLUMN) {
  const offenders = [];
  const needle = `INSERT INTO ${table}`;
  let from = 0;
  for (;;) {
    const at = source.indexOf(needle, from);
    if (at === -1) break;
    from = at + needle.length;

    // Take the parenthesised column list that follows. Bail if the statement has no column list
    // (e.g. INSERT ... SELECT) — that shape cannot be tag-checked textually and is treated as an
    // offender so it gets human eyes rather than a silent pass.
    const open = source.indexOf("(", at + needle.length);
    if (open === -1) {
      offenders.push({ index: at, columns: "<no column list>" });
      continue;
    }
    // Only accept a column list that starts before the next INSERT/statement boundary.
    const between = source.slice(at + needle.length, open);
    if (/\b(select|values)\b/i.test(between)) {
      offenders.push({ index: at, columns: "<no column list>" });
      continue;
    }
    let depth = 0;
    let close = -1;
    for (let i = open; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === "(") depth += 1;
      else if (ch === ")") {
        depth -= 1;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    if (close === -1) {
      offenders.push({ index: at, columns: "<unterminated column list>" });
      continue;
    }
    const columns = source.slice(open + 1, close);
    const named = columns
      .split(",")
      .map((c) => c.trim().replace(/\s+/g, " "))
      .filter(Boolean);
    if (!named.includes(requiredColumn)) {
      offenders.push({ index: at, columns: named.join(", ") });
    }
  }
  return offenders;
}

const SELFTEST = process.argv.includes("--selftest");

if (SELFTEST) {
  const failures = [];
  const good = `
    INSERT INTO ${TABLE} (
      operating_company_id, display_id, driver_id, period_start, period_end, status,
      gross_pay, deductions_total, reimbursements_total, net_pay, is_sample_data
    ) VALUES ($1,$2,$3,$4,$5,'presettle',$6,$7,$8,$9,$10)
  `;
  const bad = `
    INSERT INTO ${TABLE} (
      operating_company_id, display_id, driver_id, period_start, period_end, status,
      gross_pay, deductions_total, reimbursements_total, net_pay
    ) VALUES ($1,$2,$3,$4,$5,'presettle',$6,$7,$8,$9)
  `;

  // MUTATION PROOF: the guard must FAIL on the defect and PASS on the fix. A selftest that only
  // asserts the happy path cannot fail and is worthless.
  if (findUntaggedInserts(good).length !== 0) failures.push("tagged INSERT was flagged (false positive)");
  if (findUntaggedInserts(bad).length !== 1) failures.push("untagged INSERT was NOT caught (the actual bug)");
  if (findUntaggedInserts(`${good}\n${bad}`).length !== 1) failures.push("mixed file: exactly one offender expected");
  if (findUntaggedInserts("no inserts here").length !== 0) failures.push("empty source flagged");
  // INSERT ... SELECT has no textual column list to check -> must be surfaced, not silently passed.
  if (findUntaggedInserts(`INSERT INTO ${TABLE} SELECT * FROM x`).length !== 1) {
    failures.push("INSERT ... SELECT silently passed");
  }

  if (failures.length) {
    console.error("verify-settlement-sample-tag-wired SELFTEST FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-settlement-sample-tag-wired SELFTEST OK — 5/5 (catches the defect, passes the fix)");
  process.exit(0);
}

const offenders = [];
for (const file of walk(SRC)) {
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (!source.includes(`INSERT INTO ${TABLE}`)) continue;
  for (const hit of findUntaggedInserts(source)) {
    const line = source.slice(0, hit.index).split("\n").length;
    offenders.push({ file: path.relative(ROOT, file), line, columns: hit.columns });
  }
}

if (offenders.length) {
  console.error(
    `verify-settlement-sample-tag-wired FAILED — ${offenders.length} production INSERT(s) into ${TABLE} omit \`${REQUIRED_COLUMN}\`:`
  );
  for (const o of offenders) {
    console.error(`  ${o.file}:${o.line}`);
    console.error(`    columns: ${o.columns}`);
  }
  console.error(
    `\n  A settlement written without \`${REQUIRED_COLUMN}\` cannot be found by the Gate-B purge sweep.\n` +
      `  This table has NO free-text column to fall back on — this column is the only tag path.\n` +
      `  Add ${REQUIRED_COLUMN} to the column list (user-facing create routes accept it and default false;\n` +
      `  system-generated writers pass a literal false).`
  );
  process.exit(1);
}

console.log(
  `verify-settlement-sample-tag-wired OK — every production INSERT into ${TABLE} carries \`${REQUIRED_COLUMN}\``
);
