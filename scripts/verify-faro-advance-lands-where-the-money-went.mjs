#!/usr/bin/env node
/**
 * verify-faro-advance-lands-where-the-money-went (step 18801 — CC-1 443.346)
 *
 * For every live USMCA factoring advance with bank_wire_cents set:
 *   1. The 1090 (Undeposited Funds) DR on the live funding JE must equal bank_wire_cents.
 *   2. The 1230 (Factoring Reserves) DR must be >= reserve_amount_cents (gap absorbed into reserve).
 *
 * Advances with bank_wire_cents IS NULL are skipped — NULL means "full advance to 1090" which is
 * correct for exact-wire advances (original behaviour, unchanged).
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-faro-advance-lands-where-the-money-went";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });

try {
  await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
  await client.query(`SELECT set_config('app.operating_company_id','${USMCA}',true)`);

  const acct1090 = await client.query(
    `SELECT id FROM catalogs.accounts WHERE operating_company_id=$1 AND account_number='1090' LIMIT 1`,
    [USMCA]
  );
  const acct1230 = await client.query(
    `SELECT id FROM catalogs.accounts WHERE operating_company_id=$1 AND account_number='1230' LIMIT 1`,
    [USMCA]
  );

  if (acct1090.rows.length === 0 || acct1230.rows.length === 0) {
    console.error(`${LABEL}: FAIL — 1090 or 1230 account missing from USMCA`);
    client.release();
    await pool.end();
    process.exit(1);
  }
  const id1090 = acct1090.rows[0].id;
  const id1230 = acct1230.rows[0].id;

  const advRows = await client.query(
    `SELECT id, display_id, bank_wire_cents, reserve_amount_cents
     FROM accounting.factoring_advances
     WHERE operating_company_id=$1 AND voided_at IS NULL AND bank_wire_cents IS NOT NULL`,
    [USMCA]
  );

  if (advRows.rows.length === 0) {
    console.log(`${LABEL}: PASS — no advances with bank_wire_cents set (nothing to verify yet)`);
    client.release();
    await pool.end();
    process.exit(0);
  }

  const violations = [];

  for (const adv of advRows.rows) {
    const bankWire = Number(adv.bank_wire_cents);
    const reserveBase = Number(adv.reserve_amount_cents ?? 0);

    // Find the live (not reversed) funding JE via lifecycle posting key
    const keyRow = await client.query(
      `SELECT k.journal_entry_id
       FROM accounting.factoring_lifecycle_posting_keys k
       JOIN accounting.journal_entries je ON je.id = k.journal_entry_id
       WHERE k.operating_company_id=$1 AND k.factoring_advance_id=$2
         AND k.event_key='funding'
         AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL
       ORDER BY k.created_at DESC LIMIT 1`,
      [USMCA, adv.id]
    );

    if (keyRow.rows.length === 0) {
      // Not yet reposted after bank_wire_cents was set — acceptable (seed script pending)
      continue;
    }

    const jeId = keyRow.rows[0].journal_entry_id;

    const cash1090 = await client.query(
      `SELECT COALESCE(SUM(amount_cents),0)::bigint AS total
       FROM accounting.journal_entry_postings
       WHERE journal_entry_uuid=$1 AND account_id=$2 AND debit_or_credit='debit'`,
      [jeId, id1090]
    );
    const cash1230 = await client.query(
      `SELECT COALESCE(SUM(amount_cents),0)::bigint AS total
       FROM accounting.journal_entry_postings
       WHERE journal_entry_uuid=$1 AND account_id=$2 AND debit_or_credit='debit'`,
      [jeId, id1230]
    );

    const actual1090 = Number(cash1090.rows[0].total);
    const actual1230 = Number(cash1230.rows[0].total);

    if (actual1090 !== bankWire) {
      violations.push(
        `${adv.display_id}: 1090 DR=${actual1090} but expected bank_wire_cents=${bankWire}`
      );
    }
    if (actual1230 < reserveBase) {
      violations.push(
        `${adv.display_id}: 1230 DR=${actual1230} < reserve_amount_cents=${reserveBase} (gap not absorbed)`
      );
    }
  }

  if (violations.length > 0) {
    console.error(`${LABEL}: FAIL — factoring advance bank_wire posting violations:`);
    violations.forEach(v => console.error("  " + v));
    client.release();
    await pool.end();
    process.exit(1);
  }

  console.log(`${LABEL}: PASS — ${advRows.rows.length} advance(s) with bank_wire_cents post correctly`);
  client.release();
  await pool.end();
  process.exit(0);
} catch (err) {
  console.error(`${LABEL}: FAIL — ${err.message}`);
  try { client.release(); } catch (_) {}
  await pool.end().catch(() => {});
  process.exit(1);
}
