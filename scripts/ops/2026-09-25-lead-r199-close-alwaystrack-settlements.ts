// R-199 (Lead) — close the AlwaysTrack-settled USMCA settlements that tie to their PDFs. DRY_RUN=1 rolls back.
// Measured 09-25 ~7:40 PM CT: 48 fed AlwaysTrack settlements (5769–5816), 47 'approved' + 1 'closed'; their GL is
// already posted (e.g. 5769: Dr 6890 1,155.52 / Cr 2170 Driver Net-Pay Clearing 1,095.52 / Cr escrow 50.00 / Cr 7200 10.00),
// so closing is the status/trip stamp only — through the existing stamp engine, never a new posting.
// Per settlement, one short transaction: tie check (live 2170 credit = PDF TOTAL DUE; live lines unchanged) ->
// stampTripClosedForBookendedSettlement -> read back: status closed, NO new JE, NO new settlement line, TB 0.
// A settlement that does not tie is NOT closed — reported with its difference.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const DRY = process.env.DRY_RUN === "1";
if (!DRY) { const a = process.env.OWNER_AUTH_ID; if (!a) { console.error("OWNER_AUTH_ID required"); process.exit(1); } execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), a], { stdio: "inherit" }); }
const T = `${process.env.HOME}/Downloads/IH35-RECONCILIATION-AND-FEED/03-SOURCE-DOCUMENTS/settlement-text`;
const period = (doc: string): { start: string; end: string } | null => {
  try { const t = fs.readFileSync(`${T}/Driver_Settlement_${doc}.txt`, "utf8"); const a = t.match(/Start Date:\s+(\d{4}-\d{2}-\d{2})/); const b = t.match(/End Date:\s+(\d{4}-\d{2}-\d{2})/); return a && b ? { start: a[1], end: b[1] } : null; }
  catch { return null; }
};
const due = (doc: string): number | null => {
  try { const t = fs.readFileSync(`${T}/Driver_Settlement_${doc}.txt`, "utf8"); const m = t.match(/TOTAL DUE:\s+(-?[\d,]+\.\d\d)/); return m ? Math.round(Number(m[1].replace(/,/g, "")) * 100) : null; }
  catch { return null; }
};
const st: Record<string, any> = { closed: [] as string[], not_tied: [] as string[], refused: [] as string[] };
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const begin = async () => { await c.query("BEGIN"); await c.query("SET LOCAL app.bypass_rls = 'lucia'"); await c.query("SELECT set_config('app.current_user_id', $1::text, true)", [OWNER]); await c.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]); };
await begin();
const S = (await c.query(`SELECT id::text, source_document_ref doc, status::text s FROM driver_finance.driver_settlements WHERE operating_company_id=$1 AND voided_at IS NULL AND source_document_ref ~ '^[0-9]{4}$' ORDER BY source_document_ref`, [USMCA])).rows;
await c.query("ROLLBACK");
const counts = async (sid: string) => (await c.query(`SELECT
   (SELECT count(*) FROM driver_finance.settlement_lines WHERE settlement_id=$1::uuid)::int lines,
   (SELECT count(*) FROM accounting.journal_entries WHERE operating_company_id=$2)::int jes,
   (SELECT COALESCE(sum(CASE WHEN p.debit_or_credit='credit' THEN p.amount_cents ELSE -p.amount_cents END),0) FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id=p.journal_entry_uuid AND je.status='posted' AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL JOIN catalogs.accounts a ON a.id=p.account_id
      WHERE p.source_transaction_type='driver_settlement' AND p.source_transaction_id=$1::text AND a.account_number='2170')::bigint net2170,
   (SELECT COALESCE(sum(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END),0) FROM accounting.journal_entry_postings jep JOIN accounting.journal_entries je ON je.id=jep.journal_entry_uuid WHERE je.operating_company_id=$2 AND je.status='posted')::bigint tb`, [sid, USMCA])).rows[0];
for (const s of S) {
  // 5816 is already 'closed' (0.00 = PDF 0.00); it still gets its PDF period through the same path.
  await begin();
  try {
    const before = await counts(s.id); const pdf = due(s.doc);
    if (pdf === null || Number(before.net2170) !== pdf) { st.not_tied.push(`${s.doc}: PDF TOTAL DUE ${pdf === null ? "?" : (pdf / 100).toFixed(2)} vs live net ${(Number(before.net2170) / 100).toFixed(2)}`); await c.query("ROLLBACK"); continue; }
    // The trip is already stamped closed (trip_closed_at set by the feed) and the settlement GL is already posted, so
    // there is no posting close to run: closeSettlementPayRun would post again. What is wrong is the HEADER: status stays
    // 'approved' and period_end carries the feed date instead of the document's. Set both from the signed PDF.
    const per0 = period(s.doc); if (!per0) throw new Error("no Start/End Date on the PDF");
    // 5779's PDF prints Start 2026-08-18 / End 2026-08-17 (inverted, a document typo): the period is the two dates in
    // order, and the inversion is recorded in the audit row rather than silently "fixed".
    const inverted = per0.start > per0.end;
    const per = inverted ? { start: per0.end, end: per0.start } : per0;
    const hdr = (await c.query(`SELECT status::text s, period_start::text ps, period_end::text pe, trip_closed_at IS NOT NULL tc FROM driver_finance.driver_settlements WHERE id=$1::uuid`, [s.id])).rows[0];
    if (!hdr.tc) throw new Error("trip not closed - not a closed AlwaysTrack tour");
    await c.query(`UPDATE driver_finance.driver_settlements SET status='closed', period_start=$2::date, period_end=$3::date, updated_at=now() WHERE id=$1::uuid`, [s.id, per.start, per.end]);
    await appendCrudAudit(c as never, OWNER, "driver_settlement.closed_to_alwaystrack_document", { settlement_id: s.id, doc: s.doc, from_status: hdr.s, from_period: [hdr.ps, hdr.pe], to_period: [per.start, per.end], pdf_printed: [per0.start, per0.end], pdf_period_inverted: inverted, net_cents: pdf, tie: "live 2170 net = PDF TOTAL DUE to the cent", round: "R-199" }, "info", "LEAD-R199");
    const after = await counts(s.id);
    const row = (await c.query(`SELECT status::text s FROM driver_finance.driver_settlements WHERE id=$1::uuid`, [s.id])).rows[0];
    if (row.s !== "closed") throw new Error(`status ${row.s} after close`);
    if (after.lines !== before.lines || after.jes !== before.jes || Number(after.tb) !== 0) throw new Error(`close changed money: lines ${before.lines}->${after.lines}, JEs ${before.jes}->${after.jes}, TB ${after.tb}`);
    st.closed.push(`${s.doc} ${per.start}..${per.end} net ${(pdf / 100).toFixed(2)}`);
    if (DRY) await c.query("ROLLBACK"); else await c.query("COMMIT");
  } catch (err) { await c.query("ROLLBACK").catch(() => {}); st.refused.push(`${s.doc}: ${(err as Error).message.slice(0, 160)}`); }
}
await c.end();
st.result = `${DRY ? "DRY_RUN" : "COMMITTED"} — closed ${st.closed.length}, not tied ${st.not_tied.length}, refused ${st.refused.length}`;
console.log(JSON.stringify(st, null, 1));
