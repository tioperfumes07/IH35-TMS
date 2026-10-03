#!/usr/bin/env node
// verify-every-posting-has-its-spine-link.mjs — ROUND 373 (Lead, 2026-10-03).
//
// THE HOLE: the Lead's census found 7,909 journal entry postings on USMCA and only 4,355 rows in
// accounting.transaction_source_links. Roughly 3,500 postings cannot name the document that caused
// them. That is the spine, and a posting with no spine link is a number in the ledger that nothing
// in the system can explain.
//
// This does not guess at the cause. It measures WHICH postings are unlinked, grouped by the journal
// entry's own source/type and by date, so the writer behind each group can be named. "Roughly 3,500"
// is not a finding. "N postings from <this source>, written between <these dates>, by <this writer>"
// is a finding.
//
// READ ONLY. BEGIN READ ONLY, app.bypass_rls = 'lucia', USMCA only, DIRECT endpoint — a 0 from the
// pooler is MASKED, not empty.
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-every-posting-has-its-spine-link";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const cols = async (client, schema, table) => {
  const { rows } = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
    [schema, table]
  );
  return rows;
};

const main = async () => {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);

    const who = await client.query(`SELECT current_user AS u`);
    if (who.rows[0].u === "ih35_app") {
      console.error(`${LABEL}: FAIL — connected as ih35_app (the POOLER). Every count would be masked.`);
      await client.query("ROLLBACK");
      return 1;
    }
    console.log(`${LABEL} — USMCA ${USMCA} · role ${who.rows[0].u}\n`);

    // Never guess a column. Read the shape of both sides first and print it, so the next reader of
    // this output can check the join themselves instead of trusting it.
    const linkCols = await cols(client, "accounting", "transaction_source_links");
    const postCols = await cols(client, "accounting", "journal_entry_postings");
    const jeCols = await cols(client, "accounting", "journal_entries");
    console.log("  transaction_source_links columns: " + linkCols.map((c) => c.column_name).join(", "));
    console.log("  journal_entry_postings columns:   " + postCols.map((c) => c.column_name).join(", "));
    console.log("");

    const linkNames = new Set(linkCols.map((c) => c.column_name));
    const postNames = new Set(postCols.map((c) => c.column_name));
    const jeNames = new Set(jeCols.map((c) => c.column_name));

    // The spine may hang off the posting or off the journal entry. Find which, rather than assuming.
    const postKey = ["journal_entry_posting_id", "posting_id"].find((c) => linkNames.has(c));
    const jeKey = ["journal_entry_uuid", "journal_entry_id"].find((c) => linkNames.has(c));
    const postPk = ["journal_entry_posting_id", "posting_id", "id"].find((c) => postNames.has(c));
    const postJeFk = ["journal_entry_uuid", "journal_entry_id"].find((c) => postNames.has(c));
    const jePk = ["journal_entry_uuid", "journal_entry_id", "id"].find((c) => jeNames.has(c));
    const companyCol = postNames.has("operating_company_id") ? "operating_company_id" : null;

    console.log(`  spine hangs off: posting key = ${postKey ?? "(none)"} · journal entry key = ${jeKey ?? "(none)"}`);
    console.log(`  postings pk = ${postPk} · postings -> je fk = ${postJeFk} · je pk = ${jePk}\n`);

    const scope = companyCol ? `WHERE p."${companyCol}" = $1` : "";
    const args = companyCol ? [USMCA] : [];

    const totals = await client.query(
      `SELECT count(*)::int AS postings FROM accounting.journal_entry_postings p ${scope}`, args);
    console.log(`  postings in scope: ${totals.rows[0].postings}`);

    // Unlinked, by whichever key the spine actually uses.
    let unlinkedSql;
    if (postKey) {
      unlinkedSql = `
        SELECT count(*)::int AS n FROM accounting.journal_entry_postings p
        ${scope} ${scope ? "AND" : "WHERE"} NOT EXISTS (
          SELECT 1 FROM accounting.transaction_source_links l WHERE l."${postKey}" = p."${postPk}")`;
    } else if (jeKey && postJeFk) {
      unlinkedSql = `
        SELECT count(*)::int AS n FROM accounting.journal_entry_postings p
        ${scope} ${scope ? "AND" : "WHERE"} NOT EXISTS (
          SELECT 1 FROM accounting.transaction_source_links l WHERE l."${jeKey}" = p."${postJeFk}")`;
    }

    if (!unlinkedSql) {
      console.log("  CANNOT JOIN — the spine table carries neither a posting key nor a journal-entry key this script knows.");
      console.log("  That is the finding: report the two column lists above to the Lead. Nothing is guessed here.");
      await client.query("ROLLBACK");
      return 0;
    }

    const unlinked = await client.query(unlinkedSql, args);
    console.log(`  postings with NO spine link: ${unlinked.rows[0].n}\n`);

    // Group the unlinked by the journal entry's own source, so each group names a writer.
    const srcCol = ["source_type", "source", "entry_type", "kind", "origin"].find((c) => jeNames.has(c));
    if (srcCol && postJeFk && jePk) {
      const bySrc = await client.query(
        `SELECT COALESCE(je."${srcCol}"::text, '(null)') AS src,
                count(*)::int AS n,
                min(je.created_at)::date AS first_seen,
                max(je.created_at)::date AS last_seen
           FROM accounting.journal_entry_postings p
           JOIN accounting.journal_entries je ON je."${jePk}" = p."${postJeFk}"
          ${scope} ${scope ? "AND" : "WHERE"} NOT EXISTS (
            SELECT 1 FROM accounting.transaction_source_links l
             WHERE l."${postKey ?? jeKey}" = p."${postKey ? postPk : postJeFk}")
          GROUP BY 1 ORDER BY 2 DESC`, args);
      console.log(`  unlinked postings by journal_entries.${srcCol} — each row names a writer to fix:\n`);
      for (const r of bySrc.rows) {
        console.log(`    ${String(r.n).padStart(6)}  ${String(r.src).padEnd(38)} ${r.first_seen} → ${r.last_seen}`);
      }
    } else {
      console.log(`  journal_entries has no source-type column this script recognises (looked for: source_type, source, entry_type, kind, origin).`);
      console.log(`  columns present: ${jeCols.map((c) => c.column_name).join(", ")}`);
    }

    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
  console.log(`\n${LABEL}: measurement only — it reports, it does not fail a push.`);
  return 0;
};

main().then((c) => process.exit(c)).catch((e) => {
  console.error(`${LABEL}: FAIL — ${e.message}`);
  process.exit(1);
});
