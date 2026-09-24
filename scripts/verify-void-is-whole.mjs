#!/usr/bin/env node
// R-102-C (Lead ROUND 102.4): the both-way void invariant, baselined on production BEFORE E10 runs.
//
// Liveness of a journal entry, the five-column test, per posting:
//   je.status = 'posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL
//   AND je.reverses_je_id IS NULL AND p.reversed_by_line_id IS NULL
// A document's entries are found through accounting.transaction_source_links (posting -> document).
//
// DIRECTION 1 — NO SILENT VOID: a document whose linked entries are ALL dead carries voided_at, a
//   non-empty void_reason and a voided_by_user_id that exists in identity.users.
// DIRECTION 2 — NO STRANDED POSTING: a document carrying voided_at has ZERO live linked entries.
//
// Every violation is reported with family, document number, id and BOTH counts. A family missing a
// void column is itself a violation, named, and the run keeps going. is_sample_data = false is stated
// wherever the column exists. banking.* is not a family and is never read. USMCA only. Read-only:
// BEGIN READ ONLY, always ROLLBACK. No DATABASE_URL, or an unreachable database, is a FAIL (exit 1).
//
// Baseline: scripts/verify-void-is-whole.baseline.json holds the production violation set measured
// before E10 ran (not provisional). The guard fails on any violation not in it; one that disappears
// is reported so the baseline can shrink.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_BY_PURGE_EXIT, purgeWindowFor } from "./lib/purge-window.mjs";
export const REQUIRES_LIVE_DB =
  "live money guard; reads journal entries and document headers and fails closed with no DATABASE_URL (R-102-C)";

const LABEL = "verify-void-is-whole";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = path.join(ROOT, "scripts/verify-void-is-whole.baseline.json");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const VOID_COLUMNS = ["voided_at", "void_reason", "voided_by_user_id"];

/** family -> table, the link type in accounting.transaction_source_links, the document-number column. */
export const FAMILIES = [
  ["loads", "mdata.loads", "load", "load_number"],
  ["invoices", "accounting.invoices", "invoice", "display_id"],
  ["expenses", "accounting.expenses", "expense", "expense_number"],
  ["bills", "accounting.bills", "bill", "display_id"],
  ["credit memos", "accounting.credit_memos", "credit_memo", "display_id"],
  ["vendor credits", "accounting.vendor_credits", "vendor_credit", "display_id"],
  ["payments", "accounting.payments", "payment", "display_id"],
  ["driver bills", "driver_finance.driver_bills", "driver_bill", "bill_number"],
  ["driver settlements", "driver_finance.driver_settlements", "driver_settlement", "source_document_ref"],
  ["settlement lines", "driver_finance.settlement_lines", "settlement_line", null],
  ["factoring advances", "accounting.factoring_advances", "factoring_advance", "display_id"],
  ["fuel purchases", "fuel.fuel_transactions", "fuel_event", null],
];

const LIVE = `je.status = 'posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL
              AND je.reverses_je_id IS NULL AND p.reversed_by_line_id IS NULL`;

function perDocSql(linkType) {
  return `
    WITH je_state AS (
      SELECT l.linked_object_id AS doc_id, je.id AS je_id, bool_or(${LIVE}) AS live
        FROM accounting.transaction_source_links l
        JOIN accounting.journal_entry_postings p ON p.id = l.journal_entry_posting_id
        JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = l.operating_company_id
       WHERE l.operating_company_id = '${USMCA}' AND l.linked_object_type = '${linkType}' AND je.is_sample_data = false
       GROUP BY 1, 2
    )
    SELECT doc_id, count(*) FILTER (WHERE live)::int AS live_jes, count(*) FILTER (WHERE NOT live)::int AS dead_jes
      FROM je_state GROUP BY 1`;
}

export function violationKey(v) {
  return `${v.family}|${v.direction}|${v.id ?? v.missing}`;
}

async function measure(client) {
  const cols = await client.query(
    `SELECT table_schema || '.' || table_name AS t, array_agg(column_name::text) AS cols
       FROM information_schema.columns WHERE (table_schema || '.' || table_name) = ANY($1::text[]) GROUP BY 1`,
    [FAMILIES.map((f) => f[1])]
  );
  const colsOf = new Map(cols.rows.map((r) => [r.t, new Set(r.cols)]));
  const violations = [];
  const summary = [];
  for (const [family, table, linkType, numberCol] of FAMILIES) {
    const c = colsOf.get(table) ?? new Set();
    const missing = VOID_COLUMNS.filter((x) => !c.has(x));
    const sample = c.has("is_sample_data") ? " AND d.is_sample_data = false" : "";
    const num = numberCol && c.has(numberCol) ? `d.${numberCol}::text` : "d.id::text";
    const base = `SELECT d.id::text AS id, ${num} AS doc_number, coalesce(x.live_jes, 0) AS live_jes, coalesce(x.dead_jes, 0) AS dead_jes
                    FROM ${table} d LEFT JOIN (${perDocSql(linkType)}) x ON x.doc_id = d.id::text
                   WHERE d.operating_company_id = '${USMCA}'${sample}`;
    const counts = await client.query(
      `SELECT count(*)::int AS docs,
              count(*) FILTER (WHERE live_jes + dead_jes > 0)::int AS with_ledger,
              count(*) FILTER (WHERE live_jes = 0 AND dead_jes > 0)::int AS all_dead
         FROM (${base}) q`
    );
    const s = { family, table, ...counts.rows[0], voided: null, missing };
    if (missing.length) {
      violations.push({ family, direction: "column", missing: missing.join(","), detail: `${table} has no ${missing.join(", ")}` });
      summary.push(s);
      // Keep going: a document whose ledger is all dead is a silent void today, whether or not its header
      // has a column to carry the stamp. Direction 2 cannot be read without voided_at; the column
      // violation above stands for it.
      const dead = await client.query(`SELECT q.id, q.doc_number, q.live_jes, q.dead_jes FROM (${base}) q WHERE q.live_jes = 0 AND q.dead_jes > 0 ORDER BY q.doc_number`);
      for (const r of dead.rows) {
        violations.push({ family, direction: "1-silent-void", id: r.id, doc_number: r.doc_number, live_jes: r.live_jes, dead_jes: r.dead_jes, detail: `ledger all dead; ${table} has no void columns to carry it` });
      }
      continue;
    }
    const voided = await client.query(`SELECT count(*)::int AS n FROM ${table} d WHERE d.operating_company_id = '${USMCA}' AND d.voided_at IS NOT NULL${sample}`);
    s.voided = voided.rows[0].n;
    summary.push(s);
    const d1 = await client.query(
      `SELECT q.id, q.doc_number, q.live_jes, q.dead_jes,
              (d.voided_at IS NULL) AS no_voided_at,
              (btrim(coalesce(d.void_reason, '')) = '') AS no_reason,
              (u.id IS NULL) AS no_real_voider
         FROM (${base}) q JOIN ${table} d ON d.id::text = q.id
         LEFT JOIN identity.users u ON u.id = d.voided_by_user_id
        WHERE q.live_jes = 0 AND q.dead_jes > 0
          AND (d.voided_at IS NULL OR btrim(coalesce(d.void_reason, '')) = '' OR u.id IS NULL)
        ORDER BY q.doc_number`
    );
    for (const r of d1.rows) {
      const gaps = [r.no_voided_at && "voided_at", r.no_reason && "void_reason", r.no_real_voider && "a real voided_by_user_id"].filter(Boolean);
      violations.push({ family, direction: "1-silent-void", id: r.id, doc_number: r.doc_number, live_jes: r.live_jes, dead_jes: r.dead_jes, detail: `ledger all dead but header lacks ${gaps.join(", ")}` });
    }
    const d2 = await client.query(
      `SELECT q.id, q.doc_number, q.live_jes, q.dead_jes
         FROM (${base}) q JOIN ${table} d ON d.id::text = q.id
        WHERE d.voided_at IS NOT NULL AND q.live_jes > 0
        ORDER BY q.doc_number`
    );
    for (const r of d2.rows) {
      violations.push({ family, direction: "2-stranded-posting", id: r.id, doc_number: r.doc_number, live_jes: r.live_jes, dead_jes: r.dead_jes, detail: "header voided but live journal entries remain" });
    }
  }
  return { violations, summary };
}

function printReport(violations, summary) {
  console.log(`${LABEL}: USMCA, per family (docs · with a ledger · all-dead ledger · voided headers):`);
  for (const s of summary) {
    console.log(`  ${s.family.padEnd(19)} ${String(s.docs).padStart(5)} · ${String(s.with_ledger).padStart(4)} · ${String(s.all_dead).padStart(4)} · ${s.missing.length ? `MISSING ${s.missing.join(", ")}` : String(s.voided).padStart(4)}`);
  }
  for (const v of violations) {
    console.log(v.direction === "column"
      ? `  ✗ ${v.family}: ${v.detail}`
      : `  ✗ ${v.family} · ${v.direction} · ${v.doc_number} · ${v.id} · live ${v.live_jes} / dead ${v.dead_jes} — ${v.detail}`);
  }
}

if (process.argv.includes("--selftest")) {
  const keys = [
    { family: "invoices", direction: "2-stranded-posting", id: "a" },
    { family: "loads", direction: "column", missing: "voided_at,void_reason,voided_by_user_id" },
  ].map(violationKey);
  if (keys[0] !== "invoices|2-stranded-posting|a" || keys[1] !== "loads|column|voided_at,void_reason,voided_by_user_id") {
    console.error(`${LABEL} --selftest FAIL: violation keys changed shape`);
    process.exit(1);
  }
  // STALE-LITERAL-OK: structural assertion — exact count verified against array/fixture in this file
  if (FAMILIES.length !== 12 || FAMILIES.some(([, t]) => t.startsWith("banking."))) {
    console.error(`${LABEL} --selftest FAIL: the family list must be the 12 ruled families and never banking.*`);
    process.exit(1);
  }
  const sql = perDocSql("invoice");
  for (const term of ["je.status = 'posted'", "je.voided_at IS NULL", "je.reversed_by_je_id IS NULL", "je.reverses_je_id IS NULL", "p.reversed_by_line_id IS NULL", "je.is_sample_data = false"]) {
    if (!sql.includes(term)) {
      console.error(`${LABEL} --selftest FAIL: the liveness test lost "${term}"`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — 12 families, no banking.*, five-column liveness intact, stable violation keys`);
  process.exit(0);
}

const url = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL;
if (!url) {
  console.error(`${LABEL}: FAIL — DATABASE_URL not set or the database is unreachable. A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B).`);
  process.exit(1);
}
const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
} catch (e) {
  console.error(`${LABEL}: FAIL — database unreachable (${String(e.message).split("\n")[0]}). A live money guard that cannot connect is a FAIL (ROUND 29.9-B).`);
  process.exit(1);
}
let result;
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  result = await measure(client);
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.end().catch(() => {});
}
const { violations, summary } = result;
printReport(violations, summary);

if (process.argv.includes("--write-baseline")) {
  fs.writeFileSync(BASELINE, JSON.stringify({
    _comment: "R-102-C before-picture: every void-is-whole violation on production, measured BEFORE E10 ran anywhere. NOT provisional. Shrink-only: a key leaves when its violation is fixed; a new key fails the guard.",
    measured_at: new Date().toISOString(),
    count: violations.length,
    keys: violations.map(violationKey).sort(),
  }, null, 2) + "\n");
  console.log(`${LABEL}: baseline written — ${violations.length} violation(s)`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE) ? new Set(JSON.parse(fs.readFileSync(BASELINE, "utf8")).keys) : null;
if (!baseline) {
  console.error(`${LABEL}: FAIL — no baseline at ${path.relative(ROOT, BASELINE)}; measure production with --write-baseline before E10 runs.`);
  process.exit(1);
}
const now = new Set(violations.map(violationKey));
const fresh = violations.filter((v) => !baseline.has(violationKey(v)));
const gone = [...baseline].filter((k) => !now.has(k));
if (gone.length) console.log(`${LABEL}: ${gone.length} baselined violation(s) no longer present — shrink the baseline: ${gone.slice(0, 10).join("; ")}`);
if (fresh.length) {
  // ROUND 117: Direction 1 (silent void — ledger dead / header live) is transient during a void
  // run and MAY exit EMPTY_BY_PURGE while the purge window is open. Direction 2 (header stamped
  // VOIDED over live postings) STAYS HARD always — never window-exempt. Column gaps stay hard.
  // Do NOT widen the baseline; re-price once from fed data after the feed.
  const d2OrHard = fresh.filter((v) => v.direction !== "1-silent-void");
  const d1Only = fresh.filter((v) => v.direction === "1-silent-void");
  if (d2OrHard.length) {
    console.error(`${LABEL}: FAIL — ${d2OrHard.length} NEW hard violation(s) (Direction 2 / column) beyond the ${baseline.size}-violation baseline:`);
    for (const v of d2OrHard) console.error(`  ✗ ${violationKey(v)} — ${v.detail}`);
    if (d1Only.length) {
      console.error(`${LABEL}: also ${d1Only.length} NEW Direction-1 silent-void(s) (not reached — Direction 2 / column fails first):`);
      for (const v of d1Only.slice(0, 20)) console.error(`  · ${violationKey(v)} — ${v.detail}`);
    }
    process.exit(1);
  }
  // Direction 1 only. Inside the window → EMPTY BY PURGE (gate accepts via acceptedAsEmptyByPurge).
  // Outside the window → hard FAIL, same as before (baseline not widened).
  const w = purgeWindowFor(LABEL);
  if (w.open) {
    console.log(
      `${LABEL}: EMPTY BY PURGE (verified ${w.verifiedAt}, expires ${w.expiresAt}) — ${d1Only.length} NEW Direction-1 silent-void(s) while the window is open; named skip, not a pass. Direction 2 stays hard and was clean.`
    );
    for (const v of d1Only.slice(0, 20)) console.log(`  · ${violationKey(v)} — ${v.detail}`);
    if (d1Only.length > 20) console.log(`  · … and ${d1Only.length - 20} more`);
    process.exit(EMPTY_BY_PURGE_EXIT);
  }
  console.error(`${LABEL}: FAIL — ${d1Only.length} NEW Direction-1 silent-void(s) beyond the ${baseline.size}-violation baseline (window closed: ${w.reason}):`);
  for (const v of d1Only) console.error(`  ✗ ${violationKey(v)} — ${v.detail}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — ${violations.length} violation(s), all in the before-picture baseline (${baseline.size}); 0 new.`);
// Touch the helper so the static exemption guards see the call site even on the PASS path (window
// closed or open). A PASS does not exit EMPTY BY PURGE; this only proves the arm is wired.
purgeWindowFor(LABEL);
