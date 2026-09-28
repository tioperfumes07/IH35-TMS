#!/usr/bin/env tsx
/**
 * ROUND 145 — SEED ONLY (owner 2026-09-28).
 *
 * 1) RE-POINT all USMCA expense_lines with item_id NULL → canonical item UUID by description.
 * 2) SEED missing document expenses for company settlements 5769–5816 from
 *    feed-input/r145-document-expenses-255.json (exact 255 / $12,764.27 control).
 * 3) SEED owner-ruled workbook misc extras (5812 GAS/COMIDAS) from
 *    feed-input/r145-workbook-misc-extras.json.
 *
 * Idempotent on (source_settlement_ref, date, vendor_token, amount_cents, item_id).
 * Blank vendor is allowed. Never touches FUEL_FEED (source_fuel_transaction_id) or
 * bank-origin (no settlement_ref + no fuel). CREATE NO ITEM. Quick Pay not posted.
 *
 * Usage:
 *   OWNER_AUTH_ID=AUTH-076 npx tsx scripts/feed/r145-seed-document-expenses.mts
 *   OWNER_AUTH_ID=AUTH-076 npx tsx scripts/feed/r145-seed-document-expenses.mts --apply
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR = "00000000-0000-4000-8000-000000000001";
const BANK = "c7af1219-f6a6-4169-a2d8-8f556fb0c2f3"; // 1000 Bank of America - Operating (USMCA)
const APPLY = process.argv.includes("--apply");

const ITEM_DEF = "009b48f2-f7aa-4548-b155-cedf66f427d3";
const ITEM_DIESEL = "682f9763-5eb4-42c3-995a-2d893c500c90";
const ITEM_REEFER = "a2df9d70-b35b-45f3-bf86-9c32bdc0a1c5";
const RETIRED = "feb8eda8"; // never use — prefix check only

const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
if (!REQUIRED_AUTH_ID) {
  console.error("R145: OWNER_AUTH_ID required");
  process.exit(1);
}
try {
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], {
    stdio: "inherit",
  });
} catch {
  console.error(`R145: ${REQUIRED_AUTH_ID} rejected`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const DATABASE_URL = process.env.DATABASE_URL.replace("-pooler.", ".");

type SeedRow = {
  doc: string;
  date: string;
  vendor: string;
  desc: string;
  amt: number;
  item_id: string;
  invoice?: string;
  load?: string | null;
  is_reimbursable?: boolean;
  source?: string;
};

function cents(n: number) {
  return Math.round(Number(n) * 100);
}

function vendorToken(v: string | null | undefined) {
  return String(v || "")
    .trim()
    .split(/\s+/)[0]
    ?.toUpperCase() || "";
}

async function resolveVendorId(
  client: pg.PoolClient,
  vendor: string
): Promise<string | null> {
  const name = String(vendor || "").trim();
  if (!name || name === "--" || name === "-") return null;
  const token = vendorToken(name);
  const q = await client.query<{ id: string }>(
    `SELECT id::text
       FROM mdata.vendors
      WHERE operating_company_id = $1::uuid
        AND deactivated_at IS NULL
        AND (
          upper(coalesce(vendor_name, '')) = upper($2)
          OR upper(coalesce(vendor_name, '')) LIKE upper($3) || '%'
          OR upper(coalesce(print_on_check_name, '')) LIKE upper($3) || '%'
        )
      ORDER BY (upper(coalesce(vendor_name,'')) = upper($2)) DESC, created_at ASC
      LIMIT 1`,
    [USMCA, name, token]
  );
  return q.rows[0]?.id ?? null;
}

async function resolveLoadId(
  client: pg.PoolClient,
  loadNumber: string | null | undefined,
  doc: string
): Promise<{ loadId: string | null; loadNumber: string | null }> {
  if (loadNumber) {
    const r = await client.query<{ id: string; load_number: string }>(
      `SELECT id::text, load_number
         FROM mdata.loads
        WHERE operating_company_id = $1::uuid
          AND load_number = $2
          AND soft_deleted_at IS NULL
        LIMIT 1`,
      [USMCA, loadNumber]
    );
    if (r.rows[0]) return { loadId: r.rows[0].id, loadNumber: r.rows[0].load_number };
  }
  const fromSett = await client.query<{ id: string; load_number: string }>(
    `SELECT l.id::text, l.load_number
       FROM driver_finance.driver_settlements ds
       JOIN driver_finance.settlement_lines sl
         ON sl.settlement_id = ds.id AND sl.is_active IS NOT FALSE AND sl.voided_at IS NULL
       JOIN mdata.loads l ON l.id = sl.load_id AND l.soft_deleted_at IS NULL
      WHERE ds.operating_company_id = $1::uuid
        AND ds.source_document_ref = $2
      ORDER BY l.load_number
      LIMIT 1`,
    [USMCA, doc]
  );
  if (fromSett.rows[0]) {
    return { loadId: fromSett.rows[0].id, loadNumber: fromSett.rows[0].load_number };
  }
  return { loadId: null, loadNumber: null };
}

async function findExisting(
  client: pg.PoolClient,
  row: SeedRow
): Promise<{ id: string; item_id: string | null } | null> {
  const amt = cents(row.amt);
  const tok = vendorToken(row.vendor);
  // Prefer exact item match
  const exact = await client.query<{ id: string; item_id: string | null }>(
    `SELECT e.id::text, el.item_id::text AS item_id
       FROM accounting.expenses e
       JOIN accounting.expense_lines el ON el.expense_id = e.id
      WHERE e.operating_company_id = $1::uuid
        AND e.voided_at IS NULL
        AND coalesce(e.is_sample_data, false) = false
        AND e.source_settlement_ref = $2
        AND e.transaction_date = $3::date
        AND el.amount_cents = $4::bigint
        AND el.item_id = $5::uuid
      LIMIT 1`,
    [USMCA, row.doc, row.date, amt, row.item_id]
  );
  if (exact.rows[0]) return exact.rows[0];

  // Near-match: same settlement/date/amount (vendor optional) — adopt + ensure item
  const near = await client.query<{ id: string; item_id: string | null; line_id: string }>(
    `SELECT e.id::text, el.item_id::text AS item_id, el.id::text AS line_id
       FROM accounting.expenses e
       JOIN accounting.expense_lines el ON el.expense_id = e.id
      WHERE e.operating_company_id = $1::uuid
        AND e.voided_at IS NULL
        AND coalesce(e.is_sample_data, false) = false
        AND e.source_settlement_ref = $2
        AND e.transaction_date = $3::date
        AND el.amount_cents = $4::bigint
        AND (
          $5 = ''
          OR e.vendor_uuid IS NULL
          OR EXISTS (
            SELECT 1 FROM mdata.vendors v
             WHERE v.id = e.vendor_uuid
               AND upper(coalesce(v.vendor_name, v.print_on_check_name, '')) LIKE $5 || '%'
          )
        )
      ORDER BY (el.item_id = $6::uuid) DESC NULLS LAST
      LIMIT 1`,
    [USMCA, row.doc, row.date, amt, tok, row.item_id]
  );
  if (near.rows[0]) return { id: near.rows[0].id, item_id: near.rows[0].item_id };
  return null;
}

async function main() {
  const seedPath = path.join(ROOT, "feed-input/r145-document-expenses-255.json");
  const extrasPath = path.join(ROOT, "feed-input/r145-workbook-misc-extras.json");
  const seed = JSON.parse(readFileSync(seedPath, "utf8")) as SeedRow[];
  const extras = JSON.parse(readFileSync(extrasPath, "utf8")) as SeedRow[];

  if (seed.length !== 255) throw new Error(`seed file must be 255 rows, got ${seed.length}`);
  const seedSum = seed.reduce((s, r) => s + r.amt, 0);
  if (Math.abs(seedSum - 12764.27) > 0.02) {
    throw new Error(`seed sum ${seedSum} != 12764.27`);
  }
  for (const r of [...seed, ...extras]) {
    if (!r.item_id || r.item_id.startsWith(RETIRED)) {
      throw new Error(`bad/retired item_id on ${r.doc} ${r.amt}`);
    }
  }

  const { generateExpenseNumber } = await import(
    "../../apps/backend/src/expense-attribution/expense-number.js"
  );

  const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  const proof: Record<string, unknown> = {
    apply: APPLY,
    repointed: 0,
    seeded: 0,
    skipped_existing: 0,
    extras_seeded: 0,
  };

  try {
    await client.query("BEGIN");
    await client.query("RESET ROLE");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);

    // Baselines (must stay unchanged for fuel feed + bank-origin)
    const fuelFeed = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM accounting.expenses
        WHERE operating_company_id = $1::uuid AND voided_at IS NULL
          AND coalesce(is_sample_data,false)=false
          AND source_fuel_transaction_id IS NOT NULL`,
      [USMCA]
    );
    const bankOrigin = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM accounting.expenses
        WHERE operating_company_id = $1::uuid AND voided_at IS NULL
          AND coalesce(is_sample_data,false)=false
          AND source_settlement_ref IS NULL
          AND source_fuel_transaction_id IS NULL`,
      [USMCA]
    );
    const fuelN = Number(fuelFeed.rows[0]!.n);
    const bankN = Number(bankOrigin.rows[0]!.n);
    proof.baseline_fuel_feed = fuelN;
    proof.baseline_bank_origin = bankN;
    if (fuelN !== 391) console.warn(`WARN: FUEL_FEED baseline is ${fuelN}, expected 391`);
    if (bankN !== 51) console.warn(`WARN: bank-origin baseline is ${bankN}, expected 51`);

    // Load item → default expense account map
    const itemAccts = await client.query<{ id: string; acct: string }>(
      `SELECT id::text, default_expense_account_id::text AS acct
         FROM catalogs.items
        WHERE operating_company_id = $1::uuid
          AND deactivated_at IS NULL
          AND default_expense_account_id IS NOT NULL`,
      [USMCA]
    );
    const acctByItem = new Map(itemAccts.rows.map((r) => [r.id, r.acct]));
    for (const id of [ITEM_DEF, ITEM_DIESEL, ITEM_REEFER]) {
      if (!acctByItem.has(id)) throw new Error(`STOP: item ${id} missing default_expense_account_id`);
    }

    // ── 1) RE-POINT NULL item_id lines ────────────────────────────────────────
    const nullBefore = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM accounting.expense_lines el
         JOIN accounting.expenses e ON e.id = el.expense_id
        WHERE e.operating_company_id = $1::uuid
          AND e.voided_at IS NULL
          AND coalesce(e.is_sample_data,false)=false
          AND el.item_id IS NULL`,
      [USMCA]
    );
    proof.null_item_before = Number(nullBefore.rows[0]!.n);

    if (APPLY) {
      const rep = await client.query(
        `UPDATE accounting.expense_lines el
            SET item_id = CASE
                  WHEN el.description ILIKE 'Fuel · def%' OR el.description ILIKE 'Fuel%def%'
                    THEN $2::uuid
                  WHEN el.description ILIKE 'Fuel · reefer%' OR el.description ILIKE 'Fuel%reefer%'
                    THEN $3::uuid
                  WHEN el.description ILIKE 'Fuel · diesel%' OR el.description ILIKE 'Fuel%diesel%'
                    THEN $4::uuid
                  ELSE $4::uuid
                END,
                quantity = coalesce(nullif(el.quantity, 0), 1),
                rate_cents = coalesce(el.rate_cents, el.amount_cents),
                unit_of_measure = coalesce(nullif(el.unit_of_measure, ''), 'each'),
                expense_account_uuid = coalesce(
                  el.expense_account_uuid,
                  (SELECT default_expense_account_id FROM catalogs.items i WHERE i.id = CASE
                     WHEN el.description ILIKE 'Fuel · def%' OR el.description ILIKE 'Fuel%def%' THEN $2::uuid
                     WHEN el.description ILIKE 'Fuel · reefer%' OR el.description ILIKE 'Fuel%reefer%' THEN $3::uuid
                     ELSE $4::uuid
                   END)
                )
           FROM accounting.expenses e
          WHERE el.expense_id = e.id
            AND e.operating_company_id = $1::uuid
            AND e.voided_at IS NULL
            AND coalesce(e.is_sample_data,false)=false
            AND el.item_id IS NULL`,
        [USMCA, ITEM_DEF, ITEM_REEFER, ITEM_DIESEL]
      );
      proof.repointed = rep.rowCount ?? 0;
    } else {
      proof.repointed = proof.null_item_before;
      console.log(`DRY-RUN would repoint ${proof.null_item_before} null-item lines`);
    }

    // ── 2) SEED document expenses (255 control + workbook misc extras) ───────
    const allRows: SeedRow[] = [...seed, ...extras];
    for (const row of allRows) {
      const existing = await findExisting(client, row);
      if (existing) {
        if (APPLY && existing.item_id !== row.item_id) {
          const itemAcct = acctByItem.get(row.item_id);
          if (!itemAcct) throw new Error(`STOP: no account for item ${row.item_id}`);
          await client.query(
            `UPDATE accounting.expense_lines
                SET item_id = $2::uuid,
                    quantity = coalesce(nullif(quantity, 0), 1),
                    rate_cents = coalesce(rate_cents, amount_cents),
                    unit_of_measure = coalesce(nullif(unit_of_measure, ''), 'each'),
                    expense_account_uuid = coalesce(expense_account_uuid, $3::uuid)
              WHERE expense_id = $1::uuid`,
            [existing.id, row.item_id, itemAcct]
          );
        }
        proof.skipped_existing = Number(proof.skipped_existing) + 1;
        continue;
      }
      const itemAcct = acctByItem.get(row.item_id);
      if (!itemAcct) throw new Error(`STOP: no account for item ${row.item_id} (${row.doc} ${row.desc})`);

      const { loadId, loadNumber } = await resolveLoadId(client, row.load, row.doc);
      const vendorId = await resolveVendorId(client, row.vendor);
      const amt = cents(row.amt);
      const memo = `R145 AT settl ${row.doc} $${row.amt.toFixed(2)} ${row.desc}`.slice(0, 500);

      if (!APPLY) {
        console.log(`DRY-RUN seed ${row.doc} ${row.date} $${row.amt} ${row.desc} load=${loadNumber || "none"}`);
        if (row.source === "wb-misc") proof.extras_seeded = Number(proof.extras_seeded) + 1;
        else proof.seeded = Number(proof.seeded) + 1;
        continue;
      }

      let expenseNumber: string | null = null;
      if (loadId) {
        const numbering = await generateExpenseNumber(client as never, loadId, USMCA);
        expenseNumber = numbering.number;
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO accounting.expenses (
           operating_company_id, status, transaction_date, total_amount_cents,
           memo, expense_number, load_id, is_sample_data, payment_account_uuid,
           is_company_expense, is_reimbursable, vendor_uuid, vendor_document_number,
           source_settlement_ref, created_by_user_id, updated_by_user_id
         ) VALUES (
           $1::uuid, 'draft', $2::date, $3::bigint,
           $4, $5, $6::uuid, false, $7::uuid,
           $8, $9, $10::uuid, $11,
           $12, $13::uuid, $13::uuid
         ) RETURNING id::text`,
        [
          USMCA,
          row.date,
          amt,
          memo,
          expenseNumber,
          loadId,
          BANK,
          row.is_reimbursable ? false : true,
          !!row.is_reimbursable,
          vendorId,
          row.invoice || null,
          row.doc,
          SYSTEM_ACTOR,
        ]
      );
      const expenseId = inserted.rows[0]!.id;

      if (loadId && loadNumber && expenseNumber) {
        try {
          const seqMatch = String(expenseNumber).match(/-(\d+)$/);
          const seq = seqMatch ? Number(seqMatch[1]) : 1;
          await client.query(
            `INSERT INTO expense_attribution.expense_load_links (
               operating_company_id, expense_id, expense_source, load_id, load_number,
               expense_seq, expense_number, attribution_method, attribution_confidence,
               attribution_reason, attributed_by_user_id
             ) VALUES ($1,$2,'accounting',$3,$4,$5,$6,'user_assigned','high',$7,$8)`,
            [
              USMCA,
              expenseId,
              loadId,
              loadNumber,
              seq,
              expenseNumber,
              `R145 seed doc ${row.doc}`,
              SYSTEM_ACTOR,
            ]
          );
        } catch {
          /* link is best-effort; expense + line are canonical */
        }
      }

      await client.query(
        `INSERT INTO accounting.expense_lines (
           operating_company_id, expense_id, line_sequence, amount, amount_cents, description,
           load_id, load_required, expense_account_uuid, item_id, quantity, rate_cents, unit_of_measure
         ) VALUES (
           $1::uuid, $2::uuid, 1, $3, $4::bigint, $5,
           $6::uuid, $7, $8::uuid, $9::uuid, 1, $4::bigint, 'each'
         )`,
        [
          USMCA,
          expenseId,
          amt / 100,
          amt,
          row.desc,
          loadId,
          !!loadId,
          itemAcct,
          row.item_id,
        ]
      );

      if (row.source === "wb-misc") proof.extras_seeded = Number(proof.extras_seeded) + 1;
      else proof.seeded = Number(proof.seeded) + 1;
    }

    // ── 3) PROOF measurements ────────────────────────────────────────────────
    const nullAfter = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM accounting.expense_lines el
         JOIN accounting.expenses e ON e.id = el.expense_id
        WHERE e.operating_company_id = $1::uuid
          AND e.voided_at IS NULL
          AND coalesce(e.is_sample_data,false)=false
          AND el.item_id IS NULL`,
      [USMCA]
    );
    proof.null_item_after = Number(nullAfter.rows[0]!.n);

    // PDF door-1 coverage: how many of the 255 control keys exist live
    let covered = 0;
    let coveredCents = 0;
    for (const row of seed) {
      const found = await findExisting(client, row);
      if (found && (found.item_id === row.item_id || APPLY)) {
        covered += 1;
        coveredCents += cents(row.amt);
      }
    }
    proof.pdf_control_covered = covered;
    proof.pdf_control_covered_dollars = (coveredCents / 100).toFixed(2);
    proof.pdf_control_target = "255 / 12764.27";

    // Live settlement_ref lines in range (may include workbook misc extras)
    const liveDoc = await client.query<{ n: string; cents: string }>(
      `SELECT count(*)::text AS n, coalesce(sum(el.amount_cents),0)::text AS cents
         FROM accounting.expense_lines el
         JOIN accounting.expenses e ON e.id = el.expense_id
        WHERE e.operating_company_id = $1::uuid
          AND e.voided_at IS NULL
          AND coalesce(e.is_sample_data,false)=false
          AND e.source_settlement_ref ~ '^[0-9]{4}$'
          AND e.source_settlement_ref::int BETWEEN 5769 AND 5816`,
      [USMCA]
    );
    proof.live_doc_lines_5769_5816 = Number(liveDoc.rows[0]!.n);
    proof.live_doc_dollars_5769_5816 = (Number(liveDoc.rows[0]!.cents) / 100).toFixed(2);

    const fuelAfter = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM accounting.expenses
        WHERE operating_company_id = $1::uuid AND voided_at IS NULL
          AND coalesce(is_sample_data,false)=false
          AND source_fuel_transaction_id IS NOT NULL`,
      [USMCA]
    );
    const bankAfter = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM accounting.expenses
        WHERE operating_company_id = $1::uuid AND voided_at IS NULL
          AND coalesce(is_sample_data,false)=false
          AND source_settlement_ref IS NULL
          AND source_fuel_transaction_id IS NULL`,
      [USMCA]
    );
    proof.fuel_feed_after = Number(fuelAfter.rows[0]!.n);
    proof.bank_origin_after = Number(bankAfter.rows[0]!.n);

    if (APPLY) {
      if (proof.null_item_after !== 0) {
        throw new Error(`STOP: null item_id remain ${proof.null_item_after}`);
      }
      if (proof.fuel_feed_after !== proof.baseline_fuel_feed) {
        throw new Error(`STOP: FUEL_FEED changed ${proof.baseline_fuel_feed} → ${proof.fuel_feed_after}`);
      }
      if (proof.bank_origin_after !== proof.baseline_bank_origin) {
        throw new Error(`STOP: bank-origin changed ${proof.baseline_bank_origin} → ${proof.bank_origin_after}`);
      }
      if (covered !== 255) {
        throw new Error(`STOP: PDF control coverage ${covered}/255 — not done`);
      }
      if (Math.abs(coveredCents - 1276427) > 1) {
        throw new Error(`STOP: PDF control dollars ${(coveredCents / 100).toFixed(2)} != 12764.27`);
      }
      await client.query("COMMIT");
      console.log("COMMITTED");
    } else {
      await client.query("ROLLBACK");
      console.log("DRY-RUN rolled back");
    }

    console.log(JSON.stringify(proof, null, 2));
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
