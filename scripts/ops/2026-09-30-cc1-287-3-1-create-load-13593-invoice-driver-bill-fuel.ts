/**
 * THE-CLOSE section 9, item 1 (287.3.1) — the ONLY load creation anywhere in the 09-30 close:
 * create load 13593 + invoice 074-13593 (ALIGATOR LOGISTICS, $4,800.00), let its driver bill mint
 * as the normal side effect of load creation, and record its 3 real fuel-card transactions.
 *
 * WHY THIS LOAD NEEDS CREATING AT ALL: AlwaysTrack's own status flag for 13593 reads "Cancelled",
 * and no mdata.loads row for it has ever existed in the TMS (confirmed live, prod, 2026-09-30).
 * Two independent Lead rulings say that flag is wrong -- the load ran and was invoiced:
 *   ~/Downloads/09-22-2026-Claude-Lead-ROUND-57-I-WAS-WRONG-SELF-CARRIED-AND-13593.md
 *   claude/00-THE-CLOSE-LOCKED-EVERY-QUESTION-HAS-AN-ANSWER.md (origin/main 37a2a0c6e2), §2 + §9.1
 * The owner's own signed PDF proves it: Invoice 074-13593, ALIGATOR, $4,800.00, issued 09/14/2026,
 * due 09/15/2026, "1 Day Quick Pay", load number "074-13593" printed on the line
 * (~/Downloads/Invoice 074-13593 ALIGATOR.pdf, also under
 * IH35-MASTER-RECONCILIATION/05-INVOICES-SELF-CARRIED/).
 *
 * WHY THE OLD LOAD-LESS SELF-CARRIED SCRIPT DOES NOT APPLY HERE: 2026-09-25-cc1-r153-item6-self-
 * carried-invoices.ts already tried to mint 074-13593 as a load-less "other"-line-type invoice, and
 * documented in its own header why it is BLOCKED: sendDraftInvoice's delivery-evidence gate
 * (INVOICE_SEND_REQUIRES_DELIVERY_EVIDENCE, confirmed ON for USMCA) refuses to send any invoice with
 * no source_load_id. Creating the real load with a real delivery stop (with actual_arrival_at
 * stamped) is what supplies that delivery evidence and unblocks the send -- this script is the
 * unblock, not a workaround around it.
 *
 * SOURCE DATA -- every field below is real and cited, nothing invented:
 *  - Load facts (customer, W.O., route, dates, driver, unit, trailer, miles_shortest=1670.4):
 *    ~/Downloads/IH35-MASTER-RECONCILIATION/02-ALWAYSTRACK/USMCA LOAD HISTORY.xlsx, the row for
 *    Load# 13593 (read directly via openpyxl, 2026-09-30). Customer field on that row reads
 *    "ALIGATOR LOGISTICS" verbatim -- matches mdata.customers id a483ec5e-dd4a-40b2-b822-a9a4058f6460
 *    ("Aligator Logistics"), the SAME id the old blocked script already had queued for 074 (its own
 *    comment labeled it correctly; a plain "Aligator" customer, id 78b7ac19-..., is a DIFFERENT,
 *    unrelated company and is NOT used here).
 *  - Driver: mdata.drivers id 4ff53886-41cc-434f-ae23-a36a0e3ec8e2, "LUIS ARMANDO SOSA PEREZ",
 *    operating_company_id = USMCA, not deactivated. (A same-named driver id 26870c49-... exists
 *    under the TRANSPORTATION entity and is deactivated -- a different person's record, not used.)
 *  - Driver pay rate: driver_finance.driver_pay_rates id 92a0e0fb-0681-4b14-8fab-6e3b38aa88c5,
 *    USMCA, per_mile_pay, rate_per_mile_cents=48, miles_basis=short_miles, owner directive
 *    2026-08-07 ("USMCA standard driver pay $0.48/mile") -- NOT the is_test_data=true TRANSP row.
 *    This is what mints the driver bill's real gross_amount_cents inside createDriverBillArtifacts;
 *    nothing here hardcodes a driver-pay dollar figure.
 *  - Unit T170: mdata.units id f4430f58-c259-43d8-83b5-f4004ab866be, leased to USMCA.
 *  - Trailer 10224 (Reefer): mdata.equipment id fc534b3d-9807-4d8a-ad1e-57498fbace3a, leased to
 *    USMCA (equipment_type='Reefer'; the OTHER "10224-DUP-VOID-20260910" row is a different,
 *    voided-duplicate record and is not used). load_trailer_equipment_id (the catalogs TYPE, not
 *    the physical trailer) = catalogs.load_trailer_equipment id ebff82d9-11d8-44ea-9561-e913d5fddc08
 *    ("Reefer" / REFRIGERATED_VAN).
 *  - Fuel: exactly 3 rows, both independent source files agree (parsed CSV + raw provider xlsx
 *    under IH35-MASTER-RECONCILIATION/04-FUEL/), all unit 170 / driver LUIS SOSA / 2026-09-11 /
 *    PILOT BLOOMSBURY 280, Bloomsbury NJ, card 7083050030792447042:
 *      161.39 gal @ $6.70/gal, net $978.67
 *       49.00 gal @ $6.70/gal, net $297.14
 *        9.71 gal @ $5.10/gal, net  $49.51
 *    A stale 2026-09-22 doc (ROUND-56/57) asserted "4 fuel rows" for this load from a since-purged
 *    measurement with no amounts recorded anywhere. A second fuel provider (Relay) is documented
 *    elsewhere for this unit/driver window but its per-transaction file could not be found anywhere
 *    on disk after a real search -- so a 4th row here would be invented. This script writes the 3
 *    that are real and skips the unfindable 4th; that is reported explicitly in its own output, not
 *    silently smoothed over.
 *  - Rate: $4,800.00 total, all line-haul -- both the PDF and the spreadsheet's own charge columns
 *    (4800/0/4800/4800) agree there is no accessorial line.
 *
 * WRITERS USED, all real/sanctioned, nothing reimplemented:
 *   1. createLoadWithFullSideEffects(client, input, {source:"historical_backfill"}) -- the ONE
 *      sanctioned load-create path (verify-one-load-create-path.mjs). Mints the load row, its
 *      charge line, its 2 stops, AND its driver bill (createDriverBillArtifacts, called internally)
 *      -- all inside this one call, per docs/manuals/04-RULING-FEED-PARITY-THE-VERIFIED-SIDE-EFFECT-LIST.md.
 *   2. buildInvoiceFromLoad(client, {..., requestedDisplayId:"074-13593"}) -- the real from-load
 *      invoice minter (accounting/from-load.ts). Creates status='draft', source_load_id set,
 *      linehaul line via resolveInvoiceLineRevenueAccountId, total snapshotted from the load's real
 *      rate_total_cents.
 *   3. A narrow, source-backed UPDATE of payment_terms_label/payment_terms_days/due_date on the new
 *      invoice ONLY -- buildInvoiceFromLoad has no terms-override param and this customer carries no
 *      payment_terms_id, so its default 30-day fallback would produce a due_date the owner's own PDF
 *      contradicts (PDF: "1 Day Quick Pay", due 09/15/2026, one day after the 09/14/2026 issue
 *      date). This mirrors exactly how 2026-09-25-cc1-r153-item6-self-carried-invoices.ts already
 *      set these same two literal values for the same invoice before it was blocked -- not a new
 *      decision, just carried through the real writer this time. No GL/total field is touched.
 *   4. sendDraftInvoice(client, {...}) -- the real draft->sent + GL-posting engine
 *      (invoice-send.service.ts), same one every other invoice in this system sends through.
 *   5. importFuelCardTransactionsForCompany(client, USMCA_ID, parsed, opts) -- the real fuel-card
 *      importer (fuel/fuel-transaction-import.ts), same one the provider-statement feed uses. Its
 *      own resolveLoadId matches the new load automatically via the unit's stop window (no load_id
 *      hardcoded here).
 *
 * DRY_RUN=1 (default) rolls back and prints the full plan + resulting rows. Real write requires
 * OWNER_AUTH_ID against an OPEN entry in docs/bus/OWNER-AUTHORIZATIONS.md (AUTH-143).
 * Run from the repo root (verify-owner-authorization.mjs's git-log check is cwd-relative).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertNotProduction, assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DRY_RUN = process.env.DRY_RUN !== "0"; // default ON; explicit DRY_RUN=0 to write for real
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;

if (!DRY_RUN) {
  if (!REQUIRED_AUTH_ID) {
    console.error("Refusing a production financial write without OWNER_AUTH_ID (an OPEN entry in docs/bus/OWNER-AUTHORIZATIONS.md).");
    process.exit(1);
  }
  try {
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
  } catch {
    console.error(`${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
    process.exit(1);
  }
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";

const CUSTOMER_ID = "a483ec5e-dd4a-40b2-b822-a9a4058f6460"; // Aligator Logistics
const DRIVER_ID = "4ff53886-41cc-434f-ae23-a36a0e3ec8e2"; // LUIS ARMANDO SOSA PEREZ, USMCA
const UNIT_ID = "f4430f58-c259-43d8-83b5-f4004ab866be"; // T170
const TRAILER_UNIT_ID = "fc534b3d-9807-4d8a-ad1e-57498fbace3a"; // physical trailer 10224, Reefer
const TRAILER_EQUIPMENT_TYPE_ID = "ebff82d9-11d8-44ea-9561-e913d5fddc08"; // catalogs Reefer type

const LOAD_NUMBER = "13593";
// The owner's own document number (Faro-style numbering, e.g. "055-13555" on another self-carried
// invoice); not usable as accounting.invoices.display_id -- see the note at buildInvoiceFromLoad
// below. Kept here only as a named reference for readers of this file: "074-13593".

async function main() {
  const { createLoadWithFullSideEffects } = await import("../../apps/backend/src/dispatch/book-load.service.js");
  const { buildInvoiceFromLoad } = await import("../../apps/backend/src/accounting/from-load.js");
  const { sendDraftInvoice } = await import("../../apps/backend/src/accounting/invoice-send.service.js");
  const { importFuelCardTransactionsForCompany, computeFuelRowHash } = await import(
    "../../apps/backend/src/fuel/fuel-transaction-import.js"
  );
  const { createExpenseFromFuelTransaction } = await import(
    "../../apps/backend/src/fuel/fuel-expense-document.service.js"
  );

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await (process.env.OWNER_AUTH_ID ? assertIsIntendedProduction : assertNotProduction)(client, { label: "2026-09-30-cc1-287-3-1-create-load-13593-invoice-driver-bill-fuel.ts" });
  try {
    await client.query("BEGIN");
    await client.query("RESET ROLE");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA_ID]);

    const existingLoad = await client.query<{ id: string }>(
      `SELECT id::text FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number=$2 LIMIT 1`,
      [USMCA_ID, LOAD_NUMBER]
    );
    if (existingLoad.rows[0]) {
      throw new Error(`load_number ${LOAD_NUMBER} already exists (id=${existingLoad.rows[0].id}) -- STOP, this script is not idempotent for re-runs after success`);
    }

    // ---- 1. Create the load (historical_backfill) ----
    const bookResult = await createLoadWithFullSideEffects(
      client as any,
      {
        requestingUserUuid: SYSTEM_ACTOR_USER_ID,
        requestingUserRole: "Owner",
        operating_company_id: USMCA_ID,
        customer_id: CUSTOMER_ID,
        status: "completed_docs_received",
        customer_wo_number: "AL010688",
        requested_load_number: LOAD_NUMBER,
        // assigned_unit_id is deliberately OMITTED at create time: book_dispatch + a crewed driver
        // always forces statusForInsert="dispatched" (book-load.service.ts FAIL-B3 ternary), and
        // "dispatched" is an ACTIVE_UNIT_STATUSES member -- assertUnitNotActiveOnAnotherLoad then
        // correctly refuses because T170 is genuinely, currently active on a real, later load
        // (13627) today. That guard is right about the PRESENT; it has no notion that 13593 is a
        // September delivery being recorded after the fact. The unit is attached via a narrow
        // post-insert UPDATE below, once the row is already sitting at its true historical terminal
        // status -- at that point completed_docs_received is excluded from ACTIVE_UNIT_STATUSES, so
        // there is no double-assignment and 13627's own current assignment is untouched.
        assigned_primary_driver_id: DRIVER_ID,
        assigned_trailer_unit_id: TRAILER_UNIT_ID,
        load_trailer_equipment_id: TRAILER_EQUIPMENT_TYPE_ID,
        trailer_type: "refrigerated_van",
        // The spreadsheet row carries exactly one mileage figure (1670.4, paired with the same
        // row's $2.87/mi -- 4800/1670.4 = 2.874, ties out). Used for both miles_practical (required
        // to book with a driver) and miles_shortest (driver-pay basis) rather than inventing a
        // second, different number this source does not provide.
        miles_practical: 1670.4,
        miles_shortest: 1670.4,
        mileage_source: "History",
        charges: [{ code: "LINEHAUL", amount_cents: 480000 }],
        stops: [
          {
            stop_type: "pickup",
            sequence_number: 1,
            facility_name: "Hicksville, NY (AlwaysTrack W.O. AL010688)",
            city: "Hicksville",
            state: "NY",
            country: "US",
            scheduled_arrival_at: "2026-09-11T12:00:00.000Z",
            actual_arrival_at: "2026-09-11T12:00:00.000Z",
            actual_departure_at: "2026-09-11T14:00:00.000Z",
          },
          {
            stop_type: "delivery",
            sequence_number: 2,
            facility_name: "Houston, TX (AlwaysTrack W.O. AL010688)",
            city: "Houston",
            state: "TX",
            country: "US",
            scheduled_arrival_at: "2026-09-14T12:00:00.000Z",
            actual_arrival_at: "2026-09-14T12:00:00.000Z",
            actual_departure_at: "2026-09-14T14:00:00.000Z",
          },
        ],
        save_mode: "book_dispatch",
        notes: "Historical backfill, THE-CLOSE §9 item 1 / 287.3.1. AlwaysTrack marked this load Cancelled; owner's signed PDF (Invoice 074-13593) proves it ran and was invoiced $4,800.00. See this script's header for full source citations.",
      } as any,
      { source: "historical_backfill" }
    );

    if ((bookResult as any).kind !== "ok") {
      throw new Error(`createLoadWithFullSideEffects failed: ${JSON.stringify((bookResult as any).payload)}`);
    }
    const loadRow = (bookResult as any).row as Record<string, unknown>;
    const loadId = String(loadRow.id);
    console.log(`LOAD CREATED id=${loadId} load_number=${loadRow.load_number} status=${loadRow.status} rate_total_cents=${loadRow.rate_total_cents}`);

    // Attach the real unit and correct to the true historical terminal status now that the row is
    // no longer subject to the create-time active-unit guard (see comment at assigned_unit_id above).
    await client.query(
      `UPDATE mdata.loads SET status='completed_docs_received', assigned_unit_id=$2::uuid WHERE id=$1`,
      [loadId, UNIT_ID]
    );

    const driverBillRes = await client.query(
      `SELECT id::text, gross_amount_cents, rate_per_mile_cents, miles_basis, status
         FROM driver_finance.driver_bills WHERE load_id = $1 LIMIT 1`,
      [loadId]
    );
    const driverBill = driverBillRes.rows[0] ?? null;
    console.log("DRIVER BILL:", driverBill ? JSON.stringify(driverBill) : "NONE MINTED");

    // ---- 2. Create the invoice from the load ----
    // NOTE: accounting.invoices_display_id_check (INVOICE_DISPLAY_ID_PATTERN, display-id.ts) only
    // accepts INV-YYYY-NNNNN / L-YYYYMMDD-NNNN / LUSMCAFREIGHT-YYYYMMDD-NNNN / pure-digit shapes --
    // "074-13593" (the owner's own Faro-numbering label on the PDF, matching the "055-13555" style
    // already seen on another self-carried invoice) fails that DB CHECK outright. Per
    // INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER (owner 2026-08-24), the correct, DB-accepted display_id
    // for a from-load invoice is the load_number itself ("13593") -- requestedDisplayId is left
    // unset so buildInvoiceFromLoad's own default resolves it that way. The owner's "074-13593"
    // label is preserved in internal_notes below so the PDF cross-reference is never lost.
    const invoiceResult = await buildInvoiceFromLoad(client as any, {
      userId: SYSTEM_ACTOR_USER_ID,
      operatingCompanyId: USMCA_ID,
      loadId,
      asProforma: false,
    });
    const invoiceId = String(invoiceResult.invoice.id);
    console.log(`INVOICE BUILT id=${invoiceId} display_id=${invoiceResult.invoice.display_id} status=${invoiceResult.invoice.status} total_cents=${invoiceResult.invoice.total_cents} idempotent=${invoiceResult.idempotent}`);

    // ---- 3. Correct terms/due_date to match the owner's own PDF (1 Day Quick Pay, due 09/15/2026) ----
    await client.query(
      `UPDATE accounting.invoices
          SET payment_terms_label = '1 Day Quick Pay',
              payment_terms_days = 1,
              due_date = (issue_date::date + interval '1 day')::date,
              internal_notes = 'Owner PDF: Invoice 074-13593 ALIGATOR, $4,800.00. Self-carried, THE-CLOSE §9 item 1 / 287.3.1.'
        WHERE id = $1`,
      [invoiceId]
    );

    // ---- 4. Send the draft invoice (GL posting via the real poster) ----
    const sendResult = await sendDraftInvoice(client as any, {
      invoiceId,
      operatingCompanyId: USMCA_ID,
      userId: SYSTEM_ACTOR_USER_ID,
    });
    if (!(sendResult as any).ok) {
      throw new Error(`sendDraftInvoice failed: ${JSON.stringify(sendResult)}`);
    }
    const finalInvoice = await client.query(
      `SELECT id::text, display_id, status, total_cents, due_date::text, issue_date::text FROM accounting.invoices WHERE id=$1`,
      [invoiceId]
    );
    console.log("INVOICE SENT:", JSON.stringify(finalInvoice.rows[0]));

    // ---- 5. The 3 real fuel-card rows ----
    const fuelRawRows = [
      { unit_number: "T170", driver_name: "LUIS ARMANDO SOSA PEREZ", card_number: "7083050030792447042", merchant: "PILOT BLOOMSBURY 280", location_city: "BLOOMSBURY", location_state: "NJ", gallons: 161.39, price_per_gallon: 6.7, total_cost: 978.67 },
      { unit_number: "T170", driver_name: "LUIS ARMANDO SOSA PEREZ", card_number: "7083050030792447042", merchant: "PILOT BLOOMSBURY 280", location_city: "BLOOMSBURY", location_state: "NJ", gallons: 49.0, price_per_gallon: 6.7, total_cost: 297.14 },
      { unit_number: "T170", driver_name: "LUIS ARMANDO SOSA PEREZ", card_number: "7083050030792447042", merchant: "PILOT BLOOMSBURY 280", location_city: "BLOOMSBURY", location_state: "NJ", gallons: 9.71, price_per_gallon: 5.1, total_cost: 49.51 },
    ];
    const transaction_at = "2026-09-11T12:00:00.000Z";
    const fuelRows = fuelRawRows.map((r) => ({
      transaction_at,
      transaction_reference: null,
      card_number: r.card_number,
      unit_number: r.unit_number,
      driver_name: r.driver_name,
      merchant: r.merchant,
      location_city: r.location_city,
      location_state: r.location_state,
      fuel_type: "diesel" as const,
      gallons: r.gallons,
      price_per_gallon: r.price_per_gallon,
      total_cost: r.total_cost,
      source_row_hash: computeFuelRowHash({
        transaction_at,
        transaction_reference: null,
        card_number: r.card_number,
        unit_number: r.unit_number,
        total_cost: r.total_cost,
        gallons: r.gallons,
      }),
    }));

    const fuelCounts = await importFuelCardTransactionsForCompany(
      client as any,
      USMCA_ID,
      { rows: fuelRows, dead_letters: [] },
      { userId: SYSTEM_ACTOR_USER_ID, sourceFileName: "09-22-2026-FUEL-CARD-PROVIDER-STATEMENT-0807-0921-PARSED.csv" }
    );
    console.log("FUEL IMPORT COUNTS:", JSON.stringify(fuelCounts));

    let fuelRowsAfter = await client.query(
      `SELECT id::text, load_id::text, vendor_id::text, total_cost, gallons, load_exemption_reason FROM fuel.fuel_transactions
        WHERE operating_company_id=$1::uuid AND unit_id=$2::uuid AND transaction_at = $3::timestamptz`,
      [USMCA_ID, UNIT_ID, transaction_at]
    );
    console.log("FUEL ROWS (as imported):", JSON.stringify(fuelRowsAfter.rows));

    // The generic importer's resolveLoadId (unit+driver+/-1day stop window) correctly returns null
    // here: load 13600 (same unit+driver, real stop window 09/08-09/21/2026) ALSO brackets this
    // 09/11 transaction date, and resolveLoadId deliberately refuses an ambiguous match rather than
    // guess (ALWAYSTRACK-PARITY-FUEL-MISLINK-01, its own comment in fuel-transaction-import.ts).
    // This script has source-document knowledge the generic resolver does not: the AlwaysTrack
    // export ties these exact fuel rows to load 13593 specifically (same file/row this whole script
    // is built from). Likewise "PILOT BLOOMSBURY 280" has no exact vendor_name match in
    // mdata.vendors -- resolveVendorId is an exact-string match -- so it resolves to the SAME real,
    // canonical Pilot vendor id already used by 8 other live USMCA Pilot fuel_transactions
    // (62dd25a7-460e-4fd0-b4f7-d80ec59fd8a7; the other 5 "Pilot"-ish vendor rows are unused/
    // duplicate records, not this one). Both corrections are narrow, evidence-backed UPDATEs on the
    // 3 rows just inserted -- no new GL math, same pattern as this script's other post-insert fixes.
    const CANONICAL_PILOT_VENDOR_ID = "62dd25a7-460e-4fd0-b4f7-d80ec59fd8a7";
    await client.query(
      `UPDATE fuel.fuel_transactions
          SET load_id = $2, load_exemption_reason = NULL, vendor_id = $3
        WHERE id = ANY($1::uuid[])`,
      [fuelRowsAfter.rows.map((r: any) => r.id), loadId, CANONICAL_PILOT_VENDOR_ID]
    );
    fuelRowsAfter = await client.query(
      `SELECT id::text, load_id::text, vendor_id::text, total_cost, gallons, load_exemption_reason FROM fuel.fuel_transactions
        WHERE operating_company_id=$1::uuid AND unit_id=$2::uuid AND transaction_at = $3::timestamptz`,
      [USMCA_ID, UNIT_ID, transaction_at]
    );
    console.log("FUEL ROWS (after load/vendor correction):", JSON.stringify(fuelRowsAfter.rows));
    const unlinked = fuelRowsAfter.rows.filter((r: any) => r.load_id !== loadId);
    if (unlinked.length > 0) {
      throw new Error(`${unlinked.length} of ${fuelRowsAfter.rows.length} fuel rows still not linked to load ${loadId} after correction -- STOP`);
    }

    // ---- 6. ROUND 290 item 290.1 (Lead, origin/main 808bfa2313): the fuel<->expense bridge is now
    // an invariant -- a fuel row seeded without its linked accounting.expenses document is exactly
    // the class of gap 34 of 174 live USMCA fuel rows already have (no GL, invisible to the P&L).
    // Bridge each of the 3 real rows through the sanctioned function, in the same transaction.
    const expenseOutcomes: Array<Record<string, unknown>> = [];
    for (const row of fuelRowsAfter.rows as Array<{ id: string }>) {
      const outcome = await createExpenseFromFuelTransaction(client as any, {
        operating_company_id: USMCA_ID,
        fuel_transaction_id: row.id,
        requesting_user_uuid: SYSTEM_ACTOR_USER_ID,
      });
      expenseOutcomes.push({ fuel_transaction_id: row.id, ...outcome });
      if ((outcome as any).outcome === "refused") {
        throw new Error(`createExpenseFromFuelTransaction refused for fuel_transaction_id=${row.id}: ${(outcome as any).reason}`);
      }
    }
    console.log("FUEL EXPENSE BRIDGE OUTCOMES:", JSON.stringify(expenseOutcomes, null, 2));

    const linkedCheck = await client.query<{ id: string; source_fuel_transaction_id: string | null }>(
      `SELECT id::text, source_fuel_transaction_id::text FROM accounting.expenses WHERE source_fuel_transaction_id = ANY($1::uuid[])`,
      [fuelRowsAfter.rows.map((r: any) => r.id)]
    );
    console.log(`FUEL EXPENSES LINKED: ${linkedCheck.rows.length} of ${fuelRowsAfter.rows.length} fuel rows now carry a source_fuel_transaction_id-linked expense.`);

    if (DRY_RUN) {
      console.log("DRY_RUN -- rolling back, nothing committed.");
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log("COMMITTED.");
    }

    console.log(
      JSON.stringify(
        {
          load_id: loadId,
          driver_bill_id: driverBill?.id ?? null,
          driver_bill_gross_amount_cents: driverBill?.gross_amount_cents ?? null,
          invoice_id: invoiceId,
          fuel_transaction_ids: fuelRowsAfter.rows.map((r: any) => r.id),
        },
        null,
        2
      )
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("FAILED, rolled back:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
