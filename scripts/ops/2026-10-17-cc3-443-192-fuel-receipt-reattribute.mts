// LEAD 443.192 (10:35Z — "keep the 44 fuel_event load-stamp rows"): verify-every-load-born-posting-carries-its-load RULE 2 —
// posted Relay fuel receipts attached (fill-once) to loads booked "dispatched" with no stop stamps; seconds later their
// deliveries were stamped and the Settlement Creator wrote the fills' fuel rows on other loads, so the postings kept a stale
// load. Engine fix #26930 (reattributeFuelReceiptsForLoad): each receipt the fill's fuel row / the one fuel-to-load rule now
// names elsewhere moves as ONE reclassification entry (lines reversed on the old load, posted on the new — same accounts, same
// amounts), its fuel row + expense document follow, audited fuel.receipt_reattributed_to_load; a receipt no load covers is
// reported, never moved.
// One transaction: per-account trial balance before == after (every delta 0), company TB 0, RULE 2 count after; COMMIT only
// with --apply (or --fork-commit on a non-production branch); default = everything ROLLED BACK.
//   default: dry run · --fork-commit (assertNotProduction) · --apply --auth LEAD-ORDER-443.192
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { reattributeFuelReceiptsForLoad } from "../../apps/backend/src/fuel/fuel-receipt-repoint.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  if ((process.argv[i + 1] ?? "") !== "LEAD-ORDER-443.192") throw new Error("--apply requires --auth LEAD-ORDER-443.192");
  // verify-owner-authorization: Lead ROUND 443.192 (08:55Z engine + evidence re-stamp through the engine, audited, TB 0;
  // 10:35Z "keep the 44 fuel_event load-stamp rows") — evidence = the fill's fuel row / fill time under the one rule.
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.192 fuel receipt reattribute" });
else if (FORK) await assertNotProduction(db, { label: "443.192 fuel receipt reattribute (fork)" });

const byAccount = async () =>
  Object.fromEntries(
    (await db.query(`SELECT account_id::text a, sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END)::text n
       FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid GROUP BY 1`, [USMCA])).rows.map((r: any) => [r.a, r.n])
  );
// RULE 2 of the guard, by its own SQL function: postings since the load-born migration whose load ≠ the source's load.
const rule2 = async () =>
  Number((await db.query(`SELECT count(*)::int n FROM accounting.journal_entry_postings p
     WHERE p.operating_company_id=$1::uuid AND p.source_transaction_type='fuel_event' AND p.load_id IS NOT NULL
       AND accounting.posting_source_load_id(p.source_transaction_type, p.source_transaction_id) IS NOT NULL
       AND p.load_id IS DISTINCT FROM accounting.posting_source_load_id(p.source_transaction_type, p.source_transaction_id)
       AND p.reversal_of_line_id IS NULL AND p.reversed_by_line_id IS NULL`, [USMCA])).rows[0].n);

let ok = false;
try {
  await db.query("BEGIN");
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);
  const before = await byAccount();
  const r2Before = await rule2();
  const out = await reattributeFuelReceiptsForLoad(db as never, { operatingCompanyId: USMCA, loadId: null, actorUserId: OWNER });
  const after = await byAccount();
  const r2After = await rule2();
  const by = (o: string) => out.filter((r: any) => r.outcome === o);
  console.log(`outcomes: ${JSON.stringify(Object.fromEntries([...new Set(out.map((r: any) => r.outcome))].map((o) => [o, by(o as string).length])))}`);
  for (const r of by("reattributed") as any[]) console.log(`  moved fill ${r.fill_id} ${r.from_load_id} → ${r.load_number ?? r.load_id}`);
  for (const r of out.filter((x: any) => x.outcome !== "reattributed") as any[]) console.log(`  ${r.outcome} fill ${r.fill_id}${r.reason ? ` — ${r.reason}` : ""}`);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const moved = [...keys].filter((k) => Number(before[k] ?? 0) !== Number(after[k] ?? 0));
  const tb = Object.values(after).reduce((s, n) => s + Number(n), 0);
  console.log(`RULE 2 fuel rows ${r2Before} → ${r2After} · accounts whose balance moved ${moved.length} · company TB ${tb}`);
  if (moved.length || tb !== 0) throw new Error("NOT VERIFIED: a balance moved or TB ≠ 0 — rolled back");
  if (APPLY || FORK) {
    await db.query("COMMIT");
    console.log("COMMITTED");
  } else {
    await db.query("ROLLBACK");
    console.log("DRY RUN — ROLLED BACK. Pass --fork-commit (fork) or --apply --auth LEAD-ORDER-443.192.");
  }
  ok = true;
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  console.error(e);
} finally {
  await db.end();
  setTimeout(() => process.exit(ok ? 0 : 1), 2000);
}
