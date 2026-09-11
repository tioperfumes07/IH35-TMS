#!/usr/bin/env tsx
/**
 * REG-028/030 repair — ground truth = BofA CSV in Downloads (Claude recon 2026-09-11e).
 * 1) Match statement lines to Neon (date + abs cents).
 * 2) VOID unmatched Neon rows (phantoms / pending dupes) — never DELETE.
 * 3) INSERT the 2 missing statement lines (csv_import, statement-signed cents).
 * 4) NEGATE remaining Plaid amount_cents so they match BofA (in+, out−); is_credit unchanged.
 * 5) Set current_balance_cents to the statement ending $6,389.72.
 *
 * Usage:
 *   DATABASE_URL=<neon> npx tsx scripts/ops/cursor-2026-09-10-reg030-bofa-repair.mts --dry-run
 *   DATABASE_URL=<neon> npx tsx scripts/ops/cursor-2026-09-10-reg030-bofa-repair.mts --apply
 */
import fs from "node:fs";
import pg from "pg";

const ACCOUNT_ID = "e83028a5-dcda-4233-b660-5b9923b3d39c";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const CSV = "/Users/jorgemunoz/Downloads/USMCA-BANK OF AMERICA ACCOUNT-TRANSACTIONS 2025-2026.csv";
const ENDING_CENTS = 638972;
const VOID_REASON = "reg030_bofa_statement_unmatched_phantom";

type Stmt = { date: string; desc: string; cents: number };
type Neon = {
  id: string;
  transaction_date: string;
  description: string | null;
  amount_cents: string;
  is_credit: boolean;
  pending: boolean;
  matched_journal_entry_id: string | null;
  reconciled_obligation_id: string | null;
  categorization_gl_account_id: string | null;
};

function parseCsv(path: string): Stmt[] {
  const raw = fs.readFileSync(path, "utf8");
  const lines = raw.split(/\r?\n/);
  const out: Stmt[] = [];
  for (const line of lines) {
    if (!/^\d{1,2}\/\d{1,2}\/\d{2},/.test(line)) continue;
    const m = line.match(/^(\d{1,2}\/\d{1,2}\/\d{2}),([\s\S]*)$/);
    if (!m) continue;
    const dateRaw = m[1];
    let rest = m[2];
    if (rest.includes("Beginning balance")) continue;
    // amount is the last-but-one numeric field; running bal last.
    const amountMatch = rest.match(/,"?(-?[\d,]+\.?\d*)"?,(?:"?(-?[\d,]+\.?\d*)"?)$/);
    const simple = rest.match(/,(-?[\d,]+\.?\d*),(-?[\d,]+\.?\d*)$/);
    const amtStr = (amountMatch?.[1] ?? simple?.[1] ?? "").replace(/,/g, "");
    if (!amtStr) continue;
    const [mm, dd, yy] = dateRaw.split("/").map((x) => Number(x));
    const date = `${2000 + yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    const desc = rest.slice(0, rest.lastIndexOf(amountMatch?.[0] ?? simple?.[0] ?? "")).replace(/^"|"$/g, "");
    out.push({ date, desc, cents: Math.round(Number(amtStr) * 100) });
  }
  return out;
}

function key(date: string, cents: number) {
  return `${date}|${Math.abs(cents)}`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const stmt = parseCsv(CSV);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
    const neon = await c.query<Neon>(
      `SELECT id::text, transaction_date::date::text, description, amount_cents::text, is_credit, pending,
              matched_journal_entry_id::text, reconciled_obligation_id::text, categorization_gl_account_id::text
         FROM banking.bank_transactions
        WHERE bank_account_id=$1::uuid AND voided_at IS NULL`,
      [ACCOUNT_ID]
    );
    const used = new Set<string>();
    const missing: Stmt[] = [];
    for (const s of stmt) {
      const k = key(s.date, s.cents);
      const cand = neon.rows.filter((r) => !used.has(r.id) && key(r.transaction_date, Number(r.amount_cents)) === k);
      cand.sort((a, b) => Number(a.pending) - Number(b.pending));
      const hit = cand[0];
      if (!hit) missing.push(s);
      else used.add(hit.id);
    }
    const phantoms = neon.rows.filter((r) => !used.has(r.id));
    console.log(`statement=${stmt.length} neon_active=${neon.rows.length} matched=${used.size} missing=${missing.length} phantoms=${phantoms.length}`);
    for (const s of missing) console.log(`MISSING ${s.date} ${s.cents} ${s.desc.slice(0, 80)}`);
    for (const p of phantoms) {
      console.log(`PHANTOM ${p.transaction_date} pending=${p.pending} cents=${p.amount_cents} ${(p.description ?? "").slice(0, 70)}`);
    }
    if (!apply) {
      await c.query("ROLLBACK");
      return;
    }

    const linkedPhantoms = phantoms.filter((p) => p.matched_journal_entry_id || p.reconciled_obligation_id || p.categorization_gl_account_id);
    const voidable = phantoms.filter((p) => !linkedPhantoms.includes(p));
    if (voidable.length) {
      const ids = voidable.map((p) => p.id);
      const v = await c.query(
        `UPDATE banking.bank_transactions
            SET voided_at = now(), voided_reason = $2, dedup_hash = NULL, updated_at = now()
          WHERE id = ANY($1::uuid[]) AND bank_account_id = $3::uuid AND voided_at IS NULL
          RETURNING id`,
        [ids, VOID_REASON, ACCOUNT_ID]
      );
      console.log(`VOIDED ${v.rowCount} phantoms`);
    }
    if (linkedPhantoms.length) console.log(`SKIP linked phantoms ${linkedPhantoms.length}`);

    for (const s of missing) {
      const isCredit = s.cents > 0;
      await c.query(
        `INSERT INTO banking.bank_transactions (
           bank_account_id, operating_company_id, transaction_date, amount_cents, description,
           pending, is_credit, source, source_ref, review_state, status, created_at, updated_at
         ) VALUES ($1,$2,$3::date,$4,$5,false,$6,'csv_import','reg030_bofa_gapfill','for_review','pending_categorization', now(), now())`,
        [ACCOUNT_ID, USMCA, s.date, s.cents, s.desc, isCredit]
      );
    }
    console.log(`INSERTED ${missing.length} missing statement rows`);

    const flip = await c.query(
      `UPDATE banking.bank_transactions
          SET amount_cents = -amount_cents, updated_at = now()
        WHERE bank_account_id = $1::uuid
          AND voided_at IS NULL
          AND source = 'plaid'
          AND ((is_credit = true AND amount_cents < 0) OR (is_credit = false AND amount_cents > 0))
        RETURNING id`,
      [ACCOUNT_ID]
    );
    console.log(`FLIPPED ${flip.rowCount} plaid signs to BofA convention`);

    await c.query(
      `UPDATE banking.bank_accounts SET current_balance_cents = $2, updated_at = now() WHERE id = $1::uuid`,
      [ACCOUNT_ID, ENDING_CENTS]
    );

    const postedPending = await c.query(
      `UPDATE banking.bank_transactions
          SET pending = false, updated_at = now()
        WHERE bank_account_id = $1::uuid AND voided_at IS NULL AND pending = true
        RETURNING id`,
      [ACCOUNT_ID]
    );
    console.log(`CLEARED pending flag on ${postedPending.rowCount} leftover rows that matched the posted statement`);

    const sum = await c.query<{ s: string }>(
      `SELECT COALESCE(SUM(CASE WHEN is_credit THEN ABS(amount_cents) ELSE -ABS(amount_cents) END),0)::text AS s
         FROM banking.bank_transactions
        WHERE bank_account_id=$1::uuid AND voided_at IS NULL AND pending = false`,
      [ACCOUNT_ID]
    );
    console.log(`posted_signed_sum_cents=${sum.rows[0]?.s} expected=${ENDING_CENTS}`);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
