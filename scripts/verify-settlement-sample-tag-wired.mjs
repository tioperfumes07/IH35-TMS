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
 * KNOWN LIMIT, stated because a guard's blind spot must be written down, not discovered later:
 * the [literal] arm parses the SQL VALUES tuple, so it catches `..., false)` written INTO the SQL.
 * It CANNOT see a JavaScript-side hardcode — a writer that binds `$n` and passes a literal `false`
 * in the params array reads as correctly parameterised to this parser. Verified deliberately:
 * replacing `opts.isSampleData ?? load.is_sample_data ?? false` with `false` in
 * settlements-load-bookended.service.ts leaves this guard GREEN, because the SQL still says `$15`.
 * That is not a bug in the check; it is the boundary of a static SQL parser, and closing it needs
 * either a TS-level assertion on the params array or a live post-deploy read. Do not read a green
 * result here as proof that a derivation is real.
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
 * LV-SAMPLE-TAG-DISPATCH-HOLE: naming the column is NOT enough. The load-bookended writer — the one
 * dispatch calls on `in_transit` — named `is_sample_data` and then supplied the LITERAL `false`, so
 * every settlement it auto-opened was hardcoded "not sample data" no matter what the parent load
 * said. A Gate-B sample load therefore produced an UNTAGGED live financial record while this guard
 * sat green, because the column was present in the column list.
 *
 * So the value must be DERIVED (a bind param, or a SELECT/COALESCE off the parent row), never a
 * literal. Given the column list and the VALUES tuple, returns the literal found in that column's
 * position, or null when the slot is derived.
 */
export function literalInSampleSlot(columns, valuesTuple, requiredColumn = REQUIRED_COLUMN) {
  const cols = columns.split(",").map((c) => c.trim().replace(/\s+/g, " "));
  const idx = cols.indexOf(requiredColumn);
  if (idx === -1) return null; // absence is the other check's job

  // Split the VALUES tuple on top-level commas only, so a nested COALESCE(...)/SELECT stays intact.
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of valuesTuple) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  if (parts.length !== cols.length) return null; // shape we cannot read textually — not a verdict

  // Strip SQL comments so a `-- note` above the value does not masquerade as the value.
  const slot = parts[idx].replace(/--[^\n]*/g, "").trim().toLowerCase();
  if (/^(true|false|null)$/.test(slot)) return slot;
  return null;
}

/**
 * Find every `INSERT INTO <TABLE> ( ... )` column list in a source string and report which ones
 * omit the required column. Returns [{ index, columns }] for offenders.
 */
export function findUntaggedInserts(rawSource, table = TABLE, requiredColumn = REQUIRED_COLUMN) {
  // ACCT-F193: strip SQL line comments FIRST. A `-- why this column exists` note inside the column
  // list otherwise gets absorbed into a column name, and the required column stops being recognised
  // — the guard then reports a correctly-tagged INSERT as untagged. Caught by this guard failing on
  // my own fix, which is the right way to find it.
  const source = rawSource.replace(/^[ \t]*--[^\n]*$/gm, "");
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
      offenders.push({ index: at, columns: named.join(", "), kind: "missing" });
      continue;
    }

    // Column IS named — now make sure its value is derived, not a hardcoded literal.
    const valuesAt = source.slice(close).search(/\bVALUES\b/i);
    if (valuesAt === -1) continue;
    const vOpen = source.indexOf("(", close + valuesAt);
    if (vOpen === -1) continue;
    let vDepth = 0;
    let vClose = -1;
    for (let i = vOpen; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === "(") vDepth += 1;
      else if (ch === ")") {
        vDepth -= 1;
        if (vDepth === 0) {
          vClose = i;
          break;
        }
      }
    }
    if (vClose === -1) continue;
    const literal = literalInSampleSlot(columns, source.slice(vOpen + 1, vClose), requiredColumn);
    if (literal) {
      offenders.push({ index: at, columns: named.join(", "), kind: "literal", literal });
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

  // LV-SAMPLE-TAG-DISPATCH-HOLE — the defect this guard MISSED the first time. The column is named,
  // so the original check passed, but the value is the literal `false`: every settlement the dispatch
  // writer auto-opened was hardcoded "not sample data" regardless of the parent load.
  const literalFalse = `
    INSERT INTO ${TABLE} (
      operating_company_id, display_id, driver_id, period_start, period_end, status,
      gross_pay, deductions_total, reimbursements_total, net_pay, is_sample_data
    ) VALUES ($1,$2,$3,$4,$5,'presettle',0,0,0,0,false)
  `;
  const derivedFromParent = `
    INSERT INTO ${TABLE} (
      operating_company_id, display_id, driver_id, period_start, period_end, status,
      gross_pay, deductions_total, reimbursements_total, net_pay, is_sample_data
    ) VALUES (
      $1,$2,$3,$4,$5,'presettle',0,0,0,0,
      COALESCE((SELECT d.is_sample_data FROM mdata.drivers d WHERE d.id = $3::uuid), false)
    )
  `;
  const lit = findUntaggedInserts(literalFalse);
  if (lit.length !== 1 || lit[0].kind !== "literal") {
    failures.push("hardcoded literal `false` NOT caught — this is the exact dispatch hole");
  }
  if (findUntaggedInserts(derivedFromParent).length !== 0) {
    failures.push("COALESCE/SELECT-derived value was flagged (false positive on the fix)");
  }
  if (findUntaggedInserts(literalFalse.replace(",false)", ",true)")).length !== 1) {
    failures.push("hardcoded literal `true` NOT caught");
  }

  if (failures.length) {
    console.error("verify-settlement-sample-tag-wired SELFTEST FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-settlement-sample-tag-wired SELFTEST OK — 8/8 (missing column, hardcoded literal, and INSERT..SELECT all caught; derived values pass)"
  );
  process.exit(0);
}

/**
 * ACCT-F193 — EXTENDED FROM ONE TABLE TO THE LOAD-DERIVED MONEY DOCUMENTS.
 *
 * This guard was scoped to driver_finance.driver_settlements because that was the ONE money create
 * type with no writable free-text column, so it was the only one that NEEDED a boolean to be
 * taggable at all. Migration 202612370000 has since added is_sample_data to the accounting money
 * tables (verified live on prod: all seven now carry it), so the same assertion can now protect the
 * document a sample load actually produces first — its invoice.
 *
 * ONLY accounting.invoices is added, deliberately. A bill, a payment or a journal entry has no
 * single parent row to inherit "sample" FROM — an invoice built from a load does. Asserting a
 * derivation that has no source would just push writers to hardcode `false`, which is the exact
 * defect this guard already catches on settlements.
 */
/**
 * table -> the files that must carry the tag. `null` means EVERY writer of that table.
 *
 * accounting.invoices is scoped to the LOAD-DERIVED writer alone, and that narrowing was forced by
 * this guard failing when I first extended it to the whole table: it reddened five other writers —
 * invoices.routes.ts and invoices.service.ts (manual invoices, no parent row), recurring.worker.ts
 * (no load), factoring/packet-assemble.service.ts, and qbo-ar-invoices-puller.ts (a CLONE writer,
 * where requiring a local tag would break the import exactly as it would for items).
 *
 * None of those has a parent to inherit "sample" FROM. Demanding the column there would push writers
 * to hardcode `false` — which is precisely the defect this guard already catches on settlements. So
 * the assertion follows the DERIVATION, not the table.
 */
const TAGGED_TABLES = [
  { table: TABLE, onlyFiles: null },
  { table: "accounting.invoices", onlyFiles: ["accounting/from-load.ts"] },
];

const offenders = [];
for (const file of walk(SRC)) {
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const { table: tbl, onlyFiles } of TAGGED_TABLES) {
  if (!source.includes(`INSERT INTO ${tbl}`)) continue;
  const rel = path.relative(ROOT, file);
  if (onlyFiles && !onlyFiles.some((f) => rel.endsWith(f))) continue;
  for (const hit of findUntaggedInserts(source, tbl)) {
    const line = source.slice(0, hit.index).split("\n").length;
    offenders.push({
      file: path.relative(ROOT, file),
      line,
      columns: hit.columns,
      kind: hit.kind,
      literal: hit.literal,
      table: tbl,
    });
  }
  }
}

if (offenders.length) {
  console.error(
    `verify-settlement-sample-tag-wired FAILED — ${offenders.length} production INSERT(s) into ${TABLE} cannot carry a Gate-B tag:`
  );
  for (const o of offenders) {
    console.error(`  ${o.file}:${o.line}  [${o.kind}]  ${o.table}`);
    if (o.kind === "literal") {
      console.error(`    \`${REQUIRED_COLUMN}\` is hardcoded to the literal \`${o.literal}\``);
    } else {
      console.error(`    columns: ${o.columns}`);
    }
  }
  console.error(
    `\n  A settlement that cannot carry \`${REQUIRED_COLUMN}\` is invisible to the Gate-B purge sweep, and\n` +
      `  this table has NO free-text column to fall back on — this column is the only tag path.\n` +
      `\n  [missing] add ${REQUIRED_COLUMN} to the column list.\n` +
      `  [literal] DERIVE the value, never hardcode it: bind it from the caller, or COALESCE it off the\n` +
      `            parent row (load for the dispatch/bookended writer, driver for the weekly close).\n` +
      `            A literal is how LV-SAMPLE-TAG-DISPATCH-HOLE shipped: the column was named, this guard\n` +
      `            was green, and every auto-opened settlement was still hardcoded "not sample data".`
  );
  process.exit(1);
}

console.log(
  `verify-settlement-sample-tag-wired OK — every production INSERT into ${TABLE} carries \`${REQUIRED_COLUMN}\``
);
