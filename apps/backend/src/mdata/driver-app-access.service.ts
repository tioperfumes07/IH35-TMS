/**
 * DRIVER APP ACCESS — give an EXISTING driver a login.
 *
 * THE DEFECT, MEASURED ON PROD 2026-08-03 (positive control mdata.vendors = 2,828):
 *   mdata.drivers                                   183 total, 88 active
 *   drivers with identity_user_id                     6
 *   ACTIVE drivers with NO identity_user_id           86  — of which 86 have a phone and ZERO an email
 *
 * Two independent walls stood between those 86 drivers and the app, and either one alone was fatal:
 *
 *  1. NO BOOTSTRAP. The only code that creates a driver's identity user lives inside the CREATE-driver
 *     route. `POST /drivers/:id/resend-invite` returns `driver_not_linked` when identity_user_id is
 *     null, so it can only re-send to someone who already has a login. Every driver imported rather
 *     than typed into the onboarding form was permanently unreachable — there was no path, in any UI,
 *     to give them access.
 *
 *  2. WRONG CHANNEL. resend-invite then requires an email and delivers by email. ZERO of the 86 have
 *     one. These are Mexican-B1 contract drivers who are reached on WhatsApp — which is exactly what
 *     the CREATE path uses (twilio.whatsapp.send / driver_invite). The re-send path had drifted onto a
 *     channel this fleet does not use, so it would have rejected all 86 even after linking.
 *
 * Combined with the outbox repair in this same branch (the WhatsApp queue wrote to a table nothing
 * read), driver app access was unreachable end to end.
 *
 * WHY A SERVICE RATHER THAN MORE ROUTE CODE: the create-driver route already does this work inline —
 * reuse-by-phone-or-email, unique-violation fallback, role/company update, company-access grant. Coding
 * it a second time in the invite route is how the two paths drift apart, which is the root cause of
 * wall #2 above. One implementation, two callers.
 *
 * PHONE-ONLY LOGINS ARE ALREADY SUPPORTED, NOT INVENTED HERE: identity.users.email is NULLABLE and 2 of
 * the 6 existing Driver users already carry a NULL email. No synthetic address is minted — fabricating
 * an email to satisfy a column would poison a unique index and every future match on it.
 */

import { appendCrudAudit } from "../audit/crud-audit.js";

type Queryable = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type DriverAppAccessError =
  | "driver_not_found"
  | "driver_no_contact_method"
  | "driver_company_unresolved"
  | "driver_app_access_state_changed"
  | "identity_user_conflict_credentials";

export type DriverAppAccessResult =
  | {
      ok: true;
      driverId: string;
      identityUserId: string;
      operatingCompanyId: string;
      phone: string | null;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
      /** true when this call minted the identity user, false when it reused/found one. */
      createdUser: boolean;
      /** true when this call linked the driver row that previously had none. */
      linkedDriver: boolean;
    }
  | { ok: false; error: DriverAppAccessError };

type DriverRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  identity_user_id: string | null;
  operating_company_id: string | null;
  preferred_language: string | null;
};

function normalizeEmail(raw: string | null): string | null {
  const trimmed = (raw ?? "").trim().toLowerCase();
  // identity.users carries CHECK (email = lower(email)) and UNIQUE(email); an empty string would
  // occupy the unique slot and collide with the next email-less driver.
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePhone(raw: string | null): string | null {
  const trimmed = (raw ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolve — creating if necessary — the identity user for `driverId`, link the driver row to it, and
 * grant company access. Idempotent: a driver that already has a login returns it untouched.
 *
 * The caller must already have established authorisation; this performs no role check of its own.
 */
export async function ensureDriverAppAccess(
  client: Queryable,
  driverId: string,
  actorUserId: string
): Promise<DriverAppAccessResult> {
  // RLS bypass: identity.users and org.user_company_access are not readable under the driver-scoped
  // policies this route runs with, and a masked read here would silently mint a DUPLICATE user.
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");

  const driverRes = await client.query<DriverRow>(
    `
      SELECT d.id::text            AS id,
             d.first_name,
             d.last_name,
             d.email,
             d.phone,
             d.identity_user_id::text     AS identity_user_id,
             d.operating_company_id::text AS operating_company_id,
             NULL::text                   AS preferred_language
        FROM mdata.drivers d
       WHERE d.id = $1::uuid
         -- ENTITY-SCOPED: an Owner/Admin of one company must not be able to provision a login for a
         -- driver belonging to another. org.user_accessible_company_ids() is the same gate the
         -- create-driver route uses to resolve its company.
         AND d.operating_company_id IN (SELECT org.user_accessible_company_ids())
       LIMIT 1
    `,
    [driverId]
  );
  const driver = driverRes.rows[0] ?? null;
  if (!driver) return { ok: false, error: "driver_not_found" };

  const email = normalizeEmail(driver.email);
  const phone = normalizePhone(driver.phone);
  if (!email && !phone) return { ok: false, error: "driver_no_contact_method" };

  // The driver's OWN company, not one derived from the identity user — that derivation is circular
  // for exactly the unlinked drivers this function exists to serve.
  const operatingCompanyId = driver.operating_company_id;
  if (!operatingCompanyId) return { ok: false, error: "driver_company_unresolved" };

  let identityUserId = driver.identity_user_id;
  let createdUser = false;

  if (!identityUserId) {
    const existingRes = await client.query<{ id: string }>(
      `
        SELECT id::text AS id
          FROM identity.users
         WHERE ($1::text IS NOT NULL AND phone = $1)
            OR ($2::text IS NOT NULL AND lower(email) = $2)
         ORDER BY id
         LIMIT 2
      `,
      [phone, email]
    );
    const existing = existingRes.rows;
    // Two DIFFERENT users matching — one by phone, another by email. Merging them is an identity
    // decision, never an automatic one; fail rather than pick.
    if (existing.length > 1 && existing[0].id !== existing[1].id) {
      return { ok: false, error: "identity_user_conflict_credentials" };
    }

    if (existing[0]) {
      identityUserId = existing[0].id;
    } else {
      try {
        const inserted = await client.query<{ id: string }>(
          `
            INSERT INTO identity.users (email, role, phone, default_company_id, deactivated_at)
            VALUES ($1, 'Driver', $2, $3::uuid, NULL)
            RETURNING id::text AS id
          `,
          [email, phone, operatingCompanyId]
        );
        identityUserId = inserted.rows[0]?.id ?? null;
        createdUser = true;
      } catch (err) {
        // 23505: another request won the race on UNIQUE(phone) / UNIQUE(email). Re-resolve rather
        // than fail — the same fallback the create-driver route uses.
        if ((err as { code?: string }).code !== "23505") throw err;
        const conflictRes = await client.query<{ id: string }>(
          `
            SELECT id::text AS id
              FROM identity.users
             WHERE ($1::text IS NOT NULL AND phone = $1)
                OR ($2::text IS NOT NULL AND lower(email) = $2)
             ORDER BY id
             LIMIT 2
          `,
          [phone, email]
        );
        if (conflictRes.rows.length > 1 && conflictRes.rows[0].id !== conflictRes.rows[1].id) {
          return { ok: false, error: "identity_user_conflict_credentials" };
        }
        identityUserId = conflictRes.rows[0]?.id ?? null;
      }
    }
  }

  if (!identityUserId) return { ok: false, error: "identity_user_conflict_credentials" };

  // COALESCE on email/phone so re-inviting a driver never ERASES a contact detail the user record
  // already had and the driver row happens to be missing.
  const identityRes = await client.query<{ id: string }>(
    `
      UPDATE identity.users
         SET role = 'Driver',
             default_company_id = COALESCE(default_company_id, $2::uuid),
             phone = COALESCE($3, phone),
             email = COALESCE($4, email),
             deactivated_at = NULL
       WHERE id = $1::uuid
         AND (role IS DISTINCT FROM 'Driver'
           OR default_company_id IS NULL
           OR ($3::text IS NOT NULL AND phone IS DISTINCT FROM $3)
           OR ($4::text IS NOT NULL AND email IS DISTINCT FROM $4)
           OR deactivated_at IS NOT NULL)
      RETURNING id::text AS id
    `,
    [identityUserId, operatingCompanyId, phone, email]
  );

  // Preserve the original grant actor/time for active access. A resend is not a new grant. Only an
  // insert or a real reactivation may replace grant provenance and receive an access-granted audit.
  const accessRes = await client.query<{ user_id: string }>(
    `
      INSERT INTO org.user_company_access (user_id, company_id, granted_by_user_id, deactivated_at, granted_at)
      VALUES ($1::uuid, $2::uuid, $3::uuid, NULL, now())
      ON CONFLICT (user_id, company_id)
      DO UPDATE SET deactivated_at = NULL,
                    granted_by_user_id = EXCLUDED.granted_by_user_id,
                    granted_at = now()
            WHERE org.user_company_access.deactivated_at IS NOT NULL
      RETURNING user_id::text AS user_id
    `,
    [identityUserId, operatingCompanyId, actorUserId]
  );

  const linkRes = await client.query<{ id: string }>(
    `
      UPDATE mdata.drivers
         SET identity_user_id = $2::uuid,
             updated_at = now()
       WHERE id = $1::uuid
         AND identity_user_id IS DISTINCT FROM $2::uuid
         AND operating_company_id = $3::uuid
         AND deactivated_at IS NULL
      RETURNING id::text AS id
    `,
    [driverId, identityUserId, operatingCompanyId]
  );
  if (driver.identity_user_id !== identityUserId && !linkRes.rows[0]) {
    return { ok: false, error: "driver_app_access_state_changed" };
  }

  // AUDIT AT THE POINT OF CHANGE. This function can CREATE a login, GRANT company access and re-link a
  // driver — an access-control mutation. The invite routes audit the invite; that is a different fact.
  // An auditor asking "who gave this driver a login, and when" must find the answer here, on the
  // mutation itself, not inferred from a notification that may never have been sent.
  if (createdUser || identityRes.rows.length > 0 || accessRes.rows.length > 0 || linkRes.rows.length > 0) {
    await appendCrudAudit(
      client as Parameters<typeof appendCrudAudit>[0],
      actorUserId,
      "mdata.driver.app_access_granted",
      {
        resource_type: "mdata.drivers",
        resource_id: driverId,
        driver_id: driverId,
        identity_user_id: identityUserId,
        operating_company_id: operatingCompanyId,
        created_identity_user: createdUser,
        identity_updated_or_reactivated: identityRes.rows.length > 0,
        company_access_inserted_or_reactivated: accessRes.rows.length > 0,
        linked_driver: linkRes.rows.length > 0,
        matched_on: email ? "email_or_phone" : "phone",
      },
      // warning, not info: creating/reactivating a login or granting company access is a privilege change.
      "warning",
      "BT-3-DRIVER-ONBOARDING"
    );
  }

  return {
    ok: true,
    driverId,
    identityUserId,
    operatingCompanyId,
    phone,
    email,
    firstName: driver.first_name,
    lastName: driver.last_name,
    createdUser,
    linkedDriver: linkRes.rows.length > 0,
  };
}
