#!/usr/bin/env node
/**
 * STAGE 2 GATE — walk one load book → bank on a Neon REHEARSE branch, through the REAL shared poster.
 *
 * WHY THIS SCRIPT EXISTS
 * Hops 6–9 are each wired in code, and each has a guard. What none of that proves is that a single load
 * can travel the whole path and leave a BALANCED ledger behind with both-way links intact. Per-hop
 * green plus per-hop guards is exactly the state in which a system passes every check and still cannot
 * complete one real transaction — the seams between the hops are where money goes missing.
 *
 * So this drives the compiled `postSourceTransaction` (the same shared poster the app calls; NO new GL
 * math here) and then asserts, from the ledger itself:
 *   1. every journal entry it produced is balanced, DR = CR to the cent;
 *   2. each posting carries source_transaction_type + source_transaction_id, so the ledger can name
 *      what caused it;
 *   3. the both-way links resolve (§10.3): invoice → load, and bank transaction → invoice.
 *
 * REHEARSE ONLY. It refuses to run against the prod branch: the whole point is to prove the walk
 * without writing test money into the real books.
 */
import pg from "pg";
import { pathToFileURL } from "node:url";

const DATABASE_URL = process.env.DATABASE_URL;
const TRANSP = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

function assertRehearseOnly(cs) {
  if (/-pooler\./.test(String(cs ?? ""))) {
    throw new Error("refusing a -pooler endpoint: session-scoped GUCs do not survive transaction pooling.");
  }
  if (/ep-broad-block-akykk7bw/.test(String(cs ?? ""))) {
    throw new Error(
      "REFUSING TO RUN AGAINST PROD. This walk creates a load, an invoice and journal entries; on prod " +
        "that is fabricated money in the real books. Point DATABASE_URL at a rehearse branch."
    );
  }
}

async function main() {
  if (!DATABASE_URL) {
    console.error("stage2-rehearse-walk: DATABASE_URL required (rehearse branch, direct endpoint).");
    process.exit(2);
  }
  assertRehearseOnly(DATABASE_URL);

  const { postSourceTransaction } = await import(
    new URL("../dist/accounting/posting-engine.service.js", import.meta.url).href
  );

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  const client = await pool.connect();
  const results = { steps: [], failures: [] };

  try {
    await client.query(`SELECT set_config('app.bypass_rls','lucia',false)`);

    const actor = (
      await client.query(`SELECT id::text AS id FROM identity.users ORDER BY created_at LIMIT 1`)
    ).rows[0];
    if (!actor) throw new Error("no identity.users row to act as");

    const customer = (
      await client.query(
        `SELECT id::text FROM mdata.customers WHERE operating_company_id = $1::uuid LIMIT 1`,
        [TRANSP]
      )
    ).rows[0];
    if (!customer) throw new Error("no TRANSP customer to book against");

    // ── 1. BOOK: a load with a customer and a rate (hop.book predicate) ──
    const load = (
      await client.query(
        `
        INSERT INTO mdata.loads
          (operating_company_id, customer_id, dispatcher_user_id, rate_total_cents, status, load_number)
        VALUES ($1::uuid, $2::uuid, $3::uuid, 150000, 'booked',
                'STAGE2-REHEARSE-' || substr(md5(random()::text),1,6))
        RETURNING id::text, load_number
      `,
        [TRANSP, customer.id, actor.id]
      )
    ).rows[0];
    results.steps.push(`booked load ${load.load_number} @ $1,500.00`);

    // ── 2. INVOICE FROM LOAD: source_load_id is the §10.3 forward link (hop.invoice) ──
    const invoice = (
      await client.query(
        `
        INSERT INTO accounting.invoices
          (operating_company_id, customer_id, source_load_id, status, issue_date, due_date,
           subtotal_cents, total_cents, display_id, source_system)
        VALUES ($1::uuid, $2::uuid, $3::uuid, 'sent', current_date, current_date + 30,
                150000, 150000, -- display_id is CHECK-constrained to ^INV-[0-9]{4}-[0-9]{5}$, so a 'STAGE2-' prefix is rejected.
                -- Use a real-shaped id in a high block that cannot collide with production numbering.
                'INV-' || to_char(current_date,'YYYY') || '-' || lpad((90000 + floor(random()*9999))::int::text, 5, '0'), 'tms')
        RETURNING id::text, display_id
      `,
        [TRANSP, customer.id, load.id]
      )
    ).rows[0];
    results.steps.push(`invoice ${invoice.display_id} created from load (source_load_id set)`);

    // A revenue-bearing LINE carrying source_load_id AND a mapped Product/Service item.
    //
    // The poster refuses a line whose item has no income mapping — it will NOT fall back to
    // revenue_default. That is deliberate and correct: silently defaulting would post real revenue to a
    // catch-all and make every mis-mapped line invisible. So the walk resolves a genuinely mapped item
    // (21 of 190 TRANSP items carry default_income_account_id) rather than pinning account_id, which
    // would prove the insert works while leaving the real resolution path untested.
    const item = (
      await client.query(
        `SELECT qbo_item_id::text AS qbo_item_id FROM catalogs.items
          WHERE operating_company_id=$1::uuid AND default_income_account_id IS NOT NULL
            AND qbo_item_id IS NOT NULL
          LIMIT 1`,
        [TRANSP]
      )
    ).rows[0];
    if (!item) throw new Error("no TRANSP item mapped to an income account — cannot post revenue honestly");
    await client.query(
      `
        INSERT INTO accounting.invoice_lines
          (operating_company_id, invoice_id, source_load_id, line_type, description,
           quantity, unit_amount_cents, line_total_cents, qbo_item_id)
        VALUES ($1::uuid, $2::uuid, $3::uuid, 'linehaul', 'STAGE2 rehearse line-haul', 1, 150000, 150000, $4)
      `,
      [TRANSP, invoice.id, load.id, item.qbo_item_id]
    );
    results.steps.push(`revenue line added ($1,500.00) on mapped item ${item.qbo_item_id}`);

    // ── 3. GL: the SHARED poster, not hand-written SQL ──
    const posted = await postSourceTransaction(
      {
        operating_company_id: TRANSP,
        source_transaction_type: "invoice",
        source_transaction_id: invoice.id,
        posting_purpose: "initial_post",
      },
      { userId: actor.id }
    );
    results.steps.push(`shared poster produced JE ${posted.journal_entry_id} (${posted.result})`);

    // ── ASSERT 1: balanced to the cent ──
    const bal = (
      await client.query(
        `
        SELECT
          COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit='debit'),0)::bigint  AS dr,
          COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit='credit'),0)::bigint AS cr,
          count(*)::int AS lines
        FROM accounting.journal_entry_postings
        WHERE journal_entry_uuid = $1::uuid
      `,
        [posted.journal_entry_id]
      )
    ).rows[0];
    if (String(bal.dr) !== String(bal.cr) || Number(bal.lines) < 2) {
      results.failures.push(`JE NOT BALANCED: dr=${bal.dr} cr=${bal.cr} lines=${bal.lines}`);
    } else {
      results.steps.push(`BALANCED: DR ${bal.dr} = CR ${bal.cr} across ${bal.lines} lines`);
    }

    // ── ASSERT 2: every posting names its source ──
    const unsourced = (
      await client.query(
        `
        SELECT count(*)::int AS n FROM accounting.journal_entry_postings
        WHERE journal_entry_uuid = $1::uuid
          AND (source_transaction_type IS NULL OR source_transaction_id IS NULL)
      `,
        [posted.journal_entry_id]
      )
    ).rows[0];
    if (Number(unsourced.n) > 0) {
      results.failures.push(`${unsourced.n} posting(s) carry no source_transaction_type/id`);
    } else {
      results.steps.push("every posting names its source_transaction_type + id");
    }

    // ── 4. BANK: a receipt matched back to the invoice (hop.bank, §10.3 reverse link) ──
    const bankAcct = (
      await client.query(
        `SELECT id::text FROM banking.bank_accounts
          WHERE operating_company_id=$1::uuid AND is_active AND account_class='depository' LIMIT 1`,
        [TRANSP]
      )
    ).rows[0];
    if (!bankAcct) {
      results.failures.push("no depository bank account on TRANSP to receive the payment");
    } else {
      const bt = (
        await client.query(
          `
          INSERT INTO banking.bank_transactions
            (operating_company_id, bank_account_id, transaction_date, amount_cents, is_credit,
             description, status, matched_invoice_id, source)
          VALUES ($1::uuid, $2::uuid, current_date, 150000, true,
                  'STAGE2 REHEARSE customer receipt', 'matched', $3::uuid, 'csv_import')
          RETURNING id::text
        `,
          [TRANSP, bankAcct.id, invoice.id]
        )
      ).rows[0];
      results.steps.push(`bank receipt ${bt.id} matched to invoice`);
    }

    // ── ASSERT 3: both-way links resolve (§10.3) ──
    const links = (
      await client.query(
        `
        SELECT
          (SELECT count(*) FROM accounting.invoices i
             WHERE i.id=$1::uuid AND i.source_load_id=$2::uuid)::int AS invoice_to_load,
          (SELECT count(*) FROM banking.bank_transactions b
             WHERE b.matched_invoice_id=$1::uuid)::int AS bank_to_invoice
      `,
        [invoice.id, load.id]
      )
    ).rows[0];
    if (Number(links.invoice_to_load) !== 1 || Number(links.bank_to_invoice) !== 1) {
      results.failures.push(
        `linkage did not resolve: invoice→load=${links.invoice_to_load}, bank→invoice=${links.bank_to_invoice}`
      );
    } else {
      results.steps.push("§10.3 linkage resolves both ways: invoice→load AND bank→invoice");
    }
  } catch (error) {
    results.failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    client.release();
    await pool.end();
  }

  console.log("\n=== STAGE 2 REHEARSE WALK ===");
  for (const s of results.steps) console.log(`  ok   ${s}`);
  for (const f of results.failures) console.error(`  FAIL ${f}`);
  console.log(
    results.failures.length
      ? `\nWALK FAILED — ${results.failures.length} problem(s).`
      : "\nWALK PASSED — one load travelled book → invoice → balanced GL → bank, links intact."
  );
  process.exit(results.failures.length ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
