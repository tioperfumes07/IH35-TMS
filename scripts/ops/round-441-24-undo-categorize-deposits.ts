#!/usr/bin/env tsx
/**
 * ROUND 441.24 — undo the Deposit documents the ROUND 441.5 conversion created from categorized money-in bank lines, and
 * re-categorize each as the plain CHAIN-05 journal entry (docs/specs/qbo-parity/CHAIN-05-BANK-FEED-POSTING-DESIGN.md:236,
 * "Categorize = new JE", no document). Measured 2026-10-08: 23 deposits (DEP-2025-00001, DEP-2026-00001..00022),
 * $35,355.00, to 2410 and 3000. The deposits make the line read as already matched, which blocks the matching engine.
 *
 * Through the app, as the Owner, per line:
 *   1. Undo the bank line (undoBankLineOnClient). It reverses the deposit's posting through the source-type reversal
 *      (reversePostedSourceTransactionInClientTx 'bank_deposit', inside voidBankDepositOnClient), stamps the deposit void so it
 *      is no longer a live match, and releases the line to For review.
 *   2. Re-categorize it (POST /api/v1/banking/transactions/:id/categorize) with the SAME account and payer the deposit carried.
 *      Since #25785 that posts ONE bank_categorization entry per the matrix (money in: Dr bank / Cr the account) and creates
 *      no document.
 * Same date, same amount, same account: the trial balance moves by exactly $0.00.
 *
 * RESUMABLE: the plan (bank line, account, payer, memo) is written to --plan-file BEFORE anything changes. A re-run
 * re-categorizes any planned line that was undone but not re-categorized. Dry run by default; --execute needs --expect-host.
 */
import fs from "node:fs";
import pg from "pg";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import { registerBankTxCategorizationRoutes } from "../../apps/backend/src/banking/categorization.routes.js";
import { withCompanyScope } from "../../apps/backend/src/accounting/shared.js";
import { undoBankLineOnClient } from "../../apps/backend/src/banking/bank-line-state-machine.service.js";

// Owner authorization gate: scripts/verify-owner-authorization.mjs must be satisfied before any --execute run that writes financial tables.
const FINDING = "ROUND 441.24: CHAIN-05 categorize is a journal entry, not a document — deposit undone, line re-categorized";

type PlanLine = {
  bt: string; deposit_id: string; display_id: string; date: string; amount_cents: number;
  account_id: string; account_number: string; account_name: string;
  vendor_id: string | null; customer_id: string | null; memo: string | null;
};

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const actor = arg("--actor-user-id");
  const expectHost = arg("--expect-host");
  const planFile = arg("--plan-file");
  const url = process.env.DATABASE_URL ?? "";
  if (!url || !actor || !planFile) throw new Error("DATABASE_URL, --actor-user-id and --plan-file are required");
  if (execute && new URL(url).hostname !== expectHost) throw new Error("--execute needs --expect-host equal to DATABASE_URL's host");

  const pool = new pg.Pool({ connectionString: url, max: 3 });
  const read = async <T,>(sql: string, params: unknown[] = []): Promise<T[]> => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN READ ONLY");
      await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      const r = await c.query(sql, params);
      await c.query("ROLLBACK");
      return r.rows as T[];
    } finally {
      c.release();
    }
  };
  const [co] = await read<{ id: string }>(`SELECT id::text FROM org.companies WHERE code = 'USMCA'`);
  const oc = co!.id;
  const [owner] = await read<{ role: string }>(`SELECT role FROM identity.users WHERE id = $1::uuid AND deactivated_at IS NULL`, [actor]);
  if (owner?.role !== "Owner") throw new Error("--actor-user-id must be an active Owner");

  const plan: PlanLine[] = fs.existsSync(planFile) ? (JSON.parse(fs.readFileSync(planFile, "utf8")) as PlanLine[]) : [];
  const live = await read<PlanLine & { amount_cents: string }>(
    `SELECT d.source_bank_transaction_id::text AS bt, d.id::text AS deposit_id, d.display_id, d.deposit_date::text AS date,
            d.total_receipts_cents::text AS amount_cents, a.id::text AS account_id, a.account_number, a.account_name,
            l.received_from_vendor_id::text AS vendor_id, l.received_from_customer_id::text AS customer_id,
            NULLIF(bt.categorization_memo, '') AS memo
       FROM accounting.deposits d
       JOIN accounting.deposit_lines l ON l.deposit_id = d.id AND l.line_type = 'account'
       JOIN catalogs.accounts a ON a.id = l.account_id
       JOIN banking.bank_transactions bt ON bt.id = d.source_bank_transaction_id
      WHERE d.operating_company_id = $1::uuid AND d.voided_at IS NULL AND d.source_bank_transaction_id IS NOT NULL
      ORDER BY d.deposit_date, d.display_id`,
    [oc]
  );
  for (const l of live) if (!plan.some((p) => p.bt === l.bt)) plan.push({ ...l, amount_cents: Number(l.amount_cents) });
  if (execute) fs.writeFileSync(planFile, JSON.stringify(plan, null, 2));

  const accountNumbers = [...new Set(["1000", ...plan.map((l) => l.account_number)])];
  const tb = async () =>
    read<{ account_number: string; net_cents: string }>(
      `SELECT a.account_number, COALESCE(sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END),0)::text AS net_cents
         FROM catalogs.accounts a
         LEFT JOIN accounting.journal_entry_postings p ON p.account_id = a.id
         LEFT JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.status = 'posted'
        WHERE a.operating_company_id = $1::uuid AND a.account_number = ANY($2::text[]) AND (p.id IS NULL OR je.id IS NOT NULL)
        GROUP BY 1 ORDER BY 1`,
      [oc, accountNumbers]
    );
  const before = await tb();

  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await registerBankTxCategorizationRoutes(a);
  });
  const headers = { "x-test-auth": Buffer.from(JSON.stringify({ id: actor, role: "Owner", email: null }), "utf8").toString("base64url") };
  const total = plan.reduce((s, l) => s + l.amount_cents, 0);
  const log: string[] = [`ROUND 441.24 undo deposits — ${execute ? "EXECUTE" : "DRY RUN (no writes)"} — USMCA — ${plan.length} lines, ${(total / 100).toFixed(2)}`];
  const done: string[] = [];

  try {
    for (const l of plan) {
      const label = `${l.date} $${(l.amount_cents / 100).toFixed(2)} → ${l.account_number} (${l.display_id})`;
      const [state] = await read<{ deposit_live: boolean; je: string | null; review_state: string }>(
        `SELECT EXISTS (SELECT 1 FROM accounting.deposits WHERE id = $2::uuid AND voided_at IS NULL) AS deposit_live,
                bt.matched_journal_entry_id::text AS je, bt.review_state
           FROM banking.bank_transactions bt WHERE bt.id = $1::uuid`,
        [l.bt, l.deposit_id]
      );
      if (!state?.deposit_live && state?.je) {
        const [isCat] = await read<{ ok: boolean }>(
          `SELECT EXISTS (SELECT 1 FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = $1::uuid AND p.source_transaction_type = 'bank_categorization') AS ok`,
          [state.je]
        );
        if (isCat?.ok) { log.push(`  SKIP ${label}: already a CHAIN-05 entry`); continue; }
      }
      if (!execute) { log.push(`  would UNDO ${label} and re-categorize to ${l.account_number}`); continue; }
      if (state?.deposit_live) {
        await withCompanyScope(actor, oc, (client) =>
          undoBankLineOnClient(client as never, { operatingCompanyId: oc, bankTransactionId: l.bt, actorUserId: actor, reason: FINDING })
        );
      } else {
        log.push(`  RESUME ${label}: deposit already undone, re-categorizing from the plan`);
      }
      const payload: Record<string, unknown> = { category_kind: l.account_name, gl_account_id: l.account_id };
      if (l.customer_id) payload.customer_id = l.customer_id;
      else if (l.vendor_id) payload.vendor_id = l.vendor_id;
      if (l.memo) payload.memo = l.memo;
      const res = await app.inject({ method: "POST", url: `/api/v1/banking/transactions/${l.bt}/categorize?operating_company_id=${oc}`, headers, payload });
      if (res.statusCode >= 300) throw new Error(`categorize ${label}: ${res.statusCode} ${res.body}`);
      const [after] = await read<{ je: string | null }>(`SELECT matched_journal_entry_id::text AS je FROM banking.bank_transactions WHERE id = $1::uuid`, [l.bt]);
      if (!after?.je) throw new Error(`categorize ${label}: no entry stamped after re-categorize`);
      done.push(`${label}: deposit ${l.deposit_id} undone -> bank_categorization entry ${after.je}`);
    }
  } finally {
    await app.close();
  }

  const after = await tb();
  log.push("", "account | net before (cents) | net after (cents) | delta");
  let delta = 0;
  for (const b of before) {
    const a = after.find((x) => x.account_number === b.account_number);
    const d = Number(a?.net_cents ?? 0) - Number(b.net_cents);
    delta += d;
    log.push(`${b.account_number} | ${b.net_cents} | ${a?.net_cents} | ${d}`);
  }
  log.push(`net trial-balance delta across these accounts: ${delta} cents`);
  if (done.length) log.push("", `undone + re-categorized ${done.length}:`, ...done);
  await pool.end();
  console.log(log.join("\n"));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
