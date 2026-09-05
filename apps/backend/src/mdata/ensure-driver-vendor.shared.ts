/**
 * DRIVER→VENDOR — mint the A/P payee for one driver, idempotently.
 *
 * Drivers are hired Mexican-B1 1099 CONTRACTORS (locked driver model), so a driver who is not also
 * a `mdata.vendors` row cannot be billed or paid through A/P at all — the vendor picker on bills and
 * expenses simply does not contain them.
 *
 * This logic already existed, but ONLY inside the on-demand POST /mdata/vendors/ensure-drivers
 * maintenance route. Nothing minted a payee when a driver was actually hired, so the link existed
 * exactly as often as somebody remembered to press the button.
 *
 * MEASURED ON PROD (br-fancy-credit-akjnd07a, 2026-08-09, bypass txn):
 *   USMCA active drivers                     16
 *   ... with a same-entity vendor            13
 *   ... WITHOUT                               3  — and all three are the operator-created ones
 *                                                 (TEST DRIVER-USMCA 08-02, TEST Driver-One 08-06,
 *                                                  SAMPLE Cascade-1612 08-08)
 * The 13 linked are the seeded cohort, whose seeders DO mint a vendor. So the failure rate on the
 * path a human actually uses was 3 of 3 — the row-origin test points the opposite way from usual
 * here: the unlinked rows are TMS-native, not imports, so this is a real defect and not expected
 * state.
 *
 * Extracted rather than reimplemented so the hire path and the maintenance route cannot drift into
 * two different definitions of "the driver's payee".
 */

export type EnsureDriverVendorClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type EnsureDriverVendorInput = {
  operatingCompanyId: string;
  driverId: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  actorUserId: string;
};

export type EnsureDriverVendorOutcome = "created" | "linked" | "already_present" | "skipped_no_name";

/**
 * Deterministic per-driver payee code: DRV-<12 alphanumerics of the name>-<8 hex of the driver id>.
 * The id half is what makes it re-runnable — two drivers who share a name still get distinct codes,
 * and the SAME driver always resolves to the same code on a later run.
 */
export function driverVendorCode(displayName: string, driverId: string): string {
  const codeBase =
    displayName
      .replace(/[^A-Za-z0-9]+/g, "")
      .toUpperCase()
      .slice(0, 12) || "DRIVER";
  return `DRV-${codeBase}-${driverId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export async function ensureDriverVendor(
  client: EnsureDriverVendorClient,
  input: EnsureDriverVendorInput
): Promise<EnsureDriverVendorOutcome> {
  const displayName = input.displayName.trim();
  // A payee with no name is not a payee. Better to report it than to mint "  " into the picker.
  if (!displayName) return "skipped_no_name";

  // Identity is `mdata.vendors.driver_id` — a real FK, guarded by
  // uq_vendors_driver_active_per_company. A `lower(vendor_name)` match is NOT identity: two drivers
  // sharing a name collapse onto one payee (paying the wrong person), and a renamed driver forks a
  // second one.
  const linkedRow = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
        FROM mdata.vendors
       WHERE operating_company_id = $1::uuid
         AND deactivated_at IS NULL
         AND driver_id = $2::uuid
       LIMIT 1
    `,
    [input.operatingCompanyId, input.driverId]
  );
  if (linkedRow.rows[0]?.id) return "already_present";

  const vendorCode = driverVendorCode(displayName, input.driverId);

  // Adopt a row an earlier run created (same deterministic code, same driver id) instead of forking
  // a duplicate payee. Deliberately NOT a name match: an unrelated third-party vendor that happens
  // to share the driver's name must never be silently claimed as the driver's payee.
  const adopt = await client.query<{ id: string }>(
    `
      UPDATE mdata.vendors
         SET driver_id = $2::uuid,
             updated_by_user_id = $3::uuid,
             updated_at = now()
       WHERE operating_company_id = $1::uuid
         AND deactivated_at IS NULL
         AND driver_id IS NULL
         AND vendor_code = $4
      RETURNING id::text AS id
    `,
    [input.operatingCompanyId, input.driverId, input.actorUserId, vendorCode]
  );
  if (adopt.rows[0]?.id) return "linked";

  // A pre-existing name-matched vendor (e.g. the ~52 TRANSP rows mirrored from QBO) is left alone —
  // no duplicate is created and no link is invented.
  const nameMatch = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
        FROM mdata.vendors
       WHERE operating_company_id = $1::uuid
         AND deactivated_at IS NULL
         AND lower(btrim(vendor_name)) = lower(btrim($2))
       LIMIT 1
    `,
    [input.operatingCompanyId, displayName]
  );
  if (nameMatch.rows[0]?.id) return "already_present";

  // ACCT-F5435: is_sample_data is how a report answers "is this real money?" — a row minted
  // without it is indistinguishable from real financial data no matter what its memo says (that
  // is exactly the shape of prod's existing 12-row ACCT-F208 contamination: SAMPLE in the free
  // text, false in the boolean). This function's own header names TEST/SAMPLE-tagged drivers
  // (TEST DRIVER-USMCA, SAMPLE Cascade-1612) minted through this exact path, so a hardcoded
  // false would repeat ACCT-F208 for every sample driver hired through it. Inherit the driver's
  // OWN is_sample_data instead — the payee's sample status must match the payee it was minted
  // for, not a create-path constant.
  const driverSample = await client.query<{ is_sample_data: boolean }>(
    `SELECT is_sample_data FROM mdata.drivers WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
    [input.driverId, input.operatingCompanyId]
  );
  const isSampleData = driverSample.rows[0]?.is_sample_data ?? false;

  // SAVEPOINT, not a bare try/catch: the caller may run this inside ONE transaction across many
  // drivers, and an un-savepointed unique violation aborts it so every later driver fails 25P02.
  // Only 23505 is absorbed — anything else is re-thrown so the caller fails loudly.
  //
  // SEED/DRIVERS-ARE-VENDORS (owner order, corrects the note this comment used to carry): the prior
  // "vendor_type 'Other' ... convention is followed, not invented" reasoning was itself the defect
  // — it perpetuated a mistype rather than fixing it, so every driver payee minted through this path
  // (and the ~97 that pre-date it) is invisible to any vendor_type='Driver' filter (settlement pay
  // posting, Purchases YTD, statements). 'Driver' is the correct type for a payee whose `driver_id`
  // is set; a same-shaped repair script re-typed the ~97 pre-existing rows in the same PR that
  // changed this constant, so this create path and the backfilled history agree going forward.
  await client.query("SAVEPOINT ensure_driver_vendor");
  try {
    await client.query(
      `
        INSERT INTO mdata.vendors (
          vendor_name, vendor_code, vendor_type, phone, email, driver_id,
          operating_company_id, created_by_user_id, updated_by_user_id, is_sample_data
        )
        VALUES ($1, $2, 'Driver', $3, $4, $7::uuid, $5::uuid, $6::uuid, $6::uuid, $8)
      `,
      [
        displayName,
        vendorCode,
        input.phone,
        input.email,
        input.operatingCompanyId,
        input.actorUserId,
        input.driverId,
        isSampleData,
      ]
    );
    await client.query("RELEASE SAVEPOINT ensure_driver_vendor");
    return "created";
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT ensure_driver_vendor");
    // 23505 = unique_violation: a concurrent run already produced this payee.
    if ((err as { code?: string })?.code !== "23505") throw err;
    return "already_present";
  }
}
