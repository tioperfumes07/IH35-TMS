/**
 * Register rows 166 / 167 (2026-11-03) — read a driver THROUGH his merged shells.
 *
 * A merge (mdata.drivers.merged_into_driver_id) leaves the shell row in place; its child rows (VDA pairings, medical cards,
 * HOS snapshots) and its credential columns were never moved onto the survivor. Prod, USMCA: Angel Alfonso Sosa Perez
 * (survivor 52037e93) has 3 shells — his CDL TAMP220307 / exp 2029-09-22 sits only on shell fba21d80, so the survivor's
 * profile read "Not recorded"; 3 survivors in USMCA carry a CDL expiry only on a shell, 1 a medical expiry only on a shell.
 *
 * Readers resolve: survivor id + every shell merged into it (same company), and the survivor's NULL credential fields take
 * the newest shell's non-null value. Read-only — nothing is written back.
 */

type Queryable = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

/** SQL: the uuid[] of a driver + every shell merged into it, in the company. `$driver` / `$company` are placeholders. */
export function driverAndShellIdsSql(driverParam: string, companyParam: string): string {
  return `(ARRAY[${driverParam}::uuid] || COALESCE(ARRAY(
      SELECT shell.id FROM mdata.drivers shell
       WHERE shell.merged_into_driver_id = ${driverParam}::uuid
         AND shell.operating_company_id = ${companyParam}::uuid), ARRAY[]::uuid[]))`;
}

/**
 * SQL: a driver id expression resolved to its survivor (merged shell → merged_into_driver_id; survivor → itself), in the
 * company. Both merge writers (driver-merge.service.ts, driver-mapping.routes.ts) merge a shell only inside its own company,
 * so the shell read is pinned to `companyExpr` — an id from another entity is never followed (CLS-JOIN-ENTITY-UNSCOPED).
 */
export function survivorDriverIdSql(driverIdExpr: string, companyExpr: string): string {
  return `COALESCE((SELECT merge_src.merged_into_driver_id FROM mdata.drivers merge_src WHERE merge_src.id = ${driverIdExpr} AND merge_src.operating_company_id = ${companyExpr}), ${driverIdExpr})`;
}

/**
 * Register row 93 (2026-11-03) — a WRITER's driver id resolved to the survivor before it writes. One profile per person:
 * nothing is ever written onto a merged shell (mdata.drivers.merged_into_driver_id set). Merges are one level deep (the
 * merge engine refuses a survivor that is itself merged; prod 11-03: 0 chained shells), so one hop is the survivor. An
 * unknown id comes back unchanged (the writer's own FK / mapping check reports it).
 */
export async function resolveSurvivorDriverId(client: Queryable, driverId: string, operatingCompanyId: string): Promise<string> {
  // CLS-JOIN-ENTITY-UNSCOPED: the shell is read in the writer's company only (merges never cross companies).
  const r = await client.query<{ id: string }>(
    `SELECT COALESCE(d.merged_into_driver_id, d.id)::text AS id FROM mdata.drivers d WHERE d.id = $1::uuid AND d.operating_company_id = $2::uuid`,
    [driverId, operatingCompanyId]
  );
  return r.rows[0]?.id ?? driverId;
}

/** Credential / document columns a merged shell can hold that the survivor's profile reads. */
export const SHELL_CREDENTIAL_FIELDS = [
  "cdl_number", "cdl_state", "cdl_class", "cdl_expires_at", "cdl_restrictions",
  "dot_medical_expires_at", "hazmat_endorsement_expires_at",
  "visa_type", "visa_number", "visa_expires_at", "visa_b1_status", "b1_visa_number", "b1_visa_expires_date",
  "passport_number", "passport_expires_at", "passport_country",
  "mexican_license_number", "mexican_license_expiration",
  "fast_card_number", "fast_card_expiration", "sentri_expiration", "twic_card_number", "twic_expiration",
  "emergency_contact_name", "emergency_contact_relationship", "emergency_contact_phone_primary",
  "emergency_contact_phone_alternate", "emergency_contact_address",
  "date_of_birth",
] as const;

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** Pure: fill the survivor's blank credential fields from shells (shells ordered newest first). Returns the fields filled. */
export function overlayShellCredentials(driver: Record<string, unknown>, shells: Array<Record<string, unknown>>): string[] {
  const filled: string[] = [];
  for (const field of SHELL_CREDENTIAL_FIELDS) {
    if (!isBlank(driver[field])) continue;
    const source = shells.find((shell) => !isBlank(shell[field]));
    if (!source) continue;
    driver[field] = source[field];
    filled.push(field);
  }
  return filled;
}

export async function loadMergedShellCredentials(client: Queryable, driverId: string, operatingCompanyId: string) {
  const res = await client.query<Record<string, unknown>>(
    `SELECT ${SHELL_CREDENTIAL_FIELDS.map((f) => `s.${f}`).join(", ")}
       FROM mdata.drivers s
      WHERE s.merged_into_driver_id = $1::uuid
        AND s.operating_company_id = $2::uuid
      ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC`,
    [driverId, operatingCompanyId]
  );
  return res.rows;
}
