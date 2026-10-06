#!/usr/bin/env node
/** MATRIX-BUILT-OPTIONAL — live-only / invariant ratchet guard; no surface wiring leaf to register. */
// verify-documents-survived-the-undo.mjs — ROUND 371 (Lead, 2026-10-03).
//
// THE QUESTION THIS ANSWERS, IN THE OWNER'S WORDS: "the documents have not been deleted? expenses,
// bills, driver bill payments, etc. I will reclassify a few, void a few so we can verify the
// engines are working correctly. Once I do that, we continue with the purge."
//
// He undid every categorization and sent every bank line back to For Review. In QuickBooks an UNDO
// returns the line to For Review and the underlying record stays intact — undoing a MATCH touches
// no document at all, and undoing a CATEGORIZE removes or voids only the document that categorize
// created. Nothing he did should have removed an expense, a bill or a bill payment that already
// existed. This proves it instead of assuming it, BEFORE he tests reclassify and void on live rows.
//
// It is READ ONLY. BEGIN READ ONLY, no writes, no temp tables, USMCA only. It reads the DIRECT
// endpoint through require-live-db.mjs — never the pooler, where pgbouncer carries SET ROLE ih35_app
// across borrowers and a 0 is MASKED, not empty (CC-3: 10 of 10 pooled read as ih35_app;
// load_charge_lines 0 pooled vs 284 direct).
//
// EMPTY IS A QUESTION, NOT AN ANSWER. A zero here is reported as a zero AND as a thing to explain.
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

// --selftest (Devin build order 2026-10-05): live-DB guards cannot be fixture-tested — their inputs
// are rows on Neon. One case MUST pass (live check green, or the canonical no-credential refusal
// when nothing resolves locally) and one MUST fail (dead credential — it must refuse, never green).
if (process.argv.includes("--selftest")) { await selftest_verify_documents_survived_the_undo(); }
async function selftest_verify_documents_survived_the_undo() {
  const { runGuard, reportSelftest, statusOf, outputOf, DEAD_DB_ENV } = await import("./lib/guard-selftest.mjs");
  const { fileURLToPath } = await import("node:url");
  const me = fileURLToPath(import.meta.url);
  const real = runGuard(me);
  const noDb = runGuard(me, { env: DEAD_DB_ENV });
  const refused = /DATABASE_URL (?:is )?(?:not set|unset|required)|credential/.test(outputOf(real));
  reportSelftest("verify_documents_survived_the_undo", [
    { name: "live check green, or canonically refuses with no credential", pass: statusOf(real) === 0 || refused, detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-300) },
    { name: "refuses on dead credential", pass: statusOf(noDb) !== 0, detail: statusOf(noDb) !== 0 ? undefined : outputOf(noDb).slice(-200) },
  ]);
}


const LABEL = "verify-documents-survived-the-undo";
export const REQUIRES_LIVE_DB = "live-only guard: reads production database (USMCA) and cannot be statically verified; run by money-pr-local-gate with DATABASE_URL";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

// Each entry: label, schema.table, the company column, and an optional voided predicate so we can
// separate "still here and live" from "still here and voided". Never guess a column — anything that
// does not exist is reported as NOT PRESENT rather than silently skipped.
const DOCUMENT_TABLES = [
  ["Expenses", "accounting", "expenses"],
  ["Bills", "accounting", "bills"],
  ["Bill payments", "accounting", "bill_payments"],
  ["Invoices", "accounting", "invoices"],
  ["Received payments", "accounting", "payments"],
  ["Credit memos", "accounting", "credit_memos"],
  ["Vendor credits", "accounting", "vendor_credits"],
  ["Journal entries", "accounting", "journal_entries"],
  ["Journal entry postings", "accounting", "journal_entry_postings"],
  ["Transaction source links (the spine)", "accounting", "transaction_source_links"],
  ["Driver bills", "driver_finance", "driver_bills"],
  ["Loads", "mdata", "loads"],
  ["Bank transactions", "banking", "bank_transactions"],
];

const q = (s) => `"${s.replace(/"/g, '""')}"`;

async function columnsOf(client, schema, table) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
    [schema, table]
  );
  return new Set(rows.map((r) => r.column_name));
}

const main = async () => {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  const out = [];
  let problems = 0;

  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);

    // Prove we are NOT on the pooler before we believe a single number (the masking trap).
    const who = await client.query(`SELECT current_user AS u, current_setting('server_version') AS v`);
    const role = who.rows[0].u;
    out.push(`connection role = ${role} · postgres ${who.rows[0].v}`);
    if (role === "ih35_app") {
      console.error(
        `${LABEL}: FAIL — connected as ih35_app, which means the POOLER. Every count from this ` +
          `connection would be masked, not empty. Read the DIRECT endpoint.`
      );
      await client.query("ROLLBACK");
      return 1;
    }

    for (const [label, schema, table] of DOCUMENT_TABLES) {
      const cols = await columnsOf(client, schema, table);
      if (cols.size === 0) {
        out.push(`${label.padEnd(38)} NOT PRESENT — ${schema}.${table} does not exist`);
        problems++;
        continue;
      }

      const companyCol = ["operating_company_id", "company_id"].find((c) => cols.has(c));
      const scope = companyCol ? ` WHERE ${q(companyCol)} = $1` : "";
      const args = companyCol ? [USMCA] : [];

      const total = await client.query(
        `SELECT count(*)::int AS n FROM ${q(schema)}.${q(table)}${scope}`,
        args
      );

      // Voided is spelled differently across tables and we never guess: we look for the column.
      let voidedNote = "";
      const voidedCol = ["voided_at", "void_at", "voided", "is_void"].find((c) => cols.has(c));
      if (voidedCol) {
        const pred = voidedCol.endsWith("_at") ? `${q(voidedCol)} IS NOT NULL` : `${q(voidedCol)} = true`;
        const v = await client.query(
          `SELECT count(*)::int AS n FROM ${q(schema)}.${q(table)} ${scope ? scope + " AND" : "WHERE"} ${pred}`,
          args
        );
        voidedNote = ` · voided ${v.rows[0].n}`;
      }

      const scopeNote = companyCol ? `scoped by ${companyCol}` : "NOT COMPANY-SCOPED (whole table)";
      out.push(`${label.padEnd(38)} ${String(total.rows[0].n).padStart(7)}${voidedNote}  (${scopeNote})`);
      if (total.rows[0].n === 0) problems++;
    }

    // The bank feed: the owner says every line is back in For Review. Prove it, and prove that no
    // line claims a matched state with nothing matched (ROUND 368.2(b)).
    const bankCols = await columnsOf(client, "banking", "bank_transactions");
    const matchedCols = [...bankCols].filter((c) => c.startsWith("matched_")).sort();
    out.push(`matched_* columns on banking.bank_transactions: ${matchedCols.length} — ${matchedCols.join(", ") || "none"}`);
    if (matchedCols.length) {
      const anySet = matchedCols.map((c) => `${q(c)} IS NOT NULL`).join(" OR ");
      const companyCol = ["operating_company_id", "company_id"].find((c) => bankCols.has(c));
      const scope = companyCol ? `${q(companyCol)} = $1 AND ` : "";
      const args = companyCol ? [USMCA] : [];
      const r = await client.query(
        `SELECT count(*)::int AS n FROM banking.bank_transactions WHERE ${scope}(${anySet})`,
        args
      );
      out.push(`bank lines with ANY matched_* column set: ${r.rows[0].n}  (owner expects 0 after his undo)`);
      if (r.rows[0].n !== 0) problems++;
    }

    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`${LABEL} — USMCA ${USMCA}\n`);
  for (const line of out) console.log("  " + line);
  console.log("");

  if (problems) {
    console.log(
      `${LABEL}: ${problems} line(s) above need an explanation. A zero is not automatically wrong — ` +
        `but it is never an answer on its own. Check the entity, the filter, the RLS bypass, the join ` +
        `and the connection before concluding anything is missing.`
    );
  } else {
    console.log(`${LABEL}: every document table is present and populated, and no bank line claims a match.`);
  }
  // Census, not a gate: it reports. It never fails a push on a count the owner is about to change.
  return 0;
};

main().then((c) => process.exit(c)).catch((e) => {
  console.error(`${LABEL}: FAIL — ${e.message}`);
  process.exit(1);
});
