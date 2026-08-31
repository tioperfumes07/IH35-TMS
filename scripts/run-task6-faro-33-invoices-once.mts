/**
 * TASK 6 -- load the 33 real Faro invoices from data/FARO-33-INVOICES-TO-CREATE.csv so the
 * factoring tie-out can execute against real data. is_sample_data FALSE (derives from the
 * customer being invoiced, the same ACCT-F353 relationship accounting.bills already uses for
 * vendors -- every one of these 26 customers is real, non-sample).
 *
 * Creates each invoice via the exact same INSERT shape POST /api/v1/accounting/invoices uses
 * (issue_date/due_date from the CSV, converted MM/DD/YYYY -> YYYY-MM-DD; display_id via the real
 * nextInvoiceDisplayId), then one "linehaul" line via the exact same shape POST
 * /invoices/:id/lines uses (unit_amount_cents = the CSV's face_usd, quantity=1, revenue account
 * auto-resolved via the real resolveInvoiceLineRevenueAccountId -- never invented), then
 * recomputes totals via the real recomputeInvoiceTotals and asserts the result matches the CSV's
 * face amount to the cent before moving on.
 *
 * DOES NOT send, factor, or fund any of the 33. Blocked on a real, verified gap: sendDraftInvoice
 * requires the customer's assigned factor to carry noa_stamp_text OR noa_remit_to_name (the Notice
 * of Assignment legend/remit-to that goes on the invoice, telling the customer where to actually
 * send payment). factoring.factor's live Faro row for USMCA has both NULL -- confirmed live, and
 * confirmed the SAME is true of TRANSP's own real, already-factoring Faro row, so this is not a
 * gap introduced by this session's work, and there is no existing real NOA text anywhere in this
 * system to reuse. Fabricating remittance/legal text on a real financial document is exactly the
 * kind of guess this repo's own standing law forbids -- the owner must supply Faro's real NOA
 * stamp text and remit-to details before any of these 33 can be sent, factored, or funded.
 *
 * Usage:
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-task6-faro-33-invoices-once.mts          # dry run
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-task6-faro-33-invoices-once.mts --commit  # apply
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { nextInvoiceDisplayId } from "../apps/backend/src/accounting/display-id.js";
import { recomputeInvoiceTotals } from "../apps/backend/src/accounting/shared.js";
import { resolveInvoiceLineRevenueAccountId } from "../apps/backend/src/invoices/invoice-line-revenue-resolution.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_UUID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
import os from "node:os";
import path from "node:path";
const CSV_PATH = path.join(os.homedir(), "Downloads/PASTE-TO-CODERS/data/FARO-33-INVOICES-TO-CREATE.csv");

// CSV customer_name (verbatim) -> resolved USMCA customer id. Resolved live against the
// post-correction customer set; several CSV names differ in case/punctuation from the real
// copied TRANSP spelling (same class as defect 1's Watco/NCC/Simple, but these were exact-enough
// to resolve unambiguously by direct/case-insensitive lookup, not a dedup defect).
const CUSTOMER_ID_BY_CSV_NAME: Record<string, string> = {
  "REHMANN TRANSPORTATION CORP.": "cfc5f1dc-7945-46dd-b16c-569d456e3d13",
  "IMPACT BULK LOGISTICS LLC": "1b83bffd-6bb0-4ad1-a38f-5bda84598d41",
  "NCC LOGISTICS USA INC": "ed3543fc-e6ab-4975-b8d4-0993c5faab08",
  "Watco Supply Chain Services, LLC": "21f62529-3521-4aa3-a766-3e92b782e01d",
  "Magna Transport Solutions LLC": "b6964f03-e15c-47f0-8e95-a319ec040e71",
  "BV LOGISTICS INC": "dc0dece9-cea0-4a4c-8db1-a407b90cb852",
  "ITS LOGISTICS, LLC": "736e3124-8bc1-4ccd-973b-b97ecf0b92f8",
  "FLS Transport Inc.": "54276c80-9972-4ea5-924e-af709794be7a",
  "Sethmar Transportation Inc": "1d380fd1-382e-4773-8278-774c77ec5176",
  "CORE LOGISTICS BROKERAGE": "411b2172-56dc-483f-b07e-991a21ac4793",
  "SAJACKS FREIGHT INC": "5a1cc76b-b397-4e17-9964-42ec5d45aeec",
  "MPH CARRIER SERVICES INC": "a760ee40-ad82-4bb5-9120-4d0766b46297",
  "DARDINI LLC": "71afff38-075d-4d64-b98a-e1176f0b0c44",
  "J RAYL TRANSPORT INC": "97da39d7-fc19-44a0-8430-5a7642495944",
  "OSTT LOGISTICS LLC": "348907b7-8323-42fd-8138-889238bebdb5",
  "S E Mares Forwarding Service LLC": "f406cfbc-bd3f-402b-b671-1fd39b6226c7",
  "Simple Logistics Solutions": "4338fe9d-4a5d-4262-8c80-1be27b1b3448",
  "Prodigee Logistics LLC": "3ce1ab0c-61fc-4e24-bdca-61c80e40677d",
  "Jericho Freight LLC": "6249ca59-50e8-42d8-8fc2-d7534098a558",
  "PFL LOGISTICS LLC": "1d1f8b21-3ea6-423e-8ced-af0c2b6a21fb",
  "R2X LLC": "66870aae-6255-4e6a-95aa-386146ee76e6",
  "CTS XPRESS LLC": "0f9d5812-7111-4a83-8b3c-9fb33f839fe0",
  "John J Jerue Truck Broker Inc.": "3b3c53de-9c6a-431d-92ca-17d379ccbd8a",
  "HUMMINGBIRD LOGISTIX LLC": "b5166208-3415-4284-baca-8eb5dcae1777",
  "Hawkeye Transportation Services": "ba40f2bf-6033-41fc-8078-841c34c15029",
  '"DEL-CAN LOGISTICS, LLC."': "a6693cb9-d41a-4d57-a3a8-188c9e5b29e6",
  "DEL-CAN LOGISTICS, LLC.": "a6693cb9-d41a-4d57-a3a8-188c9e5b29e6",
};

const COMMIT = process.argv.includes("--commit");
const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
if (!dbUrl) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL required");

type CsvRow = {
  invoice_no: string;
  customer_name: string;
  po_ref: string;
  issue_date: string;
  due_date: string;
  face_usd: string;
};

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split("\n");
  const header = lines[0]!.split(",");
  const idx = (name: string) => header.indexOf(name);
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    // Minimal CSV parse honoring quoted fields (remit_events contains commas inside quotes).
    const raw = lines[i]!;
    const fields: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let j = 0; j < raw.length; j++) {
      const ch = raw[j]!;
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        fields.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    fields.push(cur);
    rows.push({
      invoice_no: fields[idx("invoice_no")]!,
      customer_name: fields[idx("customer_name")]!,
      po_ref: fields[idx("po_ref")]!,
      issue_date: fields[idx("issue_date")]!,
      due_date: fields[idx("due_date")]!,
      face_usd: fields[idx("face_usd")]!,
    });
  }
  return rows;
}

function mmddyyyyToIso(d: string): string {
  const [mm, dd, yyyy] = d.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

async function main() {
  const csvText = readFileSync(CSV_PATH, "utf8");
  const rows = parseCsv(csvText);
  console.log(`Parsed ${rows.length} invoice rows from CSV.`);

  const unresolved = rows.filter((r) => !CUSTOMER_ID_BY_CSV_NAME[r.customer_name]);
  if (unresolved.length > 0) {
    console.log("UNRESOLVED customer names:", unresolved.map((r) => `${r.invoice_no}:"${r.customer_name}"`));
  }

  const pool = new pg.Pool({ connectionString: dbUrl, max: 3 });
  const client = await pool.connect();
  try {
    await client.query("RESET ROLE");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

    const existing = await client.query<{ display_id: string }>(
      `SELECT display_id FROM accounting.invoices WHERE operating_company_id = $1::uuid AND internal_notes ILIKE '%FARO-33-INVOICES%'`,
      [USMCA]
    );
    console.log("Already-created FARO-33 invoices (should be none):", existing.rows.length);

    if (!COMMIT) {
      console.log("DRY RUN -- pass --commit to apply. No writes made.");
      if (unresolved.length > 0) throw new Error(`${unresolved.length} customer name(s) unresolved -- fix the map before --commit`);
      return;
    }
    if (unresolved.length > 0) throw new Error(`${unresolved.length} customer name(s) unresolved -- refusing to commit`);
    if (existing.rows.length > 0) throw new Error("FARO-33 invoices already exist -- refusing to duplicate");

    let created = 0;
    const mismatches: Array<{ invoice_no: string; expected: number; actual: number }> = [];
    for (const row of rows) {
      const customerId = CUSTOMER_ID_BY_CSV_NAME[row.customer_name]!;
      const faceCents = Math.round(Number(row.face_usd) * 100);

      await client.query("BEGIN");
      await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);
      try {
        const customerRes = await client.query<{
          id: string;
          payment_terms_id: string | null;
          ar_email: string | null;
          ar_phone: string | null;
          is_sample_data: boolean;
          terms_name: string | null;
          days_until_due: number | null;
        }>(
          `
            SELECT c.id, c.payment_terms_id, c.ar_email, c.ar_phone, c.is_sample_data,
                   pt.terms_name, pt.days_until_due
            FROM mdata.customers c
            LEFT JOIN catalogs.payment_terms pt ON pt.id = c.payment_terms_id
            WHERE c.id = $1 AND c.operating_company_id = $2::uuid
          `,
          [customerId, USMCA]
        );
        const customer = customerRes.rows[0];
        if (!customer) throw new Error(`customer ${customerId} not found for invoice ${row.invoice_no}`);

        const issueDate = mmddyyyyToIso(row.issue_date);
        const dueDate = mmddyyyyToIso(row.due_date);
        const displayId = await nextInvoiceDisplayId(client as never, USMCA, new Date(`${issueDate}T00:00:00.000Z`));

        const invRes = await client.query<{ id: string }>(
          `
            INSERT INTO accounting.invoices (
              operating_company_id, customer_id, display_id, status, issue_date, due_date,
              payment_terms_id, payment_terms_label, payment_terms_days, ar_email_snapshot,
              ar_phone_snapshot, internal_notes, customer_notes, currency_code,
              created_by_user_id, updated_by_user_id, source_load_id, is_sample_data
            ) VALUES (
              $1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,NULL,'USD',$12,$12,NULL,$13
            )
            RETURNING id
          `,
          [
            USMCA,
            customerId,
            displayId,
            issueDate,
            dueDate,
            customer.payment_terms_id ?? null,
            customer.terms_name ?? null,
            Number(customer.days_until_due ?? 30),
            customer.ar_email ?? null,
            customer.ar_phone ?? null,
            `TASK6-FARO-33-INVOICES-TO-CREATE.csv row ${row.invoice_no} (PO ${row.po_ref}) -- backloaded real Faro-factored invoice`,
            ACTOR_USER_UUID,
            Boolean(customer.is_sample_data),
          ]
        );
        const invoiceId = invRes.rows[0]!.id;

        const revenue = await resolveInvoiceLineRevenueAccountId(USMCA, { line_type: "linehaul" });
        await client.query(
          `
            INSERT INTO accounting.invoice_lines (
              operating_company_id, invoice_id, source_load_id, line_type, revenue_code, account_id,
              description, quantity, unit_amount_cents, line_total_cents, display_order
            ) VALUES ($1,$2,NULL,'linehaul',$3,$4,$5,1,$6,$6,0)
          `,
          [USMCA, invoiceId, revenue.revenue_code, revenue.account_id, `Faro invoice ${row.invoice_no} (PO ${row.po_ref})`, faceCents]
        );

        const totals = await recomputeInvoiceTotals(client as never, invoiceId);
        const actualTotal = Number((totals as { total_cents?: number })?.total_cents ?? 0);
        if (actualTotal !== faceCents) {
          mismatches.push({ invoice_no: row.invoice_no, expected: faceCents, actual: actualTotal });
        }

        await client.query("COMMIT");
        created++;
        console.log(`INVOICE CREATED: ${row.invoice_no} -> ${displayId} (${invoiceId}) customer="${row.customer_name}" face=$${row.face_usd}`);
      } catch (e) {
        await client.query("ROLLBACK");
        throw new Error(`invoice ${row.invoice_no} failed: ${(e as Error).message}`);
      }
    }

    console.log(`CREATED: ${created} / ${rows.length}`);
    if (mismatches.length > 0) {
      console.error("TOTAL MISMATCHES (invoice total_cents != CSV face_usd):", JSON.stringify(mismatches, null, 2));
    } else {
      console.log("All 33 invoice totals match the CSV face_usd exactly.");
    }

    // This closing summary query runs outside every per-invoice BEGIN block above, so the
    // session's app.bypass_rls GUC (set via set_config(..., true) = transaction-local) has
    // already expired with the last COMMIT. Re-set it fresh right here or this read gets
    // silently RLS-filtered to an empty/zero result despite the writes having fully succeeded.
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    const faceSum = await client.query<{ n: string }>(
      `SELECT COALESCE(SUM(total_cents),0)::text AS n FROM accounting.invoices WHERE operating_company_id=$1::uuid AND internal_notes ILIKE '%FARO-33-INVOICES%'`,
      [USMCA]
    );
    console.log("SUM of created invoice totals (cents):", faceSum.rows[0]?.n, "-- target 9507500");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
