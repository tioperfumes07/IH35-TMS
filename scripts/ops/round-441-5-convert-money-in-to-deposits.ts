#!/usr/bin/env tsx
/**
 * ROUND 441.5 Phase 2 — convert every live money-IN bank line that was categorized as a BARE journal entry into a DEPOSIT
 * document (QBO "Add funds to this deposit"). Measured 2026-10-07: 23 lines, $35,355.00 (20 to 2410 related-party loan,
 * 3 to 3000 owner's capital). Same date, same amount, same account — only the shape changes; the trial balance moves by
 * exactly $0.00.
 *
 * Through the app only, never SQL writes, as the Owner:
 *   1. Undo the line (undoBankLineOnClient — the engine behind POST /transactions/:id/undo-categorization); the reversal
 *      carries this finding as its reason.
 *   2. Re-categorize it (POST /api/v1/banking/transactions/:id/categorize) with the SAME account and the SAME payer tag it
 *      had. Since Phase 2 that creates and posts the Deposit, linked to the line both ways.
 *
 * Dry run by default. --execute needs --expect-host = DATABASE_URL's host.
 */
import pg from "pg";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import { registerBankTxCategorizationRoutes } from "../../apps/backend/src/banking/categorization.routes.js";
import { withCompanyScope } from "../../apps/backend/src/accounting/shared.js";
import { undoBankLineOnClient } from "../../apps/backend/src/banking/bank-line-state-machine.service.js";

const FINDING = "ROUND 441.5 Phase 2: re-recorded as a Deposit document (owner: ours works exactly as QuickBooks)";

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const actor = arg("--actor-user-id");
  const expectHost = arg("--expect-host");
  const url = process.env.DATABASE_URL ?? "";
  if (!url || !actor) throw new Error("DATABASE_URL and --actor-user-id are required");
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

  type Line = {
    je: string; bt: string; account_id: string; account_number: string; account_name: string; amount_cents: string;
    vendor_id: string | null; customer_id: string | null; memo: string | null; transaction_date: string; description: string | null;
  };
  const lines = await read<Line>(
    `SELECT DISTINCT ON (bt.id) je.id::text AS je, bt.id::text AS bt, a.id::text AS account_id, a.account_number, a.account_name,
            abs(bt.amount_cents)::text AS amount_cents, bt.categorization_vendor_id::text AS vendor_id,
            bt.categorization_customer_id::text AS customer_id, bt.categorization_memo AS memo,
            bt.transaction_date::text AS transaction_date, bt.description
       FROM accounting.journal_entries je
       JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = je.id AND p.source_transaction_type = 'bank_categorization'
       JOIN banking.bank_transactions bt ON bt.id::text = p.source_transaction_id AND bt.operating_company_id = je.operating_company_id
       JOIN catalogs.accounts a ON a.id = bt.categorization_gl_account_id
      WHERE je.operating_company_id = $1::uuid AND je.status = 'posted' AND je.voided_at IS NULL
        AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL AND bt.is_credit = true
      ORDER BY bt.id, je.created_at`,
    [oc]
  );
  const accountNumbers = [...new Set(["1000", ...lines.map((l) => l.account_number)])];
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
  const total = lines.reduce((s, l) => s + Number(l.amount_cents), 0);
  const log: string[] = [`ROUND 441.5 Phase 2 convert — ${execute ? "EXECUTE" : "DRY RUN (no writes)"} — USMCA — ${lines.length} money-in lines, ${(total / 100).toFixed(2)}`];
  const done: string[] = [];

  try {
    for (const l of lines) {
      const label = `${l.transaction_date} $${(Number(l.amount_cents) / 100).toFixed(2)} → ${l.account_number}`;
      if (!execute) { log.push(`  would CONVERT ${label} (JE ${l.je})`); continue; }
      await withCompanyScope(actor, oc, (client) =>
        undoBankLineOnClient(client as never, { operatingCompanyId: oc, bankTransactionId: l.bt, actorUserId: actor, reason: FINDING })
      );
      const payload: Record<string, unknown> = { category_kind: l.account_name, gl_account_id: l.account_id };
      if (l.vendor_id) payload.vendor_id = l.vendor_id;
      if (l.customer_id) payload.customer_id = l.customer_id;
      if (l.memo) payload.memo = l.memo;
      const res = await app.inject({ method: "POST", url: `/api/v1/banking/transactions/${l.bt}/categorize?operating_company_id=${oc}`, headers, payload });
      if (res.statusCode >= 300) throw new Error(`categorize ${label}: ${res.statusCode} ${res.body}`);
      const [after] = await read<{ deposit_id: string | null; display_id: string | null; je: string | null }>(
        `SELECT d.id::text AS deposit_id, d.display_id, d.journal_entry_id::text AS je
           FROM banking.bank_transactions bt LEFT JOIN accounting.deposits d ON d.id = bt.matched_deposit_id WHERE bt.id = $1::uuid`,
        [l.bt]
      );
      if (!after?.deposit_id) throw new Error(`categorize ${label}: no deposit linked after re-record`);
      done.push(`${label}: voided JE ${l.je} -> ${after.display_id} (${after.deposit_id}), entry ${after.je}`);
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
  if (done.length) log.push("", `converted ${done.length}:`, ...done);
  await pool.end();
  console.log(log.join("\n"));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
