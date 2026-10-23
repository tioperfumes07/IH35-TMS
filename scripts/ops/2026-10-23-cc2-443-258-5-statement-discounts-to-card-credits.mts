// LEAD 443.258.5 ruling 2 / 443.258.6 (CC-2, writer shape B) — the Dreamline statement card differences become DOCUMENTS.
// OWNER, verbatim 10-22 8:25 PM CT: "REMEMBER FIND THE ROOTCAUSES AND CREATE PERMANENT SOLUTION AND FIX. ALWAYS FIX ENGINES,
// NEVER DEFER." and 9:55 PM CT: "fix".
// Every LIVE "Dreamline statement <marker> — Fuel Card Discount" journal entry (hand-written by the old
// postStatementDifference, tagged fuel_card_discount, not yet reversed) is:
//   1. voided through THE void engine (reverseJournalEntryNoFlip: an equal and opposite reversal JE, audit row), and
//   2. re-issued as its document through THE expense writer — positive (card charged less) = a card-CREDIT expense
//      (is_credit, Dr 2510 / Cr Fuel Card Discount, QBO Credit Card Credit, number <marker>-CARD-DISC); negative (card
//      charged more) = an ordinary expense (Dr Fuel Card Discount / Cr 2510, number <marker>-CARD-DIFF) — both carrying
//      the receipt's vendor and load (the load decides unit / driver / trailer).
// Thin wrapper over THE service the owner-only route also calls (statement-card-credit-repair.service.ts).
// 443.258.6: in BATCHES (default 25) — each batch ONE transaction that refuses (ROLLBACK and stop) unless, inside it,
// the net change on 5000 and on 2510 is exactly $0.00 and the trial balance is 0. A rerun skips done documents (a
// reversed statement JE is no longer selected; the writer refuses a second <marker>-CARD-DISC). USMCA only. No DELETE.
// Refuses outright when accounting.expenses.is_credit does not exist (the writer would then post money OUT).
//   default: dry run (first batch, ROLLBACK) · --fork-commit (assertNotProduction) · --apply with OWNER_AUTH_ID=AUTH-453
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { runStatementCardCreditRepair, type RunInTx } from "../../apps/backend/src/fuel/statement-card-credit-repair.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
const BATCH = Math.max(1, Number(process.env.BATCH ?? 25));
if (APPLY) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  // verify-owner-authorization: LEAD 443.258.6 — owner 10-22 8:25 PM CT "ALWAYS FIX ENGINES, NEVER DEFER." / 9:55 PM CT "fix".
  if (auth !== "AUTH-453") throw new Error("--apply requires OWNER_AUTH_ID=AUTH-453");
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit" });
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
if (APPLY) await assertIsIntendedProduction(c as never, { label: "443.258.5 statement discounts to card credits" });
else if (FORK) await assertNotProduction(c as never, { label: "443.258.5 statement discounts to card credits (fork)" });
const runInTx: RunInTx = async (fn) => {
  await c.query("BEGIN");
  try {
    await c.query("SET LOCAL app.bypass_rls = 'lucia'");
    await c.query("SET LOCAL lock_timeout = '5s'");
    await c.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);
    await c.query("SELECT set_config('app.current_user_id', $1, true)", [OWNER_USER]);
    const out = await fn(c as never);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  }
};
try {
  const r = await runStatementCardCreditRepair(runInTx, { companyId: USMCA, actorUserId: OWNER_USER, dryRun: !(APPLY || FORK), batchSize: BATCH });
  for (const b of r.batches) console.log(JSON.stringify(b));
  const { rows, ...summary } = r;
  console.log(JSON.stringify(summary, null, 1));
  if (process.env.LIST_OUT) fs.writeFileSync(process.env.LIST_OUT, JSON.stringify(rows, null, 1));
} catch (e) {
  throw new Error(`REFUSED: ${(e as Error).message}`);
} finally {
  await c.end();
}
