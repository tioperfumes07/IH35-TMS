#!/usr/bin/env node
// ROUND 443.292-F void — P-0123 (Carlos Pena) and P-0124 (Jose Antonio Vicente) closed 10-23
// with 0 lines, $0.00. The close engine now refuses empty shells; these two must be voided.
// Guard: verify-no-empty-zero-settlement. TB must be 0 before and after (no GL postings exist).
// DRY_RUN=1 rolls back. Run in close order (P-0123 first, then P-0124).
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const LABEL = "443.292-F-void-empty-settlements";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const DISPLAY_IDS = ["P-0123", "P-0124"];
const VOID_REASON = "443.292-F: closed 10-23-2026 with 0 settlement lines and $0.00 — empty shell voided per engine enforcement";
const DRY = process.env.DRY_RUN === "1";

class Rollback extends Error {}

async function voidSettlement(connectionString, displayId) {
  const c = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query("BEGIN");
  await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
  const st = { settlement: displayId };
  let ok = false;
  try {
    // Look up and lock
    const row = (await c.query(
      `SELECT id::text, display_id, status, source_document_ref, voided_at,
              net_pay::numeric n, gross_pay::numeric g
         FROM driver_finance.driver_settlements
        WHERE operating_company_id = $1::uuid AND display_id = $2
          FOR UPDATE`,
      [USMCA, displayId]
    )).rows[0];
    if (!row) throw new Error(`${displayId} not found`);
    if (row.voided_at) { st.note = "already voided — skipping"; throw new Rollback("already_voided"); }

    // Measure: must have 0 active lines and 0 GL postings
    const linesCount = Number((await c.query(
      `SELECT count(*) n FROM driver_finance.settlement_lines WHERE settlement_id=$1::uuid AND is_active=true`,
      [row.id]
    )).rows[0].n);
    const glCount = Number((await c.query(
      `SELECT count(*) n FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid AND source_transaction_id=$2`,
      [USMCA, row.id]
    )).rows[0].n);
    const linkedLoads = (await c.query(
      `SELECT id::text, load_number FROM mdata.loads WHERE presettlement_link_id=$1::uuid AND soft_deleted_at IS NULL`,
      [row.id]
    )).rows;
    const linkedBills = (await c.query(
      `SELECT id::text FROM driver_finance.driver_bills WHERE settled_in_settlement_id=$1::uuid AND voided_at IS NULL`,
      [row.id]
    )).rows;

    if (linesCount !== 0) throw new Error(`${displayId} has ${linesCount} active lines — not empty`);
    if (glCount !== 0) throw new Error(`${displayId} has ${glCount} GL postings — cannot void without a GL reversal`);
    if (Number(row.g) !== 0 || Number(row.n) !== 0) throw new Error(`${displayId} gross=${row.g} net=${row.n} — expected $0.00`);

    // Release loads
    if (linkedLoads.length) {
      await c.query(
        `UPDATE mdata.loads SET presettlement_link_id=NULL, updated_at=now() WHERE presettlement_link_id=$1::uuid`,
        [row.id]
      );
      await appendCrudAudit(c, OWNER, "load.presettlement_unlinked_on_settlement_void",
        { settlement_id: row.id, display_id: displayId, loads: linkedLoads.map((l) => l.load_number), round: LABEL },
        "info", LABEL);
    }

    // Release bills
    if (linkedBills.length) {
      await c.query(
        `UPDATE driver_finance.driver_bills SET settled_in_settlement_id=NULL, updated_at=now() WHERE settled_in_settlement_id=$1::uuid AND voided_at IS NULL`,
        [row.id]
      );
    }

    // Void the settlement
    await c.query(
      `UPDATE driver_finance.driver_settlements
          SET voided_at=now(), void_reason=$2, voided_by_user_id=$3::uuid, status='cancelled', updated_at=now()
        WHERE id=$1::uuid`,
      [row.id, VOID_REASON, OWNER]
    );
    await appendCrudAudit(c, OWNER, "driver_finance.settlement.voided_empty_shell",
      { resource_type: "driver_finance.driver_settlements", resource_id: row.id, operating_company_id: USMCA,
        display_id: displayId, status_was: row.status, lines_count: linesCount, gl_count: glCount,
        loads_released: linkedLoads.map((l) => l.load_number), void_reason: VOID_REASON, round: LABEL },
      "warning", LABEL);

    // TB check
    const tb = Number((await c.query(
      `SELECT COALESCE(sum(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END),0) net
         FROM accounting.journal_entry_postings jep
         JOIN accounting.journal_entries je ON je.id=jep.journal_entry_uuid
        WHERE je.operating_company_id=$1 AND je.status='posted'`,
      [USMCA]
    )).rows[0].net);
    if (tb !== 0) throw new Error(`TB ${tb} ≠ 0 after void`);

    Object.assign(st, { id: row.id, lines_count: linesCount, gl_count: glCount,
      loads_released: linkedLoads.map((l) => l.load_number), tb_net_cents: tb, result: "OK" });
    if (DRY) throw new Rollback("dry");
    await c.query("COMMIT"); ok = true; st.committed = true;
  } catch (err) {
    st.error = err instanceof Rollback ? `ROLLBACK: ${err.message}` : (err instanceof Error ? err.message : String(err));
    if (!(err instanceof Rollback)) st.result = "FAILED";
  } finally { if (!ok) await c.query("ROLLBACK").catch(() => {}); await c.end(); }
  return st;
}

async function main() {
  if (!DRY) {
    const authId = process.env.OWNER_AUTH_ID;
    if (!authId) {
      console.error("OWNER_AUTH_ID required for live run (DRY_RUN=1 to rehearse).");
      process.exit(1);
    }
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), authId], {
      stdio: "inherit",
    });
  }
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL required"); process.exit(1); }
  const results = [];
  for (const did of DISPLAY_IDS) {
    const r = await voidSettlement(process.env.DATABASE_URL, did);
    results.push(r);
    if (r.result === "FAILED") { console.error(`FAILED on ${did}: ${r.error}`); break; }
  }
  console.log(JSON.stringify(results, null, 2));
  if (results.some((r) => r.result === "FAILED")) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
