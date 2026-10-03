#!/usr/bin/env node
// U22 (owner, 2026-10-03) — the Reclassify register's Num column rendered empty for 3,860 of 5,416 USMCA expense
// postings: they are the reversal pairs of expenses later PURGED, so the document lookup found no row. The number
// survives in the WORM audit trail (the DELETE's old_data); the register must read it there and mark the line purged.
//
// Static: LINE_SELECT falls back to audit.row_changes for a purged expense / bill / invoice, flags document_purged,
// the drill map sends a purged line to its journal entry, and no per-row document lookup compares a key as text (that
// defeated the primary-key index: 39 s for USMCA's fiscal year, 0.36 s as uuid).
// Live: names how many purged documents have NO number even in the audit trail (Num stays empty for those only).
import { readFileSync } from "node:fs";
import { NOT_FROZEN_SQL, FROZEN_COMPANY_CODES } from "./lib/bank-feed-state-machine.mjs";

export const ALLOW_OFFLINE_SKIP = "the enforcing half is static and always runs; the live half only counts documents purged with no number in the audit trail";

const LABEL = "verify-register-num-resolves-purged-documents";
const SVC = "apps/backend/src/accounting/reclassify/reclassify.service.ts";
const DRILL = "apps/frontend/src/lib/reclassifyDrill.ts";
const svc = readFileSync(SVC, "utf8");
const drill = readFileSync(DRILL, "utf8");
const fails = [];

const select = svc.slice(svc.indexOf("const LINE_SELECT = `"), svc.indexOf("`;", svc.indexOf("const LINE_SELECT = `")));
if (!select) fails.push(`${SVC}: LINE_SELECT not found`);
if (!/FROM audit\.row_changes rc[\s\S]{0,400}rc\.op = 'DELETE' AND rc\.row_pk = p\.source_transaction_id/.test(select)) fails.push(`${SVC}: Num no longer falls back to the audit trail for a purged document`);
if (!/AS document_purged/.test(select)) fails.push(`${SVC}: lines no longer say when their document was purged`);
if (/\.id::text = p\.source_transaction_id\b/.test(select)) fails.push(`${SVC}: a per-row document lookup compares the key as text — use \${SRC_DOC_UUID}`);
if (!/if \(l\.document_purged\) return \{ kind: "journal_entry", id: l\.journal_entry_id \}/.test(drill)) fails.push(`${DRILL}: a purged line must drill to its journal entry`);

let liveLine = "live half skipped (no DATABASE_URL)";
const url = process.env.DATABASE_URL;
if (url && !fails.length) {
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000, statement_timeout: 120000 });
  try {
    await c.connect();
    await c.query("BEGIN READ ONLY");
    await c.query("SET LOCAL app.bypass_rls = 'lucia'");
    const r = await c.query(
      `WITH m AS (
         SELECT DISTINCT p.source_transaction_id AS sid
           FROM accounting.journal_entry_postings p
          WHERE p.source_transaction_type = 'expense' AND ${NOT_FROZEN_SQL("p.operating_company_id")}
            AND NOT EXISTS (SELECT 1 FROM accounting.expenses e WHERE e.id::text = p.source_transaction_id))
       SELECT count(*)::int AS purged,
              count(*) FILTER (WHERE NOT EXISTS (
                SELECT 1 FROM audit.row_changes rc
                 WHERE rc.schema_name = 'accounting' AND rc.table_name = 'expenses' AND rc.op = 'DELETE'
                   AND rc.row_pk = m.sid AND NULLIF(btrim(rc.old_data->>'expense_number'), '') IS NOT NULL))::int AS no_number
         FROM m`
    );
    await c.query("ROLLBACK");
    liveLine = `${r.rows[0].purged} purged expenses behind ledger lines; ${r.rows[0].purged - r.rows[0].no_number} resolve their number from the audit trail; ${r.rows[0].no_number} have no number anywhere (Num stays empty for those only)`;
  } catch (err) {
    console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
    process.exit(1);
  } finally {
    await c.end().catch(() => {});
  }
}

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Num reads a purged document's number from the audit trail, uuid-keyed lookups; ${liveLine} [not read: ${FROZEN_COMPANY_CODES.join(", ")} — frozen]`);
