// R-195 (Lead) — void the minted, empty pre-settlement P-0006 (ecb8b27f…), unlink load 90007.
// Measured 09-25 06:20 PM CT: P-0006 was minted as "5817" by the settlement link engine in the Lead's R-168 run
// (the AlwaysTrack-sequence allocator), renumbered P-0006 in R-189A. It is open, carries 0 settlement lines,
// 0 driver bills, and its ONLY linked load is 90007 — the Transportation-era load (shared Faro account) that the
// owner's handoff law and the ROUND 153 closing guard (ITEM1) say does not belong in USMCA. It is an artifact,
// same class as the "5819" shell voided in R-189A. verify-no-empty-zero-settlement FAILS on it (every seat's push).
// One transaction: re-measure (refuse on any drift) -> unlink 90007 -> void the settlement (void, never delete)
// -> audit -> read back -> TB 0. Load 90007 itself is NOT cancelled here (that is the closing guard's ITEM1 work).
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const SID = "ecb8b27f-2a5d-434a-8b3f-a2a921c5dd7f";
const TAG = "R-195";
const DRY = process.env.DRY_RUN === "1";
if (!DRY) {
  const auth = process.env.OWNER_AUTH_ID;
  if (!auth) { console.error("OWNER_AUTH_ID required"); process.exit(1); }
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit" });
}
class Rollback extends Error {}
const st: Record<string, unknown> = {};
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect(); await c.query("BEGIN");
await c.query("SET LOCAL app.bypass_rls = 'lucia'");
await c.query("SELECT set_config('app.current_user_id', $1::text, true)", [OWNER]);
await c.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);
let ok = false;
try {
  const s = (await c.query(`SELECT id::text, display_id, status::text, source_document_ref, voided_at FROM driver_finance.driver_settlements WHERE id=$1::uuid AND operating_company_id=$2`, [SID, USMCA])).rows[0];
  if (!s || s.display_id !== "P-0006" || s.status !== "open" || s.voided_at || s.source_document_ref) throw new Error(`drift: ${JSON.stringify(s)}`);
  const lines = Number((await c.query(`SELECT count(*) n FROM driver_finance.settlement_lines WHERE settlement_id=$1::uuid`, [SID])).rows[0].n);
  // Measured: exactly one driver bill points here — 33fed2b1 (load 90007, $0.00, open, 0 GL postings, notes "Faro inv 7
  // ITS $350 accessorial — outcome arm"). It is detached from the voided settlement, not touched otherwise.
  const billRows = (await c.query(`SELECT b.id::text, b.gross_amount_cents::bigint g, b.status::text s, l.load_number,
      (SELECT count(*) FROM accounting.journal_entry_postings p WHERE p.source_transaction_id=b.id::text) p
      FROM driver_finance.driver_bills b JOIN mdata.loads l ON l.id=b.load_id WHERE b.settled_in_settlement_id=$1::uuid`, [SID])).rows;
  const bills = billRows.length;
  const loads = (await c.query(`SELECT id::text, load_number FROM mdata.loads WHERE presettlement_link_id=$1::uuid`, [SID])).rows;
  if (lines !== 0 || bills !== 1 || billRows[0].load_number !== "90007" || Number(billRows[0].g) !== 0 || Number(billRows[0].p) !== 0 || loads.length !== 1 || loads[0].load_number !== "90007")
    throw new Error(`drift: lines ${lines} bills ${JSON.stringify(billRows)} loads ${JSON.stringify(loads)}`);
  await c.query(`UPDATE driver_finance.driver_bills SET settled_in_settlement_id=NULL, updated_at=now() WHERE id=$1::uuid`, [billRows[0].id]);
  await appendCrudAudit(c as never, OWNER, "driver_bill.detached_from_voided_presettlement", { bill: billRows[0].id, load: "90007", settlement_id: SID, gross_cents: 0, round: TAG }, "info", "LEAD-R195");
  const jes = Number((await c.query(`SELECT count(*) n FROM accounting.journal_entry_postings WHERE source_transaction_id=$1`, [SID])).rows[0].n);
  if (jes !== 0) throw new Error(`settlement has ${jes} GL postings — refusing`);
  await c.query(`UPDATE mdata.loads SET presettlement_link_id=NULL, updated_at=now() WHERE id=$1::uuid`, [loads[0].id]);
  await appendCrudAudit(c as never, OWNER, "load.presettlement_unlinked", { load: "90007", load_id: loads[0].id, settlement_id: SID, display_id: "P-0006", reason: "minted empty pre-settlement voided; 90007 is the Transportation-era load (ROUND 153 ITEM1)", round: TAG }, "info", "LEAD-R195");
  await c.query(`UPDATE driver_finance.driver_settlements SET voided_at=now(), void_reason=$2, voided_by_user_id=$3::uuid, status='cancelled', updated_at=now() WHERE id=$1::uuid`,
    [SID, `${TAG}: pre-settlement minted as "5817" by the AlwaysTrack-sequence allocator (Lead R-168 engine call), renumbered P-0006 in R-189A; 0 lines, 0 bills, its only load 90007 is the Transportation-era load — voided`, OWNER]);
  await appendCrudAudit(c as never, OWNER, "driver_settlement.voided_minted_shell", { settlement_id: SID, display_id: "P-0006", minted_as: "5817", round: TAG }, "warning", "LEAD-R195");
  const back = (await c.query(`SELECT status::text, voided_at IS NOT NULL v, (SELECT count(*) FROM mdata.loads WHERE presettlement_link_id=$1::uuid) + (SELECT count(*) FROM driver_finance.driver_bills WHERE settled_in_settlement_id=$1::uuid) n FROM driver_finance.driver_settlements WHERE id=$1::uuid`, [SID])).rows[0];
  if (back.status !== "cancelled" || !back.v || Number(back.n) !== 0) throw new Error(`read-back failed ${JSON.stringify(back)}`);
  const tb = Number((await c.query(`SELECT COALESCE(sum(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END),0) net FROM accounting.journal_entry_postings jep JOIN accounting.journal_entries je ON je.id=jep.journal_entry_uuid WHERE je.operating_company_id=$1 AND je.status='posted'`, [USMCA])).rows[0].net);
  Object.assign(st, { settlement: "P-0006 " + SID, before: { lines, bills, loads: loads.map((l) => l.load_number) }, after: back, tb_net_cents: tb });
  if (tb !== 0) throw new Error(`TB ${tb}`);
  if (DRY) throw new Rollback("dry");
  await c.query("COMMIT"); ok = true; st.result = "COMMITTED";
} catch (err) {
  st.result = err instanceof Rollback ? "DRY_RUN rolled back" : "FAILED — rolled back: " + (err as Error).message;
} finally { if (!ok) await c.query("ROLLBACK").catch(() => {}); await c.end(); }
console.log(JSON.stringify(st, null, 1));
process.exit(String(st.result).startsWith("FAILED") ? 1 : 0);
