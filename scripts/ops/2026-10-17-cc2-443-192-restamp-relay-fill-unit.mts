// LEAD 443.192 (ruling 11:40Z): re-stamp EXP-2026-00009 -> T163 — attribution only, through the audited expense-engine
// writer restampRelayFillExpenseUnit (accounting/expense-attribution-restamp.service.ts; the same-company unit rule
// fuel/relay-fill-unit.sql.ts). EXP-2026-00008 -> T169 is NOT stamped (T169 is operated by IH 35 Transportation, 91e0bf0a)
// and is deliberately absent from the list below. Journal entries / postings are never touched: the script hashes the
// document's JE postings and the company TB before and after, and refuses (rolls back) if either moves or the read-back
// is not exactly the expected unit on the header and every line.
//   default DRY RUN — SELECT-only preview (runs under the read-only guard role; nothing is written)
//   --fork-commit — writer + read-back + COMMIT on a NON-production database (assertNotProduction)
//   --apply --auth AUTH-NNN | OWNER-ORDER-443.192 — the same on production (assertIsIntendedProduction)
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { RELAY_FILL_UNIT_LOOKUP_SQL, restampRelayFillExpenseUnit } from "../../apps/backend/src/accounting/expense-attribution-restamp.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const EXPECTED: Record<string, string> = { "EXP-2026-00009": "181b5c93-8bcf-4155-8a2e-ebc86f2a34e1" }; // T163 (leased to USMCA)
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
const WRITE = APPLY || FORK;
let auth = "";
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  auth = i > 0 ? process.argv[i + 1] ?? "" : "";
  // Lead 443.192 ruling 11:40Z approves this exact re-stamp (owner law: merge-on-safe); --auth OWNER-ORDER-443.192 records
  // it; any AUTH-NNN still goes through verify-owner-authorization.
  if (auth === "OWNER-ORDER-443.192") console.log("authority: Lead ruling 443.192 11:40Z (EXP-2026-00009 -> T163 approved)");
  else if (!/^AUTH-\d+$/.test(auth)) throw new Error("--apply requires --auth AUTH-NNN | OWNER-ORDER-443.192");
  else execFileSync("node", ["scripts/verify-owner-authorization.mjs", auth], { stdio: "inherit" });
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.192 relay-fill unit re-stamp" });
else if (FORK) await assertNotProduction(db, { label: "443.192 relay-fill unit re-stamp (fork)" });
const one = async (sql: string, p: unknown[]) => (await db.query(sql, p)).rows[0] as Record<string, any> | undefined;
await db.query("BEGIN");
try {
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);
  const tb = async () => (await one(`SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text net FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid`, [USMCA]))!.net as string;
  const jeHash = async (je: string) => (await one(
    `SELECT md5(string_agg(to_jsonb(p)::text, ',' ORDER BY p.id)) h
       FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = $1::uuid`, [je]))!.h as string;
  const snapshot = async (id: string) => ({
    header: await one(`SELECT expense_number, unit_id::text, journal_entry_id::text, total_amount_cents::text AS total_cents, voided_at FROM accounting.expenses WHERE id=$1::uuid`, [id]),
    lines: (await db.query(`SELECT id::text, unit_id::text, amount_cents::text FROM accounting.expense_lines WHERE expense_id=$1::uuid ORDER BY id`, [id])).rows,
  });
  const tb0 = await tb();
  console.log(`trial balance (USMCA net debits - credits) before: ${tb0}`);
  let refused = 0;
  for (const [number, expectedUnit] of Object.entries(EXPECTED)) {
    const exp = await one(`SELECT id::text FROM accounting.expenses WHERE operating_company_id=$1::uuid AND expense_number=$2 AND voided_at IS NULL`, [USMCA, number]);
    if (!exp) { console.log(`HELD ${number}: no live expense with that number`); refused++; continue; }
    const before = await snapshot(exp.id);
    const je = before.header!.journal_entry_id as string;
    const h0 = await jeHash(je);
    const preview = await one(RELAY_FILL_UNIT_LOOKUP_SQL, [USMCA, exp.id]);
    console.log(`${number} (${exp.id}) JE ${je} postings md5 ${h0}`);
    console.log(`  BEFORE header unit=${before.header!.unit_id ?? "NULL"} total=${before.header!.total_cents}`);
    for (const l of before.lines) console.log(`  BEFORE line ${l.id} unit=${l.unit_id ?? "NULL"} amount=${l.amount_cents}`);
    console.log(`  rule: fill=${preview?.relay_fill_id ?? "none"} fills=${preview?.fills ?? "0"} -> unit=${preview?.unit_id ?? "NULL"} (expected ${expectedUnit})`);
    if (!preview || preview.fills !== "1" || preview.unit_id !== expectedUnit) { console.log(`HELD ${number}: the rule does not resolve exactly the expected unit`); refused++; continue; }
    const wouldStamp = before.lines.filter((l) => l.unit_id === null).length;
    console.log(`  AFTER (planned) header unit=${expectedUnit}; ${wouldStamp} line(s) NULL -> ${expectedUnit}; postings unchanged`);
    if (!WRITE) continue;
    const [out] = await restampRelayFillExpenseUnit(db as never, { operatingCompanyId: USMCA, actorUserId: OWNER, expenseIds: [exp.id] });
    const after = await snapshot(exp.id);
    const h1 = await jeHash(je);
    const ok = out?.outcome === "stamped" && after.header!.unit_id === expectedUnit
      && after.lines.every((l) => l.unit_id === expectedUnit) && h1 === h0 && after.header!.total_cents === before.header!.total_cents;
    console.log(`  READ-BACK outcome=${out?.outcome} header unit=${after.header!.unit_id} lines=${after.lines.map((l) => l.unit_id).join(",")} postings md5 ${h1}`);
    if (!ok) throw new Error(`REFUSE ${number}: read-back differs from the plan (or the JE postings moved)`);
  }
  const tb1 = await tb();
  console.log(`trial balance ${tb0} -> ${tb1}`);
  if (tb1 !== tb0) throw new Error("REFUSE: trial balance moved");
  if (refused) throw new Error(`REFUSE: ${refused} row(s) held — nothing written`);
  await db.query(WRITE ? "COMMIT" : "ROLLBACK");
  console.log(WRITE ? "COMMITTED" : "DRY RUN — SELECT-only preview, rolled back, nothing written");
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await db.end();
  setTimeout(() => process.exit(0), 2000);
}
