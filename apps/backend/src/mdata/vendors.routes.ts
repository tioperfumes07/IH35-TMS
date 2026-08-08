import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { resolveOperatingCompanyId } from "../auth/operating-company-scope.js";
import { requireAuth } from "../auth/session-middleware.js";
import { enqueueTmsVendorPushRequested } from "../qbo/tms-vendor-push-chain.service.js";
import { listActiveVendorClassifications } from "./classification-queries.js";
import { isTestVendorFixtureName } from "./fixture-vendor-name-pattern.js";
import { searchVendorsForAutocomplete } from "./vendor-autocomplete.shared.js";

// LST-PICKER-01 (guard 1852) — vendor_type is CATALOG-BACKED (catalogs.vendor_types), per entity, with an
// inline "+ Add new vendor type" row (VendorCreateModal / VendorDetail). It was once a frozen z.enum of
// the 8 legacy values, which 400'd on PATCH/POST the moment an owner added a new vendor type from the
// catalog picker, so PR #3884 widened it to a free-form `z.string().trim().min(1).max(100)`. The COLUMN is
// `text` (0008_mdata_init.sql), so free-form looked right at the app layer — but the TABLE also carries a
// CHECK constraint that was never widened to match, which is the defect below.
//
// LV-TXN-017 — the app layer and the DATABASE held different contracts, and the database won with a 500.
//
// PROD-VERIFIED 2026-08-08 on br-fancy-credit-akjnd07a (pg_constraint, RLS-immune):
//   vendors_vendor_type_check = CHECK (vendor_type = ANY (ARRAY['Fuel','Repair','Tires','Towing',
//   'Insurance','Permit','Toll','Other'])), convalidated = true.
// The relax migration 202611021200 that would widen this is marked HOLD-FOR-JORGE / "DO NOT RUN ON PROD"
// and is NOT applied, so the closed 8-value list is what production actually enforces TODAY.
//
// The zod above accepts ANY string up to 100 chars, so anything outside those 8 reached Postgres and
// aborted as HTTP 500 / PG 23514 instead of a 400. The constraint is CASE-SENSITIVE, so the single most
// likely human or import input — lowercase 'other', 'fuel', 'repair' — produced an opaque Internal Server
// Error that named neither the field, the legal values, nor the fact that only capitalisation was wrong.
// CC-3 proved it live on USMCA (deploy e6343f4): 'Other' -> 201, 'other' -> 500 23514, 'NotAType123' -> 500.
//
// WHY TIGHTENING IS SAFE HERE, measured rather than assumed: the comment above warns that a frozen enum
// once 400'd when an owner added a vendor type via the catalogs.vendor_types picker. On prod TODAY that
// scenario does not exist — catalogs.vendor_types holds 24 rows across the three entities with ZERO
// distinct names outside these 8, and all 2837 mdata.vendors rows (visible == n_live_tup, so no RLS
// masking) use 'Other'. Nothing live is rejected by this list that the DATABASE was not already rejecting
// with a 500. A catalog type outside the 8 still cannot be saved — but it now fails as an honest 400 that
// names the legal values instead of a 500, and the real unblock is applying that held migration.
//
// We also NORMALISE case, which the card recommends: 'other' now round-trips as 'Other' (201) rather than
// 500ing on a capitalisation difference no UI ever surfaced.
export const VENDOR_TYPE_VALUES = ["Fuel", "Repair", "Tires", "Towing", "Insurance", "Permit", "Toll", "Other"] as const;

const VENDOR_TYPE_BY_LOWER = new Map(VENDOR_TYPE_VALUES.map((v) => [v.toLowerCase(), v]));

/** Canonical form for a caller-supplied vendor type, or null when it is not one of the 8. */
function canonicalVendorType(raw: string): string | null {
  return VENDOR_TYPE_BY_LOWER.get(raw.trim().toLowerCase()) ?? null;
}

/**
 * WRITE paths (create/update). Rejects with a 400 naming the legal values instead of letting the DB CHECK
 * raise a 23514, and normalises case so only genuinely unknown types fail.
 */
const vendorTypeWriteSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .transform((v, ctx) => {
    const canonical = canonicalVendorType(v);
    if (!canonical) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `vendor_type must be one of: ${VENDOR_TYPE_VALUES.join(", ")} (case-insensitive)`,
      });
      return z.NEVER;
    }
    return canonical;
  });

/**
 * READ filter. Canonicalises case so `?vendor_type=other` matches the stored 'Other', but deliberately
 * does NOT reject an unknown value — a filter that matches nothing should return an empty list, not a 400.
 * Tightening a read is a behaviour change nobody asked for; the 500 this card is about is on the WRITES.
 */
const vendorTypeFilterSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .transform((v) => canonicalVendorType(v) ?? v);
const QBO_ARCHIVE_PROJECTION_SOURCE_RE = /Projected from qbo_archive\.entities_snapshot[^\n]*/gi;

// VENDOR-CUSTOMER-QBO-PARITY (migration 202607110230, HELD): the vendor row shape returned by every
// read/write endpoint. Kept as one constant (mirrors CUSTOMER_SELECT_COLUMNS in customers.routes.ts)
// so list/get/create/update can never drift from each other.
const VENDOR_SELECT_COLUMNS = `
  id,
  vendor_name AS name,
  vendor_code,
  vendor_type,
  vendor_category,
  vendor_category_locked_at,
  phone,
  email,
  operating_company_id,
  address_line1 AS address,
  address_line2,
  city,
  state,
  postal_code,
  country,
  mc_number,
  dot_number,
  eligible_1099,
  website,
  print_on_check_name,
  payment_terms_id,
  default_expense_account_id,
  account_number,
  tax_id,
  notes,
  created_at,
  updated_at,
  deactivated_at,
  created_by_user_id,
  updated_by_user_id
`;

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(5000).default(50), // VEND-1: allow loading the full roster (was capped at 200, hiding ~440 of 490)
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(["active", "inactive"]).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  vendor_type: vendorTypeFilterSchema.optional(),
  operating_company_id: z.string().uuid().optional(),
  // QboCombobox picker repoint: autocomplete mode reads the CANONICAL mdata.vendors (with qbo_vendor_id)
  // instead of the mdata.qbo_vendors mirror, so vendors created via the canonical writer are visible.
  autocomplete: z.coerce.boolean().optional().default(false),
  q: z.string().trim().max(100).optional(),
  active_only: z.coerce.boolean().optional(),
  // ITEM 3 = B (owner ruling 2026-07-11): master data is SHARED by design, but the Vendors LIST VIEW
  // must show ONLY the ACTIVE company's records. OPT-IN flag passed by the Vendors list page alone; shared
  // pickers/autocomplete NEVER pass it, so cross-entity bill/expense vendor dropdowns are unaffected.
  active_company_only: z.coerce.boolean().optional().default(false),
});

const idParamSchema = z.object({ id: z.string().uuid() });
const detailQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
});

const createVendorBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  vendor_code: z.string().trim().max(100).optional(),
  vendor_type: vendorTypeWriteSchema,
  phone: z.string().trim().max(50).optional(),
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase())
    .optional(),
  operating_company_id: z.string().uuid().optional(),
  address: z.string().trim().max(500).optional(),
  // VENDOR-CUSTOMER-QBO-PARITY (migration 202607110230, HELD): structured address already existed as
  // real mdata.vendors columns (0008) but was never exposed here — `address` above still maps to
  // address_line1 for existing callers; these are additive, optional structured fields alongside it.
  address_line2: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(50).optional(),
  postal_code: z.string().trim().max(20).optional(),
  country: z.string().trim().max(56).optional(),
  // mc_number/dot_number already existed (0382, for carrier/subhaul vendors) but were unexposed.
  mc_number: z.string().trim().max(50).optional(),
  dot_number: z.string().trim().max(50).optional(),
  // eligible_1099 already existed (0178) but was unexposed — QBO "Track payments for 1099" parity.
  eligible_1099: z.boolean().optional(),
  website: z.string().trim().max(200).optional(),
  print_on_check_name: z.string().trim().max(200).optional(),
  payment_terms_id: z.string().uuid().nullable().optional(),
  // Option-B: recommendation-only default expense account — pre-fills bill lines, never a silent post.
  default_expense_account_id: z.string().uuid().nullable().optional(),
  account_number: z.string().trim().max(120).optional(),
  tax_id: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const updateVendorBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    vendor_code: z.string().trim().max(100).nullable().optional(),
    vendor_type: vendorTypeWriteSchema.optional(),
    phone: z.string().trim().max(50).nullable().optional(),
    email: z
      .string()
      .email()
      .transform((v) => v.toLowerCase())
      .nullable()
      .optional(),
    operating_company_id: z.string().uuid().optional(),
    address: z.string().trim().max(500).nullable().optional(),
    address_line2: z.string().trim().max(200).nullable().optional(),
    city: z.string().trim().max(100).nullable().optional(),
    state: z.string().trim().max(50).nullable().optional(),
    postal_code: z.string().trim().max(20).nullable().optional(),
    country: z.string().trim().max(56).nullable().optional(),
    mc_number: z.string().trim().max(50).nullable().optional(),
    dot_number: z.string().trim().max(50).nullable().optional(),
    eligible_1099: z.boolean().optional(),
    website: z.string().trim().max(200).nullable().optional(),
    print_on_check_name: z.string().trim().max(200).nullable().optional(),
    payment_terms_id: z.string().uuid().nullable().optional(),
    default_expense_account_id: z.string().uuid().nullable().optional(),
    account_number: z.string().trim().max(120).nullable().optional(),
    tax_id: z.string().trim().max(100).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    deactivated_at: z.string().datetime().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function isWriteRole(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

// VEND-3: block TEST-VENDOR fixture names in production (create + rename). Non-prod keeps test harnesses working.
const IS_PROD_ENV = process.env.NODE_ENV === "production";

function sendTestVendorFixtureRejected(reply: FastifyReply) {
  return reply.code(422).send({
    error: "mdata_vendor_test_fixture_rejected",
    message: "Vendor names containing TEST-VENDOR are not allowed in production",
    fieldErrors: { name: "TEST-VENDOR fixture names are not allowed in production" },
  });
}

// G6-2: vendor create previously had NO dedup guard (customers had one), so duplicate vendors could
// be created freely. Mirror the customer pattern: (a) case-insensitive on name (lower(btrim(...))),
// (b) entity-scoped by operating_company_id (mdata RLS is identity-based, NOT entity-scoped, so the
// opco predicate MUST be explicit — the same vendor name in TRANSP vs USMCA is allowed), and (c)
// ignore archived rows (deactivated_at IS NULL). Returns true when a live duplicate exists.
async function vendorNameConflictExists(
  authUserId: string,
  operatingCompanyId: string,
  name: string,
  excludeId?: string
): Promise<boolean> {
  return withCurrentUser(authUserId, async (client) => {
    await setScopedCompanyContext(client, authUserId, operatingCompanyId);
    const values: unknown[] = [name, operatingCompanyId];
    let where = `lower(btrim(vendor_name)) = lower(btrim($1)) AND operating_company_id = $2 AND deactivated_at IS NULL`;
    if (excludeId) {
      values.push(excludeId);
      where += " AND id <> $3";
    }
    const res = await client.query(`SELECT id FROM mdata.vendors WHERE ${where} LIMIT 1`, values);
    return res.rows.length > 0;
  });
}

function scrubVendorProjectionSource(row: Record<string, unknown>) {
  const notesRaw = typeof row.notes === "string" ? row.notes : null;
  if (!notesRaw || !QBO_ARCHIVE_PROJECTION_SOURCE_RE.test(notesRaw)) return row;
  QBO_ARCHIVE_PROJECTION_SOURCE_RE.lastIndex = 0;

  const projectionSources = Array.from(notesRaw.matchAll(QBO_ARCHIVE_PROJECTION_SOURCE_RE))
    .map((match) => match[0]?.trim())
    .filter((value): value is string => Boolean(value));

  const cleanedNotes = notesRaw.replace(QBO_ARCHIVE_PROJECTION_SOURCE_RE, "").replace(/\n{3,}/g, "\n\n").trim();
  const existingMeta =
    row._internal_meta && typeof row._internal_meta === "object" && !Array.isArray(row._internal_meta)
      ? (row._internal_meta as Record<string, unknown>)
      : {};

  return {
    ...row,
    notes: cleanedNotes.length > 0 ? cleanedNotes : null,
    _internal_meta: {
      ...existingMeta,
      projection_source: projectionSources,
    },
  };
}

export async function registerVendorRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/vendors", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const { limit, offset, status, search, vendor_type, operating_company_id, autocomplete, q, active_only, active_company_only } = parsedQuery.data;
    const resolvedOperatingCompanyId = await withCurrentUser(authUser.uuid, async (client) =>
      resolveOperatingCompanyId(client, authUser.uuid, operating_company_id)
    );
    if (!resolvedOperatingCompanyId) {
      return reply.code(400).send({ error: "operating_company_id_required" });
    }

    // QboCombobox picker repoint: canonical-table autocomplete (mirrors the customers endpoint) so a
    // vendor created via the canonical writer is immediately selectable in bill/expense editors.
    if (autocomplete) {
      const results = await withCurrentUser(authUser.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [resolvedOperatingCompanyId]);
        return searchVendorsForAutocomplete(client, {
          operating_company_id: resolvedOperatingCompanyId,
          term: q ?? search ?? "",
          active_only,
        });
      });
      return { results };
    }

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [resolvedOperatingCompanyId]);
      const values: unknown[] = [];
      const filters: string[] = [];
      if (status === "active") filters.push("deactivated_at IS NULL");
      if (status === "inactive") filters.push("deactivated_at IS NOT NULL");
      if (vendor_type) {
        values.push(vendor_type);
        filters.push(`vendor_type = $${values.length}`);
      }
      if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        filters.push(`(vendor_name ILIKE $${idx} OR vendor_code ILIKE $${idx} OR email ILIKE $${idx})`);
      }
      values.push(resolvedOperatingCompanyId);
      filters.push(`operating_company_id = $${values.length}`);
      // ITEM 3 = B: LIST-VIEW-ONLY active-company pin. When the Vendors list page opts in, additionally
      // constrain rows to the ACTIVE session company (app.operating_company_id, set above). Layered ON TOP
      // of the existing access check so the list can never regress to a cross-entity roster; shared pickers
      // do not pass the flag and keep their per-call operating_company_id scope untouched.
      if (active_company_only) {
        filters.push(`operating_company_id = current_setting('app.operating_company_id', true)::uuid`);
      }
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const countRes = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM mdata.vendors ${whereClause}`,
        values
      );
      values.push(limit);
      values.push(offset);
      const res = await client.query(
        `
          SELECT ${VENDOR_SELECT_COLUMNS}
          FROM mdata.vendors
          ${whereClause}
          ORDER BY created_at DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return { rows: res.rows.map((row) => scrubVendorProjectionSource(row as Record<string, unknown>)), total: countRes.rows[0]?.total ?? 0 };
    });
    return { vendors: result.rows, total: result.total };
  });

  // Driver-as-vendor ensure (Jorge-depth Accounting 2026-07-22): Active drivers must appear in the
  // vendor picker for bills/expenses. TRANSP already has ~52 name-matched vendor rows from QBO;
  // USMCA had 83 drivers / 2 vendors — empty driver payees. Idempotent INSERT of missing vendors.
  //
  // rateLimit: this handler fans out one SELECT (+ possibly one INSERT) PER ACTIVE DRIVER — 83 for
  // USMCA — so an unthrottled caller can drive an unbounded number of round trips per request.
  // CodeQL js/missing-rate-limiting flagged exactly that. Same shape as allocations.routes.ts;
  // max is low because this is an idempotent maintenance action, not a read path.
  app.post("/api/v1/mdata/vendors/ensure-drivers", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedBody = z
      .object({ operating_company_id: z.string().uuid() })
      .safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const scopedCompanyId = await withCurrentUser(authUser.uuid, async (client) =>
      resolveOperatingCompanyId(client, authUser.uuid, parsedBody.data.operating_company_id)
    );
    if (!scopedCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [scopedCompanyId]);
      const drivers = await client.query<{
        id: string;
        display_name: string;
        phone: string | null;
        email: string | null;
      }>(
        `
          SELECT
            d.id::text AS id,
            btrim(concat_ws(' ', d.first_name, d.last_name)) AS display_name,
            d.phone,
            d.email
          FROM mdata.drivers d
          WHERE d.operating_company_id = $1::uuid
            AND d.status = 'Active'
            AND d.deactivated_at IS NULL
            AND btrim(concat_ws(' ', d.first_name, d.last_name)) <> ''
        `,
        [scopedCompanyId]
      );

      let created = 0;
      let alreadyPresent = 0;
      let linked = 0;
      for (const driver of drivers.rows) {
        // Identity is mdata.vendors.driver_id — a real FK to mdata.drivers, guarded by
        // uq_vendors_driver_active_per_company (operating_company_id, driver_id) WHERE driver_id IS
        // NOT NULL AND deactivated_at IS NULL. The old `lower(vendor_name)` match was NOT identity:
        // two drivers with the same name collapse onto one vendor (paying the wrong person), and a
        // renamed driver silently forks a second payee.
        const linkedRow = await client.query<{ id: string }>(
          `
            SELECT id::text AS id
            FROM mdata.vendors
            WHERE operating_company_id = $1::uuid
              AND deactivated_at IS NULL
              AND driver_id = $2::uuid
            LIMIT 1
          `,
          [scopedCompanyId, driver.id]
        );
        if (linkedRow.rows[0]?.id) {
          alreadyPresent += 1;
          continue;
        }

        const codeBase = driver.display_name
          .replace(/[^A-Za-z0-9]+/g, "")
          .toUpperCase()
          .slice(0, 12) || "DRIVER";
        const vendorCode = `DRV-${codeBase}-${driver.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

        // Adopt a row THIS route created on an earlier run (vendor_code = the deterministic
        // DRV-<NAME>-<8hex> for this exact driver id) so re-running links it instead of forking a
        // duplicate payee. Deliberately NOT a name match: an unrelated third-party vendor that
        // happens to share the driver's name must never be silently claimed as the driver's payee.
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
          [scopedCompanyId, driver.id, authUser.uuid, vendorCode]
        );
        if (adopt.rows[0]?.id) {
          linked += 1;
          continue;
        }

        // A pre-existing name-matched vendor (e.g. the ~52 TRANSP rows mirrored from QBO) is left
        // alone — no duplicate is created and no link is invented.
        const nameMatch = await client.query<{ id: string }>(
          `
            SELECT id::text AS id
            FROM mdata.vendors
            WHERE operating_company_id = $1::uuid
              AND deactivated_at IS NULL
              AND lower(btrim(vendor_name)) = lower(btrim($2))
            LIMIT 1
          `,
          [scopedCompanyId, driver.display_name]
        );
        if (nameMatch.rows[0]?.id) {
          alreadyPresent += 1;
          continue;
        }

        // SAVEPOINT, not a bare try/catch: withCurrentUser runs the whole handler in ONE
        // transaction, so an un-savepointed unique violation aborts it and every later driver in
        // this loop fails with 25P02. Only 23505 is absorbed — anything else is re-thrown so the
        // request fails loudly instead of silently under-creating.
        await client.query("SAVEPOINT ensure_driver_vendor");
        try {
          await client.query(
            `
              INSERT INTO mdata.vendors (
                vendor_name, vendor_code, vendor_type, phone, email, driver_id,
                operating_company_id, created_by_user_id, updated_by_user_id
              )
              VALUES ($1, $2, 'Other', $3, $4, $7::uuid, $5::uuid, $6::uuid, $6::uuid)
            `,
            [
              driver.display_name,
              vendorCode,
              driver.phone,
              driver.email,
              scopedCompanyId,
              authUser.uuid,
              driver.id,
            ]
          );
          await client.query("RELEASE SAVEPOINT ensure_driver_vendor");
          created += 1;
        } catch (err) {
          await client.query("ROLLBACK TO SAVEPOINT ensure_driver_vendor");
          // 23505 = unique_violation: uq_vendors_driver_active_per_company (or the vendor_code
          // unique) means a concurrent run already produced this driver's payee — "already
          // present", not an error.
          if ((err as { code?: string })?.code !== "23505") throw err;
          alreadyPresent += 1;
        }
      }
      return {
        created,
        linked,
        already_present: alreadyPresent,
        total_active_drivers: drivers.rows.length,
      };
    });

    return result;
  });

  app.post("/api/v1/mdata/vendors", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedBody = createVendorBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    // Resolve the operating company BEFORE the dedup check so the check is entity-scoped (G6-2).
    const createOperatingCompanyId = await withCurrentUser(authUser.uuid, async (client) =>
      resolveOperatingCompanyId(client, authUser.uuid, b.operating_company_id)
    );
    if (!createOperatingCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });
    if (IS_PROD_ENV && isTestVendorFixtureName(b.name)) {
      return sendTestVendorFixtureRejected(reply);
    }
    if (await vendorNameConflictExists(authUser.uuid, createOperatingCompanyId, b.name)) {
      return reply.code(409).send({
        error: "mdata_vendor_name_conflict",
        message: "Vendor with this name already exists",
        fieldErrors: { name: "Already in use" },
      });
    }

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        const resolvedOperatingCompanyId = createOperatingCompanyId;
        const columns: string[] = [
          "vendor_name",
          "vendor_code",
          "vendor_type",
          "phone",
          "email",
          "operating_company_id",
          "address_line1",
          "tax_id",
          "notes",
          "created_by_user_id",
          "updated_by_user_id",
        ];
        const values: unknown[] = [
          b.name,
          b.vendor_code ?? null,
          b.vendor_type,
          b.phone ?? null,
          b.email ?? null,
          resolvedOperatingCompanyId,
          b.address ?? null,
          b.tax_id ?? null,
          b.notes ?? null,
          authUser.uuid,
          authUser.uuid,
        ];
        const placeholders: string[] = values.map((_, i) => `$${i + 1}`);

        // VENDOR-CUSTOMER-QBO-PARITY (migration 202607110230, HELD): additive optional columns.
        const addOptional = (column: string, value: unknown) => {
          if (value === undefined) return;
          columns.push(column);
          values.push(value);
          placeholders.push(`$${values.length}`);
        };
        addOptional("address_line2", b.address_line2);
        addOptional("city", b.city);
        addOptional("state", b.state);
        addOptional("postal_code", b.postal_code);
        addOptional("country", b.country);
        addOptional("mc_number", b.mc_number);
        addOptional("dot_number", b.dot_number);
        addOptional("eligible_1099", b.eligible_1099);
        addOptional("website", b.website);
        addOptional("print_on_check_name", b.print_on_check_name);
        addOptional("payment_terms_id", b.payment_terms_id);
        addOptional("default_expense_account_id", b.default_expense_account_id);
        addOptional("account_number", b.account_number);

        const res = await client.query(
          `
            INSERT INTO mdata.vendors (${columns.join(", ")})
            VALUES (${placeholders.join(", ")})
            RETURNING ${VENDOR_SELECT_COLUMNS}
          `,
          values
        );
        const row = res.rows[0];
        await appendCrudAudit(client, authUser.uuid, "mdata.vendors.created", {
          resource_id: row.id,
          resource_type: "mdata.vendors",
          id: row.id,
          name: row.name,
          vendor_code: row.vendor_code,
          vendor_type: row.vendor_type,
        });
        await enqueueTmsVendorPushRequested(client, {
          operating_company_id: String(row.operating_company_id),
          vendor_id: String(row.id),
          operation: "create",
        });
        return row;
      });
      return reply.code(201).send(created);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        return reply.code(409).send({ error: "mdata_vendor_conflict" });
      }
      if ((err as Error).message === "operating_company_id_required") {
        return reply.code(400).send({ error: "operating_company_id_required" });
      }
      throw err;
    }
  });

  app.get("/api/v1/mdata/vendors/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = detailQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const resolvedOperatingCompanyId = await withCurrentUser(authUser.uuid, async (client) =>
      resolveOperatingCompanyId(client, authUser.uuid, parsedQuery.data.operating_company_id)
    );
    if (!resolvedOperatingCompanyId) {
      return reply.code(400).send({ error: "operating_company_id_required" });
    }

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [resolvedOperatingCompanyId]);
      const res = await client.query(
        `
          SELECT ${VENDOR_SELECT_COLUMNS}
          FROM mdata.vendors
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [parsedParams.data.id, resolvedOperatingCompanyId]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "mdata_vendor_not_found" });
    return row;
  });

  app.patch("/api/v1/mdata/vendors/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateVendorBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    // G6-2: a rename must not collide with an existing live vendor in the same entity.
    if ("name" in b && b.name) {
      if (IS_PROD_ENV && isTestVendorFixtureName(b.name)) {
        return sendTestVendorFixtureRejected(reply);
      }
      const patchScopedCompanyId = await withCurrentUser(authUser.uuid, async (client) =>
        resolveOperatingCompanyId(client, authUser.uuid)
      );
      if (patchScopedCompanyId && (await vendorNameConflictExists(authUser.uuid, patchScopedCompanyId, b.name, parsedParams.data.id))) {
        return reply.code(409).send({
          error: "mdata_vendor_name_conflict",
          message: "Vendor with this name already exists",
          fieldErrors: { name: "Already in use" },
        });
      }
    }

    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      setParts.push(`${col} = $${values.length}`);
    };
    if ("name" in b) add("vendor_name", b.name ?? null);
    if ("vendor_code" in b) add("vendor_code", b.vendor_code ?? null);
    if ("vendor_type" in b) add("vendor_type", b.vendor_type);
    if ("phone" in b) add("phone", b.phone ?? null);
    if ("email" in b) add("email", b.email ?? null);
    if ("operating_company_id" in b) add("operating_company_id", b.operating_company_id ?? null);
    if ("address" in b) add("address_line1", b.address ?? null);
    // VENDOR-CUSTOMER-QBO-PARITY (migration 202607110230, HELD)
    if ("address_line2" in b) add("address_line2", b.address_line2 ?? null);
    if ("city" in b) add("city", b.city ?? null);
    if ("state" in b) add("state", b.state ?? null);
    if ("postal_code" in b) add("postal_code", b.postal_code ?? null);
    if ("country" in b) add("country", b.country ?? null);
    if ("mc_number" in b) add("mc_number", b.mc_number ?? null);
    if ("dot_number" in b) add("dot_number", b.dot_number ?? null);
    if ("eligible_1099" in b) add("eligible_1099", b.eligible_1099);
    if ("website" in b) add("website", b.website ?? null);
    if ("print_on_check_name" in b) add("print_on_check_name", b.print_on_check_name ?? null);
    if ("payment_terms_id" in b) add("payment_terms_id", b.payment_terms_id ?? null);
    if ("default_expense_account_id" in b) add("default_expense_account_id", b.default_expense_account_id ?? null);
    if ("account_number" in b) add("account_number", b.account_number ?? null);
    if ("tax_id" in b) add("tax_id", b.tax_id ?? null);
    if ("notes" in b) add("notes", b.notes ?? null);
    if ("deactivated_at" in b) add("deactivated_at", b.deactivated_at ?? null);
    add("updated_by_user_id", authUser.uuid);

    values.push(parsedParams.data.id);
    const idIdx = values.length;
    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        const oldRes = await client.query(
          `
            SELECT ${VENDOR_SELECT_COLUMNS}
            FROM mdata.vendors
            WHERE id = $1
            LIMIT 1
          `,
          [parsedParams.data.id]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;

        const res = await client.query(
          `
            UPDATE mdata.vendors
            SET ${setParts.join(", ")}
            WHERE id = $${idIdx}
            RETURNING ${VENDOR_SELECT_COLUMNS}
          `,
          values
        );
        const updatedRow = res.rows[0] ?? null;
        if (!updatedRow) return null;

        const changes = buildPatchChanges(
          b as unknown as Record<string, unknown>,
          oldRow as Record<string, unknown>,
          updatedRow as Record<string, unknown>
        );
        await appendCrudAudit(client, authUser.uuid, "mdata.vendors.updated", {
          resource_id: updatedRow.id,
          resource_type: "mdata.vendors",
          changes,
        });
        await enqueueTmsVendorPushRequested(client, {
          operating_company_id: String(updatedRow.operating_company_id),
          vendor_id: String(updatedRow.id),
          operation: "update",
        });
        return updatedRow;
      });
      if (!updated) return reply.code(404).send({ error: "mdata_vendor_not_found" });
      return updated;
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        return reply.code(409).send({ error: "mdata_vendor_conflict" });
      }
      throw err;
    }
  });

  app.post("/api/v1/mdata/vendors/:id/deactivate", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const deactivated = await withCurrentUser(authUser.uuid, async (client) => {
      const oldRes = await client.query(
        `
          SELECT id, operating_company_id, deactivated_at
          FROM mdata.vendors
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      const oldRow = oldRes.rows[0] ?? null;
      if (!oldRow) return null;

      let deactivatedAt = oldRow.deactivated_at as string | null;
      let wasAlreadyDeactivated = oldRow.deactivated_at !== null;
      if (!wasAlreadyDeactivated) {
        const res = await client.query(
          `
            UPDATE mdata.vendors
            SET deactivated_at = now(), updated_by_user_id = $2
            WHERE id = $1
              AND deactivated_at IS NULL
            RETURNING id, deactivated_at
          `,
          [parsedParams.data.id, authUser.uuid]
        );
        deactivatedAt = (res.rows[0]?.deactivated_at as string | undefined) ?? deactivatedAt;
        wasAlreadyDeactivated = false;
      }

      await appendCrudAudit(client, authUser.uuid, "mdata.vendors.deactivated", {
        resource_id: oldRow.id,
        resource_type: "mdata.vendors",
        was_already_deactivated: wasAlreadyDeactivated,
      });
      await enqueueTmsVendorPushRequested(client, {
        operating_company_id: String(oldRow.operating_company_id ?? ""),
        vendor_id: String(oldRow.id),
        operation: "update",
      });

      return { id: oldRow.id, deactivated_at: deactivatedAt, was_already_deactivated: wasAlreadyDeactivated };
    });
    if (!deactivated) return reply.code(404).send({ error: "mdata_vendor_not_found" });
    return deactivated;
  });

  app.get("/api/v1/mdata/vendors/:id/classifications", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = detailQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const classifications = await withCurrentUser(authUser.uuid, async (client) => {
      const operatingCompanyId = await resolveOperatingCompanyId(
        client,
        authUser.uuid,
        parsedQuery.data.operating_company_id
      );
      if (!operatingCompanyId) return null;
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
      const vendorRes = await client.query(
        `SELECT id FROM mdata.vendors WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
        [parsedParams.data.id, operatingCompanyId]
      );
      if (vendorRes.rows.length === 0) return undefined;
      return listActiveVendorClassifications(client, parsedParams.data.id, operatingCompanyId);
    });

    if (classifications === null) {
      return reply.code(400).send({ error: "operating_company_id_required" });
    }
    if (classifications === undefined) {
      return reply.code(404).send({ error: "mdata_vendor_not_found" });
    }
    return reply.send({ classifications });
  });
}
