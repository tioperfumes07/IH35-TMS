/**
 * CLS-SUBLEDGER-GL-DARK-TIEOUT-UPDATE — read-only live check. Calls the REAL, already-vetted
 * getSubledgerGlControlRecReport() service directly (never a reimplementation — the board's own
 * "do NOT build a second one" law) against prod, for USMCA, to see the current live variance now
 * that ACCT-F369 (source_transaction_type tagging on reversal postings) has shipped.
 *
 * READ-ONLY. No writes.
 *
 * Usage:
 *   DATABASE_URL=<direct> DATABASE_DIRECT_URL=<direct> npx tsx scripts/run-check-subledger-gl-control-rec-live.mts
 */
import { getSubledgerGlControlRecReport } from "../apps/backend/src/accounting/subledger-gl-control-rec.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL required");
if (/-pooler\./.test(url)) throw new Error("REFUSING -pooler: session GUCs do not survive transaction pooling under FORCE RLS");

const report = await getSubledgerGlControlRecReport({
  userId: ACTOR_USER_ID,
  operating_company_id: USMCA,
});

console.log(JSON.stringify(report, null, 2));
