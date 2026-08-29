import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ensureDriverVendor } from "./ensure-driver-vendor.shared.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { randomBytes } from "crypto";
import { z } from "zod";

type DriverConflictBody = {
  error: string;
  message: string;
  fieldErrors?: Record<string, string>;
};

// DRIVER-F7250-CONFLICT-MISLABELS-PHONE-AS-CDL — PostgreSQL 23505 is not synonymous with CDL.
// Driver create also provisions/reuses identity.users, whose phone/email indexes can raise the same
// code. Report the actual constrained field and keep unknown future constraints honest/generic.
export function mapDriverUniqueConflict(error: unknown): DriverConflictBody {
  const constraint = String((error as { constraint?: unknown } | null)?.constraint ?? "").toLowerCase();
  if (constraint.includes("phone")) {
    return { error: "identity_user_phone_conflict", message: "Phone number is already in use", fieldErrors: { phone: "Already in use" } };
  }
  if (constraint.includes("email")) {
    return { error: "identity_user_email_conflict", message: "Email address is already in use", fieldErrors: { email: "Already in use" } };
  }
  if (constraint.includes("curp")) {
    return { error: "mdata_driver_curp_conflict", message: "CURP is already in use", fieldErrors: { curp: "Already in use" } };
  }
  if (constraint.includes("ine")) {
    return { error: "mdata_driver_ine_conflict", message: "INE number is already in use", fieldErrors: { ine_number: "Already in use" } };
  }
  return { error: "mdata_driver_conflict", message: "Driver conflicts with an existing record" };
}
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { resolveOperatingCompanyId } from "../auth/operating-company-scope.js";
import { sendZodValidation } from "../lib/zod-http-error.js";
import { enqueueEmail } from "../email/queue.service.js";
import { findReturningDriverMatches } from "./driver-returning-detection.routes.js";
import { findRosterDuplicates } from "./driver-roster-duplicate.service.js";
import { emitMasterDataCreatedSpineEvent } from "./master-data-spine-emit.js";
import { buildDriverAggregate } from "./driver-aggregate.service.js";
import { registerDriverDefaultTruckRoutes } from "./driver-default-truck.routes.js";
import { registerDriverMessagesRoutes } from "./driver-messages.routes.js";
import {
  provisionDriverAdvanceSubAccount,
  provisionDriverEscrowSubAccount,
  upsertDriverAdvanceAccountLink,
  upsertDriverEscrowAccountLink,
} from "../accounting/driver-subaccount-provision.service.js";
import { registerDriverPdfExportRoutes } from "./driver-pdf-export.routes.js";
import { registerDriverTrainingRoutes } from "./driver-training.routes.js";
import { registerDriverW8benRoutes } from "./driver-w8ben.routes.js";
import { EXCLUDE_PSEUDO_DRIVERS_SQL } from "./driver-pseudo-user.js";
import { EXCLUDE_ARCHIVED_DRIVERS_SQL } from "./test-seed-archive.js";
import { ensureDriverAppAccess } from "./driver-app-access.service.js";
import { enqueueOutboxEvent } from "../outbox/enqueue-outbox-event.js";
import { isWhatsappChannelConfigured } from "../outbox/handlers/twilio-channel-config.js";
import {
  DriverVendorMissingError,
  resolveDriverVendorLink,
} from "../accounting/driver-vendor-link.service.js";

const DRIVER_STATUS_VALUES = ["Active", "Probation", "Inactive", "Terminated", "OnLeave"] as const;
export const driverStatusSchema = z.enum(DRIVER_STATUS_VALUES);

// AUTO-01-FOLLOWUP: the LIST query `?status=` tolerates input casing — a case variant of a REAL status
// (e.g. "active", "ACTIVE", "aCtIvE") resolves to its canonical casing BEFORE validation, so it filters
// instead of 400ing. A value that is NOT a case variant of a real status (e.g. "all") is passed through
// unchanged and still fails the enum → 400 (correct; "all" is not a real status). The enum and the stored
// values are unchanged; the create/update write bodies keep strict casing (only the read filter is lenient).
export function normalizeDriverListStatusInput(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const canonical = DRIVER_STATUS_VALUES.find((status) => status.toLowerCase() === value.toLowerCase());
  return canonical ?? value;
}
const listStatusSchema = z.preprocess(normalizeDriverListStatusInput, driverStatusSchema);
const cdlClassSchema = z.enum(["A", "B", "C"]);
const milesBasisSchema = z.enum(["short_miles", "practical_miles"]);
const preferredLanguageSchema = z.enum(["en", "es"]);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const e164PhoneSchema = z.string().regex(/^\+\d{10,15}$/, "phone must be E.164 format (e.g., +19565550001)");
const curpSchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9]{18}$/i, "CURP must be 18 alphanumeric characters");
const ineSchema = z.string().trim().min(8, "INE must be between 8 and 20 characters").max(20, "INE must be between 8 and 20 characters");

/**
 * CURP → date of birth. Characters 5-10 of a CURP are the birth date as YYMMDD
 * (MUGJ`840525`HTSXNR06 → 1984-05-25). Century is disambiguated by position 17: a DIGIT means
 * 1900s (CURPs issued before 2000), a LETTER means 2000s. That is the RENAPO rule, not a guess —
 * and it is why a naive `19${yy}` would misread every driver born after 1999.
 *
 * Returns null when the CURP is absent or the embedded date is not a real calendar date, so a
 * malformed CURP degrades to "no DOB derived" rather than writing a wrong statutory field.
 */
export function deriveDobFromCurp(curp: string | null | undefined): string | null {
  const raw = (curp ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{18}$/.test(raw)) return null;
  const yy = raw.slice(4, 6);
  const mm = raw.slice(6, 8);
  const dd = raw.slice(8, 10);
  if (!/^\d{2}$/.test(yy) || !/^\d{2}$/.test(mm) || !/^\d{2}$/.test(dd)) return null;
  const century = /\d/.test(raw[16]!) ? "19" : "20";
  const iso = `${century}${yy}-${mm}-${dd}`;
  // Round-trip through Date to reject 1984-02-31 and friends.
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

/**
 * 49 CFR 391.21(b)(2) makes date of birth a statutory element of the driver's application for
 * employment, so it is not an optional nicety. When BOTH a CURP and an explicit DOB are supplied
 * they must agree: the CURP is a government-issued identifier and a DOB contradicting it is a data
 * error, never a correction. Fail loud rather than silently preferring one.
 */
export class DriverDobCurpMismatchError extends Error {
  constructor(readonly supplied: string, readonly derived: string) {
    super(`date_of_birth ${supplied} contradicts the CURP-derived date ${derived}`);
    this.name = "DriverDobCurpMismatchError";
  }
}

export function resolveDateOfBirth(input: {
  date_of_birth?: string | null;
  curp?: string | null;
}): string | null {
  const derived = deriveDobFromCurp(input.curp);
  const supplied = input.date_of_birth?.trim() || null;
  if (supplied && derived && supplied !== derived) {
    throw new DriverDobCurpMismatchError(supplied, derived);
  }
  return supplied ?? derived;
}

/**
 * ACCT-F209 — the driver list cap made real drivers UNASSIGNABLE, not merely paginated.
 *
 * The default was 50 with `ORDER BY created_at DESC`, so the endpoint returned the 50 NEWEST drivers
 * and silently dropped the rest. Measured on prod for USMCA: 89 listable rows, 50 returned, and of the
 * 27 genuinely active drivers only 17 fell inside the window — 10 REAL, ACTIVE DRIVERS WERE UNREACHABLE
 * in the Book Load picker. Because the sort is newest-first, the drivers hidden were the longest-tenured
 * ones, which is the opposite of who a dispatcher is most likely to be looking for.
 *
 * That is what made this a blocker rather than an inconvenience: combined with a search that could not
 * match a full name (ACCT-F203), there was NO route to those drivers at all — neither by scrolling nor
 * by typing. Fixing search alone would have left the ten unreachable to anyone who did not already know
 * to search; fixing the cap alone would have left them findable only by scrolling. Both were required.
 *
 * 250/1000 is sized against live rosters with headroom: TRANSP 89 listable and USMCA 89 today, and the
 * ceiling is a guard against an unbounded scan, not a product limit. Pagination still works — offset is
 * untouched — this only changes what a caller gets when it does not ask.
 */
const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(250),
  offset: z.coerce.number().int().min(0).default(0),
  status: listStatusSchema.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  operating_company_id: z.string().uuid().optional(),
  include_system: z.coerce.boolean().optional().default(false),
});

const idParamSchema = z.object({ id: z.string().uuid() });
/** dry_run defaults TRUE — a bulk outward action must be previewed before it messages real drivers. */
const bulkInviteBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_ids: z.array(z.string().uuid()).optional(),
  dry_run: z.boolean().default(true),
});

const driverAggregateQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  // The by-id route also serves the lightweight canonical driver row. Requiring an explicit
  // aggregate opt-in prevents ordinary profile/link pickers from running the full DQ/HOS/docs
  // aggregate query just because they correctly supplied their company scope.
  aggregate: z.literal("true"),
});

// Simple by-id GET (non-aggregate branch): operating_company_id is OPTIONAL here. When present it
// seeds the scope resolution; when absent we fall back to the caller's default/first-accessible
// company. Either way the driver is matched by home company OR an active driver_company_authorization
// (mirrors buildDriverAggregate) so a driver the caller is authorized to see is never a false 404.
const driverByIdQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
});

const createDriverBodySchema = z.object({
  identity_user_id: z.string().uuid().optional(),
  create_login_user: z.boolean().optional().default(false),
  operating_company_id: z.string().uuid().optional(),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  phone: e164PhoneSchema,
  email: z
    .string()
    .email()
    .refine((v) => v === v.toLowerCase(), { message: "email must be lowercase" })
    .optional(),
  cdl_number: z.string().trim().max(100).optional(),
  cdl_state: z.string().trim().max(50).optional(),
  cdl_class: cdlClassSchema.optional(),
  cdl_expires_at: isoDateSchema.optional(),
  hire_date: isoDateSchema.optional(),
  pay_basis: milesBasisSchema.optional(),
  dot_medical_expires_at: isoDateSchema.optional(),
  hazmat_endorsement_expires_at: isoDateSchema.optional(),
  visa_type: z.string().trim().max(100).optional(),
  visa_number: z.string().trim().max(100).optional(),
  visa_expires_at: isoDateSchema.optional(),
  passport_number: z.string().trim().max(100).optional(),
  passport_expires_at: isoDateSchema.optional(),
  // 49 CFR 391.21(b)(2) — date of birth is a statutory element of the driver application. Accepted
  // explicitly AND derivable from the CURP; resolveDateOfBirth() rejects a supplied DOB that
  // contradicts the CURP rather than silently picking one.
  date_of_birth: isoDateSchema.optional(),
  passport_country: z.string().trim().max(2).optional(),
  // 49 CFR 391.21(b)(5) requires the licence(s) held. For B-1 Mexican drivers operating under
  // reciprocity the operative credential is the Licencia Federal, NOT a US CDL — cdl_number above
  // is the US credential and cannot carry it.
  mexican_license_number: z.string().trim().max(100).optional(),
  mexican_license_expiration: isoDateSchema.optional(),
  ine_number: ineSchema.optional(),
  curp: curpSchema.optional(),
  mx_address_line1: z.string().trim().max(200).optional(),
  mx_address_line2: z.string().trim().max(200).optional(),
  mx_city: z.string().trim().max(120).optional(),
  mx_state: z.string().trim().max(120).optional(),
  mx_postal_code: z.string().trim().max(20).optional(),
  emergency_contact_name: z.string().trim().max(160).optional(),
  emergency_contact_relationship: z.string().trim().max(80).optional(),
  emergency_contact_phone_primary: z.string().trim().max(40).optional(),
  emergency_contact_phone_alternate: z.string().trim().max(40).optional(),
  emergency_contact_address: z.string().trim().max(300).optional(),
  emergency_contact_notes: z.string().trim().max(2000).optional(),
  preferred_language: preferredLanguageSchema.optional(),
  // DRIVER-DEFAULT-PARITY (owner ruling 2026-08-02): a newly created driver defaults to Probation,
  // NOT Active. A brand-new driver must not be instantly dispatchable — the dispatch picker requires
  // status='Active' (driver-optimizer.service.ts, dispatch-refinements.service.ts) and that gate is
  // correct and deliberately unchanged.
  //
  // This line previously defaulted to "Active" while CreateDriverModal.tsx defaulted to "Probation",
  // so the SAME action produced a DIFFERENT status depending on whether it came from the UI or the
  // API: a UI-created driver was silently unassignable, an API/seed-created one was dispatchable
  // immediately. The divergence was the defect, not the gate. Both ends now say Probation.
  status: driverStatusSchema.default("Probation"),
  /**
   * OUTBOUND CONSENT — default FALSE. Creating a driver record must not message a human as a side
   * effect; the caller opts in explicitly. Omitted = record only, no WhatsApp, no live invite link.
   */
  send_invite: z.boolean().optional().default(false),
  /**
   * QA/battery marker. A sample driver never triggers an outbound invite regardless of send_invite,
   * and is distinguishable and cleanable afterwards.
   */
  is_sample_data: z.boolean().optional().default(false),
  notes: z.string().trim().max(2000).optional(),
  override_returning_warning: z.boolean().optional().default(false),
  /**
   * Explicitly acknowledge that an ACTIVE driver already on this entity's roster matches. Separate
   * from override_returning_warning: that one answers "we employed this person before", this one
   * answers "this person is on the roster right now".
   */
  override_duplicate_warning: z.boolean().optional(),
  prior_driver_id: z.string().uuid().optional(),
  is_rehire: z.boolean().optional().default(false),
});

const updateDriverBodySchema = z
  .object({
    identity_user_id: z.string().uuid().nullable().optional(),
    first_name: z.string().trim().min(1).max(100).optional(),
    last_name: z.string().trim().min(1).max(100).optional(),
    phone: z.string().trim().min(1).max(50).optional(),
    email: z
      .string()
      .email()
      .refine((v) => v === v.toLowerCase(), { message: "email must be lowercase" })
      .nullable()
      .optional(),
    cdl_number: z.string().trim().max(100).nullable().optional(),
    cdl_state: z.string().trim().max(50).nullable().optional(),
    cdl_class: cdlClassSchema.nullable().optional(),
    cdl_expires_at: isoDateSchema.nullable().optional(),
    hire_date: isoDateSchema.nullable().optional(),
    pay_basis: milesBasisSchema.optional(),
    dot_medical_expires_at: isoDateSchema.nullable().optional(),
    hazmat_endorsement_expires_at: isoDateSchema.nullable().optional(),
    endorsement_h: z.boolean().optional(),
    visa_type: z.string().trim().max(100).nullable().optional(),
    visa_number: z.string().trim().max(100).nullable().optional(),
    visa_expires_at: isoDateSchema.nullable().optional(),
    passport_number: z.string().trim().max(100).nullable().optional(),
    passport_expires_at: isoDateSchema.nullable().optional(),
    ine_number: ineSchema.nullable().optional(),
    curp: curpSchema.nullable().optional(),
    mx_address_line1: z.string().trim().max(200).nullable().optional(),
    mx_address_line2: z.string().trim().max(200).nullable().optional(),
    mx_city: z.string().trim().max(120).nullable().optional(),
    mx_state: z.string().trim().max(120).nullable().optional(),
    mx_postal_code: z.string().trim().max(20).nullable().optional(),
    emergency_contact_name: z.string().trim().max(160).nullable().optional(),
    emergency_contact_relationship: z.string().trim().max(80).nullable().optional(),
    emergency_contact_phone_primary: z.string().trim().max(40).nullable().optional(),
    emergency_contact_phone_alternate: z.string().trim().max(40).nullable().optional(),
    emergency_contact_address: z.string().trim().max(300).nullable().optional(),
    emergency_contact_notes: z.string().trim().max(2000).nullable().optional(),
    preferred_language: preferredLanguageSchema.optional(),
    status: driverStatusSchema.optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    deactivated_at: isoDateSchema.nullable().optional(),
    qbo_vendor_id: z.string().trim().max(120).nullable().optional(),
    qbo_class_id: z.string().trim().max(120).nullable().optional(),
    operating_company_id: z.string().uuid().nullable().optional(),
    settlement_auto_pay_enabled: z.boolean().optional(),
    fast_card_number: z.string().trim().max(100).nullable().optional(),
    fast_card_expiration: isoDateSchema.nullable().optional(),
    sentri_member: z.boolean().optional(),
    sentri_expiration: isoDateSchema.nullable().optional(),
    twic_card_number: z.string().trim().max(100).nullable().optional(),
    twic_expiration: isoDateSchema.nullable().optional(),
    mexican_license_number: z.string().trim().max(100).nullable().optional(),
    mexican_license_expiration: isoDateSchema.nullable().optional(),
    // ACCT-F18 / banking-b4: Option-B RECOMMENDATION ONLY — pre-fills categorize account; never auto-posts.
    default_expense_account_id: z.string().uuid().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return sendZodValidation(reply, error);
}

function isWriteRole(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager";
}

function isOwnerOrAdmin(role: string): boolean {
  return role === "Owner" || role === "Administrator";
}

function statusDisablesDriverLogin(status: string): boolean {
  return status === "Inactive" || status === "Terminated";
}

function driverIdentityMatches(
  prior: { curp: string | null; cdl_number: string | null; cdl_state: string | null },
  incoming: { curp?: string; cdl_number?: string; cdl_state?: string }
): "curp" | "cdl" | null {
  const normalizedPriorCurp = prior.curp?.trim().toUpperCase() ?? "";
  const normalizedIncomingCurp = incoming.curp?.trim().toUpperCase() ?? "";
  if (normalizedPriorCurp && normalizedIncomingCurp && normalizedPriorCurp === normalizedIncomingCurp) {
    return "curp";
  }

  const normalizedPriorCdlNumber = prior.cdl_number?.trim().toUpperCase() ?? "";
  const normalizedPriorCdlState = prior.cdl_state?.trim().toUpperCase() ?? "";
  const normalizedIncomingCdlNumber = incoming.cdl_number?.trim().toUpperCase() ?? "";
  const normalizedIncomingCdlState = incoming.cdl_state?.trim().toUpperCase() ?? "";
  if (
    normalizedPriorCdlNumber &&
    normalizedPriorCdlState &&
    normalizedIncomingCdlNumber &&
    normalizedIncomingCdlState &&
    normalizedPriorCdlNumber === normalizedIncomingCdlNumber &&
    normalizedPriorCdlState === normalizedIncomingCdlState
  ) {
    return "cdl";
  }

  return null;
}

// Module-level driver-invite env + sender. Moved out of registerDriverRoutes so the extracted
// canonical create (createDriverCanonical) — used by BOTH the office POST /mdata/drivers route and the
// maintenance POST /maintenance/drivers route (DRIVER-1 single-code-path fix) — can send invites without
// re-implementing the email plumbing per call site.
const driverInviteBaseUrl = (process.env.DRIVER_PWA_BASE_URL || "https://driver.ih35dispatch.com").replace(/\/$/, "");
const supportEmail = process.env.EMAIL_FROM_DISPATCH || "dispatch@ih35dispatch.com";

async function sendDriverInvite(params: {
  to: string;
  driverName: string;
  loginUrl: string;
  actorUserId: string | null;
  recipientUserUuid?: string | null;
  operatingCompanyId: string;
}) {
  const { queueId } = await enqueueEmail({
    operatingCompanyId: params.operatingCompanyId,
    toAddresses: [params.to],
    subject: "Welcome to IH 35 Dispatch — your driver app login",
    templateKey: "driver-invite",
    templateVars: {
      driverName: params.driverName,
      loginUrl: params.loginUrl,
      ownerName: "Jorge",
      supportEmail,
    },
    queuedByUserId: params.actorUserId,
  });
  return { id: queueId };
}

export type CreateDriverCanonicalResult =
  | { status: 201; body: Record<string, unknown> }
  | { status: number; body: { error: string; [key: string]: unknown } };

export interface CreateDriverCanonicalOptions {
  // Non-onboarding company assignment: set mdata.drivers.operating_company_id to this company WITHOUT
  // triggering the onboarding/invite flow (used by the maintenance quick-add surface, which assigns a
  // company but never invites). Validated against org.user_accessible_company_ids(). Ignored when the
  // input carries operating_company_id (which means an explicit onboarding request).
  assignCompanyId?: string | null;
  // Whether to auto-provision the per-driver advance/escrow sub-accounts (catalogs.accounts writes).
  // Defaults ON (the office hire flow). The maintenance surface passes false to preserve its historical
  // non-financial behavior; provisioning-on-maintenance-create is a separate (financial-cluster) follow-up.
  provisionSubAccounts?: boolean;
}

/**
 * DRIVER-1 (single canonical driver-create code path).
 *
 * The ONE place a driver row is INSERTed from an office/maintenance request. It carries every hire-time
 * guard: returning-driver detection, rehire-chain matching, identity-user link/create + invite, entity
 * defaulting, CDL-conflict handling, and rich audit. Both POST /api/v1/mdata/drivers and
 * POST /api/v1/maintenance/drivers delegate here so neither surface can drift or bypass a guard again.
 *
 * Returns a discriminated { status, body } instead of writing to a FastifyReply, so each route can shape
 * its own response envelope. The caller has already validated the body with createDriverBodySchema (office)
 * or mapped its own validated body into this shape (maintenance).
 */
export async function createDriverCanonical(
  authUser: { uuid: string; role: string },
  input: z.infer<typeof createDriverBodySchema>,
  options: CreateDriverCanonicalOptions = {}
): Promise<CreateDriverCanonicalResult> {
  const b = input;
  const normalizedEmail = b.email?.toLowerCase() ?? null;
  const provisionSubAccounts = options.provisionSubAccounts !== false;

  try {
    const created = await withCurrentUser(authUser.uuid, async (client) => {
      if (b.prior_driver_id && !b.override_returning_warning) {
        return { error: "override_required_for_rehire" as const };
      }

      // ROSTER duplicate check — asks "is this person already active on this roster?", which the
      // returning-driver check below does NOT ask (it matches event snapshots, so a first-time entry
      // has nothing to match). On prod this is how three ACTIVE same-name pairs reached TRANSP,
      // including one with a byte-identical CDL.
      if (b.operating_company_id && b.override_duplicate_warning !== true) {
        const rosterDuplicates = await findRosterDuplicates(client, {
          operating_company_id: b.operating_company_id,
          first_name: b.first_name,
          last_name: b.last_name,
          cdl_number: b.cdl_number,
          cdl_state: b.cdl_state,
          curp: b.curp,
        });
        if (rosterDuplicates.length > 0) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "mdata.drivers.roster_duplicate_detected",
            {
              resource_type: "mdata.drivers",
              operating_company_id: b.operating_company_id,
              attempted_name: [b.first_name, b.last_name].filter(Boolean).join(" "),
              match_count: rosterDuplicates.length,
              matches: rosterDuplicates,
            },
            "warning",
            "BT-1-DRIVER-SAFETY-FILE"
          );
          return { error: "roster_duplicate_detected" as const, duplicates: rosterDuplicates };
        }
      }

      const returningDetection = await findReturningDriverMatches(client, {
        curp: b.curp,
        cdl_number: b.cdl_number,
        cdl_state: b.cdl_state,
      });
      if (returningDetection.returning_driver) {
        await appendCrudAudit(
          client,
          authUser.uuid,
          "mdata.drivers.returning_driver_detected",
          {
            resource_type: "mdata.drivers",
            match_count: returningDetection.matched_events.length,
            severity_summary: returningDetection.severity_summary,
            matched_events: returningDetection.matched_events,
          },
          returningDetection.severity_summary.severe_count > 0 ? "warning" : "info",
          "BT-1-DRIVER-SAFETY-FILE"
        );
        if (!b.override_returning_warning) {
          return {
            error: "returning_driver_detected" as const,
            detection: returningDetection,
          };
        }
      }

      const rehireState: {
        prior_driver_id: string | null;
        is_rehire: boolean;
        rehire_count: number;
        matched_via: "curp" | "cdl" | null;
      } = {
        prior_driver_id: null,
        is_rehire: false,
        rehire_count: 0,
        matched_via: null,
      };

      if (b.override_returning_warning && b.prior_driver_id) {
        const priorRes = await client.query<{
          id: string;
          status: string;
          curp: string | null;
          cdl_number: string | null;
          cdl_state: string | null;
          rehire_count: number | null;
        }>(
          `
              SELECT id, status, curp, cdl_number, cdl_state, rehire_count
              FROM mdata.drivers
              WHERE id = $1
                AND operating_company_id = $2::uuid
              LIMIT 1
            `,
          [b.prior_driver_id, b.operating_company_id]
        );
        const priorDriver = priorRes.rows[0] ?? null;
        if (!priorDriver) {
          return { error: "prior_driver_not_found" as const };
        }
        if (priorDriver.status !== "Terminated") {
          return { error: "prior_driver_not_terminated" as const };
        }

        const matchedVia = driverIdentityMatches(priorDriver, {
          curp: b.curp,
          cdl_number: b.cdl_number,
          cdl_state: b.cdl_state,
        });
        if (!matchedVia) {
          return { error: "prior_driver_identity_mismatch" as const };
        }

        // Hardening: require prior_driver_id to be the MOST-RECENT terminated record in this
        // identity's full rehire chain — not an older link. Walk the whole chain by identity
        // (curp / cdl), not just the immediate prior. Linking to a non-tip record would fork the
        // chain (two drivers pointing at the same prior) and miscount rehires.
        const tipFilters: string[] = [];
        const tipValues: unknown[] = [];
        const ncurp = b.curp?.trim().toUpperCase();
        const ncdlNumber = b.cdl_number?.trim().toUpperCase();
        const ncdlState = b.cdl_state?.trim().toUpperCase();
        if (ncurp) {
          tipValues.push(ncurp);
          tipFilters.push(`upper(trim(curp)) = $${tipValues.length}`);
        }
        if (ncdlNumber && ncdlState) {
          tipValues.push(ncdlNumber);
          tipValues.push(ncdlState);
          tipFilters.push(
            `(upper(trim(cdl_number)) = $${tipValues.length - 1} AND upper(trim(cdl_state)) = $${tipValues.length})`
          );
        }
        let chainTip: { id: string; rehire_count: number | null } = priorDriver;
        if (tipFilters.length > 0) {
          tipValues.push(b.operating_company_id);
          const tipRes = await client.query<{ id: string; rehire_count: number | null }>(
            `
                SELECT id, rehire_count
                FROM mdata.drivers
                WHERE status = 'Terminated'
                  AND (${tipFilters.join(" OR ")})
                  AND operating_company_id = $${tipValues.length}::uuid
                ORDER BY rehire_count DESC NULLS LAST, created_at DESC
                LIMIT 1
              `,
            tipValues
          );
          chainTip = tipRes.rows[0] ?? priorDriver;
        }
        if (String(chainTip.id) !== String(priorDriver.id)) {
          return { error: "prior_driver_not_most_recent_in_chain" as const };
        }

        rehireState.prior_driver_id = priorDriver.id;
        rehireState.is_rehire = true;
        rehireState.rehire_count = Number(chainTip.rehire_count ?? priorDriver.rehire_count ?? 0) + 1;
        rehireState.matched_via = matchedVia;
      }

      let identityUserId = b.identity_user_id ?? null;
      let linkedUserEventType: "existing_user" | "new_user_created" | null = null;
      let operatingCompany: { id: string; legal_name: string } | null = null;
      let resolvedOperatingCompanyId: string | null = null;
      const onboardingEnabled = Boolean(b.operating_company_id);

      if (onboardingEnabled) {
        const companyRes = await client.query<{ id: string; legal_name: string }>(
          `
              SELECT id, legal_name
              FROM org.companies
              WHERE ($1::uuid IS NULL OR id = $1)
                AND id IN (SELECT org.user_accessible_company_ids())
                AND deactivated_at IS NULL
                AND is_active = true
              ORDER BY legal_name
              LIMIT 1
            `,
          [b.operating_company_id]
        );
        operatingCompany = companyRes.rows[0] ?? null;
        if (!operatingCompany) {
          return { error: "operating_company_not_found" as const };
        }
        resolvedOperatingCompanyId = operatingCompany.id;
        // Cross-tenant guard: operating_company_id is CALLER-SUPPLIED (request body). Assert the
        // authed user is a member of that company on the SAME client BEFORE any tenant GUC is set
        // (same pattern as the sub-account route below). verify:company-membership-assert enforces this.
        await assertCompanyMembership(client, authUser.uuid, resolvedOperatingCompanyId);

        await client.query("SET LOCAL app.bypass_rls = 'lucia'");

        if (!identityUserId) {
          const existingUserRes = await client.query<{ id: string }>(
            `
                SELECT id
                FROM identity.users
                WHERE phone = $1
                   OR ($2::text IS NOT NULL AND lower(email) = $2)
                ORDER BY id
                LIMIT 2
              `,
            [b.phone, normalizedEmail]
          );
          const existingUsers = existingUserRes.rows;
          if (existingUsers.length > 1 && existingUsers[0].id !== existingUsers[1].id) {
            return { error: "identity_user_conflict_credentials" as const };
          }
          const existingUser = existingUsers[0] ?? null;
          if (existingUser) {
            identityUserId = existingUser.id;
            linkedUserEventType = "existing_user";
          } else {
            try {
              const userRes = await client.query<{ id: string }>(
                `
                    INSERT INTO identity.users (email, role, phone, default_company_id, deactivated_at)
                    VALUES ($1, 'Driver', $2, $3, NULL)
                    RETURNING id
                  `,
                [normalizedEmail, b.phone, resolvedOperatingCompanyId]
              );
              identityUserId = userRes.rows[0]?.id ?? null;
              linkedUserEventType = "new_user_created";
            } catch (err) {
              const code = (err as { code?: string }).code;
              if (code !== "23505") throw err;
              const conflictUserRes = await client.query<{ id: string }>(
                `
                    SELECT id
                    FROM identity.users
                    WHERE phone = $1
                       OR ($2::text IS NOT NULL AND lower(email) = $2)
                    ORDER BY id
                    LIMIT 2
                  `,
                [b.phone, normalizedEmail]
              );
              const conflictUsers = conflictUserRes.rows;
              if (conflictUsers.length > 1 && conflictUsers[0].id !== conflictUsers[1].id) {
                return { error: "identity_user_conflict_credentials" as const };
              }
              identityUserId = conflictUsers[0]?.id ?? null;
              linkedUserEventType = "existing_user";
            }
          }
        }
        if (!identityUserId) throw new Error("failed_to_resolve_identity_user");

        await client.query(
          `
              UPDATE identity.users
              SET default_company_id = $2,
                  role = 'Driver',
                  phone = $3,
                  email = COALESCE($4, email),
                  preferred_language = COALESCE($5, preferred_language, 'en'),
                  deactivated_at = NULL
              WHERE id = $1
            `,
          [identityUserId, resolvedOperatingCompanyId, b.phone, normalizedEmail, b.preferred_language ?? null]
        );

        await client.query(
          `
              INSERT INTO org.user_company_access (user_id, company_id, granted_by_user_id, deactivated_at, granted_at)
              VALUES ($1, $2, $3, NULL, now())
              ON CONFLICT (user_id, company_id)
              DO UPDATE
              SET deactivated_at = NULL,
                  granted_by_user_id = EXCLUDED.granted_by_user_id,
                  granted_at = now()
              WHERE org.user_company_access.deactivated_at IS NOT NULL
            `,
          [identityUserId, resolvedOperatingCompanyId, authUser.uuid]
        );
      } else if (b.create_login_user) {
        const existingUserRes = await client.query<{ id: string }>(
          `
              SELECT id
              FROM identity.users
              WHERE phone = $1
                 OR ($2::text IS NOT NULL AND lower(email) = $2)
              ORDER BY id
              LIMIT 2
            `,
          [b.phone, normalizedEmail]
        );
        const existingUsers = existingUserRes.rows;
        if (existingUsers.length > 1 && existingUsers[0].id !== existingUsers[1].id) {
          return { error: "identity_user_conflict_credentials" as const };
        }
        if (existingUsers[0]) {
          identityUserId = existingUsers[0].id;
          linkedUserEventType = "existing_user";
        } else {
          const userRes = await client.query<{ id: string }>(
            `
                INSERT INTO identity.users (email, role, phone)
                VALUES ($1, 'Driver', $2)
                RETURNING id
              `,
            [normalizedEmail, b.phone]
          );
          identityUserId = userRes.rows[0]?.id ?? null;
          linkedUserEventType = "new_user_created";
        }
        if (!identityUserId) throw new Error("failed_to_create_identity_user");

        await client.query(
          `
              UPDATE identity.users
              SET role = 'Driver',
                  phone = $2,
                  email = COALESCE($3, email),
                  preferred_language = COALESCE($4, preferred_language, 'en'),
                  deactivated_at = NULL
              WHERE id = $1
            `,
          [identityUserId, b.phone, normalizedEmail, b.preferred_language ?? null]
        );
      }

      // DRIVER-1 non-onboarding company assignment (maintenance quick-add): when the caller supplied a
      // company to assign but did NOT request onboarding, bind it here — validated the same way the
      // onboarding branch validates b.operating_company_id (must be user-accessible + active). This
      // replaces the maintenance route's old assertCompanyMembership + direct INSERT.
      if (!resolvedOperatingCompanyId && options.assignCompanyId) {
        const assignRes = await client.query<{ id: string }>(
          `
              SELECT id
              FROM org.companies
              WHERE id = $1
                AND id IN (SELECT org.user_accessible_company_ids())
                AND deactivated_at IS NULL
                AND is_active = true
              LIMIT 1
            `,
          [options.assignCompanyId]
        );
        if (!assignRes.rows[0]) {
          return { error: "operating_company_not_found" as const };
        }
        resolvedOperatingCompanyId = assignRes.rows[0].id;
      }

      // DRIVER ENTITY DEFAULT (business rule): a driver must never be entity-less. TRANSP
      // (IH 35 Transportation) is the DEFAULT driver-bearing entity (TRK is asset-holder). The
      // note here used to say "USMCA inactive" — that is stale: USMCA is active and carries 16
      // active drivers on prod today. The default is unchanged, but it is a default, not the only
      // possibility. When the caller did not supply an operating company, default to TRANSP by its
      // stable code (never a hardcoded uuid). The mdata.drivers.operating_company_id NOT NULL
      // constraint is the hard backstop if even this resolves null.
      if (!resolvedOperatingCompanyId) {
        const transpRes = await client.query<{ id: string }>(
          `SELECT id FROM org.companies WHERE code = 'TRANSP' LIMIT 1`
        );
        resolvedOperatingCompanyId = transpRes.rows[0]?.id ?? null;
      }

      const res = await client.query(
        `
            INSERT INTO mdata.drivers (
              identity_user_id, first_name, last_name, phone, email, cdl_number, cdl_state, cdl_class,
              cdl_expires_at, hire_date, pay_basis, dot_medical_expires_at, hazmat_endorsement_expires_at,
              visa_type, visa_number, visa_expires_at, passport_number, passport_expires_at, ine_number, curp,
              date_of_birth, passport_country, mexican_license_number, mexican_license_expiration,
              mx_address_line1, mx_address_line2, mx_city, mx_state, mx_postal_code,
              emergency_contact_name, emergency_contact_relationship, emergency_contact_phone_primary,
              emergency_contact_phone_alternate, emergency_contact_address, emergency_contact_notes,
              status, notes, prior_driver_id, rehire_count, is_rehire,
            operating_company_id, created_by_user_id, updated_by_user_id, is_sample_data
            ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$42,$43
            )
            RETURNING
              id, identity_user_id, first_name, last_name, phone, email, cdl_number, cdl_state, cdl_class,
              cdl_expires_at, hire_date, pay_basis, termination_date, dot_medical_expires_at, hazmat_endorsement_expires_at,
              visa_type, visa_number, visa_expires_at, passport_number, passport_expires_at, ine_number, curp,
              date_of_birth, passport_country, mexican_license_number, mexican_license_expiration,
              mx_address_line1, mx_address_line2, mx_city, mx_state, mx_postal_code,
              emergency_contact_name, emergency_contact_relationship, emergency_contact_phone_primary,
              emergency_contact_phone_alternate, emergency_contact_address, emergency_contact_notes,
              COALESCE((SELECT iu.preferred_language FROM identity.users iu WHERE iu.id = mdata.drivers.identity_user_id), 'en') AS preferred_language,
              status, notes, prior_driver_id, rehire_count, is_rehire,
            operating_company_id, created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          `,
        [
          identityUserId,
          b.first_name,
          b.last_name,
          b.phone,
          normalizedEmail,
          b.cdl_number ?? null,
          b.cdl_state ?? null,
          b.cdl_class ?? null,
          b.cdl_expires_at ?? null,
          b.hire_date ?? null,
          b.pay_basis ?? "short_miles",
          b.dot_medical_expires_at ?? null,
          b.hazmat_endorsement_expires_at ?? null,
          b.visa_type ?? null,
          b.visa_number ?? null,
          b.visa_expires_at ?? null,
          b.passport_number ?? null,
          b.passport_expires_at ?? null,
          b.ine_number ?? null,
          b.curp ?? null,
          // 391.21(b)(2): explicit DOB when given, otherwise derived from the CURP. Throws when the
          // two disagree — a government identifier is not overridden by a typed date.
          resolveDateOfBirth({ date_of_birth: b.date_of_birth, curp: b.curp }),
          b.passport_country ?? null,
          b.mexican_license_number ?? null,
          b.mexican_license_expiration ?? null,
          b.mx_address_line1 ?? null,
          b.mx_address_line2 ?? null,
          b.mx_city ?? null,
          b.mx_state ?? null,
          b.mx_postal_code ?? null,
          b.emergency_contact_name ?? null,
          b.emergency_contact_relationship ?? null,
          b.emergency_contact_phone_primary ?? null,
          b.emergency_contact_phone_alternate ?? null,
          b.emergency_contact_address ?? null,
          b.emergency_contact_notes ?? null,
          b.status,
          b.notes ?? null,
          rehireState.prior_driver_id,
          rehireState.rehire_count,
          rehireState.is_rehire,
          resolvedOperatingCompanyId,
          authUser.uuid,
          b.is_sample_data ?? false,
        ]
      );
      const row = res.rows[0];

      // DRIVER-SUBACCOUNT-AUTO-PROVISION: create BOTH per-driver sub-accounts together on hire —
      //   ASSET     "Driver Cash Advance- <Name>"   under "Driver Cash Advance" (QBO-149)
      //   LIABILITY "Damage Claim Escrow- <Name>"   under "Damage Claim Escrow" (QBO-1150040187)
      // Best-effort + idempotent: a missing parent (e.g. TRK's chart) is a graceful no-op, and any
      // error must NOT fail driver creation. Gated by options.provisionSubAccounts (maintenance opts out).
      if (provisionSubAccounts) {
        try {
          if (resolvedOperatingCompanyId) {
            // AF-1 entity scope: catalogs.accounts is per-entity. This handler runs under withCurrentUser
            // (lucia-bypass, GUC unset) — set app.operating_company_id so the sub-account parent lookup +
            // INSERTs resolve/land inside THIS driver's entity chart. Without it, AF-1 RLS returns 0 rows and
            // the sub-accounts are silently never created (a live break even for TRANSP); under bypass they
            // would nest under another entity's parent (cross-entity GL leak).
            // membership-scope-exempt: the company was resolved by a lookup restricted to `id IN (SELECT org.user_accessible_company_ids())`, which IS the membership check
            await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [resolvedOperatingCompanyId]);
            const provisionArgs = {
              operatingCompanyId: resolvedOperatingCompanyId,
              driverId: String(row.id),
              driverName: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
              actorUserId: authUser.uuid,
            };
            // Provision BOTH sub-accounts AND STORE the returned account ids against the driver so the
            // driver <-> account link is reachable both directions (no orphan). The provisioners return
            // accountId for BOTH created and already_exists — so a re-run re-wires an existing account too.
            const advanceResult = await provisionDriverAdvanceSubAccount(client, provisionArgs);
            const escrowResult = await provisionDriverEscrowSubAccount(client, {
              ...provisionArgs,
              hireDate: (row.hire_date as string | Date | null) ?? b.hire_date ?? null,
            });
            if (advanceResult.accountId) {
              await upsertDriverAdvanceAccountLink(client, {
                operatingCompanyId: resolvedOperatingCompanyId,
                driverId: String(row.id),
                coaAccountId: advanceResult.accountId,
                actorUserId: authUser.uuid,
              });
            }
            if (escrowResult.accountId) {
              await upsertDriverEscrowAccountLink(client, {
                operatingCompanyId: resolvedOperatingCompanyId,
                driverId: String(row.id),
                coaAccountId: escrowResult.accountId,
              });
            }
          }
        } catch (err) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "catalogs.accounts.auto_provision_failed",
            { resource_type: "mdata.drivers", resource_id: String(row.id), error: String((err as Error)?.message ?? err) },
            "warning",
            "DRIVER-SUBACCOUNT-AUTO-PROVISION"
          ).catch(() => undefined);
        }
      }

      // DRIVER→VENDOR (measured on prod 2026-08-09): USMCA had 16 active drivers, 13 with a payee —
      // and all 3 without were the operator-created ones. The 13 came from seeders that mint a
      // vendor; the only other minter was the on-demand POST /mdata/vendors/ensure-drivers route.
      // Nothing minted a payee on HIRE, so a driver created through this endpoint could not be
      // billed or paid: drivers are 1099 contractors and A/P reaches them only through mdata.vendors.
      //
      // Best-effort and idempotent, exactly like the sub-account provisioning above: a payee problem
      // must never fail the hire, but it must never be silent either — the failure is audited.
      if (resolvedOperatingCompanyId) {
        try {
          // Cross-tenant guard (site 2): re-assert caller-supplied company membership on this client
          // before setting the tenant GUC. verify:company-membership-assert pairs one assertion per GUC site.
          await assertCompanyMembership(client, authUser.uuid, resolvedOperatingCompanyId);
          await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [resolvedOperatingCompanyId]);
          await ensureDriverVendor(client, {
            operatingCompanyId: resolvedOperatingCompanyId,
            driverId: String(row.id),
            displayName: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
            phone: (row.phone as string | null) ?? null,
            email: (row.email as string | null) ?? null,
            actorUserId: authUser.uuid,
          });
        } catch (err) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "mdata.vendors.driver_payee_provision_failed",
            {
              resource_type: "mdata.drivers",
              resource_id: String(row.id),
              operating_company_id: resolvedOperatingCompanyId,
              error: String((err as Error)?.message ?? err),
            },
            "warning",
            "DRIVER-VENDOR-ON-HIRE"
          ).catch(() => undefined);
        }
      }

      let inviteUrl: string | null = null;
      let inviteExpiresAt: string | null = null;

      // invite-entity-gate-exempt: resolvedOperatingCompanyId came from a lookup restricted to
      // `id IN (SELECT org.user_accessible_company_ids())`, which IS the membership check — the caller
      // cannot name a company they do not belong to, so there is nothing left to assert here.
      // OUTBOUND-CONSENT GATE: creating a record must not, by itself, message a human. This block
      // mints an invite token and queues a WhatsApp send; before this gate the Save button was also
      // a Send button, so any placeholder or test driver carrying a real number got a live 72-hour
      // link. Two additional conditions, both fail-closed:
      //   send_invite  — the caller must ASK for the invite. Absent/false = record only.
      //   is_sample_data — a QA/battery driver NEVER messages anyone, even if send_invite is true.
      // The pre-existing conditions are unchanged: the invite still requires an entity and a login
      // user, because an invite with nothing to log into is meaningless.
      if (
        onboardingEnabled &&
        resolvedOperatingCompanyId &&
        operatingCompany &&
        identityUserId &&
        b.send_invite === true &&
        b.is_sample_data !== true
      ) {
        const inviteToken = randomBytes(32).toString("hex");
        inviteUrl = `${driverInviteBaseUrl}/invite?token=${inviteToken}`;
        await client.query("SET LOCAL app.bypass_rls = 'lucia'");
        const inviteRes = await client.query<{ expires_at: string }>(
          `
              INSERT INTO identity.driver_invites (
                operating_company_id,
                driver_id,
                identity_user_id,
                token,
                phone,
                expires_at,
                created_by_user_id
              )
              VALUES ($1, $2, $3, $4, $5, now() + interval '72 hours', $6)
              RETURNING expires_at
            `,
          [resolvedOperatingCompanyId, row.id, identityUserId, inviteToken, b.phone, authUser.uuid]
        );
        inviteExpiresAt = inviteRes.rows[0]?.expires_at ?? null;

        await client.query(
          `
              INSERT INTO outbox.events (event_type, payload, next_retry_at)
              VALUES ($1, $2::jsonb, now())
            `,
          [
            "twilio.whatsapp.send",
            JSON.stringify({
              to: b.phone,
              template: "driver_invite",
              variables: {
                driver_first_name: row.first_name,
                company_name: operatingCompany.legal_name,
                invite_url: inviteUrl,
                expires_hours: 72,
              },
            }),
          ]
        );

        if (normalizedEmail) {
          await enqueueOutboxEvent(
            client,
            "email.driver_invite.send",
            { aggregate_type: "identity.driver_invites", aggregate_id: String(row.id) },
            {
              operating_company_id: resolvedOperatingCompanyId,
              driver_id: String(row.id),
              to: normalizedEmail,
              driver_name: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Driver",
              login_url: inviteUrl,
              actor_user_id: authUser.uuid,
            }
          );
        }

        await appendCrudAudit(
          client,
          authUser.uuid,
          "mdata.driver.linked_to_user",
          {
            resource_id: row.id,
            resource_type: "mdata.drivers",
            driver_id: row.id,
            identity_user_id: identityUserId,
            phone: b.phone,
            event_type: linkedUserEventType,
            operating_company_id: resolvedOperatingCompanyId,
          },
          "info",
          "BT-3-DRIVER-ONBOARDING"
        );

        await appendCrudAudit(
          client,
          authUser.uuid,
          "identity.driver_invite.created",
          {
            resource_id: row.id,
            resource_type: "identity.driver_invites",
            driver_id: row.id,
            identity_user_id: identityUserId,
            phone: b.phone,
            invite_url: inviteUrl,
            expires_at: inviteExpiresAt,
            event_type: linkedUserEventType,
          },
          "info",
          "BT-3-DRIVER-ONBOARDING"
        );
      } else if (b.create_login_user && identityUserId) {
        await appendCrudAudit(
          client,
          authUser.uuid,
          linkedUserEventType === "existing_user" ? "identity.users.linked" : "identity.users.created",
          {
            resource_id: identityUserId,
            resource_type: "identity.users",
            phone: b.phone,
            email: normalizedEmail,
            role: "Driver",
            linked_driver_id: row.id,
          },
          "warning",
          "BT-1-AUTH-DRIVER"
        );
      }

      await appendCrudAudit(client, authUser.uuid, "mdata.drivers.created", {
        resource_id: row.id,
        resource_type: "mdata.drivers",
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        status: row.status,
      });
      await emitMasterDataCreatedSpineEvent(client, {
        operating_company_id: String(row.operating_company_id),
        actor_user_id: authUser.uuid,
        subject_type: "driver",
        subject_id: String(row.id),
        payload: { first_name: row.first_name, last_name: row.last_name, status: row.status },
      });

      if (returningDetection.returning_driver && b.override_returning_warning) {
        if (rehireState.is_rehire && rehireState.prior_driver_id) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "mdata.drivers.rehired",
            {
              resource_id: row.id,
              resource_type: "mdata.drivers",
              new_driver_id: row.id,
              prior_driver_id: rehireState.prior_driver_id,
              rehire_count: rehireState.rehire_count,
              matched_via: rehireState.matched_via,
            },
            "warning",
            "BT-1-REHIRE-STATES-COMBOBOX"
          );
        } else {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "mdata.drivers.returning_driver_override",
            {
              resource_id: row.id,
              resource_type: "mdata.drivers",
              match_count: returningDetection.matched_events.length,
              severity_summary: returningDetection.severity_summary,
              matched_events: returningDetection.matched_events,
            },
            "warning",
            "BT-1-DRIVER-SAFETY-FILE"
          );
        }
      }
      return {
        ...row,
        invite_url: inviteUrl,
        invite_expires_at: inviteExpiresAt,
        linked_user_event_type: linkedUserEventType,
        invite_operating_company_id: resolvedOperatingCompanyId,
      };
    });
    // 409 CONFLICT, not 400: the request is well-formed — an ACTIVE driver already on this roster
    // matches. The caller gets the matching rows so an operator can decide, and re-submits with
    // override_duplicate_warning when the two really are different people.
    if (created && typeof created === "object" && "error" in created && created.error === "roster_duplicate_detected") {
      return { status: 409, body: { error: "roster_duplicate_detected", duplicates: created.duplicates } };
    }
    if (created && typeof created === "object" && "error" in created && created.error === "returning_driver_detected") {
      return { status: 409, body: { error: "returning_driver_detected", ...created.detection } };
    }
    if (created && typeof created === "object" && "error" in created) {
      if (created.error === "identity_user_conflict_credentials") {
        return { status: 409, body: { error: "identity_user_conflict_credentials" } };
      }
      if (created.error === "operating_company_not_found") return { status: 400, body: { error: "operating_company_not_found" } };
      if (created.error === "prior_driver_not_found") return { status: 404, body: { error: "prior_driver_not_found" } };
      if (created.error === "prior_driver_not_terminated") return { status: 400, body: { error: "prior_driver_not_terminated" } };
      if (created.error === "prior_driver_identity_mismatch") return { status: 400, body: { error: "prior_driver_identity_mismatch" } };
      if (created.error === "prior_driver_not_most_recent_in_chain")
        return { status: 409, body: { error: "prior_driver_not_most_recent_in_chain" } };
      if (created.error === "override_required_for_rehire") return { status: 400, body: { error: "override_required_for_rehire" } };
      return { status: 400, body: { error: String((created as { error: string }).error) } };
    }

    return { status: 201, body: created as Record<string, unknown> };
  } catch (err) {
    // A DOB that contradicts the CURP is caller error, not a server fault — 400 with the two dates
    // named, so the operator can see WHICH is wrong instead of retrying a 500.
    if (err instanceof DriverDobCurpMismatchError) {
      return {
        status: 400,
        body: {
          error: "date_of_birth_contradicts_curp",
          message: err.message,
          fieldErrors: { date_of_birth: `CURP indicates ${err.derived}`, curp: `implies date of birth ${err.derived}` },
        },
      };
    }
    const code = (err as { code?: string }).code;
    if (code === "23505") return { status: 409, body: mapDriverUniqueConflict(err) };
    if (code === "23503") return { status: 400, body: { error: "invalid_identity_user_id" } };
    throw err;
  }
}

// Rate limits are written INLINE, not hoisted into an RL_READ-style const, on purpose: the
// rate-limit plugin is registered `global: false`, so a route with no `config.rateLimit` has NO limit
// at all — and verify-new-auth-routes-rate-limited.mjs matches a literal `rateLimit:` inside the
// registration window (RATE_RE, scripts/verify-new-auth-routes-rate-limited.mjs:29). A shared const
// reads as covered to a human and as unlimited to the guard. House values, from
// mdata/customers.routes.ts:484-486: reads 120/min, writes 30/min.
export async function registerDriverRoutes(app: FastifyInstance) {

  app.get("/api/v1/mdata/drivers", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const { limit, offset, status, search, operating_company_id, include_system } = parsedQuery.data;
    if (include_system && !isOwnerOrAdmin(authUser.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const filters: string[] = [EXCLUDE_ARCHIVED_DRIVERS_SQL];
      if (!include_system) {
        // Exclude system pseudo-users from human listings. They are required by referential integrity for system-
        // generated events and must NOT be deleted.
        filters.push(EXCLUDE_PSEUDO_DRIVERS_SQL);
      }
      // LV-DRIVER-HUB-SCHEDULER-TEST-FIXTURES-IN-PROD-PICKER-2026-08-23: this is the canonical driver
      // list/picker read (GET /api/v1/mdata/drivers) that the Driver Hub Assign-Temp-Cover modal, and
      // every other driver picker across the app, call. Unlike units.routes.ts (DISPATCH-4) and
      // driver-scheduler.service.ts, this route had no is_sample_data exclusion at all, so agent/QA
      // fixture drivers (e.g. "CODEX ACTIVE FLEET TEST 20260821", "TEST-DRIVER-1 SEED") were live and
      // selectable in real dispatch/scheduling flows. is_sample_data is NOT NULL DEFAULT false, so
      // `IS NOT TRUE` is a total, index-friendly predicate — same pattern as units.routes.ts.
      filters.push("is_sample_data IS NOT TRUE");
      if (status) {
        values.push(status);
        filters.push(`status = $${values.length}`);
      }
      if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        // ACCT-F203 — MATCH THE FULL NAME, not just the individual columns.
        //
        // This used to test first_name / last_name / cdl_number separately, so the single most
        // natural thing a dispatcher does — type the driver's whole name — returned NOTHING. Proven
        // on prod: '%Juan USMCA%' scores 0 against the three columns while
        // (first_name || ' ' || last_name) matches exactly 1 driver. The picker looked empty and the
        // driver was unreachable, because the list default is LIMIT 50 against 92 USMCA / 96 TRANSP
        // drivers — past the cap, search is the ONLY way to reach someone, and search was the part
        // that was broken.
        //
        // Both orders are matched because people type either ("Perez Juan" is normal here), and the
        // concatenation is NULL-safe: last_name is nullable, and 'Juan' || ' ' || NULL is NULL in
        // SQL, which would silently drop every driver missing a surname from their own search.
        filters.push(
          `(first_name ILIKE $${idx} OR last_name ILIKE $${idx} OR cdl_number ILIKE $${idx}` +
            ` OR (COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')) ILIKE $${idx}` +
            ` OR (COALESCE(last_name,'') || ' ' || COALESCE(first_name,'')) ILIKE $${idx})`
        );
      }
      // Entity scope (USMCA cross-entity leak fix): driver PII must never blend across operating
      // companies. mdata.drivers RLS is role-scoped, not entity-scoped, so ALWAYS bind the
      // operating_company_id predicate — using the requested company or the user's current one.
      const scopedCompanyId = await resolveOperatingCompanyId(client, authUser.uuid, operating_company_id);
      if (!scopedCompanyId) return { rows: [], total: 0 };
      // membership-scope-exempt: scopedCompanyId comes from resolveOperatingCompanyId, which validates a requested company against org.user_accessible_company_ids() and throws forbidden_company_membership
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [scopedCompanyId]);
      values.push(scopedCompanyId);
      const ociIdx = values.length;
      // Predicate must appear in the SQL template literal (verify-mdata-entity-scope ratchet) —
      // do not bury operating_company_id only inside an interpolated ${whereClause}.
      const extraAnd = filters.length > 0 ? `AND ${filters.join(" AND ")}` : "";
      const countRes = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total
           FROM mdata.drivers
          WHERE (operating_company_id = $${ociIdx}::uuid OR EXISTS (
            SELECT 1 FROM mdata.driver_company_authorizations canonical_list_dca
             WHERE canonical_list_dca.driver_id = mdata.drivers.id
               AND canonical_list_dca.company_id = $${ociIdx}::uuid
               AND canonical_list_dca.is_authorized = true
               AND canonical_list_dca.deactivated_at IS NULL
          )) ${extraAnd}`,
        values
      );
      values.push(limit);
      values.push(offset);
      const res = await client.query(
        `
          SELECT
            id, operating_company_id, identity_user_id, first_name, last_name, phone, email, cdl_number, cdl_state, cdl_class,
            cdl_expires_at, hire_date, pay_basis, termination_date, dot_medical_expires_at, hazmat_endorsement_expires_at,
            visa_type, visa_number, visa_expires_at, passport_number, passport_expires_at, ine_number, curp,
            mx_address_line1, mx_address_line2, mx_city, mx_state, mx_postal_code,
            emergency_contact_name, emergency_contact_relationship, emergency_contact_phone_primary,
            emergency_contact_phone_alternate, emergency_contact_address, emergency_contact_notes,
            COALESCE((SELECT iu.preferred_language FROM identity.users iu WHERE iu.id = mdata.drivers.identity_user_id), 'en') AS preferred_language,
            qbo_vendor_id, qbo_vendor_linked_at, qbo_vendor_linked_by_user_id,
            qbo_class_id,
            samsara_driver_id,
            default_expense_account_id,
            status, notes, prior_driver_id, rehire_count, is_rehire,
            created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id,
            (SELECT COALESCE(NULLIF(trim(concat_ws(' ', updater.first_name, updater.last_name)), ''), updater.email)
             FROM identity.users updater
             WHERE updater.id = mdata.drivers.updated_by_user_id
             LIMIT 1) AS updated_by_user_label
          FROM mdata.drivers
          WHERE (operating_company_id = $${ociIdx}::uuid OR EXISTS (
            SELECT 1 FROM mdata.driver_company_authorizations canonical_list_dca
             WHERE canonical_list_dca.driver_id = mdata.drivers.id
               AND canonical_list_dca.company_id = $${ociIdx}::uuid
               AND canonical_list_dca.is_authorized = true
               AND canonical_list_dca.deactivated_at IS NULL
          ))
          ${extraAnd}
          ORDER BY created_at DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return { rows: res.rows, total: countRes.rows[0]?.total ?? 0 };
    });

    return { drivers: result.rows, total: result.total };
  });

  app.get("/api/v1/mdata/drivers/me", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT
            id, identity_user_id, first_name, last_name, phone, email,
            COALESCE((SELECT iu.preferred_language FROM identity.users iu WHERE iu.id = mdata.drivers.identity_user_id), 'en') AS preferred_language,
            status, created_at, updated_at
          FROM mdata.drivers
          WHERE identity_user_id = $1
          LIMIT 1
        `,
        [authUser.uuid]
      );
      return res.rows[0] ?? null;
    });

    if (!row) {
      return reply.code(404).send({
        error: "driver_profile_not_linked",
        message: "your account is not linked to a driver profile",
      });
    }
    return row;
  });

  app.post("/api/v1/mdata/drivers", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedBody = createDriverBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    // DRIVER-1: the office create delegates to the single canonical create path (createDriverCanonical),
    // which is the ONLY place a driver row is INSERTed from a request.
    const result = await createDriverCanonical(authUser, parsedBody.data, { provisionSubAccounts: true });
    return reply.code(result.status).send(result.body);
  });

  await registerDriverDefaultTruckRoutes(app);
  await registerDriverTrainingRoutes(app);
  await registerDriverW8benRoutes(app);
  await registerDriverMessagesRoutes(app);
  await registerDriverPdfExportRoutes(app);

  app.get("/api/v1/mdata/drivers/:id", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    // Aggregate reads are explicit. Historically operating_company_id alone selected this branch,
    // making every getDriver() call execute the much heavier DQ/HOS/documents aggregate and leaving
    // /drivers/:id in a long-lived loading state when one aggregate dependency stalled. The normal
    // scoped by-id read below is the canonical fast path; dedicated aggregate consumers opt in.
    const parsedAggregateQuery = driverAggregateQuerySchema.safeParse(req.query ?? {});
    if (parsedAggregateQuery.success) {
      const aggregate = await withCurrentUser(authUser.uuid, async (client) => {
        const scopedCompanyId = await resolveOperatingCompanyId(
          client,
          authUser.uuid,
          parsedAggregateQuery.data.operating_company_id
        );
        if (!scopedCompanyId) return null;
        return buildDriverAggregate(client, parsedParams.data.id, scopedCompanyId);
      });
      if (!aggregate) return reply.code(404).send({ error: "mdata_driver_not_found" });
      return aggregate;
    }

    // Optional operating_company_id (frontend #1890 passes the SELECTED company). A valid uuid is
    // handled by the aggregate branch above; this parse keeps the non-aggregate path from 400ing and
    // lets an explicitly-requested company seed the scope resolution below.
    const parsedByIdQuery = driverByIdQuerySchema.safeParse(req.query ?? {});
    const requestedCompanyId = parsedByIdQuery.success ? parsedByIdQuery.data.operating_company_id : undefined;

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      // Entity scope (USMCA cross-entity leak fix): a by-id driver read must not return a driver
      // belonging to another operating company. Scope to the requested company when supplied,
      // otherwise the caller's default/first-accessible company.
      const scopedCompanyId = await resolveOperatingCompanyId(client, authUser.uuid, requestedCompanyId);
      if (!scopedCompanyId) return null;
      // membership-scope-exempt: scopedCompanyId comes from resolveOperatingCompanyId, which validates a requested company against org.user_accessible_company_ids() and throws forbidden_company_membership
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [scopedCompanyId]);
      const res = await client.query(
        `
          SELECT
            id, identity_user_id, first_name, last_name, phone, email, cdl_number, cdl_state, cdl_class,
            EXISTS (
              SELECT 1
              FROM identity.users phone_login_user
              WHERE phone_login_user.id = mdata.drivers.identity_user_id
                AND phone_login_user.deactivated_at IS NULL
            ) AS phone_login_enabled,
            cdl_expires_at, hire_date, pay_basis, termination_date, dot_medical_expires_at, hazmat_endorsement_expires_at, endorsement_h,
            visa_type, visa_number, visa_expires_at, passport_number, passport_expires_at, ine_number, curp,
            mx_address_line1, mx_address_line2, mx_city, mx_state, mx_postal_code,
            emergency_contact_name, emergency_contact_relationship, emergency_contact_phone_primary,
            emergency_contact_phone_alternate, emergency_contact_address, emergency_contact_notes,
            COALESCE((SELECT iu.preferred_language FROM identity.users iu WHERE iu.id = mdata.drivers.identity_user_id), 'en') AS preferred_language,
            status, notes, prior_driver_id, rehire_count, is_rehire,
            (SELECT NULLIF(trim(concat_ws(' ', prior.first_name, prior.last_name)), '')
             FROM mdata.drivers prior
             WHERE prior.id = mdata.drivers.prior_driver_id
               AND (
                 prior.operating_company_id = $2::uuid
                 OR EXISTS (
                   SELECT 1
                   FROM mdata.driver_company_authorizations flat_prior_driver_label_dca
                   WHERE flat_prior_driver_label_dca.driver_id = prior.id
                     AND flat_prior_driver_label_dca.company_id = $2::uuid
                     AND flat_prior_driver_label_dca.is_authorized = true
                     AND flat_prior_driver_label_dca.deactivated_at IS NULL
                 )
               )
             LIMIT 1) AS prior_driver_name,
          operating_company_id,
            qbo_vendor_id,
            (SELECT v.id::text
             FROM mdata.vendors v
             WHERE v.operating_company_id = mdata.drivers.operating_company_id
               AND v.qbo_vendor_id = mdata.drivers.qbo_vendor_id
               AND v.deactivated_at IS NULL
             LIMIT 1) AS qbo_vendor_local_id,
            (SELECT v.vendor_name
             FROM mdata.vendors v
             WHERE v.operating_company_id = mdata.drivers.operating_company_id
               AND v.qbo_vendor_id = mdata.drivers.qbo_vendor_id
               AND v.deactivated_at IS NULL
             LIMIT 1) AS qbo_vendor_name,
            qbo_class_id,
            default_expense_account_id,
            created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          FROM mdata.drivers
          WHERE id = $1
            AND (
              operating_company_id = $2::uuid
              OR EXISTS (
                -- driver_company_authorizations fallback (mirrors buildDriverAggregate): a driver the
                -- caller's company is insurance-authorized to see must not be a false 404. The dca RLS
                -- SELECT policy already restricts rows to user-accessible companies.
                SELECT 1 FROM mdata.driver_company_authorizations dca
                WHERE dca.driver_id = mdata.drivers.id
                  AND dca.company_id = $2
                  AND dca.is_authorized = true
                  AND dca.deactivated_at IS NULL
              )
            )
          LIMIT 1
        `,
        [parsedParams.data.id, scopedCompanyId]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "mdata_driver_not_found" });
    return row;
  });

  /**
   * FAIL-AP1 — Driver → A/P vendor reverse read.
   *
   * Forward FK already exists (`mdata.vendors.driver_id`) and posters resolve it via
   * `resolveDriverVendorLink`. Nothing exposed that join on the driver profile, so Earnings & Debt
   * could not drill to the payee vendor (Cascade measured live: 3 bills / $1,350 already flow
   * through driver-vendors with no reverse surface). Soft-miss returns `{ vendor: null }` — never
   * invent a vendor id. Distinct from QBO Mapping (`qbo_vendor_id`).
   */
  app.get(
    "/api/v1/mdata/drivers/:id/ap-vendor",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return reply;
      const parsedParams = idParamSchema.safeParse(req.params ?? {});
      if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
      const parsedQuery = z
        .object({ operating_company_id: z.string().uuid() })
        .safeParse(req.query ?? {});
      if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

      const payload = await withCurrentUser(authUser.uuid, async (client) => {
        const scopedCompanyId = await resolveOperatingCompanyId(
          client,
          authUser.uuid,
          parsedQuery.data.operating_company_id
        );
        if (!scopedCompanyId) return { error: "operating_company_id_required" as const };
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [scopedCompanyId]);

        const driverExists = await client.query(
          `SELECT 1
             FROM mdata.drivers d
            WHERE d.id = $1::uuid
              AND (
                d.operating_company_id = $2::uuid
                OR EXISTS (
                  SELECT 1
                    FROM mdata.driver_company_authorizations ap_vendor_driver_dca
                   WHERE ap_vendor_driver_dca.driver_id = d.id
                     AND ap_vendor_driver_dca.company_id = $2::uuid
                     AND ap_vendor_driver_dca.is_authorized = true
                     AND ap_vendor_driver_dca.deactivated_at IS NULL
                )
              )
            LIMIT 1`,
          [parsedParams.data.id, scopedCompanyId]
        );
        if (!driverExists.rows[0]) return { error: "mdata_driver_not_found" as const };

        try {
          const link = await resolveDriverVendorLink(client, scopedCompanyId, parsedParams.data.id);
          return {
            vendor: {
              id: link.vendorId,
              name: link.vendorName,
              qbo_vendor_id: link.qboVendorId,
              operating_company_id: scopedCompanyId,
              driver_id: parsedParams.data.id,
            },
          };
        } catch (err) {
          if (err instanceof DriverVendorMissingError) {
            return { vendor: null, operating_company_id: scopedCompanyId, driver_id: parsedParams.data.id };
          }
          throw err;
        }
      });

      if ("error" in payload && payload.error === "operating_company_id_required") {
        return reply.code(400).send({ error: "operating_company_id_required" });
      }
      if ("error" in payload && payload.error === "mdata_driver_not_found") {
        return reply.code(404).send({ error: "mdata_driver_not_found" });
      }
      return payload;
    }
  );

  /**
   * BULK INVITE — grant app access to drivers who have none.
   *
   * WHY THIS EXISTS: 86 of 88 active drivers on prod have no identity_user_id (verified 2026-08-03,
   * positive control mdata.vendors=2,828). Inviting them one at a time through the single-driver
   * endpoint is 86 deliberate clicks, which in practice means it never happens and the driver PWA,
   * every dispatch notification and every driver-targeted alert stay dark.
   *
   * DRY RUN IS THE DEFAULT, DELIBERATELY. This sends real WhatsApp messages to real people. An
   * Owner must ask for `dry_run: false` explicitly; a mistyped company id or an unintended filter
   * should cost a preview, never 86 messages. The preview returns exactly what the live run would do,
   * driver by driver, so the decision is made on the actual list rather than on a count.
   *
   * PARTIAL FAILURE IS REPORTED, NOT SWALLOWED. Each driver is attempted independently and its own
   * outcome recorded; one driver with conflicting credentials must not abort the other 85, and must
   * not be silently dropped from the result either.
   */
  // Rate-limited hard: this is the one endpoint that can message the entire roster in a single call.
  app.post(
    "/api/v1/mdata/drivers/bulk-invite",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!isOwnerOrAdmin(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedBody = bulkInviteBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    // Read once: a bulk run must not report some drivers as invited and others as skipped purely
    // because the environment changed mid-loop.
    const whatsappReady = isWhatsappChannelConfigured();

    const outcome = await withCurrentUser(authUser.uuid, async (client) => {
      // MDATA-F08 — CROSS-ENTITY GATE. Same class as MDATA-F07 on resend-invite (fixed in #4562),
      // but at mass scale. The only check above is isOwnerOrAdmin, which is a ROLE, not a company.
      // `b.operating_company_id` arrives in the REQUEST BODY and is used verbatim as the
      // `d.operating_company_id = $1` predicate below, so an Owner/Admin in company A could pass
      // company B's id and mass-invite every driver in B — real email/WhatsApp to real people, plus
      // one identity.driver_invites row each under B. RLS is no backstop: org.user_accessible_company_ids()
      // returns EVERY active company for an Owner (PERMANENT LAW 4), so the predicate authorizes nothing.
      await assertCompanyMembership(client, authUser.uuid, b.operating_company_id);

      const targetsRes = await client.query<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        phone: string | null;
      }>(
        `
          SELECT d.id::text AS id, d.first_name, d.last_name, d.email, d.phone
            FROM mdata.drivers d
           WHERE d.operating_company_id = $1::uuid
             AND d.identity_user_id IS NULL
             AND d.deactivated_at IS NULL
             AND d.archived_at IS NULL
             AND ($2::uuid[] IS NULL OR d.id = ANY($2::uuid[]))
           ORDER BY d.last_name NULLS LAST, d.first_name NULLS LAST
        `,
        [b.operating_company_id, b.driver_ids && b.driver_ids.length > 0 ? b.driver_ids : null]
      );

      const results: Array<{
        driver_id: string;
        name: string;
        channel: "whatsapp" | "email" | null;
        status: "would_invite" | "invited" | "skipped";
        reason?: string;
      }> = [];
      const pendingEmails: Array<{
        driverId: string;
        name: string;
        to: string;
        inviteUrl: string;
        identityUserId: string;
        operatingCompanyId: string;
      }> = [];

      for (const d of targetsRes.rows) {
        const name = [d.first_name, d.last_name].filter(Boolean).join(" ").trim() || d.id;
        const email = (d.email ?? "").trim();
        const phone = (d.phone ?? "").trim();
        if (!email && !phone) {
          results.push({ driver_id: d.id, name, channel: null, status: "skipped", reason: "driver_no_contact_method" });
          continue;
        }
        const channel: "whatsapp" | "email" = email ? "email" : "whatsapp";
        if (channel === "whatsapp" && !whatsappReady) {
          results.push({
            driver_id: d.id,
            name,
            channel,
            status: "skipped",
            reason: "whatsapp_channel_not_configured",
          });
          continue;
        }

        if (b.dry_run) {
          results.push({ driver_id: d.id, name, channel, status: "would_invite" });
          continue;
        }

        const access = await ensureDriverAppAccess(client, d.id, authUser.uuid);
        if (!access.ok) {
          results.push({ driver_id: d.id, name, channel, status: "skipped", reason: access.error });
          continue;
        }

        const inviteToken = randomBytes(32).toString("hex");
        const inviteUrl = `${driverInviteBaseUrl}/invite?token=${inviteToken}`;
        await client.query(
          `
            INSERT INTO identity.driver_invites (
              operating_company_id, driver_id, identity_user_id, token, phone, expires_at, created_by_user_id
            )
            VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, now() + interval '72 hours', $6::uuid)
          `,
          [access.operatingCompanyId, access.driverId, access.identityUserId, inviteToken, access.phone, authUser.uuid]
        );

        if (channel === "whatsapp") {
          await enqueueOutboxEvent(
            client,
            "twilio.whatsapp.send",
            { aggregate_type: "mdata.drivers", aggregate_id: access.driverId },
            {
              to: access.phone,
              template: "driver_invite",
              operating_company_id: access.operatingCompanyId,
              variables: {
                driver_first_name: access.firstName ?? "Driver",
                company_name: "",
                invite_url: inviteUrl,
                expires_hours: 72,
              },
            }
          );
        }

        await appendCrudAudit(
          client,
          authUser.uuid,
          "email.driver_invite.resent",
          {
            resource_id: access.driverId,
            resource_type: "identity.driver_invites",
            driver_id: access.driverId,
            identity_user_id: access.identityUserId,
            invite_url: inviteUrl,
            channel,
            bulk: true,
            created_identity_user: access.createdUser,
            linked_driver: access.linkedDriver,
          },
          "info",
          "BT-3-DRIVER-ONBOARDING"
        );

        if (channel === "email") {
          // Queued AFTER the transaction, like the single-driver path — the email service is not
          // transactional, so sending inside would risk a message about an invite that rolled back.
          // Status is decided by whether the send succeeds, not by having created the invite row.
          pendingEmails.push({
            driverId: d.id,
            name,
            to: access.email as string,
            inviteUrl,
            identityUserId: access.identityUserId,
            operatingCompanyId: access.operatingCompanyId,
          });
          continue;
        }

        results.push({ driver_id: d.id, name, channel, status: "invited" });
      }

      return { results, pendingEmails };
    });

    // Email sends happen outside the transaction; each driver's status reflects its OWN outcome, so a
    // single bounce is never reported as success and never hides the other drivers' results.
    for (const pending of outcome.pendingEmails) {
      try {
        await sendDriverInvite({
          to: pending.to,
          driverName: pending.name,
          loginUrl: pending.inviteUrl,
          actorUserId: authUser.uuid,
          recipientUserUuid: pending.identityUserId,
          operatingCompanyId: pending.operatingCompanyId,
        });
        outcome.results.push({ driver_id: pending.driverId, name: pending.name, channel: "email", status: "invited" });
      } catch (err) {
        outcome.results.push({
          driver_id: pending.driverId,
          name: pending.name,
          channel: "email",
          status: "skipped",
          reason: `email_send_failed: ${String((err as Error)?.message ?? err)}`,
        });
      }
    }

    const invited = outcome.results.filter((r) => r.status === "invited").length;
    const wouldInvite = outcome.results.filter((r) => r.status === "would_invite").length;
    const skipped = outcome.results.filter((r) => r.status === "skipped").length;

    return reply.code(200).send({
      dry_run: b.dry_run,
      eligible: outcome.results.length,
      invited,
      would_invite: wouldInvite,
      skipped,
      results: outcome.results,
    });
    }
  );


  // 10/min, not the 30/min write default: this route sends a REAL email to a REAL person and writes an
  // identity.driver_invites row, so the abuse case is mail-bombing a driver. Same limit as
  // driver-pdf-export.routes.ts:17 — the other endpoint here that produces something outside the app.
  app.post("/api/v1/mdata/drivers/:id/resend-invite", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!isOwnerOrAdmin(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const driverRes = await client.query<{
        id: string;
        first_name: string;
        last_name: string;
        email: string | null;
        identity_user_id: string | null;
        driver_operating_company_id: string;
        operating_company_id: string | null;
        operating_company_name: string | null;
      }>(
        `
          SELECT
            d.id,
            d.first_name,
            d.last_name,
            d.email,
            d.identity_user_id,
            d.operating_company_id AS driver_operating_company_id,
            i.default_company_id AS operating_company_id,
            c.legal_name AS operating_company_name
          FROM mdata.drivers d
          LEFT JOIN identity.users i ON i.id = d.identity_user_id
          LEFT JOIN org.companies c ON c.id = i.default_company_id
          WHERE d.id = $1
            AND d.operating_company_id IN (
              SELECT uca.company_id
                FROM org.user_company_access uca
                JOIN org.companies oc ON oc.id = uca.company_id AND oc.deactivated_at IS NULL
               WHERE uca.user_id = $2::uuid
                 AND uca.deactivated_at IS NULL
            )
          LIMIT 1
        `,
        [parsedParams.data.id, authUser.uuid]
      );
      const row = driverRes.rows[0] ?? null;
      if (!row) return { error: "mdata_driver_not_found" as const };

      // ENTITY-SCOPED RESOLVER. The read is scoped to the companies the CALLER actually belongs to —
      // NOT to a caller-supplied company, which would be the untrusted input this fix exists to
      // distrust, and not by the driver's own company, which is what the read is trying to discover.
      // Same shape as the reclassify resolver already on main, and it reads org.user_company_access,
      // the same table assertCompanyMembership keys on, so the read and the gate below cannot drift.
      // Two effects: it satisfies the entity-predicate contract (verify-steps/84) with a real
      // predicate rather than a baseline waiver, and it collapses 403-vs-404 so a caller can no longer
      // tell "no such driver" from "exists in another entity" and enumerate ids across entities.
      //
      // CROSS-ENTITY GATE. This route looked the driver up by id ALONE, so a caller in company A could
      // trigger an invite to company B's driver — a real email to a real person in another entity, plus
      // an identity.driver_invites row written under that entity. The company is DERIVED from the
      // driver record here, so the control is a membership assertion on it (the resolver pattern from
      // MDATA-F03), not a circular predicate on the lookup. Throws 403 forbidden_company_membership.
      await assertCompanyMembership(client, authUser.uuid, row.driver_operating_company_id);

      // BOOTSTRAP, don't reject. Previously this returned `driver_not_linked` whenever
      // identity_user_id was null, which is the state of 86 of 88 active drivers on prod — every
      // driver imported rather than typed into the onboarding form was permanently unreachable, with
      // no path in any UI to give them access. ensureDriverAppAccess creates/reuses the identity user,
      // links the driver and grants company access, reusing the exact logic the create-driver route
      // uses so the two paths cannot drift apart again.
      const access = await ensureDriverAppAccess(client, parsedParams.data.id, authUser.uuid);
      if (!access.ok) return { error: access.error };

      const inviteToken = randomBytes(32).toString("hex");
      const inviteUrl = `${driverInviteBaseUrl}/invite?token=${inviteToken}`;
      const inviteRes = await client.query<{ expires_at: string }>(
        `
          INSERT INTO identity.driver_invites (
            operating_company_id,
            driver_id,
            identity_user_id,
            token,
            phone,
            expires_at,
            created_by_user_id
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, now() + interval '72 hours', $6::uuid)
          RETURNING expires_at
        `,
        [access.operatingCompanyId, access.driverId, access.identityUserId, inviteToken, access.phone, authUser.uuid]
      );
      const inviteExpiresAt = inviteRes.rows[0]?.expires_at ?? null;

      // CHANNEL: WhatsApp when there is no email. ZERO of the 86 active unlinked drivers have an
      // email — they are B1 contract drivers reached on WhatsApp, which is what the CREATE path
      // already uses. Requiring email here rejected the entire active fleet.
      const useWhatsapp = !access.email && Boolean(access.phone);
      // WhatsApp is NOT active yet (owner, 2026-08-03). Refuse rather than queue: the processor marks
      // an event whose handler is unavailable as DELIVERED, so enqueuing here would tell the Owner the
      // driver was invited when nothing was sent. The identity user and company access created above
      // are kept — they are real and correct — so the invite succeeds the moment the channel is on.
      if (useWhatsapp && !isWhatsappChannelConfigured()) {
        return { error: "whatsapp_channel_not_configured" as const };
      }
      if (useWhatsapp) {
        await enqueueOutboxEvent(
          client,
          "twilio.whatsapp.send",
          { aggregate_type: "mdata.drivers", aggregate_id: access.driverId },
          {
            to: access.phone,
            template: "driver_invite",
            operating_company_id: access.operatingCompanyId,
            variables: {
              driver_first_name: access.firstName ?? "Driver",
              company_name: row.operating_company_name ?? "",
              invite_url: inviteUrl,
              expires_hours: 72,
            },
          }
        );
      }

      await appendCrudAudit(
        client,
        authUser.uuid,
        "email.driver_invite.resent",
        {
          resource_id: access.driverId,
          resource_type: "identity.driver_invites",
          driver_id: access.driverId,
          identity_user_id: access.identityUserId,
          invite_url: inviteUrl,
          invite_expires_at: inviteExpiresAt,
          channel: useWhatsapp ? "whatsapp" : "email",
          created_identity_user: access.createdUser,
          linked_driver: access.linkedDriver,
        },
        "info",
        "BT-3-DRIVER-ONBOARDING"
      );

      return {
        row,
        access,
        inviteUrl,
        channel: useWhatsapp ? ("whatsapp" as const) : ("email" as const),
      };
    });

    if ("error" in result) {
      if (result.error === "mdata_driver_not_found") return reply.code(404).send({ error: result.error });
      if (result.error === "whatsapp_channel_not_configured") {
        // 503, not 400: the request is valid and the driver is now linked — the CHANNEL is unavailable.
        return reply.code(503).send({
          error: result.error,
          detail:
            "The driver has no email and WhatsApp is not configured, so no invite could be delivered. " +
            "The driver's login and company access were created and the invite will send once the channel is enabled.",
        });
      }
      return reply.code(400).send({ error: result.error });
    }

    // WhatsApp was already enqueued inside the transaction (outbox.events, delivered by the
    // registered TwilioWhatsappHandler). Nothing further to do on this path.
    if (result.channel === "whatsapp") {
      return reply.code(200).send({
        sent_to: result.access.phone,
        channel: "whatsapp",
        created_identity_user: result.access.createdUser,
        linked_driver: result.access.linkedDriver,
      });
    }

    const emailResult = await sendDriverInvite({
      to: result.access.email as string,
      driverName: `${result.row.first_name} ${result.row.last_name}`.trim() || "Driver",
      loginUrl: result.inviteUrl,
      actorUserId: authUser.uuid,
      recipientUserUuid: result.access.identityUserId,
      operatingCompanyId: result.access.operatingCompanyId,
    });

    return reply.code(200).send({
      sent_to: result.access.email,
      channel: "email",
      queue_id: emailResult.id,
      created_identity_user: result.access.createdUser,
      linked_driver: result.access.linkedDriver,
    });
  });

  app.patch("/api/v1/mdata/drivers/:id", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateDriverBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const b = parsedBody.data;
    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      setParts.push(`${col} = $${values.length}`);
    };

    if ("identity_user_id" in b) add("identity_user_id", b.identity_user_id ?? null);
    if ("first_name" in b) add("first_name", b.first_name ?? null);
    if ("last_name" in b) add("last_name", b.last_name ?? null);
    if ("phone" in b) add("phone", b.phone ?? null);
    if ("email" in b) add("email", b.email ?? null);
    if ("cdl_number" in b) add("cdl_number", b.cdl_number ?? null);
    if ("cdl_state" in b) add("cdl_state", b.cdl_state ?? null);
    if ("cdl_class" in b) add("cdl_class", b.cdl_class ?? null);
    if ("cdl_expires_at" in b) add("cdl_expires_at", b.cdl_expires_at ?? null);
    if ("hire_date" in b) add("hire_date", b.hire_date ?? null);
    if ("pay_basis" in b) add("pay_basis", b.pay_basis);
    if ("dot_medical_expires_at" in b) add("dot_medical_expires_at", b.dot_medical_expires_at ?? null);
    if ("hazmat_endorsement_expires_at" in b) add("hazmat_endorsement_expires_at", b.hazmat_endorsement_expires_at ?? null);
    if ("endorsement_h" in b) add("endorsement_h", b.endorsement_h);
    if ("visa_type" in b) add("visa_type", b.visa_type ?? null);
    if ("visa_number" in b) add("visa_number", b.visa_number ?? null);
    if ("visa_expires_at" in b) add("visa_expires_at", b.visa_expires_at ?? null);
    if ("passport_number" in b) add("passport_number", b.passport_number ?? null);
    if ("passport_expires_at" in b) add("passport_expires_at", b.passport_expires_at ?? null);
    if ("ine_number" in b) add("ine_number", b.ine_number ?? null);
    if ("curp" in b) add("curp", b.curp ?? null);
    if ("mx_address_line1" in b) add("mx_address_line1", b.mx_address_line1 ?? null);
    if ("mx_address_line2" in b) add("mx_address_line2", b.mx_address_line2 ?? null);
    if ("mx_city" in b) add("mx_city", b.mx_city ?? null);
    if ("mx_state" in b) add("mx_state", b.mx_state ?? null);
    if ("mx_postal_code" in b) add("mx_postal_code", b.mx_postal_code ?? null);
    if ("emergency_contact_name" in b) add("emergency_contact_name", b.emergency_contact_name ?? null);
    if ("emergency_contact_relationship" in b) add("emergency_contact_relationship", b.emergency_contact_relationship ?? null);
    if ("emergency_contact_phone_primary" in b) add("emergency_contact_phone_primary", b.emergency_contact_phone_primary ?? null);
    if ("emergency_contact_phone_alternate" in b) add("emergency_contact_phone_alternate", b.emergency_contact_phone_alternate ?? null);
    if ("emergency_contact_address" in b) add("emergency_contact_address", b.emergency_contact_address ?? null);
    if ("emergency_contact_notes" in b) add("emergency_contact_notes", b.emergency_contact_notes ?? null);
    if ("status" in b) add("status", b.status);
    if ("notes" in b) add("notes", b.notes ?? null);
    if ("deactivated_at" in b) add("deactivated_at", b.deactivated_at ?? null);
    if ("qbo_vendor_id" in b) add("qbo_vendor_id", b.qbo_vendor_id ?? null);
    if ("qbo_class_id" in b) add("qbo_class_id", b.qbo_class_id ?? null);
    if ("operating_company_id" in b) add("operating_company_id", b.operating_company_id ?? null);
    if ("settlement_auto_pay_enabled" in b) add("settlement_auto_pay_enabled", b.settlement_auto_pay_enabled);
    if ("fast_card_number" in b) add("fast_card_number", b.fast_card_number ?? null);
    if ("fast_card_expiration" in b) add("fast_card_expiration", b.fast_card_expiration ?? null);
    if ("sentri_member" in b) add("sentri_member", b.sentri_member);
    if ("sentri_expiration" in b) add("sentri_expiration", b.sentri_expiration ?? null);
    if ("twic_card_number" in b) add("twic_card_number", b.twic_card_number ?? null);
    if ("twic_expiration" in b) add("twic_expiration", b.twic_expiration ?? null);
    if ("mexican_license_number" in b) add("mexican_license_number", b.mexican_license_number ?? null);
    if ("mexican_license_expiration" in b) add("mexican_license_expiration", b.mexican_license_expiration ?? null);
    if ("default_expense_account_id" in b) add("default_expense_account_id", b.default_expense_account_id ?? null);
    add("updated_by_user_id", authUser.uuid);

    values.push(parsedParams.data.id);
    const idIdx = values.length;
    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        if ("operating_company_id" in b && b.operating_company_id) {
          const companyRes = await client.query<{ id: string }>(
            `
              SELECT id
              FROM org.companies
              WHERE id = $1
                AND id IN (SELECT org.user_accessible_company_ids())
                AND deactivated_at IS NULL
                AND is_active = true
              LIMIT 1
            `,
            [b.operating_company_id]
          );
          if (companyRes.rows.length === 0) return { error: "operating_company_not_found" as const };
        }

        const oldRes = await client.query(
          `
            SELECT
              id, identity_user_id, first_name, last_name, phone, email, cdl_number, cdl_state, cdl_class,
              cdl_expires_at, hire_date, pay_basis, termination_date, dot_medical_expires_at, hazmat_endorsement_expires_at, endorsement_h,
              visa_type, visa_number, visa_expires_at, passport_number, passport_expires_at, ine_number, curp,
              date_of_birth, passport_country, mexican_license_number, mexican_license_expiration,
              mx_address_line1, mx_address_line2, mx_city, mx_state, mx_postal_code,
              emergency_contact_name, emergency_contact_relationship, emergency_contact_phone_primary,
              emergency_contact_phone_alternate, emergency_contact_address, emergency_contact_notes,
              COALESCE((SELECT iu.preferred_language FROM identity.users iu WHERE iu.id = mdata.drivers.identity_user_id), 'en') AS preferred_language,
              status, notes, prior_driver_id, rehire_count, is_rehire,
              operating_company_id,
              qbo_vendor_id, qbo_class_id,
              default_expense_account_id,
              created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
            FROM mdata.drivers
            WHERE id = $1
              -- Entity scope (USMCA cross-entity leak fix): mirrors the GET-by-id route and the
              -- drivers_select RLS policy (db/migrations/0404_drivers_rls_oci_scope.sql) — a PATCH
              -- must not read/write a driver belonging to a company the caller cannot access.
              -- drivers_update RLS (0008_mdata_init.sql) is role-scoped only, so this app-level
              -- predicate is the real entity boundary for this write.
              AND operating_company_id IN (SELECT org.user_accessible_company_ids())
            LIMIT 1
          `,
          [parsedParams.data.id]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;

        const res = await client.query(
          `
            UPDATE mdata.drivers
            SET ${setParts.join(", ")}
            WHERE id = $${idIdx}
              AND operating_company_id IN (SELECT org.user_accessible_company_ids())
            RETURNING
              id, identity_user_id, first_name, last_name, phone, email, cdl_number, cdl_state, cdl_class,
              cdl_expires_at, hire_date, pay_basis, termination_date, dot_medical_expires_at, hazmat_endorsement_expires_at, endorsement_h,
              visa_type, visa_number, visa_expires_at, passport_number, passport_expires_at, ine_number, curp,
              date_of_birth, passport_country, mexican_license_number, mexican_license_expiration,
              mx_address_line1, mx_address_line2, mx_city, mx_state, mx_postal_code,
              emergency_contact_name, emergency_contact_relationship, emergency_contact_phone_primary,
              emergency_contact_phone_alternate, emergency_contact_address, emergency_contact_notes,
              COALESCE((SELECT iu.preferred_language FROM identity.users iu WHERE iu.id = mdata.drivers.identity_user_id), 'en') AS preferred_language,
              status, notes, prior_driver_id, rehire_count, is_rehire,
              operating_company_id,
              qbo_vendor_id, qbo_class_id,
              default_expense_account_id,
              created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          `,
          values
        );
        let updatedRow = res.rows[0] ?? null;
        if (!updatedRow) return null;

        const oldStatus = String(oldRow.status ?? "");
        const newStatus = String(updatedRow.status ?? oldStatus);
        const identityUserId = (updatedRow.identity_user_id as string | null) ?? (oldRow.identity_user_id as string | null);
        const nextPhone = "phone" in b ? (b.phone ?? null) : undefined;
        const nextPreferredLanguage = "preferred_language" in b ? (b.preferred_language ?? "en") : undefined;
        if (identityUserId && nextPhone !== undefined) {
          const identityPhone = await client.query<{ id: string }>(
            `
              UPDATE identity.users
              SET phone = $2
              WHERE id = $1
              RETURNING id::text
            `,
            [identityUserId, nextPhone]
          );
          if (identityPhone.rows[0]?.id !== identityUserId) {
            throw Object.assign(new Error("E_DRIVER_IDENTITY_MIRROR_WRITE_CONFLICT"), { code: "E_DRIVER_IDENTITY_MIRROR_WRITE_CONFLICT" });
          }
        }
        if (identityUserId && nextPreferredLanguage !== undefined) {
          const identityLanguage = await client.query<{ id: string }>(
            `
              UPDATE identity.users
              SET preferred_language = $2
              WHERE id = $1
              RETURNING id::text
            `,
            [identityUserId, nextPreferredLanguage]
          );
          if (identityLanguage.rows[0]?.id !== identityUserId) {
            throw Object.assign(new Error("E_DRIVER_IDENTITY_MIRROR_WRITE_CONFLICT"), { code: "E_DRIVER_IDENTITY_MIRROR_WRITE_CONFLICT" });
          }
          const refreshedRes = await client.query(
            `
              SELECT
                id, identity_user_id, first_name, last_name, phone, email, cdl_number, cdl_state, cdl_class,
                cdl_expires_at, hire_date, pay_basis, termination_date, dot_medical_expires_at, hazmat_endorsement_expires_at, endorsement_h,
                visa_type, visa_number, visa_expires_at, passport_number, passport_expires_at, ine_number, curp,
                mx_address_line1, mx_address_line2, mx_city, mx_state, mx_postal_code,
                emergency_contact_name, emergency_contact_relationship, emergency_contact_phone_primary,
                emergency_contact_phone_alternate, emergency_contact_address, emergency_contact_notes,
                COALESCE((SELECT iu.preferred_language FROM identity.users iu WHERE iu.id = mdata.drivers.identity_user_id), 'en') AS preferred_language,
                status, notes, prior_driver_id, rehire_count, is_rehire,
              operating_company_id,
                qbo_vendor_id, qbo_class_id,
                default_expense_account_id,
                created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
              FROM mdata.drivers
              WHERE id = $1
                AND operating_company_id IN (SELECT org.user_accessible_company_ids())
              LIMIT 1
            `,
            [updatedRow.id]
          );
          updatedRow = refreshedRes.rows[0] ?? updatedRow;
        }
        if (identityUserId && !statusDisablesDriverLogin(oldStatus) && statusDisablesDriverLogin(newStatus)) {
          const identityDeactivateRes = await client.query<{ deactivated_at: string | null }>(
            `
              UPDATE identity.users
              SET deactivated_at = now()
              WHERE id = $1
                AND deactivated_at IS NULL
              RETURNING deactivated_at
            `,
            [identityUserId]
          );
          if (identityDeactivateRes.rows.length > 0) {
            await appendCrudAudit(
              client,
              authUser.uuid,
              "identity.users.deactivated_via_driver_deactivation",
              {
                resource_id: identityUserId,
                resource_type: "identity.users",
                driver_id: updatedRow.id,
                driver_status_from: oldStatus,
                driver_status_to: newStatus,
              },
              "warning",
              "BT-1-AUTH-DRIVER"
            );
          }
        }

        const changes = buildPatchChanges(
          b as unknown as Record<string, unknown>,
          oldRow as Record<string, unknown>,
          updatedRow as Record<string, unknown>
        );
        await appendCrudAudit(client, authUser.uuid, "mdata.drivers.updated", {
          resource_id: updatedRow.id,
          resource_type: "mdata.drivers",
          changes,
        });
        return updatedRow;
      });
      if (updated && typeof updated === "object" && "error" in updated) {
        return reply.code(400).send({ error: "operating_company_not_found" });
      }
      if (!updated) return reply.code(404).send({ error: "mdata_driver_not_found" });
      return updated;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send(mapDriverUniqueConflict(err));
      if (code === "23503") return reply.code(400).send({ error: "invalid_identity_user_id" });
      if (code === "E_DRIVER_IDENTITY_MIRROR_WRITE_CONFLICT") {
        return reply.code(409).send({ error: code });
      }
      throw err;
    }
  });

  app.post("/api/v1/mdata/drivers/:id/deactivate", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const deactivated = await withCurrentUser(authUser.uuid, async (client) => {
      const oldRes = await client.query(
        `
          SELECT id, operating_company_id, deactivated_at, identity_user_id, status
          FROM mdata.drivers
          WHERE id = $1
            AND operating_company_id IN (
              SELECT uca.company_id
                FROM org.user_company_access uca
                JOIN org.companies oc ON oc.id = uca.company_id AND oc.deactivated_at IS NULL
               WHERE uca.user_id = $2::uuid
                 AND uca.deactivated_at IS NULL
            )
          LIMIT 1
        `,
        [parsedParams.data.id, authUser.uuid]
      );
      const oldRow = oldRes.rows[0] ?? null;
      if (!oldRow) return null;
      if (oldRow.deactivated_at !== null) return { error: "mdata_driver_already_deactivated" as const };

      // Set status -> 'Inactive' in the SAME update as deactivated_at. Every UI surface
      // (badge, Status field, Active/Inactive tab filter) reads the text `status` column, not
      // deactivated_at — so writing only deactivated_at left drivers reading "Active" forever.
      // Preserve a 'Terminated' status (a stronger, deliberate end-state) rather than downgrade it.
      const res = await client.query(
        `
          UPDATE mdata.drivers
          SET deactivated_at = now(),
              status = CASE WHEN status = 'Terminated' THEN status ELSE 'Inactive'::mdata.driver_status END,
              updated_by_user_id = $2
          WHERE id = $1
            AND operating_company_id = $3::uuid
            AND deactivated_at IS NULL
          RETURNING id, deactivated_at, status
        `,
        [parsedParams.data.id, authUser.uuid, oldRow.operating_company_id]
      );
      const changedRow = res.rows[0] ?? null;
      if (!changedRow) return { error: "mdata_driver_state_changed" as const };

      const identityUserId = oldRow.identity_user_id as string | null;
      if (identityUserId) {
        const identityDeactivateRes = await client.query<{ deactivated_at: string | null }>(
          `
            UPDATE identity.users
            SET deactivated_at = now()
            WHERE id = $1
              AND deactivated_at IS NULL
            RETURNING deactivated_at
          `,
          [identityUserId]
        );
        if (identityDeactivateRes.rows.length > 0) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "identity.users.deactivated_via_driver_deactivation",
            {
              resource_id: identityUserId,
              resource_type: "identity.users",
              driver_id: oldRow.id,
              driver_status: oldRow.status,
            },
            "warning",
            "BT-1-AUTH-DRIVER"
          );
        }
      }

      await appendCrudAudit(client, authUser.uuid, "mdata.drivers.deactivated", {
        resource_id: oldRow.id,
        resource_type: "mdata.drivers",
        operating_company_id: oldRow.operating_company_id,
      });

      return { id: oldRow.id, deactivated_at: changedRow.deactivated_at, status: changedRow.status, was_already_deactivated: false };
    });
    if (!deactivated) return reply.code(404).send({ error: "mdata_driver_not_found" });
    if ("error" in deactivated) return reply.code(409).send({ error: deactivated.error });
    return deactivated;
  });

  // Reverse of /deactivate — "Show in lists" un-hides a soft-hidden driver (Inactive -> Active). Reversible soft
  // write; preserves a deliberate 'Terminated' end-state (never un-terminates). Mirrors the deactivate audit.
  app.post("/api/v1/mdata/drivers/:id/reactivate", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const reactivated = await withCurrentUser(authUser.uuid, async (client) => {
      const oldRes = await client.query(
        `
          SELECT id, operating_company_id, deactivated_at, identity_user_id, status
          FROM mdata.drivers
          WHERE id = $1
            AND operating_company_id IN (
              SELECT uca.company_id
                FROM org.user_company_access uca
                JOIN org.companies oc ON oc.id = uca.company_id AND oc.deactivated_at IS NULL
               WHERE uca.user_id = $2::uuid
                 AND uca.deactivated_at IS NULL
            )
          LIMIT 1
        `,
        [parsedParams.data.id, authUser.uuid]
      );
      const oldRow = oldRes.rows[0] ?? null;
      if (!oldRow) return null;
      if (oldRow.status === "Terminated") return { error: "mdata_driver_terminated" as const };
      if (oldRow.deactivated_at === null) return { error: "mdata_driver_already_active" as const };

      const res = await client.query(
        `UPDATE mdata.drivers
            SET deactivated_at = NULL,
                status = 'Active'::mdata.driver_status,
                updated_by_user_id = $2
          WHERE id = $1
            AND operating_company_id = $3::uuid
            AND deactivated_at IS NOT NULL
            AND status <> 'Terminated'
          RETURNING id, deactivated_at, status`,
        [parsedParams.data.id, authUser.uuid, oldRow.operating_company_id]
      );
      const changedRow = res.rows[0] ?? null;
      if (!changedRow) return { error: "mdata_driver_state_changed" as const };

      const identityUserId = oldRow.identity_user_id as string | null;
      if (identityUserId) {
        const identityRes = await client.query<{ deactivated_at: string | null }>(
          `UPDATE identity.users SET deactivated_at = NULL WHERE id = $1 AND deactivated_at IS NOT NULL RETURNING deactivated_at`,
          [identityUserId]
        );
        if (identityRes.rows.length > 0) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "identity.users.reactivated_via_driver_reactivation",
            { resource_id: identityUserId, resource_type: "identity.users", driver_id: oldRow.id },
            "info",
            "BT-1-AUTH-DRIVER"
          );
        }
      }

      await appendCrudAudit(client, authUser.uuid, "mdata.drivers.reactivated", {
        resource_id: oldRow.id,
        resource_type: "mdata.drivers",
        operating_company_id: oldRow.operating_company_id,
      });

      return { id: oldRow.id, deactivated_at: changedRow.deactivated_at, status: changedRow.status, was_inactive: true };
    });
    if (!reactivated) return reply.code(404).send({ error: "mdata_driver_not_found" });
    if ("error" in reactivated) return reply.code(409).send({ error: reactivated.error });
    return reactivated;
  });

  app.post("/api/v1/mdata/drivers/:id/enable-phone-login", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        const driverRes = await client.query<{ id: string; operating_company_id: string; phone: string; email: string | null; identity_user_id: string | null; identity_user_deactivated_at: string | null }>(
          `
            SELECT d.id, d.operating_company_id, d.phone, d.email, d.identity_user_id,
                   iu.deactivated_at AS identity_user_deactivated_at
            FROM mdata.drivers d
            LEFT JOIN identity.users iu ON iu.id = d.identity_user_id
            WHERE d.id = $1
              AND d.deactivated_at IS NULL
              AND d.operating_company_id IN (
                SELECT uca.company_id
                  FROM org.user_company_access uca
                  JOIN org.companies oc ON oc.id = uca.company_id AND oc.deactivated_at IS NULL
                 WHERE uca.user_id = $2::uuid
                   AND uca.deactivated_at IS NULL
              )
            LIMIT 1
          `,
          [parsedParams.data.id, authUser.uuid]
        );
        const driver = driverRes.rows[0];
        if (!driver) return { error: "mdata_driver_not_found" as const };
        if (driver.identity_user_id && driver.identity_user_deactivated_at === null) {
          return { error: "driver_phone_login_already_enabled" as const };
        }

        // withCurrentUser commits returned domain errors. This savepoint makes the later lost-link
        // return a real rollback boundary instead of committing the identity row it just created.
        await client.query("SAVEPOINT driver_phone_login_enable");

        // Disable preserves the canonical driver-to-identity link so settlements, messages and audit
        // history do not become orphaned. Re-enable must therefore reactivate that same identity row;
        // creating a replacement account would break every reverse reference to the original user.
        if (driver.identity_user_id) {
          const reactivated = await client.query<{ id: string }>(
            `UPDATE identity.users
                SET deactivated_at = NULL
              WHERE id = $1
                AND deactivated_at IS NOT NULL
              RETURNING id`,
            [driver.identity_user_id]
          );
          if (!reactivated.rows[0]) return { error: "driver_phone_login_state_changed" as const };

          await appendCrudAudit(
            client,
            authUser.uuid,
            "identity.users.reactivated",
            {
              resource_id: driver.identity_user_id,
              resource_type: "identity.users",
              linked_driver_id: driver.id,
            },
            "warning",
            "BT-1-AUTH-DRIVER"
          );
          await client.query("RELEASE SAVEPOINT driver_phone_login_enable");
          return { identity_user_id: driver.identity_user_id, reactivated: true };
        }

        const userRes = await client.query<{ id: string }>(
          `
            INSERT INTO identity.users (email, role, phone)
            VALUES ($1, 'Driver', $2)
            RETURNING id
          `,
          [driver.email ? driver.email.toLowerCase() : null, driver.phone]
        );
        const identityUserId = userRes.rows[0]?.id;
        if (!identityUserId) return { error: "identity_user_create_failed" as const };

        const linked = await client.query(
          `UPDATE mdata.drivers
              SET identity_user_id = $2, updated_by_user_id = $3
            WHERE id = $1
              AND operating_company_id = $4::uuid
              AND identity_user_id IS NULL
              AND deactivated_at IS NULL
            RETURNING id`,
          [driver.id, identityUserId, authUser.uuid, driver.operating_company_id]
        );
        if (!linked.rows[0]) {
          await client.query("ROLLBACK TO SAVEPOINT driver_phone_login_enable");
          await client.query("RELEASE SAVEPOINT driver_phone_login_enable");
          return { error: "driver_phone_login_state_changed" as const };
        }

        await appendCrudAudit(
          client,
          authUser.uuid,
          "identity.users.created",
          {
            resource_id: identityUserId,
            resource_type: "identity.users",
            role: "Driver",
            phone: driver.phone,
            email: driver.email ? driver.email.toLowerCase() : null,
            linked_driver_id: driver.id,
          },
          "warning",
          "BT-1-AUTH-DRIVER"
        );

        await client.query("RELEASE SAVEPOINT driver_phone_login_enable");

        return { identity_user_id: identityUserId };
      });

      if ("error" in updated) {
        if (updated.error === "mdata_driver_not_found") return reply.code(404).send({ error: updated.error });
        if (updated.error === "driver_phone_login_already_enabled") return reply.code(409).send({ error: updated.error });
        if (updated.error === "driver_phone_login_state_changed") return reply.code(409).send({ error: updated.error });
        return reply.code(400).send({ error: updated.error });
      }

      return { ok: true, ...updated };
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "identity_user_phone_conflict" });
      throw err;
    }
  });

  app.post("/api/v1/mdata/drivers/:id/disable-phone-login", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const driverRes = await client.query<{ id: string; identity_user_id: string | null }>(
        `
          SELECT id, identity_user_id
          FROM mdata.drivers
          WHERE id = $1
            AND operating_company_id IN (
              SELECT uca.company_id
                FROM org.user_company_access uca
                JOIN org.companies oc ON oc.id = uca.company_id AND oc.deactivated_at IS NULL
               WHERE uca.user_id = $2::uuid
                 AND uca.deactivated_at IS NULL
            )
          LIMIT 1
        `,
        [parsedParams.data.id, authUser.uuid]
      );
      const driver = driverRes.rows[0];
      if (!driver) return { error: "mdata_driver_not_found" as const };
      if (!driver.identity_user_id) return { error: "driver_phone_login_not_enabled" as const };

      const deactivateRes = await client.query<{ deactivated_at: string | null }>(
        `
          UPDATE identity.users
          SET deactivated_at = now()
          WHERE id = $1
            AND deactivated_at IS NULL
          RETURNING deactivated_at
        `,
        [driver.identity_user_id]
      );
      const changed = deactivateRes.rows.length > 0;
      if (!changed) return { error: "driver_phone_login_already_disabled" as const };
      await appendCrudAudit(
        client,
        authUser.uuid,
        "identity.users.deactivated",
        {
          resource_id: driver.identity_user_id,
          resource_type: "identity.users",
          driver_id: driver.id,
          reason: "manual_phone_login_disable",
        },
        "warning",
        "BT-1-AUTH-DRIVER"
      );
      return { identity_user_id: driver.identity_user_id, changed };
    });

    if ("error" in result) {
      if (result.error === "mdata_driver_not_found") return reply.code(404).send({ error: result.error });
      return reply.code(409).send({ error: result.error });
    }

    return { ok: true, ...result };
  });
}
