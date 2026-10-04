// Escrow over-release unwind (Lead ruling 2026-10-04; engine fixed first in #25378). Nine claimless $25 releases on
// 2026-09-24 19:58Z (accounting.escrow_postings source_type 'reconciliation', source_id NULL, note "AT ctrl escrow $0 on
// settl … — reverse close-path excess") drew deposits that the settlement unwinds later reversed in full, leaving
// 2100-00-027 / -002 / -004 at debit $150 / $50 / $25. Each release's journal entry (Dr 2100-00-0NN / Cr 2170) is reversed
// through the governed void executor (executeVoidCancel 'journal_entry' -> reverseJournalEntryNoFlip). Nothing is
// deleted; the escrow_postings rows are append-only and stay for the purge engine.
//
// Runs inside withLuciaBypass. Dry run (default) ends in a throw, so the after-commit queue is discarded.
// --apply requires --auth AUTH-NNN, verified OPEN on main.
import { execFileSync } from "node:child_process";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const ACCOUNTS: Record<string, number> = { "2100-00-027": 6, "2100-00-002": 2, "2100-00-004": 1 };
const REASON =
  "Escrow over-release unwind: claimless 2026-09-24 $25 release drew a deposit the settlement unwind later reversed in full; reversing the release so the driver's escrow returns to zero (Lead ruling 2026-10-04; engine fixed #25378).";

const apply = process.argv.includes("--apply");
let authId: string | null = null;
if (apply) {
  const i = process.argv.indexOf("--auth");
  authId = i > 0 ? process.argv[i + 1] : "AUTH-MISSING";
  execFileSync("node", ["scripts/verify-owner-authorization.mjs", authId], { stdio: "inherit" });
}

const { withLuciaBypass } = await import("../../apps/backend/src/auth/db.js");
const { executeVoidCancel } = await import("../../apps/backend/src/governance/void-cancel-executors.js");

const balances = async (c: any) =>
  (
    await c.query(
      `SELECT a.account_number num, v.balance_cents::bigint bal
         FROM accounting.v_escrow_account_balance v JOIN catalogs.accounts a ON a.id = v.coa_account_id
        WHERE v.operating_company_id = $1::uuid AND a.account_number = ANY($2::text[]) ORDER BY 1`,
      [USMCA, Object.keys(ACCOUNTS)],
    )
  ).rows.map((r: any) => ({ num: r.num, bal: Number(r.bal) }));

let report: unknown;
try {
  await withLuciaBypass(
    async (c: any) => {
      await c.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);
      const rel = (
        await c.query(
          `SELECT ep.linked_journal_entry_id::text je, a.account_number num, ep.amount_cents::bigint cents, ep.note,
                  j.status::text st, (j.reversed_by_je_id IS NOT NULL) reversed
             FROM accounting.escrow_postings ep
             JOIN accounting.escrow_accounts ea ON ea.id = ep.escrow_account_id
             JOIN catalogs.accounts a ON a.id = ea.coa_account_id
             JOIN accounting.journal_entries j ON j.id = ep.linked_journal_entry_id
            WHERE ep.operating_company_id = $1::uuid AND ep.posting_type = 'release' AND ep.source_type = 'reconciliation'
              AND ep.source_id IS NULL AND ep.note LIKE 'AT ctrl escrow $0 on settl % — reverse close-path excess'
              AND a.account_number = ANY($2::text[])
            ORDER BY ep.posted_at`,
          [USMCA, Object.keys(ACCOUNTS)],
        )
      ).rows;
      const per: Record<string, number> = {};
      for (const r of rel) per[r.num] = (per[r.num] ?? 0) + 1;
      if (rel.length !== 9 || rel.some((r: any) => Number(r.cents) !== 2500 || r.st !== "posted" || r.reversed))
        throw new Error(`REFUSE: releases not as measured ${JSON.stringify(rel)}`);
      for (const [n, k] of Object.entries(ACCOUNTS)) if (per[n] !== k) throw new Error(`REFUSE: ${n} has ${per[n]} releases, expected ${k}`);
      const before = await balances(c);
      const want: Record<string, number> = { "2100-00-027": -15000, "2100-00-002": -5000, "2100-00-004": -2500 };
      for (const b of before) if (b.bal !== want[b.num]) throw new Error(`REFUSE: ${b.num} balance ${b.bal}, expected ${want[b.num]}`);

      const results = [];
      for (const r of rel) {
        const out = await executeVoidCancel("journal_entry", { client: c, operatingCompanyId: USMCA, entityId: r.je, userId: OWNER, reason: REASON } as never);
        if ((out as { kind: string }).kind !== "ok") throw new Error(`FINDING: journal_entry void refused for ${r.je}: ${JSON.stringify(out)}`);
        results.push({ je: r.je, num: r.num, reversal: (out as { reversing_entry_ref?: string }).reversing_entry_ref ?? null });
      }
      const after = await balances(c);
      for (const a of after) if (a.bal !== 0) throw new Error(`REFUSE after: ${a.num} balance ${a.bal}, expected 0`);
      report = { reversed: results.length, results, before, after };
      if (apply) {
        await c.query("SELECT audit.append_event($1,'info',$2::jsonb,NULL,$3)", [
          "cc3.escrow_unwind_225",
          JSON.stringify({ auth_id: authId, operating_company_id: USMCA, reversed: results }),
          `CC-3-${authId}`,
        ]);
      } else {
        throw new Error("PROOF_ROLLBACK");
      }
    },
    { actorUserId: OWNER },
  );
  console.log(`escrow_unwind_225: APPLIED under ${authId}`);
  console.log(JSON.stringify(report, null, 1));
} catch (e) {
  if ((e as Error).message === "PROOF_ROLLBACK") {
    console.log("escrow_unwind_225: DRY RUN (thrown, rolled back, after-commit queue discarded)");
    console.log(JSON.stringify(report, null, 1));
  } else {
    console.error("escrow_unwind_225: FAILED —", (e as Error).message);
    process.exitCode = 1;
  }
} finally {
  const { pool, luciaPool } = (await import("../../apps/backend/src/auth/db.js")) as any;
  await luciaPool?.end?.().catch(() => {});
  await pool?.end?.().catch(() => {});
}
