#!/usr/bin/env tsx
/**
 * Lead 443.58 (AUTH-429), owner 2026-10-11 09:43 CT: "Ok I'll send later today, the others get them done create the docs etc."
 * The two settled Relay deposits charged to the owner's personal card 0210 post NOW through postRelayDeposit's loan path:
 *   txn_5upWmFMZU9S6H4  2026-10-02  5,162.50 (5,000.00 + fee 162.50)
 *   txn_AVWoStcXbLRGbq  2026-10-08  2,065.00 (2,000.00 + fee 65.00)
 * Each: related-party loan document via the loan engine (createPaidDirectVendorAdvance — lender Jorge, paid direct to Relay,
 * amount = charged, date = deposit date, target = the deposit), then Dr 1295 + Dr 5005 (vendor Relay) / Cr 2410-00-001 (vendor
 * Jorge), loan.je_id = the JE. The 14 deposits on unnamed cards are not touched (only these two ids are passed).
 *
 * Usage:
 *   DATABASE_URL=<fork> npx tsx scripts/ops/2026-10-11-cc2-443-58-relay-0210-loan-deposits.ts --fork-commit
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-429 npx tsx scripts/ops/2026-10-11-cc2-443-58-relay-0210-loan-deposits.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { postRelayDeposit } from "../../apps/backend/src/integrations/relay-payments/relay-deposit-post.service.js";
import { createJournalEntryOnClient } from "../../apps/backend/src/accounting/journal-entries.service.js";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const DEPOSITS = ["txn_5upWmFMZU9S6H4", "txn_AVWoStcXbLRGbq"];
const PROD_HOST_HINT = "ep-broad-block-akykk7bw";
const LABEL = "2026-10-11-cc2-443-58-relay-0210-loan-deposits.ts";
const apply = process.argv.includes("--apply");
const forkCommit = !apply && process.argv.includes("--fork-commit");
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL required");
if (!apply && !forkCommit) throw new Error("pass --fork-commit (throwaway fork) or --apply (prod, AUTH-429)");
if (forkCommit && url.includes(PROD_HOST_HINT)) throw new Error("--fork-commit refused on the production endpoint");
if (apply) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-429") throw new Error(`--apply requires OWNER_AUTH_ID=AUTH-429 (got ${JSON.stringify(auth || null)})`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit", cwd: ROOT });
}

const client = new pg.Client({ connectionString: url });
await client.connect();
if (apply) await assertIsIntendedProduction(client, { label: LABEL });
else if (forkCommit) await assertNotProduction(client, { label: LABEL });

const measure = async () =>
  (await client.query(
    `SELECT
       (SELECT coalesce(sum(CASE WHEN p.debit_or_credit='credit' THEN p.amount_cents ELSE -p.amount_cents END),0) FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id=p.account_id WHERE a.operating_company_id=$1::uuid AND a.account_number='2410-00-001')::bigint AS credit_2410,
       (SELECT coalesce(sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END),0) FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id=p.account_id WHERE a.operating_company_id=$1::uuid AND a.account_number='1295')::bigint AS debit_1295,
       (SELECT coalesce(sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END),0) FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id=p.account_id WHERE a.operating_company_id=$1::uuid AND a.account_number='5005')::bigint AS debit_5005,
       (SELECT coalesce(sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END),0) FROM accounting.journal_entry_postings p WHERE p.operating_company_id=$1::uuid)::bigint AS trial_balance,
       (SELECT count(*) FROM integrations.relay_deposits r WHERE r.operating_company_id=$1::uuid AND r.voided_at IS NULL AND lower(r.status)='settled'
          AND NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings p WHERE p.operating_company_id=r.operating_company_id AND p.source_transaction_type='relay_deposit' AND p.source_transaction_id=r.id::text AND p.reversed_by_line_id IS NULL))::int AS held_deposits`,
    [USMCA]
  )).rows[0];

try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await client.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  const before = await measure();
  console.log(`BEFORE ${JSON.stringify(before)}`);
  for (const depositId of DEPOSITS) {
    const id = (await client.query<{ id: string }>(`SELECT id::text FROM integrations.relay_deposits WHERE operating_company_id=$1::uuid AND deposit_id=$2`, [USMCA, depositId])).rows[0]?.id;
    if (!id) throw new Error(`deposit ${depositId} not found`);
    const out = await postRelayDeposit(client as never, { operatingCompanyId: USMCA, relayDepositId: id, actorUserId: OWNER, actorRole: "Owner" }, { createJournalEntryOnClient: createJournalEntryOnClient as never });
    console.log(`  ${depositId}\t${JSON.stringify(out)}`);
    if (out.outcome !== "posted" && out.outcome !== "already_posted") throw new Error(`${depositId}: ${out.outcome} ${"reason" in out ? out.reason : ""}`);
  }
  const after = await measure();
  console.log(`AFTER  ${JSON.stringify(after)}`);
  console.log(`DELTA  2410 credit ${Number(after.credit_2410) - Number(before.credit_2410)} · 1295 ${Number(after.debit_1295) - Number(before.debit_1295)} · 5005 ${Number(after.debit_5005) - Number(before.debit_5005)} · held ${before.held_deposits} -> ${after.held_deposits} · TB ${after.trial_balance}`);
  if (apply || forkCommit) { await client.query("COMMIT"); console.log("COMMITTED."); }
  else await client.query("ROLLBACK");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await client.end();
}
