/**
 * LEAD rows 257 (ENG-22) + 251 (ENG-13) — 10-25-2026. Dry run by default; --apply commits.
 *
 * ENG-22: booking defaulted load_trailer_equipment_id to DRY_VAN whenever the wizard sent no pick (engine fixed in the
 * same PR). Measured USMCA: 191 "Dry Van" loads — the company trailer that rode them was a Reefer on 100, a Flatbed on
 * 51, a Dry Van on 28, none on 12. Repair: a load still on the DRY_VAN default whose ASSIGNED COMPANY TRAILER has a
 * different equipment_type takes the trailer's type (evidence = the trailer on dispatch.load_assignment_history).
 * mdata.loads.trailer_type (text) is re-synced from the catalog code on every load so the two never disagree.
 * ENG-13: trailer_source NULL on 129 loads. 'company' where a company trailer is on the load's assignment history;
 * 'customer' where a live trailer interchange (non-owned trailer) exists. No evidence -> left NULL and listed.
 * Never guesses: loads with no assigned trailer are listed, not changed. Books (TB) must be identical.
 */
import pg from "pg";

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
// Owner authorization (verify-no-unauthorized-production-write): an --apply refuses unless AUTH-470 is open on main.
if (APPLY) {
  const { execFileSync } = await import("node:child_process");
  try { execFileSync("node", ["scripts/verify-owner-authorization.mjs", process.env.OWNER_AUTH_ID ?? "AUTH-470"], { stdio: "inherit" }); } catch { process.exit(1); }
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const out: Record<string, unknown> = { mode: APPLY ? "APPLY" : "DRY RUN (rolled back)" };
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  await client.query("SET LOCAL lock_timeout = '20s'");
  const tb = async () =>
    (await client.query(`SELECT a.account_number, SUM(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END)::bigint bal
                           FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id = p.account_id
                          WHERE p.operating_company_id = $1::uuid GROUP BY 1 ORDER BY 1`, [CO])).rows;
  const before = await tb();

  const evidence = `
    WITH tr AS (
      SELECT DISTINCT ON (h.load_id) h.load_id, h.new_trailer_id
        FROM dispatch.load_assignment_history h
       WHERE h.new_trailer_id IS NOT NULL
       ORDER BY h.load_id, h.created_at DESC
    )
    SELECT l.id, l.load_number, lte.code AS booked, e.equipment_number, e.equipment_type::text AS trailer_type,
           target.id AS target_id, target.code AS target_code
      FROM mdata.loads l
      JOIN catalogs.load_trailer_equipment lte ON lte.id = l.load_trailer_equipment_id
      JOIN tr ON tr.load_id = l.id
      JOIN mdata.equipment e ON e.id = tr.new_trailer_id
      JOIN catalogs.load_trailer_equipment target
        ON target.operating_company_id = l.operating_company_id AND target.is_active
       AND target.code = CASE lower(regexp_replace(e.equipment_type::text, '[^A-Za-z]', '', 'g'))
                           WHEN 'reefer' THEN 'REFRIGERATED_VAN' WHEN 'flatbed' THEN 'FLATBED'
                           WHEN 'dryvan' THEN 'DRY_VAN' WHEN 'lowboy' THEN 'LOWBOY' END
     WHERE l.operating_company_id = $1 AND l.status::text <> 'cancelled'
       AND lte.code = 'DRY_VAN' AND target.code <> 'DRY_VAN'`;
  const changes = (await client.query(evidence, [CO])).rows;
  out.equipment_changes = changes.length;
  out.equipment_by_target = changes.reduce((m: Record<string, number>, r: { target_code: string }) => ((m[r.target_code] = (m[r.target_code] ?? 0) + 1), m), {});
  // one set-based UPDATE in id order (a per-row loop deadlocked with live crons touching mdata.loads)
  if (changes.length) {
    await client.query(`SELECT 1 FROM mdata.loads WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [changes.map((r: { id: string }) => r.id)]);
    await client.query(
      `UPDATE mdata.loads l SET load_trailer_equipment_id = v.target_id::uuid, updated_at = now()
         FROM unnest($1::uuid[], $2::uuid[]) AS v(id, target_id) WHERE l.id = v.id`,
      [changes.map((r: { id: string }) => r.id), changes.map((r: { target_id: string }) => r.target_id)]
    );
    for (const r of changes) {
      await client.query(`SELECT audit.append_event($1::text, $2::text, $3::jsonb, NULL::uuid, $4::text)`, [
        "dispatch.load_trailer_equipment_corrected", "info",
        JSON.stringify({ load_id: r.id, load_number: r.load_number, from: r.booked, to: r.target_code,
          basis: `assigned company trailer ${r.equipment_number} is ${r.trailer_type}`, rows: "257 ENG-22" }),
        "LEAD-ROW-257",
      ]);
    }
  }

  // text column re-synced from the catalog code on every USMCA load (single source)
  out.trailer_type_text_synced = (await client.query(
    `UPDATE mdata.loads l SET trailer_type = lower(lte.code), updated_at = now()
       FROM catalogs.load_trailer_equipment lte
      WHERE lte.id = l.load_trailer_equipment_id AND l.operating_company_id = $1
        AND l.trailer_type IS DISTINCT FROM lower(lte.code)
        AND lower(lte.code) IN ('refrigerated_van','dry_van','flatbed','lowboy','power_only_no_trailer','power_only_customer_trailer')`,
    [CO])).rowCount;

  // ENG-13 trailer_source from evidence
  out.trailer_source_company = (await client.query(
    `UPDATE mdata.loads l SET trailer_source = 'company', updated_at = now()
      WHERE l.operating_company_id = $1 AND l.trailer_source IS NULL AND l.status::text <> 'cancelled'
        AND EXISTS (SELECT 1 FROM dispatch.load_assignment_history h JOIN mdata.equipment e ON e.id = h.new_trailer_id
                     WHERE h.load_id = l.id AND COALESCE(e.currently_leased_to_company_id, e.owner_company_id) = l.operating_company_id)`,
    [CO])).rowCount;
  out.trailer_source_customer = (await client.query(
    `UPDATE mdata.loads l SET trailer_source = 'customer', updated_at = now()
      WHERE l.operating_company_id = $1 AND l.trailer_source IS NULL AND l.status::text <> 'cancelled'
        AND EXISTS (SELECT 1 FROM dispatch.trailer_interchanges t WHERE t.load_id = l.id AND t.voided_at IS NULL)`,
    [CO])).rowCount;
  out.no_evidence_left_null = (await client.query(
    `SELECT l.load_number FROM mdata.loads l WHERE l.operating_company_id = $1 AND l.status::text <> 'cancelled' AND l.trailer_source IS NULL ORDER BY 1`,
    [CO])).rows.map((r: { load_number: string }) => r.load_number);

  const after = await tb();
  out.books_identical = JSON.stringify(before) === JSON.stringify(after);
  if (!out.books_identical) throw new Error(`books moved: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  if (APPLY) { await client.query("COMMIT"); out.status = "COMMITTED"; }
  else { await client.query("ROLLBACK"); out.status = "DRY_RUN_ROLLED_BACK"; }
} catch (e) {
  await client.query("ROLLBACK").catch(() => undefined);
  out.status = "ROLLED_BACK_ERROR";
  out.error = String((e as Error).message).slice(0, 400);
} finally {
  await client.end();
}
console.log(JSON.stringify(out, null, 2));
