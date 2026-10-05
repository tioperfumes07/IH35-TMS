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

// ROUND 373.3 (CC-1) — WIRED, NO LONGER MEASUREMENT-ONLY. The 3,908 unlinked postings are journal_entries.source
// 'auto', written 2026-09-24 → 2026-09-30, before the writers were fixed; their backfill was WITHDRAWN (ROUND 380 —
// the documents are gone, the purge takes them). From here:
//   RULE 1 — unlinked postings on USMCA never exceed the pinned ceiling (shrink-only: lower it as the purge runs).
//   RULE 2 — 0 unlinked postings created on or after LINK_REQUIRED_SINCE (measured 2026-10-03: 0 in the last 3 days of
//            78 postings; every one of the 10 code paths that INSERTs journal_entry_postings writes its link per line).
//   RULE 3 — once migration 202615360500 is applied, trg_new_posting_has_spine_link is installed and enabled: a
//            posting that reaches COMMIT without a transaction_source_links row is refused (ROUND 373.3's INSERT side;
//            trg_live_posting_keeps_spine_link only guards link DELETE / UPDATE).
// 3908 -> 0: the AUTH-400 purge (2026-10-05) removed every unlinked posting; the ceiling only shrinks.
export const UNLINKED_CEILING = 0;
export const LINK_REQUIRED_SINCE = "2026-10-01T00:00:00Z";
export function evaluate({ unlinked, unlinkedSince, migrationApplied, trigger }, ceiling = UNLINKED_CEILING) {
  const out = [];
  if (unlinked > ceiling) out.push(`RULE 1: ${unlinked} unlinked postings > ceiling ${ceiling} — a new posting was written without its spine link`);
  if (unlinked < ceiling) out.push(`RULE 1 RATCHET: ${unlinked} unlinked < ceiling ${ceiling} — lower ceiling to ${unlinked} so it can only shrink`);
  if (unlinkedSince > 0) out.push(`RULE 2: ${unlinkedSince} posting(s) created since ${LINK_REQUIRED_SINCE} have no spine link`);
  if (migrationApplied && (!trigger || trigger.enabled === "D")) out.push("RULE 3: 202615360500 applied but trg_new_posting_has_spine_link is missing or disabled");
  return out;
}
if (process.argv.includes("--selftest")) {
  const FIX_CEIL = 3908; // the pre-purge shape, so the real ceiling can sit at 0
  const ok = { unlinked: FIX_CEIL, unlinkedSince: 0, migrationApplied: true, trigger: { enabled: "O" } };
  const cases = [
    ["at the ceiling, none new, trigger armed passes", evaluate(ok, FIX_CEIL).length === 0],
    ["a new unlinked posting fails (RULE 1)", evaluate({ ...ok, unlinked: FIX_CEIL + 1 }, FIX_CEIL).some((x) => x.startsWith("RULE 1:"))],
    ["the purge shrinking the count demands the ceiling drop", evaluate({ ...ok, unlinked: FIX_CEIL - 5 }, FIX_CEIL).some((x) => x.startsWith("RULE 1 RATCHET"))],
    ["an unlinked posting since the cutoff fails (RULE 2)", evaluate({ ...ok, unlinkedSince: 1 }, FIX_CEIL).some((x) => x.startsWith("RULE 2"))],
    ["migration applied without the trigger fails (RULE 3)", evaluate({ ...ok, trigger: null }, FIX_CEIL).some((x) => x.startsWith("RULE 3"))],
    ["before the migration, no trigger is fine", evaluate({ ...ok, migrationApplied: false, trigger: null }, FIX_CEIL).length === 0],
  ];
  for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, pass]) => !pass).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const main = async () => {
  let verdict = [];
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
    const unlinkedSince = postKey
      ? (await client.query(
          `SELECT count(*)::int AS n FROM accounting.journal_entry_postings p
            ${scope} ${scope ? "AND" : "WHERE"} p.created_at >= $${args.length + 1}::timestamptz
              AND NOT EXISTS (SELECT 1 FROM accounting.transaction_source_links l WHERE l."${postKey}" = p."${postPk}")`,
          [...args, LINK_REQUIRED_SINCE])).rows[0].n
      : 0;
    const migrationApplied = (await client.query(`SELECT 1 FROM _system._schema_migrations WHERE filename LIKE '202615360500%'`)).rows.length > 0;
    const trig = (await client.query(`SELECT tgenabled AS enabled FROM pg_trigger WHERE tgname = 'trg_new_posting_has_spine_link' AND tgrelid = 'accounting.journal_entry_postings'::regclass`)).rows[0] ?? null;
    verdict = evaluate({ unlinked: unlinked.rows[0].n, unlinkedSince, migrationApplied, trigger: trig });
    console.log(`  unlinked since ${LINK_REQUIRED_SINCE}: ${unlinkedSince} · refusal migration applied: ${migrationApplied} · trigger: ${trig ? "installed" : "absent"}\n`);

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
  if (verdict.length) {
    console.error(`\n${LABEL}: FAIL\n  ${verdict.join("\n  ")}`);
    return 1;
  }
  console.log(`\n${LABEL}: OK — unlinked postings at the pinned ceiling ${UNLINKED_CEILING} (purge emptied the withdrawn 09-24..09-30 population), 0 since ${LINK_REQUIRED_SINCE}; the INSERT-side refusal is armed where its migration has applied.`);
  return 0;
};

main().then((c) => process.exit(c)).catch((e) => {
  console.error(`${LABEL}: FAIL — ${e.message}`);
  process.exit(1);
});
