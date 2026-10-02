/** FEED GATE rehearsal #3 (branch-only): applies 202615170500 (deposit / bill_payment kinds) and runs both sets against real USMCA rows; rolled back. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { openOrGetIntakeOnClient, runIntakeOnClient } from "../../apps/backend/src/driver-finance/feed-gate/feed-gate.service.js";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL (throwaway branch) required"); process.exit(1); }
if (process.env.DATABASE_URL.includes("ep-broad-block-akykk7bw")) {
  const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
  if (!REQUIRED_AUTH_ID) { console.error("ROUND 133 P0: production host and no OWNER_AUTH_ID -- refusing."); process.exit(1); }
  try { execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" }); } catch { process.exit(1); }
}
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80"; const SYS = "00000000-0000-4000-8000-000000000001";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const c = await pool.connect();
await c.query("BEGIN");
const mig = readFileSync(path.join(ROOT, "db/migrations/202615170500_feed_gate_kinds_deposit_bill_payment.sql"), "utf8")
  .replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, "");
await c.query(mig); await c.query(mig); // idempotent: applied twice
const def = (await c.query(`SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conrelid='driver_finance.feed_intakes'::regclass AND conname='feed_intakes_feed_kind_check'`)).rows[0].d;
console.log("CHECK after migration:", def);
await c.query("SELECT set_config('app.bypass_rls','lucia',true)"); await c.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
const pick = async (sql: string) => (await c.query(sql, [USMCA])).rows[0]?.id as string | undefined;
const subjects: Array<[string, string | undefined, string]> = [
  ["deposit", await pick(`SELECT id::text FROM accounting.deposits WHERE operating_company_id=$1::uuid AND voided_at IS NULL ORDER BY created_at DESC LIMIT 1`), "latest deposit"],
  ["bill_payment", await pick(`SELECT id::text FROM accounting.bill_payments WHERE operating_company_id=$1::uuid AND voided_at IS NULL ORDER BY created_at DESC LIMIT 1`), "latest bill payment"],
];
for (const [kind, id, label] of subjects) {
  if (!id) { console.log(kind, label, "— no USMCA subject (0 rows); set runs against none"); continue; }
  const intake = await openOrGetIntakeOnClient(c as never, USMCA, kind as never, id, SYS);
  const run = await runIntakeOnClient(c as never, USMCA, intake.id);
  console.log(`${kind} ${label}: ${run.intake.status} — ${run.intake.checks_failed} red of ${run.intake.checks_total}`);
  for (const ch of run.checks) console.log("   ", ch.status.toUpperCase().padEnd(4), ch.check_key, "|", ch.subject_label, "|", ch.missing ?? "");
}
await c.query("ROLLBACK"); c.release(); await pool.end(); console.log("ROLLED BACK (rehearsal)");
