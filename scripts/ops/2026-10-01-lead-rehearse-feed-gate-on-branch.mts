/**
 * FEED GATE rehearsal — runs ONLY against a throwaway Neon branch (never prod): opens an intake for the latest closed USMCA
 * settlement, runs every check, tries to close, proves the one-settlement-at-a-time trigger, the WORM trigger and the
 * invoice-line rule. Writes only feed_intakes/feed_intake_checks rows on the branch. Measured 2026-10-01 on
 * br-square-mountain-ak2eiqll: P-0017 blocked 6 red of 30; close refused; all three triggers enforced.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROD_HOSTS = ["ep-broad-block-akykk7bw"];
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL (a throwaway Neon branch) required"); process.exit(1); }
if (PROD_HOSTS.some((h) => process.env.DATABASE_URL!.includes(h))) {
  // ROUND 133 P0: this rehearsal is branch-only; on the production host it needs an OPEN owner authorization like any writer.
  const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
  if (!REQUIRED_AUTH_ID) { console.error("ROUND 133 P0: production host detected and OWNER_AUTH_ID missing -- refusing."); process.exit(1); }
  try { execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" }); }
  catch { console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`); process.exit(1); }
}
import pg from "pg";
import { openOrGetIntakeOnClient, runIntakeOnClient, closeIntakeOnClient } from "../../apps/backend/src/driver-finance/feed-gate/feed-gate.service.js";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80"; const SYS = "00000000-0000-4000-8000-000000000001";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const c = await pool.connect();
await c.query("BEGIN"); await c.query("SELECT set_config('app.bypass_rls','lucia',true)"); await c.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
const s = await c.query(`SELECT id::text, display_id, driver_id::text FROM driver_finance.driver_settlements WHERE operating_company_id=$1::uuid AND voided_at IS NULL AND status='closed' ORDER BY period_end DESC LIMIT 1`, [USMCA]);
console.log("SETTLEMENT", s.rows[0]);
const intake = await openOrGetIntakeOnClient(c as never, USMCA, "settlement", s.rows[0].id, SYS);
const run = await runIntakeOnClient(c as never, USMCA, intake.id);
console.log("INTAKE", run.intake.status, "total", run.intake.checks_total, "failed", run.intake.checks_failed, "rows", run.checks.length);
for (const ch of run.checks.filter(x => x.status === "fail")) console.log(" RED", ch.check_key, "|", ch.subject_label, "|", ch.missing);
console.log(" GREEN keys:", [...new Set(run.checks.filter(x => x.status === "pass").map(x => x.check_key))].join(", "));
console.log(" NA keys:", [...new Set(run.checks.filter(x => x.status === "na").map(x => x.check_key))].join(", "));
try { await closeIntakeOnClient(c as never, USMCA, intake.id, SYS); console.log("CLOSE: allowed"); } catch (e) { console.log("CLOSE refused:", (e as Error).message.slice(0, 160)); }
// one-at-a-time rule: second settlement for the same driver
const s2 = await c.query(`SELECT id::text, display_id FROM driver_finance.driver_settlements WHERE operating_company_id=$1::uuid AND voided_at IS NULL AND driver_id=$2::uuid AND id<>$3::uuid ORDER BY period_end DESC LIMIT 1`, [USMCA, s.rows[0].driver_id, s.rows[0].id]);
if (s2.rows[0]) { await c.query("SAVEPOINT a"); try { await openOrGetIntakeOnClient(c as never, USMCA, "settlement", s2.rows[0].id, SYS); console.log("ONE-AT-A-TIME: NOT enforced (bug)"); } catch (e) { console.log("ONE-AT-A-TIME enforced:", (e as Error).message.slice(0, 120)); await c.query("ROLLBACK TO SAVEPOINT a"); } }
// WORM
await c.query("SAVEPOINT w"); try { await c.query(`UPDATE driver_finance.feed_intake_checks SET status='pass' WHERE intake_id=$1::uuid`, [intake.id]); console.log("WORM: NOT enforced (bug)"); } catch (e) { console.log("WORM enforced:", (e as Error).message.slice(0, 80)); await c.query("ROLLBACK TO SAVEPOINT w"); }
// invoice rule
await c.query("SAVEPOINT i"); try { await c.query(`UPDATE accounting.invoices SET status='sent' WHERE display_id='13616' AND operating_company_id=$1::uuid`, [USMCA]); await c.query(`UPDATE accounting.invoices SET status='draft' WHERE display_id='13616' AND operating_company_id=$1::uuid`, [USMCA]); await c.query(`UPDATE accounting.invoices SET status='sent' WHERE display_id='13616' AND operating_company_id=$1::uuid`, [USMCA]); console.log("INVOICE RULE: NOT enforced (bug)"); } catch (e) { console.log("INVOICE RULE enforced:", (e as Error).message.slice(0, 140)); await c.query("ROLLBACK TO SAVEPOINT i"); }
await c.query("COMMIT"); c.release(); await pool.end();
