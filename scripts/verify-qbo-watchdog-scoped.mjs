// Guard: the QBO "disconnected" watchdog must SKIP entities that were never connected (no
// integrations.qbo_connections row). A parallel-books / future entity like USMCA is not "disconnected";
// without this it emails a re-auth reminder every 15 min forever (the in-memory cooldown resets on every
// deploy). qbo_connections RLS is operating_company_id-scoped (NOT lucia-bypassable), so the check is
// per-company via companyHasQboConnectionRecord. Regression guard for the 2026-07-04 fix.
import fs from "node:fs";
const cron = fs.readFileSync("apps/backend/src/cron/qbo-token-refresh.ts", "utf8");
const svc = fs.readFileSync("apps/backend/src/integrations/qbo/qbo-oauth.service.ts", "utf8");
const ok =
  /export async function companyHasQboConnectionRecord/.test(svc) &&
  /companyHasQboConnectionRecord\(companyId\)/.test(cron) &&
  /if \(!\(await companyHasQboConnectionRecord\(companyId\)\)\)/.test(cron);
if (!ok) {
  console.error("verify:qbo-watchdog-scoped FAILED — watchdog must skip never-connected companies via per-company companyHasQboConnectionRecord()");
  process.exit(1);
}
console.log("verify:qbo-watchdog-scoped OK");
