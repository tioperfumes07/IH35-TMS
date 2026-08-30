/**
 * TASK 4 — MDATA-COPY-04. Copy real customers + vendors from IH 35 Transportation (TRANSP) to
 * USMCA in the DATABASE (not QuickBooks). Owner ruling: USMCA serves the same customers as
 * Transportation.
 *
 * SAFETY:
 *   - Never copies qbo_customer_id / qbo_vendor_id (those belong to TRANSP's own QBO company
 *     file; copying them would falsely link USMCA rows to TRANSP's QBO entities).
 *   - Never copies any FK into another entity-scoped catalog (payment_terms_id, customer_type_id,
 *     default_income_account_id, default_expense_account_id, vendor_type_id, fmcsa_lookup_id,
 *     factoring_company_vendor_id, created_by_user_id, etc.) -- those would silently point a
 *     USMCA row at a TRANSP-scoped row (the exact cross-entity-leak class this repo's own audits
 *     repeatedly flag). Only the customer/vendor's OWN identity/contact facts are copied.
 *   - source_system/source stamped 'COPY_FROM_TRANSP_2026-08-30' on every copied row.
 *   - is_sample_data = FALSE, factoring_eligible = TRUE (owner rule) on every copied customer.
 *   - Vendors: only ACTIVE (deactivated_at IS NULL), non-sample, and EXCLUDES driver_id IS NOT
 *     NULL (those are Transportation's own driver-linked vendor rows -- USMCA drivers get their
 *     own vendor rows via the driver-vendor link service, never copied).
 *
 * DEDUP: normalizes each name (uppercase, strip periods/commas, collapse whitespace) to find
 * duplicate groups within TRANSP itself. Only ONE survivor per normalized group is copied. The
 * owner's 7 explicit cross-spelling/cross-suffix answers (OWNER-7-ANSWERS.txt, 2026-08-30) are
 * applied as a manual override on top -- those pairs are the SAME company even though they don't
 * normalize identically (e.g. "CTS XPRESS LLC" / "CTS EXPRESS LLC"). The full duplicate-group
 * report (every group, every member, the chosen survivor, and why) is printed for the owner to
 * review -- this script does not silently discard any TRANSP data, it only chooses ONE name to
 * carry into USMCA per real company.
 *
 * Usage:
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-mdata-copy-04-transp-to-usmca-once.mts          # dry run + full report
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-mdata-copy-04-transp-to-usmca-once.mts --commit  # apply
 */
import pg from "pg";

const TRANSP = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_UUID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const SOURCE_TAG = "COPY_FROM_TRANSP_2026-08-30";

const COMMIT = process.argv.includes("--commit");
const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
if (!dbUrl) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL required");

// OWNER-7-ANSWERS.txt, 2026-08-30 -- exact canonical name to use for each cross-spelling pair.
// Applied on top of straight normalization; these pairs would NOT collapse under normalize().
const OWNER_NAME_OVERRIDES: Array<{ match: string[]; canonical: string; reason: string }> = [
  { match: ["IMPACT BULK LOGISTICS LLC", "IMPACT BULK LOGISTICS"], canonical: "Impact Bulk Logistics", reason: "OWNER 2026-08-30: same company" },
  { match: ["SETHMAR TRANSPORTATION INC", "SETHMAR TRANSPORTATION"], canonical: "Sethmar Transportation", reason: "OWNER 2026-08-30: same company" },
  {
    match: ["WATCO SUPPLY CHAIN SERVICES LLC", "WATCO SUPPLY CHAIN SERVICES LLC DBA WATCO LOGISTICS"],
    canonical: "Watco Supply Chain Services LLC DBA Watco Logistics",
    reason: "OWNER 2026-08-30: use the DBA row, not the bare name",
  },
  {
    match: ["SAJACKS FREIGHT INC", "SAJACKS FREIGHT", "SAJACKS FREIGTH"],
    canonical: "Sajacks Freight",
    reason: "OWNER 2026-08-30: Sajacks Freigth is a typo dupe -- never copied",
  },
  { match: ["NCC LOGISTICS USA INC", "NCC LOGISTICS", "NCC LOGISTICS USA"], canonical: "NCC Logistics", reason: "OWNER 2026-08-30: USA entity, not NCC Logistics Mexico" },
  { match: ["SIMPLE LOGISTICS SOLUTIONS", "SIMPLE LOGISTICS LLC"], canonical: "Simple Logistics LLC", reason: "OWNER 2026-08-30: not Simplex Logistics" },
  { match: ["CTS XPRESS LLC", "CTS EXPRESS LLC"], canonical: "CTS EXPRESS LLC", reason: "OWNER 2026-08-30: same company, canonical TRANSP spelling is EXPRESS" },
];

// FARO-26-CUSTOMERS-TO-CREATE.csv names, exact casing -- when a duplicate group contains a row
// matching one of these (case/punct-insensitive), THAT exact casing wins as survivor so TASK 5's
// factor assignment / invoice creation can find the customer by this exact name.
const FARO_26_NAMES = [
  "BV LOGISTICS INC", "CORE LOGISTICS BROKERAGE", "CTS XPRESS LLC", "DARDINI LLC",
  "DEL-CAN LOGISTICS, LLC.", "FLS Transport Inc.", "HUMMINGBIRD LOGISTIX LLC",
  "Hawkeye Transportation Services", "IMPACT BULK LOGISTICS LLC", "ITS LOGISTICS, LLC",
  "J RAYL TRANSPORT INC", "Jericho Freight LLC", "John J Jerue Truck Broker Inc.",
  "MPH CARRIER SERVICES INC", "Magna Transport Solutions LLC", "NCC LOGISTICS USA INC",
  "OSTT LOGISTICS LLC", "PFL LOGISTICS LLC", "Prodigee Logistics LLC", "R2X LLC",
  "REHMANN TRANSPORTATION CORP.", "S E Mares Forwarding Service LLC", "SAJACKS FREIGHT INC",
  "Sethmar Transportation Inc", "Simple Logistics Solutions", "Watco Supply Chain Services, LLC",
];

function normalize(name: string): string {
  return name
    .toUpperCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type Row = { id: string; name: string; created_at: string };

function groupByNormalizedName(rows: Row[]): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    let key = normalize(row.name);
    for (const override of OWNER_NAME_OVERRIDES) {
      if (override.match.some((m) => normalize(m) === key)) {
        key = `__OWNER__:${override.canonical}`;
        break;
      }
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  return groups;
}

function chooseSurvivor(key: string, members: Row[]): { survivor: Row; reason: string } {
  if (key.startsWith("__OWNER__:")) {
    const canonical = key.slice("__OWNER__:".length);
    const override = OWNER_NAME_OVERRIDES.find((o) => o.canonical === canonical)!;
    // Prefer the member whose name matches the owner's canonical casing exactly; else earliest.
    const exact = members.find((m) => normalize(m.name) === normalize(canonical));
    const survivor = exact ?? members.slice().sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    return { survivor: { ...survivor, name: canonical }, reason: override.reason };
  }
  const faroMember = members.find((m) => FARO_26_NAMES.some((f) => normalize(f) === normalize(m.name)));
  if (faroMember) return { survivor: faroMember, reason: "matches FARO-26-CUSTOMERS-TO-CREATE.csv exact casing" };
  const sorted = members.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { survivor: sorted[0], reason: "earliest created_at (original entry) -- no owner ruling, auto-picked" };
}

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 3 });
  const client = await pool.connect();
  try {
    await client.query("RESET ROLE");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

    // ---------------------------------------------------------------- CUSTOMERS ----------------
    const custRes = await client.query<{ id: string; customer_name: string; created_at: string }>(
      `SELECT id::text, customer_name, created_at::text FROM mdata.customers
        WHERE operating_company_id = $1::uuid AND is_sample_data = false AND deactivated_at IS NULL`,
      [TRANSP]
    );
    const custRows: Row[] = custRes.rows.map((r) => ({ id: r.id, name: r.customer_name, created_at: r.created_at }));

    // Collision guard: USMCA already has real (non-test) customers of its own (e.g. "TC Freight
    // LLC", used by an earlier live proof this session). Never create a second USMCA row with the
    // same name as one that already exists there -- skip the copy for that name and report it.
    const existingUsmcaCustRes = await client.query<{ customer_name: string }>(
      `SELECT customer_name FROM mdata.customers WHERE operating_company_id = $1::uuid`,
      [USMCA]
    );
    const existingUsmcaCustNames = new Set(existingUsmcaCustRes.rows.map((r) => normalize(r.customer_name)));

    const custGroups = groupByNormalizedName(custRows);
    const dupGroups = [...custGroups.entries()].filter(([, members]) => members.length > 1);

    console.log(`CUSTOMERS: ${custRows.length} real active TRANSP customers, ${dupGroups.length} duplicate-name groups found.`);
    const survivorByGroupKey = new Map<string, { survivor: Row; reason: string }>();
    for (const [key, members] of custGroups) {
      survivorByGroupKey.set(key, chooseSurvivor(key, members));
    }
    console.log("\n=== DUPLICATE-GROUP REPORT (owner review) ===");
    for (const [key, members] of dupGroups) {
      const { survivor, reason } = survivorByGroupKey.get(key)!;
      console.log(`  GROUP (${members.length}): ${members.map((m) => `"${m.name}"`).join(" | ")}`);
      console.log(`    -> SURVIVOR: "${survivor.name}" (${reason})`);
    }
    // Candidate id -> the name that would be written to USMCA (override name for owner-merged
    // groups, else the row's own name).
    const candidateNameById = new Map<string, string>();
    for (const [, { survivor }] of survivorByGroupKey) candidateNameById.set(survivor.id, survivor.name);
    for (const [, members] of custGroups) {
      if (members.length === 1) candidateNameById.set(members[0].id, members[0].name);
    }

    const skippedAsAlreadyInUsmca: string[] = [];
    const survivorIds = new Set<string>();
    for (const [id, name] of candidateNameById) {
      if (existingUsmcaCustNames.has(normalize(name))) {
        skippedAsAlreadyInUsmca.push(name);
        continue;
      }
      survivorIds.add(id);
    }
    if (skippedAsAlreadyInUsmca.length > 0) {
      console.log(`\nSKIPPED (name already exists in USMCA, not re-copied): ${skippedAsAlreadyInUsmca.join(", ")}`);
    }
    console.log(`\nCUSTOMERS TO COPY: ${survivorIds.size} (of ${custRows.length} real active TRANSP customers)`);

    // ------------------------------------------------------------------ VENDORS -----------------
    const vendRes = await client.query<{ id: string; vendor_name: string; created_at: string }>(
      `SELECT id::text, vendor_name, created_at::text FROM mdata.vendors
        WHERE operating_company_id = $1::uuid AND is_sample_data = false
          AND deactivated_at IS NULL AND driver_id IS NULL`,
      [TRANSP]
    );
    const vendRows: Row[] = vendRes.rows.map((r) => ({ id: r.id, name: r.vendor_name, created_at: r.created_at }));
    const vendGroups = groupByNormalizedName(vendRows);
    const vendDupGroups = [...vendGroups.entries()].filter(([, members]) => members.length > 1);
    console.log(`\nVENDORS: ${vendRows.length} real active non-driver TRANSP vendors, ${vendDupGroups.length} duplicate-name groups found.`);
    const vendSurvivorByGroupKey = new Map<string, { survivor: Row; reason: string }>();
    for (const [key, members] of vendGroups) {
      vendSurvivorByGroupKey.set(key, chooseSurvivor(key, members));
    }
    for (const [key, members] of vendDupGroups) {
      const { survivor, reason } = vendSurvivorByGroupKey.get(key)!;
      console.log(`  GROUP (${members.length}): ${members.map((m) => `"${m.name}"`).join(" | ")}`);
      console.log(`    -> SURVIVOR: "${survivor.name}" (${reason})`);
    }
    const vendCandidateNameById = new Map<string, string>();
    for (const [, { survivor }] of vendSurvivorByGroupKey) vendCandidateNameById.set(survivor.id, survivor.name);
    for (const [, members] of vendGroups) {
      if (members.length === 1) vendCandidateNameById.set(members[0].id, members[0].name);
    }

    const existingUsmcaVendRes = await client.query<{ vendor_name: string }>(
      `SELECT vendor_name FROM mdata.vendors WHERE operating_company_id = $1::uuid`,
      [USMCA]
    );
    const existingUsmcaVendNames = new Set(existingUsmcaVendRes.rows.map((r) => normalize(r.vendor_name)));

    const vendSkipped: string[] = [];
    const vendSurvivorIds = new Set<string>();
    for (const [id, name] of vendCandidateNameById) {
      if (existingUsmcaVendNames.has(normalize(name))) {
        vendSkipped.push(name);
        continue;
      }
      vendSurvivorIds.add(id);
    }
    if (vendSkipped.length > 0) {
      console.log(`\nSKIPPED (vendor name already exists in USMCA, not re-copied): ${vendSkipped.join(", ")}`);
    }
    console.log(`\nVENDORS TO COPY: ${vendSurvivorIds.size} (of ${vendRows.length} real active non-driver TRANSP vendors)`);

    if (!COMMIT) {
      console.log("\nDRY RUN -- pass --commit to apply. No writes made.");
      return;
    }

    // ---------------------------------------------------------------- APPLY --------------------
    // GUARD (self-caught bug): app.bypass_rls set via set_config(...,true) (SET LOCAL semantics)
    // only lives for the CURRENT transaction. Outside an explicit BEGIN, every statement is its
    // own implicit auto-commit transaction, so the GUC was gone before the very first INSERT ran
    // -- a live rehearsal of this script found exactly this: it silently copied only 414/1209
    // customers and 134/475 vendors (no error; RLS just filtered the source SELECT to 0 rows for
    // every insert once the connection's role wasn't natively bypass-capable) before this fix.
    // One explicit transaction for the whole apply phase makes the GUC live for every statement.
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    let customersCopied = 0;
    for (const id of survivorIds) {
      const nameOverride = candidateNameById.get(id) ?? null;
      const res = await client.query(
        `
          INSERT INTO mdata.customers (
            customer_name, billing_email, billing_phone, billing_address_line1, billing_address_line2,
            billing_city, billing_state, billing_postal_code, billing_country, mc_number, dot_number,
            notes, operating_company_id, customer_type, default_billing_miles_basis,
            default_free_time_hours, default_detention_rate, status, website, office_phone, fax_phone,
            main_contact_name, main_contact_title, main_contact_email, main_contact_phone,
            main_contact_mobile, ar_email, ar_phone, ap_email, ap_phone, free_time_pickup_minutes,
            free_time_delivery_minutes, detention_rate_per_hour, factoring_eligible,
            free_time_minutes, detention_currency, detention_requires_approval, lumper_billing_mode,
            source_system, source, print_on_invoice_name, cc_email, bcc_email,
            shipping_address_line1, shipping_address_line2, shipping_city, shipping_state,
            shipping_postal_code, shipping_country, shipping_same_as_billing,
            preferred_payment_method, preferred_delivery_method, preferred_language,
            tax_exempt, tax_exempt_reason, is_sample_data, created_by_user_id, updated_by_user_id
          )
          SELECT
            COALESCE($2::text, customer_name), billing_email, billing_phone, billing_address_line1, billing_address_line2,
            billing_city, billing_state, billing_postal_code, billing_country, mc_number, dot_number,
            notes, $3::uuid, customer_type, default_billing_miles_basis,
            default_free_time_hours, default_detention_rate, status, website, office_phone, fax_phone,
            main_contact_name, main_contact_title, main_contact_email, main_contact_phone,
            main_contact_mobile, ar_email, ar_phone, ap_email, ap_phone, free_time_pickup_minutes,
            free_time_delivery_minutes, detention_rate_per_hour, true,
            free_time_minutes, detention_currency, detention_requires_approval, lumper_billing_mode,
            'tms', $4, print_on_invoice_name, cc_email, bcc_email,
            shipping_address_line1, shipping_address_line2, shipping_city, shipping_state,
            shipping_postal_code, shipping_country, shipping_same_as_billing,
            preferred_payment_method, preferred_delivery_method, preferred_language,
            tax_exempt, tax_exempt_reason, false, $5::uuid, $5::uuid
          FROM mdata.customers WHERE id = $1::uuid
          RETURNING id
        `,
        [id, nameOverride, USMCA, SOURCE_TAG, ACTOR_USER_UUID]
      );
      if (res.rows[0]) customersCopied++;
    }
    console.log(`CUSTOMERS COPIED: ${customersCopied}`);

    let vendorsCopied = 0;
    for (const id of vendSurvivorIds) {
      const nameOverride = vendCandidateNameById.get(id) ?? null;
      const res = await client.query(
        `
          INSERT INTO mdata.vendors (
            vendor_name, vendor_code, vendor_type, phone, email, address_line1, address_line2,
            city, state, postal_code, country, tax_id, notes, operating_company_id,
            vendor_category, eligible_1099, mc_number, dot_number, is_sample_data,
            website, print_on_check_name, account_number, source_system, source,
            created_by_user_id, updated_by_user_id
          )
          SELECT
            COALESCE($2::text, vendor_name), NULL, vendor_type, phone, email, address_line1, address_line2,
            city, state, postal_code, country, tax_id, notes, $3::uuid,
            vendor_category, eligible_1099, mc_number, dot_number, false,
            website, print_on_check_name, account_number, 'tms', $4,
            $5::uuid, $5::uuid
          FROM mdata.vendors WHERE id = $1::uuid
          RETURNING id
        `,
        [id, nameOverride, USMCA, SOURCE_TAG, ACTOR_USER_UUID]
      );
      if (res.rows[0]) vendorsCopied++;
    }
    console.log(`VENDORS COPIED: ${vendorsCopied}`);
    if (customersCopied !== survivorIds.size || vendorsCopied !== vendSurvivorIds.size) {
      await client.query("ROLLBACK");
      throw new Error(
        `partial copy detected (customers ${customersCopied}/${survivorIds.size}, vendors ${vendorsCopied}/${vendSurvivorIds.size}) -- rolled back, nothing written. Re-run.`
      );
    }
    await client.query("COMMIT");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
