/** FEED GATE rehearsal #2 (branch-only): invoice / expense / bill kinds against real USMCA rows; proves the sets run and name real defects. */
import { execFileSync } from "node:child_process";
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
await c.query("BEGIN"); await c.query("SELECT set_config('app.bypass_rls','lucia',true)"); await c.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
const pick = async (sql: string) => (await c.query(sql, [USMCA])).rows[0]?.id as string | undefined;
const subjects: Array<[string, string | undefined, string]> = [
  ["invoice", await pick(`SELECT id::text FROM accounting.invoices WHERE operating_company_id=$1::uuid AND display_id='13616'`), "13616 (line-less)"],
  ["invoice", await pick(`SELECT id::text FROM accounting.invoices WHERE operating_company_id=$1::uuid AND display_id='13617'`), "13617 (sibling with line)"],
  ["expense", await pick(`SELECT id::text FROM accounting.expenses WHERE operating_company_id=$1::uuid AND voided_at IS NULL ORDER BY created_at DESC LIMIT 1`), "latest expense"],
  ["bill", await pick(`SELECT id::text FROM accounting.bills WHERE operating_company_id=$1::uuid AND voided_at IS NULL ORDER BY created_at DESC LIMIT 1`), "latest bill"],
];
for (const [kind, id, label] of subjects) {
  if (!id) { console.log(kind, label, "— no subject"); continue; }
  const intake = await openOrGetIntakeOnClient(c as never, USMCA, kind as never, id, SYS);
  const run = await runIntakeOnClient(c as never, USMCA, intake.id);
  console.log(`${kind} ${label}: ${run.intake.status} — ${run.intake.checks_failed} red of ${run.intake.checks_total}`);
  for (const ch of run.checks.filter((x) => x.status === "fail")) console.log("   RED", ch.check_key, "|", ch.subject_label, "|", ch.missing);
}
await c.query("ROLLBACK"); c.release(); await pool.end(); console.log("ROLLED BACK (rehearsal)");
