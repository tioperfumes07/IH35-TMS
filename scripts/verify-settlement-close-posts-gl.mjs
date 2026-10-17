#!/usr/bin/env node
/**
 * GUARD-SETTLEMENT-CLOSE-POSTS-GL (ROUND 137, owner-directed, 2026-09-23)
 *
 * USMCA-LOAD-BOOKENDED-SETTLEMENTS-NEVER-POST-GL (docs/audit/GUARD-WORKORDERS.md): all 89 USMCA
 * driver_settlements (settlement_model='load_bookended') closed/locked with ZERO GL postings --
 * the load-bookended trip-close path (settlements-load-bookended.service.ts) writes
 * status='closed' directly and never calls a poster. The real poster (closeSettlementPayRun +
 * the "Driver Net-Pay Clearing" payment method, GL 2170) is proven correct -- owner-approved and
 * already used successfully for 13 other USMCA settlements (ROUND 16.22, scripts/ops/setl-close-
 * post-a-apply.ts) -- it is simply never invoked automatically when a load-bookended trip closes.
 *
 * THIS GUARD: fails closed if ANY USMCA settlement with status IN ('closed','locked') AND
 * settlement_model='load_bookended' carries ZERO live journal_entry_postings rows tied to it
 * (checked by source_transaction_id, matching the same lookup shape used everywhere else in this
 * codebase). This exact silent-zero-GL shape must never recur, whether from the historical 89,
 * a re-seed, or a future live close.
 *
 * A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B owner ruling) --
 * no ALLOW_OFFLINE_SKIP declared; this guard needs DATABASE_URL to mean anything.
 */
export const REQUIRES_LIVE_DB = "Neon live verification required";

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-settlement-close-posts-gl";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

/** The rule, pure: the failure lines for the measured offenders (closed/locked load_bookended settlements with ZERO
 *  live postings), or null when there are none. --selftest feeds it planted rows (no database). */
export function closedWithoutGlFailure(offenders) {
  if (!offenders.length) return null;
  const lines = [`${LABEL}: FAIL — ${offenders.length} load_bookended settlement(s) are closed/locked with ZERO live GL postings:`];
  for (const r of offenders.slice(0, 30)) lines.push(`  ✗ ${r.display_id} (${r.id}) status=${r.status}`);
  if (offenders.length > 30) lines.push(`  ... and ${offenders.length - 30} more`);
  lines.push(`This is the exact USMCA-LOAD-BOOKENDED-SETTLEMENTS-NEVER-POST-GL shape (docs/audit/GUARD-WORKORDERS.md) -- the load-bookended close path must call closeSettlementPayRun (with the Driver Net-Pay Clearing payment method) before or as part of closing, not leave the settlement finalized with no ledger trace.`);
  return lines;
}

function selftest() {
  const row = (n, status = "closed") => ({ id: `id-${n}`, display_id: `SETL-${n}`, status });
  const many = Array.from({ length: 31 }, (_, i) => row(i));
  const cases = [
    ["no offender passes", closedWithoutGlFailure([]) === null],
    ["one closed settlement with zero postings fails", closedWithoutGlFailure([row(1)])?.[0].includes("1 load_bookended settlement(s)") === true],
    ["a locked one fails too", closedWithoutGlFailure([row(2, "locked")])?.[1].includes("status=locked") === true],
    ["31 offenders list 30 and count the rest", (() => { const f = closedWithoutGlFailure(many); return f !== null && f.some((l) => l.includes("... and 1 more")); })()],
  ];
  for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

async function main() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

    const res = await client.query(
      `
        SELECT s.id::text, s.display_id, s.status, s.settlement_model
          FROM driver_finance.driver_settlements s
         WHERE s.operating_company_id = $1::uuid
           AND s.settlement_model = 'load_bookended'
           AND s.status IN ('closed', 'locked')
           -- REPOINTED (ROUND 443.187): 31d926e537 "Claude-1-443.37: settlement_id stamp on bill JE
           -- postings + driver escrow backfill seed (443.41-E)" + 7ef5410e20 "Claude-1-443.37-v2:
           -- stamp settlement_id at INSERT through posting writer" moved settlement close onto the
           -- settlement-ap-chain: the close posts the per-load A/P bill JE, tagged with the BILL as
           -- its source_transaction_id and the settlement in journal_entry_postings.settlement_id
           -- (fill-once at INSERT). Only the deductions JE is still sourced 'driver_settlement', so a
           -- zero-deduction close carried GL the old lookup could not see (measured live 2026-10-17:
           -- P-0017/P-0046/P-0069/P-0102 each carry 2-7 settlement_id-stamped postings). Same rule —
           -- a closed/locked settlement with NO posting tied to it by EITHER link still fails.
           AND NOT EXISTS (
             SELECT 1 FROM accounting.journal_entry_postings jep
              WHERE jep.operating_company_id = s.operating_company_id
                AND (jep.source_transaction_id = s.id::text OR jep.settlement_id = s.id)
           )
         ORDER BY s.display_id
      `,
      [USMCA]
    );

    await client.query("ROLLBACK");

    const failure = closedWithoutGlFailure(res.rows);
    if (failure) {
      for (const l of failure) console.error(l);
      process.exit(1);
    }

    console.log(`${LABEL}: OK — 0 closed/locked load_bookended settlements carry zero GL postings.`);
    process.exit(0);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL —`, e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else main();
}
