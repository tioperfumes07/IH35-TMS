import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import {
  createDriverCashAdvanceCore,
  createEmployeeLoanCore,
  resolveCompanyCashAdvanceThresholdDollars,
} from "../cash-advances/cash-advance-create.js";
import { createSettlementDeduction, type Queryable as DeductionsQueryable } from "./deductions.service.js";
import { emitDriverRequestSpineEvent } from "./driver-request-spine-emit.js";
import { resolveAccountForCategory } from "../accounting/expense-category-map/resolver.service.js";
import { insertDriverPwaNotification } from "../pwa/driver-notifications.js";

// B4: driver-request timeline source identity (generic so future request types reuse it).
const CASH_ADVANCE_REQUEST_TYPE = "cash_advance";
const CASH_ADVANCE_REQUEST_SOURCE_TABLE = "driver_finance.cash_advance_requests";

// I4 (owner-locked, Phase 2b): maker≠checker authority for cash advances.
//   AUTHORITY roles create + approve with NO separate approval (they ARE the authority; when an authority
//   approves their OWN office-created request the reviewer stays NULL — the DB CHECK
//   cash_advance_requests_maker_ne_checker treats a NULL reviewer as satisfied).
//   All OTHER roles' requests require a DISTINCT approver drawn from the CHECKER set (Admin/Accountant/Owner).
//   The maker (submitted_by_user_id) can NEVER be the checker (reviewed_by_user_id) — enforced here with a
//   409 maker_checker_violation AND by the DB CHECK.
const AUTHORITY_ROLES = new Set(["Owner", "Administrator"]);
const CHECKER_ROLES = new Set(["Owner", "Administrator", "Accountant"]);

export function isCashAdvanceAuthorityRole(role: string | null | undefined): boolean {
  return AUTHORITY_ROLES.has(String(role ?? ""));
}
export function isCashAdvanceCheckerRole(role: string | null | undefined): boolean {
  return CHECKER_ROLES.has(String(role ?? ""));
}

export type CashAdvanceCascadeBranch = "load_bill" | "open_bill" | "loan";
export type CashAdvanceCascadeDetection = {
  branch: CashAdvanceCascadeBranch;
  activeLoadId: string | null;
  linkedDriverBillId: string | null;
};

export type QueryableClient = {
  query: (query: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export const driverCreateCashAdvanceRequestSchema = z.object({
  requested_amount_cents: z.number().int().positive(),
  reason: z.string().trim().min(10).max(4000),
  proposed_recovery_per_settlement_cents: z.number().int().positive().optional(),
  submitted_via: z.enum(["pwa", "office", "phone"]).default("pwa"),
  // [HOLD-FOR-JORGE — TIER 1] Originating load when booked at load creation (office). Driver-initiated
  // (pwa/phone) advances omit it. Nullable FK to mdata.loads — entity-scoped (same operating company as the request).
  load_id: z.string().uuid().nullable().optional(),
});

export const officeApproveBodySchema = z.object({
  approval_notes: z.string().trim().max(4000).optional(),
  // B5: optional book/document date for the disbursement post. Back-dating is role-gated
  // (Owner/Administrator) at the disburse step. YYYY-MM-DD.
  posting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // B5: optional source/bank account credited for the cash-out (defaults to company cash).
  credit_account_id: z.string().uuid().optional(),
});

export const officeDenyBodySchema = z.object({
  denial_reason: z.string().trim().min(1).max(4000),
});

async function resolveActorLabel(client: QueryableClient, userUuid: string | null | undefined): Promise<string | null> {
  if (!userUuid) return null;
  const r = await client.query(`SELECT email::text AS email FROM identity.users WHERE id = $1 LIMIT 1`, [userUuid]);
  const email = r.rows[0]?.email;
  return email ? String(email) : null;
}

async function appendRequestAudit(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    requestId: string;
    eventType: string;
    payload?: Record<string, unknown>;
    actorUserId?: string | null;
    actorName?: string | null;
  }
) {
  await client.query(
    `
      INSERT INTO driver_finance.cash_advance_request_audit (
        operating_company_id,
        request_id,
        event_type,
        event_payload,
        actor_user_id,
        actor_name
      ) VALUES ($1, $2, $3, $4::jsonb, $5, $6)
    `,
    [
      args.operatingCompanyId,
      args.requestId,
      args.eventType,
      JSON.stringify(args.payload ?? {}),
      args.actorUserId ?? null,
      args.actorName ?? null,
    ]
  );
}

async function enqueueDriverFinanceOutbox(client: QueryableClient, eventType: string, payload: Record<string, unknown>) {
  /* outbox-handler-parity: literal-types=["driver_finance.cash_advance_request.submitted","driver_finance.cash_advance_request.cancelled_by_driver","driver_finance.cash_advance_request.approved","driver_finance.cash_advance_request.denied"] */
  await client.query(
    `
      INSERT INTO outbox.events (event_type, payload, next_retry_at)
      VALUES ($1, $2::jsonb, now())
    `,
    [eventType, JSON.stringify(payload)]
  );
}

async function notifyDriverPwaIfAvailable(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    driverId: string;
    title: string;
    message: string;
    payload: Record<string, unknown>;
  }
) {
  // LV-DRIVER-PWA-NOTIFY-SILENTLY-DROPPED — never bare-return when table absent.
  await insertDriverPwaNotification(client, args);
}

export async function nextCashAdvanceRequestDisplayId(client: QueryableClient, operatingCompanyId: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const y = String(year);
  const rows = await client.query(
    `
      SELECT COALESCE(
        MAX(
          CASE
            WHEN display_id ~ ('^CA-' || $2::text || '-[0-9]{4}$')
            THEN right(display_id, 4)::int
            ELSE 0
          END
        ),
        0
      ) + 1 AS next_n
      FROM driver_finance.cash_advance_requests
      WHERE operating_company_id = $1::uuid
    `,
    [operatingCompanyId, y]
  );
  const n = Number(rows.rows[0]?.next_n ?? 1);
  return `CA-${y}-${String(n).padStart(4, "0")}`;
}

export function repaymentScheduleFromRequest(row: Record<string, unknown>): {
  weekly_installment_amount: number;
  total_periods: number;
  cadence: "weekly" | "biweekly";
} {
  const totalCents = Number(row.requested_amount_cents ?? 0);
  const proposed = row.proposed_recovery_per_settlement_cents;
  const dollars = totalCents / 100;
  if (proposed != null && Number(proposed) > 0) {
    const prop = Number(proposed);
    const weekly = prop / 100;
    const periods = Math.min(104, Math.max(1, Math.ceil(totalCents / prop)));
    return { weekly_installment_amount: weekly, total_periods: periods, cadence: "weekly" };
  }
  const periods = 8;
  return {
    weekly_installment_amount: Math.max(0.01, Math.round((dollars / periods) * 100) / 100),
    total_periods: periods,
    cadence: "weekly",
  };
}

export async function createCashAdvanceRequest(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    driverId: string;
    actorUserId: string;
    body: z.infer<typeof driverCreateCashAdvanceRequestSchema>;
  }
) {
  const input = driverCreateCashAdvanceRequestSchema.parse(args.body);
  const thresholdDollars = await resolveCompanyCashAdvanceThresholdDollars(client, args.operatingCompanyId);
  const amountDollars = input.requested_amount_cents / 100;
  const isAbovePolicy = amountDollars > thresholdDollars;
  const displayId = await nextCashAdvanceRequestDisplayId(client, args.operatingCompanyId);
  const actorName = await resolveActorLabel(client, args.actorUserId);

  const ins = await client.query(
    `
      INSERT INTO driver_finance.cash_advance_requests (
        operating_company_id,
        driver_id,
        display_id,
        submitted_via,
        requested_amount_cents,
        reason,
        proposed_recovery_per_settlement_cents,
        status,
        is_above_policy,
        load_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9)
      RETURNING *
    `,
    [
      args.operatingCompanyId,
      args.driverId,
      displayId,
      input.submitted_via,
      input.requested_amount_cents,
      input.reason,
      input.proposed_recovery_per_settlement_cents ?? null,
      isAbovePolicy,
      input.load_id ?? null,
    ]
  );
  const row = ins.rows[0]!;
  const requestId = String(row.id);

  await appendRequestAudit(client, {
    operatingCompanyId: args.operatingCompanyId,
    requestId,
    eventType: "cash_advance_request_submitted",
    payload: {
      display_id: displayId,
      requested_amount_cents: input.requested_amount_cents,
      is_above_policy: isAbovePolicy,
    },
    actorUserId: args.actorUserId,
    actorName,
  });

  // B4: timeline 'requested' step onto the spine (actor = the driver who submitted).
  await emitDriverRequestSpineEvent(client, "requested", {
    operating_company_id: args.operatingCompanyId,
    request_id: requestId,
    request_type: CASH_ADVANCE_REQUEST_TYPE,
    source_table: CASH_ADVANCE_REQUEST_SOURCE_TABLE,
    actor_type: "driver",
    actor_user_id: args.actorUserId,
    actor_role: "Driver",
    payload: { display_id: displayId, submitted_via: input.submitted_via },
  });

  await appendCrudAudit(
    client,
    args.actorUserId,
    "driver_finance.cash_advance_request.submitted",
    {
      request_id: requestId,
      display_id: displayId,
      driver_id: args.driverId,
      requested_amount_cents: input.requested_amount_cents,
      is_above_policy: isAbovePolicy,
    },
    "info"
  );

  await enqueueDriverFinanceOutbox(client, "driver_finance.cash_advance_request.submitted", {
    operating_company_id: args.operatingCompanyId,
    request_id: requestId,
    driver_id: args.driverId,
    display_id: displayId,
    // CASH-ADVANCE-OWNER-NOTIFICATION-FAILURE-RETURNS-SUCCESS: CashAdvanceOwnerNotificationHandler
    // needs the amount + actor to build the owner alert without a second DB round-trip.
    requested_amount_cents: input.requested_amount_cents,
    actor_user_id: args.actorUserId,
  });

  await notifyDriverPwaIfAvailable(client, {
    operatingCompanyId: args.operatingCompanyId,
    driverId: args.driverId,
    title: "Cash advance request submitted",
    message: `Request ${displayId} is pending office review.`,
    payload: { request_id: requestId, display_id: displayId, type: "cash_advance_request_submitted" },
  });

  return { request: row };
}

export const officeCreateCashAdvanceRequestSchema = z.object({
  driver_id: z.string().uuid(),
  requested_amount_cents: z.number().int().positive(),
  reason: z.string().trim().min(10).max(4000),
  proposed_recovery_per_settlement_cents: z.number().int().positive().optional(),
  load_id: z.string().uuid().nullable().optional(),
  // Owner/Admin office-created requests may carry the approve-time options (auto-approve path).
  approval_notes: z.string().trim().max(4000).optional(),
  posting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  credit_account_id: z.string().uuid().optional(),
});

/**
 * I4 OFFICE create path: an office user (the "maker") creates a cash-advance request for a driver. Records
 * submitted_by_user_id = the maker + submitted_via='office'. An AUTHORITY maker (Owner/Administrator)
 * auto-approves in the same call (role IS the authority; reviewer stays NULL, satisfying maker≠checker).
 * A non-authority maker's request stays 'pending' — it needs a DISTINCT Admin/Accountant/Owner checker.
 * Above-policy requests always stay pending (owner-approval flow), regardless of maker role.
 */
export async function createOfficeCashAdvanceRequest(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    actorUserId: string;
    actorRole: string;
    body: z.infer<typeof officeCreateCashAdvanceRequestSchema>;
  }
) {
  const input = officeCreateCashAdvanceRequestSchema.parse(args.body);
  const driverId = input.driver_id;
  const thresholdDollars = await resolveCompanyCashAdvanceThresholdDollars(client, args.operatingCompanyId);
  const isAbovePolicy = input.requested_amount_cents / 100 > thresholdDollars;
  const displayId = await nextCashAdvanceRequestDisplayId(client, args.operatingCompanyId);
  const actorName = await resolveActorLabel(client, args.actorUserId);

  const ins = await client.query(
    `
      INSERT INTO driver_finance.cash_advance_requests (
        operating_company_id, driver_id, display_id, submitted_via,
        requested_amount_cents, reason, proposed_recovery_per_settlement_cents,
        status, is_above_policy, load_id, submitted_by_user_id
      ) VALUES ($1, $2, $3, 'office', $4, $5, $6, 'pending', $7, $8, $9)
      RETURNING *
    `,
    [
      args.operatingCompanyId,
      driverId,
      displayId,
      input.requested_amount_cents,
      input.reason,
      input.proposed_recovery_per_settlement_cents ?? null,
      isAbovePolicy,
      input.load_id ?? null,
      args.actorUserId,
    ]
  );
  const row = ins.rows[0]!;
  const requestId = String(row.id);

  await appendRequestAudit(client, {
    operatingCompanyId: args.operatingCompanyId,
    requestId,
    eventType: "cash_advance_request_submitted",
    payload: { display_id: displayId, requested_amount_cents: input.requested_amount_cents, is_above_policy: isAbovePolicy, submitted_via: "office", submitted_by_user_id: args.actorUserId },
    actorUserId: args.actorUserId,
    actorName,
  });
  await emitDriverRequestSpineEvent(client, "requested", {
    operating_company_id: args.operatingCompanyId,
    request_id: requestId,
    request_type: CASH_ADVANCE_REQUEST_TYPE,
    source_table: CASH_ADVANCE_REQUEST_SOURCE_TABLE,
    actor_type: "user",
    actor_user_id: args.actorUserId,
    actor_role: args.actorRole,
    payload: { display_id: displayId, submitted_via: "office" },
  });
  await appendCrudAudit(client, args.actorUserId, "driver_finance.cash_advance_request.submitted", {
    request_id: requestId, display_id: displayId, driver_id: driverId, requested_amount_cents: input.requested_amount_cents, submitted_via: "office",
  }, "info");
  await enqueueDriverFinanceOutbox(client, "driver_finance.cash_advance_request.submitted", {
    operating_company_id: args.operatingCompanyId, request_id: requestId, driver_id: driverId, display_id: displayId,
    // CASH-ADVANCE-OWNER-NOTIFICATION-FAILURE-RETURNS-SUCCESS: CashAdvanceOwnerNotificationHandler
    // needs the amount + actor to build the owner alert without a second DB round-trip.
    requested_amount_cents: input.requested_amount_cents, actor_user_id: args.actorUserId,
  });

  // AUTHORITY maker + within policy → auto-approve now (reviewer stays NULL; maker≠checker satisfied).
  if (isCashAdvanceAuthorityRole(args.actorRole) && !isAbovePolicy) {
    const approved = await approveCashAdvanceRequest(client, {
      operatingCompanyId: args.operatingCompanyId,
      requestId,
      actorUserId: args.actorUserId,
      actorRole: args.actorRole,
      body: {
        approval_notes: input.approval_notes,
        posting_date: input.posting_date,
        credit_account_id: input.credit_account_id,
      },
    });
    return { request: row, auto_approved: true as const, approval: approved };
  }

  return { request: row, auto_approved: false as const };
}

export async function listMyCashAdvanceRequests(client: QueryableClient, operatingCompanyId: string, driverId: string) {
  const res = await client.query(
    `
      SELECT *
      FROM driver_finance.cash_advance_requests
      WHERE operating_company_id = $1::uuid AND driver_id = $2
      ORDER BY submitted_at DESC
      LIMIT 100
    `,
    [operatingCompanyId, driverId]
  );
  return res.rows;
}

export async function cancelMyCashAdvanceRequest(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    driverId: string;
    requestId: string;
    actorUserId: string;
  }
) {
  const res = await client.query(
    `
      UPDATE driver_finance.cash_advance_requests
      SET status = 'cancelled_by_driver'
      WHERE operating_company_id = $1::uuid
        AND id = $2
        AND driver_id = $3
        AND status = 'pending'
      RETURNING *
    `,
    [args.operatingCompanyId, args.requestId, args.driverId]
  );
  const row = res.rows[0] ?? null;
  if (!row) return null;

  const actorName = await resolveActorLabel(client, args.actorUserId);
  await appendRequestAudit(client, {
    operatingCompanyId: args.operatingCompanyId,
    requestId: args.requestId,
    eventType: "cash_advance_request_cancelled_by_driver",
    payload: { display_id: row.display_id },
    actorUserId: args.actorUserId,
    actorName,
  });
  await appendCrudAudit(client, args.actorUserId, "driver_finance.cash_advance_request.cancelled_by_driver", {
    request_id: args.requestId,
    display_id: row.display_id,
  });
  await enqueueDriverFinanceOutbox(client, "driver_finance.cash_advance_request.cancelled_by_driver", {
    operating_company_id: args.operatingCompanyId,
    request_id: args.requestId,
    driver_id: args.driverId,
  });

  await notifyDriverPwaIfAvailable(client, {
    operatingCompanyId: args.operatingCompanyId,
    driverId: args.driverId,
    title: "Cash advance request cancelled",
    message: `Request ${String(row.display_id ?? "")} was cancelled.`,
    payload: { request_id: args.requestId, display_id: row.display_id, type: "cash_advance_request_cancelled_by_driver" },
  });

  return row;
}

// LINK-F5171/LINK-F5185: settlements:cash_advances reverse — a driver can find their own pending
// cash-advance requests via ?driver_id= (driver_finance.cash_advance_requests.driver_id is a real
// FK, never used as a query filter before this).
export async function listPendingCashAdvanceRequests(
  client: QueryableClient,
  operatingCompanyId: string,
  filter: { driverId?: string | undefined } = {}
) {
  const args: unknown[] = [operatingCompanyId];
  let where = `r.operating_company_id = $1::uuid AND r.status IN ('pending', 'under_review')`;
  if (filter.driverId) {
    args.push(filter.driverId);
    where += ` AND r.driver_id = $${args.length}::uuid`;
  }
  const res = await client.query(
    `
      SELECT
        r.*,
        concat_ws(' ', d.first_name, d.last_name) AS driver_name
      FROM driver_finance.cash_advance_requests r
      JOIN mdata.drivers d ON d.id = r.driver_id
                           AND d.operating_company_id = r.operating_company_id
      WHERE ${where}
      ORDER BY r.is_above_policy ASC, r.submitted_at ASC
      LIMIT 500
    `,
    args
  );
  return res.rows;
}

export async function listCashAdvanceRequests(
  client: QueryableClient,
  operatingCompanyId: string,
  filter: { status?: string | undefined } = {}
) {
  const status = filter.status?.trim();
  const args: unknown[] = [operatingCompanyId];
  let where = `r.operating_company_id = $1::uuid`;
  if (
    status &&
    ["pending", "under_review", "approved", "denied", "expired", "cancelled_by_driver"].includes(status)
  ) {
    where += ` AND r.status = $2`;
    args.push(status);
  }
  const res = await client.query(
    `
      SELECT
        r.*,
        concat_ws(' ', d.first_name, d.last_name) AS driver_name
      FROM driver_finance.cash_advance_requests r
      JOIN mdata.drivers d ON d.id = r.driver_id
                           AND d.operating_company_id = r.operating_company_id
      WHERE ${where}
      ORDER BY r.submitted_at DESC
      LIMIT 300
    `,
    args
  );
  return res.rows;
}

export async function getCashAdvanceRequestDetail(client: QueryableClient, operatingCompanyId: string, requestId: string) {
  const reqRes = await client.query(
    `
      SELECT
        r.*,
        concat_ws(' ', d.first_name, d.last_name) AS driver_name
      FROM driver_finance.cash_advance_requests r
      JOIN mdata.drivers d ON d.id = r.driver_id
                           AND d.operating_company_id = r.operating_company_id
      WHERE r.operating_company_id = $1::uuid AND r.id = $2
      LIMIT 1
    `,
    [operatingCompanyId, requestId]
  );
  const request = reqRes.rows[0] ?? null;
  if (!request) return null;

  const auditRes = await client.query(
    `
      SELECT id, event_type, event_payload, actor_user_id, actor_name, created_at
      FROM driver_finance.cash_advance_request_audit
      WHERE operating_company_id = $1::uuid AND request_id = $2
      ORDER BY id ASC
    `,
    [operatingCompanyId, requestId]
  );

  return { request, audit_log: auditRes.rows };
}

/**
 * B5 cascade branch detection — shared by approveCashAdvanceRequest and the B6 cascade-preview.
 * Pure read (no writes). Routes the advance:
 *   1) active load WITH an open driver_bill for it -> 'load_bill' (linked to that bill)
 *   2) else any open driver_bill -> 'open_bill'
 *   3) else -> 'loan' (employee loan, no bill link)
 * Fork 3: an active load with no open bill falls through 2 -> 3.
 */
export async function detectCashAdvanceCascadeBranch(
  client: QueryableClient,
  operatingCompanyId: string,
  driverId: string
): Promise<CashAdvanceCascadeDetection> {
  let linkedDriverBillId: string | null = null;
  let branch: CashAdvanceCascadeBranch = "loan";

  const activeLoadRes = await client.query(
    `
      SELECT id::text
      FROM mdata.loads
      WHERE operating_company_id = $1::uuid
        AND assigned_primary_driver_id = $2
        AND status IN ('dispatched', 'at_pickup', 'in_transit', 'at_delivery')
        AND soft_deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [operatingCompanyId, driverId]
  );
  const activeLoadId = (activeLoadRes.rows[0] as { id?: string } | undefined)?.id ?? null;

  if (activeLoadId) {
    const loadBillRes = await client.query(
      `
        SELECT id::text
        FROM driver_finance.driver_bills
        WHERE operating_company_id = $1::uuid AND driver_id = $2 AND load_id = $3 AND status = 'open'
        ORDER BY created_at ASC
        LIMIT 1
      `,
      [operatingCompanyId, driverId, activeLoadId]
    );
    const loadBillId = (loadBillRes.rows[0] as { id?: string } | undefined)?.id ?? null;
    if (loadBillId) {
      linkedDriverBillId = loadBillId;
      branch = "load_bill";
    }
  }
  if (!linkedDriverBillId) {
    const openBillRes = await client.query(
      `
        SELECT id::text
        FROM driver_finance.driver_bills
        WHERE operating_company_id = $1::uuid AND driver_id = $2 AND status = 'open'
        ORDER BY created_at ASC
        LIMIT 1
      `,
      [operatingCompanyId, driverId]
    );
    const openBillId = (openBillRes.rows[0] as { id?: string } | undefined)?.id ?? null;
    if (openBillId) {
      linkedDriverBillId = openBillId;
      branch = "open_bill";
    }
  }

  return { branch, activeLoadId, linkedDriverBillId };
}

/**
 * B6 — read-only DRY RUN of the B5 cascade for a pending request. Shows the office user what
 * "Approve & post" WILL do — which branch, the linked load/bill, and the resolved GL account
 * (via the B1 map) — WITHOUT posting or writing anything.
 */
export async function previewCashAdvanceCascade(
  client: QueryableClient,
  operatingCompanyId: string,
  requestId: string
): Promise<
  | { error: "not_found" }
  | {
      branch: CashAdvanceCascadeBranch;
      active_load_id: string | null;
      linked_driver_bill_id: string | null;
      amount_cents: number;
      resolved_account: { id: string; account_number: string | null; account_name: string | null; posting_side: string } | null;
    }
> {
  const reqRes = await client.query(
    `SELECT driver_id::text, requested_amount_cents::bigint FROM driver_finance.cash_advance_requests WHERE operating_company_id = $1::uuid AND id = $2 LIMIT 1`,
    [operatingCompanyId, requestId]
  );
  const req = reqRes.rows[0] as { driver_id?: string; requested_amount_cents?: string } | undefined;
  if (!req?.driver_id) return { error: "not_found" };

  const detection = await detectCashAdvanceCascadeBranch(client, operatingCompanyId, String(req.driver_id));

  let resolved_account: { id: string; account_number: string | null; account_name: string | null; posting_side: string } | null = null;
  try {
    const mapped = await resolveAccountForCategory(operatingCompanyId, "cash_advance", "cash_advance");
    const acc = await client.query(
      `SELECT account_number, account_name FROM catalogs.accounts WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
      [mapped.account_id, operatingCompanyId]
    );
    const a = acc.rows[0] as { account_number?: string | null; account_name?: string | null } | undefined;
    resolved_account = {
      id: mapped.account_id,
      account_number: a?.account_number ?? null,
      account_name: a?.account_name ?? null,
      posting_side: mapped.posting_side,
    };
  } catch {
    resolved_account = null; // map not seeded for this company -> surface as unresolved
  }

  return {
    branch: detection.branch,
    active_load_id: detection.activeLoadId,
    linked_driver_bill_id: detection.linkedDriverBillId,
    amount_cents: Number(req.requested_amount_cents ?? 0),
    resolved_account,
  };
}

/**
 * B6 — read the B4 accountability timeline for one request (requested/viewed/approved/denied/
 * posted + actor/role + elapsed-between-steps) from views.driver_request_timeline. Pure read.
 * Sets app.current_operating_company_id (the event_log RLS key the view runs under).
 */
export async function getCashAdvanceRequestTimeline(
  client: QueryableClient,
  operatingCompanyId: string,
  requestId: string
): Promise<Record<string, unknown> | null> {
  await client.query(`SELECT set_config('app.current_operating_company_id', $1::text, true)`, [operatingCompanyId]);
  const r = await client.query(
    `SELECT * FROM views.driver_request_timeline WHERE request_id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
    [requestId, operatingCompanyId]
  );
  return (r.rows[0] as Record<string, unknown> | undefined) ?? null;
}

export async function approveCashAdvanceRequest(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    requestId: string;
    actorUserId: string;
    actorRole?: string; // B4: acting office role (Owner/Administrator/...) for the timeline
    body: z.infer<typeof officeApproveBodySchema>;
  }
) {
  const input = officeApproveBodySchema.parse(args.body);
  const lock = await client.query(
    `
      SELECT *
      FROM driver_finance.cash_advance_requests
      WHERE operating_company_id = $1::uuid AND id = $2
      FOR UPDATE
    `,
    [args.operatingCompanyId, args.requestId]
  );
  const row = lock.rows[0] ?? null;
  if (!row) return { error: "not_found" as const };
  const status = String(row.status ?? "");
  if (!["pending", "under_review"].includes(status)) return { error: "not_approvable" as const };
  if (new Date(String(row.expires_at)).getTime() < Date.now()) return { error: "expired" as const };
  if (Boolean(row.is_above_policy)) return { error: "above_policy_requires_owner" as const };

  // I4 maker≠checker. The approver MUST hold a CHECKER role (Owner/Administrator/Accountant). An AUTHORITY
  // role approving their OWN office-created request auto-approves with reviewer NULL (role IS the authority);
  // in every other case the recorded reviewer must be a DIFFERENT user than the office maker (submitted_by).
  const role = String(args.actorRole ?? "");
  if (!isCashAdvanceCheckerRole(role)) return { error: "checker_role_forbidden" as const };
  const submittedBy = row.submitted_by_user_id ? String(row.submitted_by_user_id) : null;
  const isAuthority = isCashAdvanceAuthorityRole(role);
  const reviewerToRecord = isAuthority && submittedBy && submittedBy === args.actorUserId ? null : args.actorUserId;
  if (reviewerToRecord && submittedBy && reviewerToRecord === submittedBy) {
    return { error: "maker_checker_violation" as const };
  }

  const driverId = String(row.driver_id);
  const amountDollars = Number(row.requested_amount_cents) / 100;
  const amountCents = Number(row.requested_amount_cents);
  const schedule = repaymentScheduleFromRequest(row);

  // B5 cascade branch detection — extracted into a shared, read-only function so the B6
  // cascade-preview reuses the exact same logic (never duplicated in the frontend).
  const { branch: cascadeBranch, linkedDriverBillId } = await detectCashAdvanceCascadeBranch(
    client,
    args.operatingCompanyId,
    driverId
  );

  const recipientInfo = {
    recipient_type: "driver" as const,
    recipient_name: null,
    bank_reference: null,
    notes: null,
  };
  const core =
    cascadeBranch === "loan"
      ? await createEmployeeLoanCore(client, args.actorUserId, args.operatingCompanyId, {
          driver_id: driverId,
          amount: amountDollars,
          purpose: "other",
          disbursement_method: "comdata",
          recipient_info: recipientInfo,
          repayment_schedule: schedule,
        })
      : await createDriverCashAdvanceCore(client, args.actorUserId, args.operatingCompanyId, {
          driver_id: driverId,
          amount: amountDollars,
          purpose: "other",
          disbursement_method: "comdata",
          recipient_info: recipientInfo,
          linked_bill_id: null,
          repayment_schedule: schedule,
          liability_type: "advance",
          linked_driver_bill_id: linkedDriverBillId,
        });
  if (!core.ok) return { error: "advance_create_failed" as const, details: core };

  // [HOLD-FOR-JORGE — TIER 1] #1440 traceability: forward the originating load from the REQUEST onto the
  // disbursed advance, so driver_finance.driver_advances.load_id mirrors cash_advance_requests.load_id (the
  // load↔advance trace — the whole point of #1440). Booked cash advances carry a load_id; driver-initiated ones
  // don't (NULL, no-op). Entity-scoped to the same operating company.
  if (row.load_id) {
    await client.query(
      `UPDATE driver_finance.driver_advances SET load_id = $1::uuid, updated_at = now()
       WHERE id = $2::uuid AND operating_company_id = $3::uuid AND load_id IS NULL`,
      [row.load_id, core.advanceId, args.operatingCompanyId]
    );
  }

  const notes = input.approval_notes?.trim() ?? null;
  const upd = await client.query(
    `
      UPDATE driver_finance.cash_advance_requests
      SET
        status = 'approved',
        reviewed_at = now(),
        reviewed_by_user_id = $3,
        approval_notes = $4,
        denial_reason = NULL,
        linked_advance_id = $5::uuid
      WHERE operating_company_id = $1::uuid AND id = $2
      RETURNING *
    `,
    // I4: reviewerToRecord is NULL for an AUTHORITY self-approval (role IS the authority), else the distinct
    // checker (maker≠checker already asserted above; the DB CHECK is the backstop).
    [args.operatingCompanyId, args.requestId, reviewerToRecord, notes, core.advanceId]
  );
  const updated = upd.rows[0]!;

  const actorName = await resolveActorLabel(client, args.actorUserId);
  await appendRequestAudit(client, {
    operatingCompanyId: args.operatingCompanyId,
    requestId: args.requestId,
    eventType: "cash_advance_request_approved",
    payload: {
      linked_advance_id: core.advanceId,
      advance_display_id: core.displayId,
      approval_notes: notes,
    },
    actorUserId: args.actorUserId,
    actorName,
  });
  await appendCrudAudit(client, args.actorUserId, "driver_finance.cash_advance_request.approved", {
    request_id: args.requestId,
    linked_advance_id: core.advanceId,
    display_id: updated.display_id,
  });
  // B4: timeline 'approved' step onto the spine (actor = the office user + role).
  await emitDriverRequestSpineEvent(client, "approved", {
    operating_company_id: args.operatingCompanyId,
    request_id: args.requestId,
    request_type: CASH_ADVANCE_REQUEST_TYPE,
    source_table: CASH_ADVANCE_REQUEST_SOURCE_TABLE,
    actor_type: "user",
    actor_user_id: args.actorUserId,
    actor_role: args.actorRole ?? null,
    payload: { linked_advance_id: core.advanceId, advance_display_id: core.displayId },
  });
  await enqueueDriverFinanceOutbox(client, "driver_finance.cash_advance_request.approved", {
    operating_company_id: args.operatingCompanyId,
    request_id: args.requestId,
    driver_id: driverId,
    linked_advance_id: core.advanceId,
  });

  await notifyDriverPwaIfAvailable(client, {
    operatingCompanyId: args.operatingCompanyId,
    driverId: driverId,
    title: "Cash advance approved",
    message: `Request ${String(updated.display_id ?? "")} was approved (${core.displayId}).`,
    payload: {
      request_id: args.requestId,
      request_display_id: updated.display_id,
      advance_id: core.advanceId,
      advance_display_id: core.displayId,
      type: "cash_advance_request_approved",
    },
  });

  // B5: keep the settlement-deduction recovery in ALL branches (the netting line on the next
  // settlement). Complementary to the deduction_schedule amortization created by the core.
  await createSettlementDeduction(client as unknown as DeductionsQueryable, {
    operatingCompanyId: args.operatingCompanyId,
    driverId,
    amountCents,
    sourceType: "cash_advance_repayment",
    reason: `Cash advance ${core.displayId} (request ${String(updated.display_id ?? args.requestId)})`,
    // #1440/load_id-direct: carry the originating load straight onto the recovery deduction (mirrors the
    // load_id we just stamped on driver_advances). Booked advances carry it; driver-initiated → null.
    loadId: (row.load_id as string | null | undefined) ?? null,
    createdByUserId: args.actorUserId,
  });

  return {
    request: updated,
    advance: core.data,
    advanceId: core.advanceId,
    cascadeBranch,
    linkedDriverBillId,
  };
}

export async function denyCashAdvanceRequest(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    requestId: string;
    actorUserId: string;
    actorRole?: string; // B4: acting office role for the timeline
    body: z.infer<typeof officeDenyBodySchema>;
  }
) {
  const input = officeDenyBodySchema.parse(args.body);
  const lock = await client.query(
    `
      SELECT *
      FROM driver_finance.cash_advance_requests
      WHERE operating_company_id = $1::uuid AND id = $2
      FOR UPDATE
    `,
    [args.operatingCompanyId, args.requestId]
  );
  const row = lock.rows[0] ?? null;
  if (!row) return { error: "not_found" as const };
  const status = String(row.status ?? "");
  if (!["pending", "under_review"].includes(status)) return { error: "not_deniable" as const };

  const reason = input.denial_reason.trim();
  const upd = await client.query(
    `
      UPDATE driver_finance.cash_advance_requests
      SET
        status = 'denied',
        reviewed_at = now(),
        reviewed_by_user_id = $3,
        denial_reason = $4,
        approval_notes = NULL,
        owner_approval_token = NULL,
        owner_approval_token_expires_at = NULL,
        owner_approval_required = false
      WHERE operating_company_id = $1::uuid AND id = $2
      RETURNING *
    `,
    [args.operatingCompanyId, args.requestId, args.actorUserId, reason]
  );
  const updated = upd.rows[0]!;

  const actorName = await resolveActorLabel(client, args.actorUserId);
  await appendRequestAudit(client, {
    operatingCompanyId: args.operatingCompanyId,
    requestId: args.requestId,
    eventType: "cash_advance_request_denied",
    payload: { denial_reason: reason },
    actorUserId: args.actorUserId,
    actorName,
  });
  await appendCrudAudit(client, args.actorUserId, "driver_finance.cash_advance_request.denied", {
    request_id: args.requestId,
    display_id: updated.display_id,
  });
  // B4: timeline 'denied' step onto the spine (actor = the office user + role).
  await emitDriverRequestSpineEvent(client, "denied", {
    operating_company_id: args.operatingCompanyId,
    request_id: args.requestId,
    request_type: CASH_ADVANCE_REQUEST_TYPE,
    source_table: CASH_ADVANCE_REQUEST_SOURCE_TABLE,
    actor_type: "user",
    actor_user_id: args.actorUserId,
    actor_role: args.actorRole ?? null,
    payload: { denial_reason: reason },
  });
  await enqueueDriverFinanceOutbox(client, "driver_finance.cash_advance_request.denied", {
    operating_company_id: args.operatingCompanyId,
    request_id: args.requestId,
    driver_id: String(row.driver_id),
  });

  await notifyDriverPwaIfAvailable(client, {
    operatingCompanyId: args.operatingCompanyId,
    driverId: String(row.driver_id),
    title: "Cash advance request denied",
    message: `Request ${String(updated.display_id ?? "")} was denied.`,
    payload: { request_id: args.requestId, display_id: updated.display_id, type: "cash_advance_request_denied" },
  });

  return { request: updated };
}

export async function expireStaleCashAdvanceRequests(client: QueryableClient) {
  const res = await client.query(
    `
      UPDATE driver_finance.cash_advance_requests
      SET
        status = 'expired',
        owner_approval_token = NULL,
        owner_approval_token_expires_at = NULL,
        owner_approval_required = false
      WHERE status IN ('pending', 'under_review')
        AND expires_at < now()
      RETURNING *
    `
  );

  for (const expired of res.rows) {
    const rid = String(expired.id ?? "");
    const oc = String(expired.operating_company_id ?? "");
    const driverId = String(expired.driver_id ?? "");
    await appendRequestAudit(client, {
      operatingCompanyId: oc,
      requestId: rid,
      eventType: "cash_advance_request_expired",
      payload: { display_id: expired.display_id },
      actorUserId: null,
      actorName: "system",
    });
    await notifyDriverPwaIfAvailable(client, {
      operatingCompanyId: oc,
      driverId,
      title: "Cash advance request expired",
      message: `Request ${String(expired.display_id ?? "")} expired before review.`,
      payload: { request_id: rid, display_id: expired.display_id, type: "cash_advance_request_expired" },
    });
  }

  return res.rows;
}
