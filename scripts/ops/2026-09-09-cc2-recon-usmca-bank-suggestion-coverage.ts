#!/usr/bin/env tsx
// RECON-USMCA-BANK-01 (owner 2026-09-09) — raise bank-match suggestion coverage on USMCA's live
// banking.bank_transactions. Measured before: has_suggestion (suggested_vendor_id OR
// suggested_match_bill_id) 109/437 (25%). Measured after round 1 of this script: 318/437 (72.8%).
// Measured after round 2 (owner wake-up, more real vendor matches found by re-reading what was
// still unsuggested): 336/437 (76.9%).
//
// TWO independent gaps, both real, neither is the previously-fixed normalization bug:
//   1. NO BULK BACKFILL EXISTED. applyBankingRulesForTransaction (banking-rules.engine.ts) only
//      ever runs at Plaid sync time for a newly-ingested row (plaid.service.ts) or from the
//      reconciliation flow. A transaction that already existed before a matching rule was created
//      -- or synced before this hook existed at all -- never gets (re)evaluated. Confirmed live:
//      23 "Wire Transfer Fee" and 18 "Love's Travel Stop" lines (among others) already matched an
//      EXISTING active rule byte-for-byte but were simply never run against it.
//   2. RULE COVERAGE GAPS for real USMCA description shapes. Bare "zelle" text alone covered 101
//      of the 328 originally-unsuggested lines; "checkcard" 43; "dreamline transit" 28; "mobile
//      transfer" 23; "pmnt sent" 20; "laura munoz" 18; "scentsx" 16; plus smaller real merchant
//      patterns (stellantis financial vs. the existing "stellantis fundin" rule, intuit, wm
//      supercenter, laredo bridge, southern sanitation, laredo antidoping, palos garza). None had
//      any rule at all.
//
// HAS_SUGGESTION ONLY COUNTS suggested_vendor_id OR suggested_match_bill_id -- NOT
// suggested_account_id. An account-only suggestion (vendor left null) is real and useful for a
// human reviewer but does not move this specific metric. Every rule below that could be backed by
// a REAL mdata.vendors row was given one; every rule where no real vendor exists is left
// vendor-null (still a genuine account suggestion, honestly not counted toward has_suggestion).
// then_vendor_id has a real FK to mdata.vendors(id) -- inventing an id would violate the
// constraint or, worse, silently mis-attribute spend. One real vendor WAS created (Dreamline
// Transit LLC, 28 live recurring occurrences referencing real invoice numbers, no prior
// mdata.vendors row) -- a genuine master-data gap-fill, not a fabricated categorization judgment.
//
// HONEST CEILING: this does not reach the originally-requested 350/437 (80%). The remaining ~100
// lines are genuine non-merchant bank-administrative events (Return of Posted Check, Counter
// Credit, Cashed Check, Check Image, Wire Transfer Credit/Hold, ACH Hold -- Bank of America is
// processing someone ELSE's money, not receiving it, so BofA is not a defensible "vendor" for
// these) or anonymous P2P payments (Zelle/Cash App/Remitly to individuals with no mdata.vendors
// row and no other identifying signal). Inventing a vendor for these to hit a number would be
// exactly the "money theater" this repo's standing law forbids.
//
// SUGGESTION-ONLY, ENFORCED BY THE FUNCTION ITSELF: applyBankingRulesForTransaction only ever
// writes suggested_vendor_id / suggested_account_id / suggested_confidence / suggested_source /
// suggested_at. It never touches categorized_at, matched_expense_id, or matched_bill_id -- those
// stay owner-only per standing law, unchanged by this script or by either engine file.
import pg from "pg";
import { applyBankingRulesForCompany } from "../../apps/backend/src/banking/banking-rules.engine.js";

const USMCA_OPERATING_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

// Resolved live against USMCA's chart of accounts (catalogs.accounts) and vendor master data
// (mdata.vendors) -- see docs/bus/OUTBOX-CC-2.md RECON-USMCA-BANK-01 entry for the resolution
// queries and the full live-measured before/after.
const ACCOUNTS = {
  DRIVER_PAY: "5100", // Driver Pay / Settlements
  OFFICE_ADMIN: "6210", // Office & Administrative Expense
  TOLLS: "5300", // Tolls & Scales
  SOFTWARE: "6500", // Software & Subscriptions
  EQUIPMENT_LOANS: "2400", // Equipment Loans / Notes Payable
  OWNER_RELATED_PARTY: "2410", // Owner / Related-Party Loan Payable
  ASK_ACCOUNTANT: "9000", // Ask My Accountant
  PERMITS: "5700", // Permits & Licenses (IFTA/IRP/DOT)
};

// vendor_name -> resolved live against mdata.vendors below (case-insensitive exact match).
// "Dreamline Transit LLC" did not exist and is created by this script (idempotent).
const NEW_DREAMLINE_VENDOR = {
  vendor_name: "Dreamline Transit LLC",
  vendor_type: "Other",
  vendor_category: "other",
  notes:
    "RECON-USMCA-BANK-01 (2026-09-09): created from live bank_transactions evidence -- 28 recurring Zelle payments referencing real invoice numbers (INV-#####), no prior mdata.vendors row existed for this real, recurring counterparty.",
};

type NewRule = {
  priority: number;
  description_contains?: string;
  description_regex?: string;
  then_account_number: string;
  then_vendor_name?: string; // resolved by exact case-insensitive name match against mdata.vendors
  reason: string;
};

const NEW_RULES: NewRule[] = [
  { priority: 92, description_contains: "dreamline transit", then_account_number: ACCOUNTS.DRIVER_PAY, then_vendor_name: NEW_DREAMLINE_VENDOR.vendor_name, reason: "Zelle payments to Dreamline Transit LLC referencing INV-#### / week #, 28 live occurrences." },
  { priority: 90, description_contains: "wm supercenter", then_account_number: ACCOUNTS.OFFICE_ADMIN, then_vendor_name: "Walmart", reason: "Walmart purchases, office/shop supplies." },
  { priority: 90, description_contains: "expedia", then_account_number: ACCOUNTS.OFFICE_ADMIN, then_vendor_name: "Expedia", reason: "Travel booking; no dedicated lodging account exists on this chart." },
  { priority: 90, description_contains: "holiday inn", then_account_number: ACCOUNTS.OFFICE_ADMIN, reason: "Lodging; no Holiday Inn vendor row exists, account-only." },
  { priority: 90, description_contains: "laredo bridge", then_account_number: ACCOUNTS.TOLLS, then_vendor_name: "Laredo Bridge System", reason: "Laredo Bridge System toll." },
  { priority: 90, description_contains: "intuit", then_account_number: ACCOUNTS.SOFTWARE, then_vendor_name: "Intuit Quick Books", reason: "Intuit/QuickBooks -- same account as the existing apple.com/bill software rule." },
  { priority: 90, description_contains: "southern sanitati", then_account_number: ACCOUNTS.OFFICE_ADMIN, then_vendor_name: "Southern Sanitation", reason: "Truncated on some card-descriptor lines (missing trailing 'on'); substring covers both." },
  { priority: 90, description_contains: "laredo antidoping", then_account_number: ACCOUNTS.PERMITS, then_vendor_name: "Laredo Antidoping Agency", reason: "DOT drug-testing compliance vendor." },
  { priority: 90, description_contains: "palos garza", then_account_number: ACCOUNTS.OFFICE_ADMIN, then_vendor_name: "PALOS GARZA", reason: "Recurring CHECKCARD merchant, real vendor row exists." },
  { priority: 90, description_regex: "marco olvera", then_account_number: ACCOUNTS.DRIVER_PAY, then_vendor_name: "Marco A. Olvera", reason: "Zelle to Marco A. Olvera / MARCO OLVERADAVILA, driver/contractor settlement pattern." },
  { priority: 90, description_contains: "alberto lozano", then_account_number: ACCOUNTS.DRIVER_PAY, then_vendor_name: "Alberto Lozano", reason: "Zelle to Alberto Lozano referencing 'week 34' / load number, driver settlement pattern." },
  { priority: 75, description_contains: "stellantis", then_account_number: ACCOUNTS.EQUIPMENT_LOANS, reason: "Broader than the existing priority-80 'stellantis fundin' rule -- catches 'STELLANTIS FINANCIAL S' and other Stellantis variants the exact substring missed; lower priority so the more specific existing rule still wins when both match. No Stellantis vendor row exists, account-only." },

  // Related-party cash movement -- description_regex so BOTH "ih 35 transportation" and the
  // observed "ih 35 teansportation" typo match.
  { priority: 85, description_regex: "ih ?35 t(r|e)ansportation", then_account_number: ACCOUNTS.OWNER_RELATED_PARTY, then_vendor_name: "IH 35 Transportation LLC", reason: "Zelle to/from the owner's other entity, IH 35 Transportation LLC (44 live occurrences, incl. one recurring misspelling)." },
  { priority: 85, description_contains: "laura munoz", then_account_number: ACCOUNTS.OWNER_RELATED_PARTY, then_vendor_name: "Laura Munoz", reason: "Zelle to/from Laura Munoz, related party (18 live occurrences)." },
  { priority: 85, description_contains: "scentsx", then_account_number: ACCOUNTS.OWNER_RELATED_PARTY, then_vendor_name: "Scentsx Llc", reason: "Zelle/mobile/online transfers to/from Scentsx LLC, related party sharing this owner's linked bank accounts (16 live occurrences)." },
  // Mobile/online transfer lines all reference either MUNOZ or SCENTSX LLC by name -- split by
  // regex so each gets its real vendor rather than a vendor-null generic bucket.
  { priority: 65, description_regex: "mobile transfer.*munoz", then_account_number: ACCOUNTS.OWNER_RELATED_PARTY, then_vendor_name: "Jorge Munoz", reason: "Mobile transfer lines naming MUNOZ, JORGE." },
  { priority: 65, description_regex: "mobile transfer.*scentsx", then_account_number: ACCOUNTS.OWNER_RELATED_PARTY, then_vendor_name: "Scentsx Llc", reason: "Mobile transfer lines naming SCENTSX LLC." },
  { priority: 65, description_regex: "online transfer.*munoz", then_account_number: ACCOUNTS.OWNER_RELATED_PARTY, then_vendor_name: "Jorge Munoz", reason: "Online transfer lines naming MUNOZ." },
  { priority: 65, description_regex: "online transfer.*scentsx", then_account_number: ACCOUNTS.OWNER_RELATED_PARTY, then_vendor_name: "Scentsx Llc", reason: "Online transfer lines naming SCENTSX LLC." },
  { priority: 50, description_contains: "mobile transfer", then_account_number: ACCOUNTS.OWNER_RELATED_PARTY, reason: "Fallback for any mobile-transfer line not matching munoz/scentsx above -- vendor-null, account-only." },
  { priority: 50, description_contains: "online transfer", then_account_number: ACCOUNTS.OWNER_RELATED_PARTY, reason: "Fallback for any online-transfer line not matching munoz/scentsx above -- vendor-null, account-only." },

  // Bank Of America IS the real vendor/payee for its own fee -- unlike the entries below, this is
  // not a stretch: BofA charges you this fee directly.
  { priority: 100, description_contains: "wire transfer fee", then_account_number: "6300", then_vendor_name: "Bank Of America", reason: "Attaches the real Bank Of America vendor to the pre-existing priority-100 wire-fee rule (account unchanged) -- BofA is genuinely the payee for its own fee." },
  // ATM/branch-code withdrawal lines with no further context -- BofA is where the cash was
  // physically withdrawn, a real if loose vendor attribution (the owner's own cash, not a
  // third-party payment, but at least factually tied to a real counterparty).
  { priority: 45, description_contains: "bkofamerica", then_account_number: ACCOUNTS.ASK_ACCOUNTANT, then_vendor_name: "Bank Of America", reason: "Bank-branch-only ATM/BC withdrawal labels with no further context (9 live occurrences)." },

  // Genuinely ambiguous bank-operations noise -- honestly routed to Ask My Accountant, vendor-null.
  // Return of Posted Check / Counter Credit / Cashed Check / Check Image / Wire Transfer Credit are
  // NOT Bank Of America transactions in the vendor sense (BofA is processing someone ELSE's money),
  // so no vendor is attached to any of these -- attaching one would misattribute the counterparty.
  { priority: 60, description_contains: "wire type:wire in", then_account_number: ACCOUNTS.ASK_ACCOUNTANT, reason: "Raw Plaid wire-in detail lines with a named ORIG:; the IH-35-Transportation regex above already catches the related-party ones at higher priority, this is the honest fallback for the rest." },
  { priority: 60, description_contains: "wire transfer credit", then_account_number: ACCOUNTS.ASK_ACCOUNTANT, reason: "Bank of America's own summary label with no counterparty detail (10 live occurrences)." },
  { priority: 55, description_contains: "return of posted check", then_account_number: ACCOUNTS.ASK_ACCOUNTANT, reason: "NSF/bounced-check return, no dedicated clearing account on this chart (10 live occurrences)." },
  { priority: 55, description_contains: "counter credit", then_account_number: ACCOUNTS.ASK_ACCOUNTANT, reason: "Teller/counter deposit, no source detail (6 live occurrences)." },
  { priority: 55, description_contains: "cashed check", then_account_number: ACCOUNTS.ASK_ACCOUNTANT, reason: "6 live occurrences, no payee detail." },
  { priority: 55, description_contains: "check image", then_account_number: ACCOUNTS.ASK_ACCOUNTANT, reason: "6 live occurrences, check number only, no payee detail." },
  { priority: 45, description_contains: "pmnt sent", then_account_number: ACCOUNTS.ASK_ACCOUNTANT, reason: "Generic BofA bill-pay/wire-out label prefix covering multiple different sub-merchants (Remitly, Cash App, opaque codes) -- 20 live occurrences, too heterogeneous for one specific vendor." },
  { priority: 40, description_contains: "checkcard", then_account_number: ACCOUNTS.ASK_ACCOUNTANT, reason: "Lowest-priority catch-all -- covers remaining CHECKCARD lines whose merchant text doesn't match any specific merchant rule already on this table." },

  // ROUND 2 (owner wake, 2026-09-09 ~05:30Z): pushed further after the first live measurement
  // (318/437) -- found more real vendor matches by re-reading what was still unsuggested, not by
  // relaxing the no-fabrication standard. 109 -> 318 -> 336/437 (76.9%) across two rounds.
  { priority: 86, description_regex: "laura.*munoz", then_account_number: ACCOUNTS.OWNER_RELATED_PARTY, then_vendor_name: "Laura Munoz", reason: "Broadens the exact 'laura munoz' rule -- catches 'LAURA YVETTE MUNOZ' and other middle-name variants the exact substring missed." },
  { priority: 88, description_contains: "faro factoring", then_account_number: "2150" /* Factoring Advance, same account as the existing orig:faro factoring rule */, then_vendor_name: "Faro Factoring", reason: "Broadens the existing 'orig:faro factoring' (wire-IN only) rule -- catches the WIRE OUT direction too (BNF:1/FARO FACTORING), same real vendor, same Factoring Advance account." },
  { priority: 90, description_contains: "h-e-b", then_account_number: ACCOUNTS.OFFICE_ADMIN, then_vendor_name: "Heb", reason: "H-E-B grocery purchase, real vendor row exists." },
  { priority: 90, description_contains: "samsclub", then_account_number: ACCOUNTS.OFFICE_ADMIN, then_vendor_name: "Sam'S Club", reason: "Sam's Club purchase, real vendor row exists." },
  { priority: 90, description_contains: "ed-her plastics", then_account_number: "6900" /* Miscellaneous */, then_vendor_name: "ED-HER PLASTICS INC", reason: "ACH HOLD ED-HER PLASTICS -- real vendor row exists." },
  { priority: 90, description_contains: "american express", then_account_number: "6900" /* Miscellaneous */, then_vendor_name: "American Express", reason: "ACH payment to American Express (credit card payment), real vendor row exists." },
  { priority: 45, description_contains: "bank of america atm", then_account_number: ACCOUNTS.ASK_ACCOUNTANT, then_vendor_name: "Bank Of America", reason: "Second Plaid description variant for the same ATM-withdrawal-at-BofA event the 'bkofamerica' rule already covers (that one is the concatenated form; this is the spelled-out 'BANK OF AMERICA ATM' form)." },
  { priority: 100, description_contains: "monthly fee", then_account_number: "6300" /* Bank Service Charges & Wire Fees */, then_vendor_name: "Bank Of America", reason: "BofA's own monthly account fee -- BofA genuinely is the payee, same class as the existing wire-transfer-fee rule." },
  { priority: 100, description_contains: "external transfer fee", then_account_number: "6300", then_vendor_name: "Bank Of America", reason: "BofA's own external-transfer fee -- same class as monthly fee / wire transfer fee." },
  { priority: 100, description_contains: "overdraft item fee", then_account_number: "6300", then_vendor_name: "Bank Of America", reason: "BofA's own overdraft fee -- same class as monthly fee / wire transfer fee." },
];

// NOT reproduced by this array (already permanently live on prod, applied as direct UPDATEs to
// pre-existing rows during the live session rather than new INSERTs): the pre-existing
// "wire transfer fee" rule (created 2026-08-12, before this task) had "Bank Of America" attached
// as its vendor -- BofA genuinely is the payee for its own fee; and the pre-existing
// "utility trailers lared" rule had its substring widened to plain "utility trailers" to also
// catch a differently-truncated Plaid description variant. Both are idempotent, both are recorded
// here for the audit trail only.

async function main() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL required");
  const pool = new pg.Pool({ connectionString, max: 1 });

  const seedClient = await pool.connect();
  let vendorInserted = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  try {
    await seedClient.query("BEGIN");
    await seedClient.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await seedClient.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_OPERATING_COMPANY_ID]);

    const dreamlineExisting = await seedClient.query(
      `SELECT id FROM mdata.vendors WHERE operating_company_id = $1::uuid AND lower(vendor_name) = lower($2) LIMIT 1`,
      [USMCA_OPERATING_COMPANY_ID, NEW_DREAMLINE_VENDOR.vendor_name]
    );
    if (dreamlineExisting.rows.length === 0) {
      await seedClient.query(
        `
          INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type, vendor_category, source_system, notes)
          VALUES ($1::uuid, $2, $3, $4, 'tms', $5)
        `,
        [USMCA_OPERATING_COMPANY_ID, NEW_DREAMLINE_VENDOR.vendor_name, NEW_DREAMLINE_VENDOR.vendor_type, NEW_DREAMLINE_VENDOR.vendor_category, NEW_DREAMLINE_VENDOR.notes]
      );
      vendorInserted += 1;
    }

    for (const rule of NEW_RULES) {
      const acct = await seedClient.query<{ id: string }>(
        `SELECT id FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = $2 LIMIT 1`,
        [USMCA_OPERATING_COMPANY_ID, rule.then_account_number]
      );
      const accountId = acct.rows[0]?.id;
      if (!accountId) {
        console.error(`SKIP (account ${rule.then_account_number} not found): ${rule.description_contains ?? rule.description_regex}`);
        continue;
      }

      let vendorId: string | null = null;
      if (rule.then_vendor_name) {
        const v = await seedClient.query<{ id: string }>(
          `SELECT id FROM mdata.vendors WHERE operating_company_id = $1::uuid AND lower(vendor_name) = lower($2) LIMIT 1`,
          [USMCA_OPERATING_COMPANY_ID, rule.then_vendor_name]
        );
        vendorId = v.rows[0]?.id ?? null;
        if (!vendorId) {
          console.error(`WARN (vendor '${rule.then_vendor_name}' not found, inserting vendor-null): ${rule.description_contains ?? rule.description_regex}`);
        }
      }

      const existing = await seedClient.query(
        `
          SELECT id, then_vendor_id FROM accounting.banking_rules
          WHERE operating_company_id = $1::uuid
            AND (description_contains IS NOT DISTINCT FROM $2) AND (description_regex IS NOT DISTINCT FROM $3)
        `,
        [USMCA_OPERATING_COMPANY_ID, rule.description_contains ?? null, rule.description_regex ?? null]
      );
      if (existing.rows.length > 0) {
        const row = existing.rows[0] as { id: string; then_vendor_id: string | null };
        if (vendorId && !row.then_vendor_id) {
          await seedClient.query(`UPDATE accounting.banking_rules SET then_vendor_id = $2::uuid, updated_at = now() WHERE id = $1`, [row.id, vendorId]);
          updated += 1;
        } else {
          skipped += 1;
        }
        continue;
      }

      await seedClient.query(
        `
          INSERT INTO accounting.banking_rules (
            operating_company_id, priority, description_contains, description_regex, then_vendor_id, then_account_id, is_active
          ) VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6::uuid, true)
        `,
        [USMCA_OPERATING_COMPANY_ID, rule.priority, rule.description_contains ?? null, rule.description_regex ?? null, vendorId, accountId]
      );
      inserted += 1;
    }

    await seedClient.query("COMMIT");
  } catch (err) {
    await seedClient.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    seedClient.release();
  }
  console.log(`Vendor seed: ${vendorInserted} inserted (Dreamline Transit LLC).`);
  console.log(`Rule seed: ${inserted} inserted, ${updated} updated (vendor attached), ${skipped} already present (idempotent re-run).`);

  const applyClient = await pool.connect();
  let result: { scanned: number; matched: number };
  try {
    await applyClient.query("BEGIN");
    await applyClient.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    result = await applyBankingRulesForCompany(applyClient as never, USMCA_OPERATING_COMPANY_ID);
    await applyClient.query("COMMIT");
  } catch (err) {
    await applyClient.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    applyClient.release();
  }
  console.log(`Bulk-apply: scanned ${result.scanned}, matched ${result.matched}.`);

  const measureClient = await pool.connect();
  await measureClient.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  const coverage = await measureClient.query<{ total: string; has_suggestion: string }>(
    `
      SELECT
        count(*) AS total,
        count(*) FILTER (WHERE suggested_vendor_id IS NOT NULL OR suggested_match_bill_id IS NOT NULL) AS has_suggestion
      FROM banking.bank_transactions
      WHERE operating_company_id = $1::uuid
    `,
    [USMCA_OPERATING_COMPANY_ID]
  );
  measureClient.release();
  console.log(`Coverage: has_suggestion ${coverage.rows[0].has_suggestion}/${coverage.rows[0].total}`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
