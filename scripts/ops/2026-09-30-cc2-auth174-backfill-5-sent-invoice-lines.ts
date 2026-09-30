#!/usr/bin/env -S npx tsx
/**
 * AUTH-174 -- B-03/D44: backfill the missing linehaul line on the 5 ALREADY-SENT, customer-facing
 * invoices that carry a real total and zero invoice_lines (13616/13618/13620/13621/13622,
 * $20,800.00 combined).
 *
 * ROOT CAUSE (B-03, Lead order): "buildInvoiceFromLoad ALWAYS writes the linehaul line, proforma
 * or not — so these did not come through it. FIND THE PATH THAT CREATED THEM." Exhaustive search
 * this session (every INSERT INTO accounting.invoices across apps/backend/src, scripts/, and
 * db/migrations/) found no OTHER committed code path that produces this exact shape (invoice_type
 * ='from_load', created_by_user_id NULL, zero accounting.audit_events rows for the invoice id,
 * 14 sibling proforma invoices sharing one identical-to-the-microsecond created_at, consistent
 * with a single bulk transaction). This matches CC-1's own independent, identical conclusion for
 * the related load_stops fabricated-delivery-stamp shape (docs/bus/... — "no committed script
 * under scripts/ops/ or scripts/feed/ produces this shape") -- the writer is very likely an
 * uncommitted/ad-hoc script or a direct database write, not a discoverable application code path.
 * Not resolved further here; reported as-is rather than guessed at.
 *
 * FIX (B-03's own instruction: "Do not fabricate a line: derive it from the load's own rate, or
 * report that the load has no rate."): each of these 5 loads' own `rate_total_cents` matches its
 * invoice's `total_cents` EXACTLY (confirmed live before writing this AUTH -- no discrepancy, no
 * derivation ambiguity). Inserts exactly the single linehaul line `buildInvoiceFromLoad` itself
 * would have created (same line_type, same revenue-code resolution via
 * resolveInvoiceLineRevenueAccountId, same description shape, same quantity/amount/display_order
 * shape) -- this is NOT inventing a number; it is the load's own real, already-booked rate,
 * already equal to what the invoice already bills.
 *
 * NOT touched here: the 14 pre-invoices (13624/27-39) -- separate remedy (void-then-delete, a
 * different Lead order), not a backfill; their loads are still rolling/undelivered, and a
 * pre-invoice should not carry a settled line before delivery is authorized (that is B-03's item
 * F, a design question for Lead, not decided here).
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc2-auth174-backfill-5-sent-invoice-lines.ts [--apply]
 * (run from repo root; DRY RUN first with no --apply flag)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-174";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const TARGETS = [
  { invoiceId: "19a81beb-aae8-424d-ba1f-4a8dbbfc0182", loadId: "7e98159b-5dcb-4e80-a470-d934d6f237ef", loadNumber: "13616", amountCents: 570000 },
  { invoiceId: "bcf369a7-9672-4b7d-b41e-ca10c5ea20d7", loadId: "e77e198c-37de-4f04-af36-055dbf531ed0", loadNumber: "13618", amountCents: 370000 },
  { invoiceId: "55e45834-cab4-4bb9-970d-8551a05687c2", loadId: "e87907c6-0cc3-4ab1-b627-437ddae8a58d", loadNumber: "13620", amountCents: 430000 },
  { invoiceId: "708ffeac-db57-4218-b343-bce97f5b0fa6", loadId: "e092cb0f-1881-457d-aa5d-ebd59b84b07d", loadNumber: "13621", amountCents: 490000 },
  { invoiceId: "5c781bac-9eb2-4a5d-9684-c72d883570df", loadId: "b4cb67a9-e395-4d26-ae0f-6257660cb968", loadNumber: "13622", amountCents: 220000 },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  if (APPLY) {
    try {
      execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
    } catch {
      console.error(`${AUTH_ID} rejected by verify-owner-authorization.mjs -- refusing --apply.`);
      process.exit(1);
    }
  }

  const { resolveInvoiceLineRevenueAccountId } = await import(
    path.join(ROOT, "apps/backend/src/invoices/invoice-line-revenue-resolution.service.ts")
  );
  const { appendCrudAudit } = await import(path.join(ROOT, "apps/backend/src/audit/crud-audit.ts"));

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    await client.query("BEGIN");
    if (APPLY) {
      await assertIsIntendedProduction(client);
    }
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const revenueResolution = await resolveInvoiceLineRevenueAccountId(USMCA, { line_type: "linehaul" });
    console.log("revenue resolution (shared across all 5, same as buildInvoiceFromLoad would use):", JSON.stringify(revenueResolution));

    for (const t of TARGETS) {
      const pre = await client.query<{ status: string; total_cents: string; rate_total_cents: string; line_count: string }>(
        `SELECT i.status, i.total_cents::text,
                l.rate_total_cents::text,
                (SELECT count(*)::text FROM accounting.invoice_lines il WHERE il.invoice_id = i.id) AS line_count
           FROM accounting.invoices i
           JOIN mdata.loads l ON l.id = i.source_load_id
          WHERE i.id = $1::uuid AND i.operating_company_id = $2::uuid`,
        [t.invoiceId, USMCA]
      );
      const row = pre.rows[0];
      if (!row) throw new Error(`${t.loadNumber}: invoice ${t.invoiceId} not found -- refusing`);
      if (row.status !== "sent") throw new Error(`${t.loadNumber}: expected status='sent', found '${row.status}' -- refusing, re-verify before backfilling`);
      if (row.total_cents !== String(t.amountCents)) throw new Error(`${t.loadNumber}: expected total_cents=${t.amountCents}, found ${row.total_cents} -- refusing`);
      if (row.rate_total_cents !== String(t.amountCents)) throw new Error(`${t.loadNumber}: load rate ${row.rate_total_cents} no longer matches invoice total ${t.amountCents} -- refusing, derivation is no longer unambiguous`);
      if (row.line_count !== "0") throw new Error(`${t.loadNumber}: expected 0 existing lines, found ${row.line_count} -- refusing, someone else already backfilled or this changed`);

      const linehaulDescription = `Linehaul · Load ${t.loadNumber}`;
      const lineRes = await client.query<{ id: string }>(
        `INSERT INTO accounting.invoice_lines (
           operating_company_id, invoice_id, source_load_id, line_type, revenue_code, account_id,
           description, quantity, unit_amount_cents, line_total_cents, display_order
         ) VALUES ($1,$2,$3,'linehaul',$4,$5,$6,1,$7,$7,0)
         RETURNING id::text`,
        [USMCA, t.invoiceId, t.loadId, revenueResolution.revenue_code, revenueResolution.account_id, linehaulDescription, t.amountCents]
      );
      console.log(`${t.loadNumber}: inserted line ${lineRes.rows[0]!.id}, $${(t.amountCents / 100).toFixed(2)}`);

      await appendCrudAudit(
        client,
        ACTOR_USER_ID,
        "accounting.invoice_lines.auth174_backfill",
        {
          operating_company_id: USMCA,
          invoice_id: t.invoiceId,
          load_id: t.loadId,
          load_number: t.loadNumber,
          line_id: lineRes.rows[0]!.id,
          amount_cents: t.amountCents,
          reason:
            "AUTH-174: B-03/D44 -- invoice was sent with a real total and zero lines. Derived from the load's own rate_total_cents, which matched the invoice total exactly (no fabrication). Writer of the original defect not identified (exhaustive code search found no committed path), reported not fixed.",
        },
        "warning",
        "AUTH-174"
      );
    }

    // D44 verification: pre-invoice-must-equal-invoice parity. Confirm all 5 now carry exactly 1
    // linehaul line matching the invoice total.
    const check = await client.query<{ display_id: string; line_count: string; line_sum: string }>(
      `SELECT i.display_id, count(il.id)::text AS line_count, COALESCE(SUM(il.line_total_cents), 0)::text AS line_sum
         FROM accounting.invoices i
         LEFT JOIN accounting.invoice_lines il ON il.invoice_id = i.id
        WHERE i.operating_company_id = $1::uuid AND i.id = ANY($2::uuid[])
        GROUP BY i.display_id ORDER BY i.display_id`,
      [USMCA, TARGETS.map((t) => t.invoiceId)]
    );
    console.log("Post-backfill line counts (each should be 1 line, sum matching invoice total):", JSON.stringify(check.rows));

    if (APPLY) {
      await client.query("COMMIT");
      console.log("COMMITTED");
    } else {
      await client.query("ROLLBACK");
      console.log("DRY RUN — rolled back, nothing written");
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
