/**
 * verify-overpayment-becomes-unapplied-credit (ROW-21 / step 20023)
 *
 * Guards the unapplied-credit engine (QBO behavior in apply.service.ts):
 * 1. Ceiling 0: no live payment has amount_unapplied_cents < 0 (amount_unapplied_cents is a
 *    generated column = amount_cents - amount_applied_cents; negative = more was applied than received).
 * 2. Credit memo floor ratchet: count of overpayment credit memos ≥ CREDIT_MEMO_FLOOR (never shrinks).
 *
 * DATA-LATER: USMCA has 0 live payments today; floor starts at 0 and grows when payments land.
 */

import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const CREDIT_MEMO_FLOOR = 0;   // grows when real overpayment credit memos are created

const isSelftest = process.argv.includes("--selftest");

if (!isSelftest) {
  await runLive();
} else {
  await runSelftest();
}

async function runLive() {
  const { client, pool } = await requireLiveDbOrExit({ label: "verify-overpayment-becomes-unapplied-credit" });
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'on'");

    const { negativeUnapplied, creditMemoCount } = await measureDb(client);

    console.log(
      `unapplied-credit: negative_unapplied=${negativeUnapplied}/0 credit_memos=${creditMemoCount}/${CREDIT_MEMO_FLOOR}`
    );

    let fail = false;

    if (negativeUnapplied > 0) {
      console.error(`FAIL: ${negativeUnapplied} live payment(s) have amount_unapplied_cents < 0 (applied > received)`);
      fail = true;
    }

    if (creditMemoCount < CREDIT_MEMO_FLOOR) {
      console.error(`FAIL: overpayment credit memo count ${creditMemoCount} < floor ${CREDIT_MEMO_FLOOR} (ratchet shrunk)`);
      fail = true;
    }

    if (fail) {
      await client.query("ROLLBACK");
      process.exit(1);
    }

    console.log("PASS");
    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
}

async function measureDb(client) {
  // 1. Live payments with negative unapplied (data corruption ceiling)
  const negRes = await client.query(`
    SELECT COUNT(*)::int AS cnt
      FROM accounting.payments
     WHERE voided_at IS NULL
       AND amount_unapplied_cents < 0
  `);
  const negativeUnapplied = Number(negRes.rows[0]?.cnt ?? 0);

  // 2. Overpayment credit memos (floor ratchet)
  const cmRes = await client.query(`
    SELECT COUNT(*)::int AS cnt
      FROM accounting.credit_memos
     WHERE status = 'issued'
       AND notes LIKE 'Auto-created from unapplied overpayment on %'
  `);
  const creditMemoCount = Number(cmRes.rows[0]?.cnt ?? 0);

  return { negativeUnapplied, creditMemoCount };
}

async function runSelftest() {
  const { client, pool } = await requireLiveDbOrExit({ label: "verify-overpayment-becomes-unapplied-credit (selftest)" });
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'on'");

    // Baseline must be clean
    const baseline = await measureDb(client);
    if (baseline.negativeUnapplied !== 0) {
      console.error("SELFTEST FAIL: baseline already has violations — test environment is dirty");
      await client.query("ROLLBACK");
      process.exit(1);
    }

    // Find any live payment to mutate
    const payRes = await client.query(`
      SELECT id::text, amount_cents::bigint AS amount_cents, amount_applied_cents::bigint AS amount_applied_cents
        FROM accounting.payments
       WHERE voided_at IS NULL
       LIMIT 1
    `);

    if (payRes.rows.length === 0) {
      console.log("SELFTEST SKIP: no live payments available to test against — guard passes vacuously (DATA-LATER)");
      await client.query("ROLLBACK");
      return;
    }

    const pay = payRes.rows[0];

    // amount_unapplied_cents is a generated column = amount_cents - amount_applied_cents.
    // Mutate amount_applied_cents to amount_cents + 1 to force negative unapplied.
    try {
      await client.query(
        `UPDATE accounting.payments SET amount_applied_cents = amount_cents + 1 WHERE id = $1::uuid`,
        [pay.id]
      );
    } catch (e) {
      if (e && typeof e === "object" && (e.code === "25006" || e.code === "23514")) {
        // 25006 = read-only; 23514 = check constraint violation
        console.log("SELFTEST SKIP: guard credential is read-only or constraint prevented mutation (run in CI)");
        await client.query("ROLLBACK");
        return;
      }
      throw e;
    }

    const afterMut = await measureDb(client);
    if (afterMut.negativeUnapplied === 0) {
      console.error("SELFTEST FAIL: negative amount_unapplied_cents not detected");
      await client.query("ROLLBACK");
      process.exit(1);
    }
    console.log(`SELFTEST 1/2 PASS: negative unapplied detected (count=${afterMut.negativeUnapplied})`);

    // Restore
    await client.query(
      `UPDATE accounting.payments SET amount_applied_cents = $1 WHERE id = $2::uuid`,
      [Number(pay.amount_applied_cents), pay.id]
    );

    const afterRestore = await measureDb(client);
    if (afterRestore.negativeUnapplied !== 0) {
      console.error("SELFTEST FAIL: restore did not clean up");
      await client.query("ROLLBACK");
      process.exit(1);
    }
    console.log("SELFTEST 2/2 PASS: restore confirmed clean");

    console.log("SELFTEST PASS: all mutations detected and restored");
    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
}
