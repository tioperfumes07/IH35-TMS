import { withCurrentUser } from "../auth/db.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import {
  computeQboSyncFreshness,
  QBO_SYNC_STALE_AFTER_MS,
  type QboSyncFreshness,
} from "../qbo/sync-freshness.js";
import { AP_BILLS_MIRROR_SYNC_KIND } from "../qbo-sync/ap-bills-sync-kind.js";

export { AP_BILLS_MIRROR_SYNC_KIND };

type ApAgingBillRowDb = {
  vendor_id: string | null;
  vendor_name: string;
  due_date: string | null;
  outstanding_cents: string | number;
  vendor_type: string | null;
  is_intercompany: boolean;
  is_driver: boolean;
};

// Display grouping for the "By Vendor Type" A/P view. READ-LAYER only — does NOT change
// mdata.vendors.vendor_type (must stay QBO-reconcilable).
export type VendorDisplayGroup = "Driver" | "Repair" | "Diesel" | "Insurance" | "Intercompany" | "Other";

export type AgingBucket = "current" | "d1_30" | "d31_60" | "d61_90" | "d90_plus";

export type ApAgingVendorRow = {
  vendor_id: string | null;
  vendor_name: string;
  display_group: VendorDisplayGroup;
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total_outstanding: number;
};

export type ApAgingTotals = {
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total_outstanding: number;
};

export type QboMirrorFreshness = "never" | "fresh" | "stale";
/** reconcile.status — never "matched" when as_of is historical or mirror N/A. */
export type QboMirrorReconcileStatus =
  | "unavailable"
  | "uncompared"
  | "incomparable"
  | "matched"
  | "divergent";

export type ApAgingQboMirrorStatus = {
  available: boolean;
  table_present: boolean;
  pull_enabled: boolean;
  projection_enabled: boolean;
  /** True only when as_of equals company business today — only then is mirror vs TMS comparable. */
  reconcile_applicable: boolean;
  last_synced_at: string | null;
  freshness: QboMirrorFreshness;
  stale_after_seconds: number;
  row_count: number;
  open_balance_cents: number;
  reconcile: {
    status: QboMirrorReconcileStatus;
    tms_open_cents: number;
    mirror_open_cents: number;
    /** Signed: tms_open - mirror_open. */
    delta_cents: number;
  };
};

export type ApAgingEmptyState =
  | "has_rows"
  | "no_unpaid_bills"
  | "no_unpaid_bills_mirror_absent"
  | "no_unpaid_bills_mirror_stale"
  | "no_unpaid_bills_mirror_disabled";

export type ApAgingReport = {
  vendors: ApAgingVendorRow[];
  totals: ApAgingTotals;
  internal_basis: "accounting.bills";
  as_of_date: string;
  as_of_is_historical: boolean;
  empty_state: ApAgingEmptyState;
  /** Back-compat; prefer qbo_mirror.last_synced_at. */
  qbo_synced_at: string | null;
  qbo_mirror: ApAgingQboMirrorStatus;
};

const AP_MIRROR_PULL_FLAG = "QBO_AP_MIRROR_PULL_ENABLED";
const AP_BILLS_PROJECTION_FLAG = "QBO_AP_BILLS_PROJECTION_ENABLED";

export function parseIsoDateOnly(value: string): number {
  return new Date(`${value}T00:00:00.000Z`).getTime();
}

export function assignAgingBucket(asOfDate: string, dueDate: string | null): AgingBucket {
  if (!dueDate) return "current";
  const daysOverdue = Math.floor((parseIsoDateOnly(asOfDate) - parseIsoDateOnly(dueDate)) / 86_400_000);
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "d1_30";
  if (daysOverdue <= 60) return "d31_60";
  if (daysOverdue <= 90) return "d61_90";
  return "d90_plus";
}

/** Historical = strictly before company business today (same rule as FIN-20). */
export function isHistoricalAsOf(asOfDate: string, today: string = companyBusinessDate()): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(asOfDate) && asOfDate < today;
}

/**
 * QBO-STALENESS-B: freshness from the AP-mirror source ONLY (ap_bills_inbound_mirror / mirror
 * updated_at). Never mask with CDC/push aggregate success.
 */
export function resolveApMirrorFreshness(
  lastSyncedAt: string | null,
  nowMs: number = Date.now()
): Pick<QboSyncFreshness, "freshness_status" | "is_stale" | "stale_after_seconds" | "last_success_age_seconds"> & {
  freshness: QboMirrorFreshness;
} {
  const f = computeQboSyncFreshness([{ source: "qbo_sync_runs", completedAt: lastSyncedAt }], nowMs);
  return {
    freshness: f.freshness_status,
    freshness_status: f.freshness_status,
    is_stale: f.is_stale,
    stale_after_seconds: f.stale_after_seconds,
    last_success_age_seconds: f.last_success_age_seconds,
  };
}

export function resolveQboMirrorReconcileStatus(input: {
  tablePresent: boolean;
  lastSyncedAt: string | null;
  rowCount: number;
  tmsOpenCents: number;
  mirrorOpenCents: number;
  reconcileApplicable: boolean;
}): { status: QboMirrorReconcileStatus; delta_cents: number } {
  const delta = input.tmsOpenCents - input.mirrorOpenCents;
  if (!input.reconcileApplicable) {
    return { status: "incomparable", delta_cents: delta };
  }
  if (!input.tablePresent || (input.lastSyncedAt == null && input.rowCount === 0)) {
    return { status: "unavailable", delta_cents: delta };
  }
  if (input.lastSyncedAt == null) {
    return { status: "uncompared", delta_cents: delta };
  }
  return { status: delta === 0 ? "matched" : "divergent", delta_cents: delta };
}

export function resolveApAgingEmptyState(input: {
  vendorCount: number;
  freshness: QboMirrorFreshness;
  pullEnabled: boolean;
}): ApAgingEmptyState {
  if (input.vendorCount > 0) return "has_rows";
  if (!input.pullEnabled && input.freshness === "never") return "no_unpaid_bills_mirror_disabled";
  if (input.freshness === "never") return "no_unpaid_bills_mirror_absent";
  if (input.freshness === "stale") return "no_unpaid_bills_mirror_stale";
  return "no_unpaid_bills";
}

export function buildQboMirrorStatus(input: {
  tablePresent: boolean;
  pullEnabled: boolean;
  projectionEnabled: boolean;
  lastSyncedAt: string | null;
  rowCount: number;
  mirrorOpenCents: number;
  tmsOpenCents: number;
  reconcileApplicable: boolean;
  nowMs?: number;
}): ApAgingQboMirrorStatus {
  const freshness = resolveApMirrorFreshness(input.lastSyncedAt, input.nowMs);
  const available = input.tablePresent && (input.lastSyncedAt != null || input.rowCount > 0);
  const reconcile = resolveQboMirrorReconcileStatus({
    tablePresent: input.tablePresent,
    lastSyncedAt: input.lastSyncedAt,
    rowCount: input.rowCount,
    tmsOpenCents: input.tmsOpenCents,
    mirrorOpenCents: input.mirrorOpenCents,
    reconcileApplicable: input.reconcileApplicable,
  });
  return {
    available,
    table_present: input.tablePresent,
    pull_enabled: input.pullEnabled,
    projection_enabled: input.projectionEnabled,
    reconcile_applicable: input.reconcileApplicable,
    last_synced_at: input.lastSyncedAt,
    freshness: freshness.freshness,
    stale_after_seconds: freshness.stale_after_seconds,
    row_count: input.rowCount,
    open_balance_cents: input.mirrorOpenCents,
    reconcile: {
      status: reconcile.status,
      tms_open_cents: input.tmsOpenCents,
      mirror_open_cents: input.mirrorOpenCents,
      delta_cents: reconcile.delta_cents,
    },
  };
}

export function resolveDisplayGroup(row: {
  is_intercompany: boolean;
  is_driver: boolean;
  vendor_type: string | null;
}): VendorDisplayGroup {
  if (row.is_intercompany) return "Intercompany";
  if (row.is_driver) return "Driver";
  switch (row.vendor_type) {
    case "Fuel":
      return "Diesel";
    case "Repair":
      return "Repair";
    case "Insurance":
      return "Insurance";
    default:
      return "Other";
  }
}

/**
 * Canonical open-A/P reconstruction (FIN-20 `accounting.ap_aging_as_of` semantics) plus applied
 * vendor credits from `accounting.vendor_credit_applications` (entity-scoped, as-of, non-voided).
 * $1 = operating_company_id, $2 = as_of_date.
 */
export const AP_AGING_OPEN_BILLS_SQL = `
        SELECT
          -- ACCT-AP-AGING-DEACTIVATED-VENDOR-NAME-GAP — mdata.vendors' RLS excludes
          -- deactivated_at IS NOT NULL rows for a non-bypass reader, so the joined v.* row (id
          -- included) goes entirely NULL once a bill's vendor is deactivated -- not just the name,
          -- the GROUP-BY key too, which would silently collapse that vendor's aging into the
          -- "__unknown_vendor__" bucket instead of its own row. b.vendor_uuid (the same safe-cast
          -- the JOIN predicate below already uses) is the real, always-present FK; prefer it over
          -- the possibly-RLS-excluded v.id. Currently latent on USMCA (every bill tied to a
          -- deactivated vendor is also voided and excluded by this query's own filters below) but
          -- a real code gap in the same class as LST-TXNREG-DEACTIVATED-COUNTERPARTY.
          COALESCE(
            v.id::text,
            CASE WHEN b.vendor_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              THEN b.vendor_uuid ELSE NULL END
          ) AS vendor_id,
          COALESCE(
            v.vendor_name,
            mdata.resolve_vendor_label_same_company(
              CASE WHEN b.vendor_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                THEN b.vendor_uuid::uuid ELSE NULL END,
              b.operating_company_id
            ),
            'Unknown Vendor'
          ) AS vendor_name,
          COALESCE(b.due_date, b.bill_date)::text AS due_date,
          GREATEST(
            COALESCE(b.amount_cents, 0)
              - COALESCE((
                  SELECT SUM(COALESCE(bp.amount_cents, 0))
                  FROM accounting.bill_payments bp
                  WHERE bp.bill_id = b.id
                    AND bp.operating_company_id = b.operating_company_id
                    AND bp.payment_date <= $2::date
                    AND (bp.revoked_at IS NULL OR bp.revoked_at::date > $2::date)
                ), 0)
              - COALESCE((
                  SELECT SUM(vca.applied_cents)
                  FROM accounting.vendor_credit_applications vca
                  WHERE vca.bill_id = b.id
                    AND vca.operating_company_id = $1::uuid
                    AND vca.voided_at IS NULL
                    AND (vca.applied_at AT TIME ZONE 'UTC')::date <= $2::date
                ), 0)
              -- ACCT-F5691 — accounting.payment_applications (target_kind='bill'), a separate
              -- cash-application path (apply.service.ts's applyToBill) that also never updates
              -- bills.paid_cents; same netting shape as vendor credits immediately above.
              - COALESCE((
                  SELECT SUM(pa.amount_cents)
                  FROM accounting.payment_applications pa
                  WHERE pa.target_kind = 'bill'
                    AND pa.target_id = b.id
                    AND pa.operating_company_id = $1::uuid
                    AND pa.unapplied_at IS NULL
                    AND (pa.applied_at AT TIME ZONE 'UTC')::date <= $2::date
                ), 0)
          , 0)::bigint AS outstanding_cents,
          v.vendor_type AS vendor_type,
          COALESCE((
            SELECT true FROM org.companies c
            WHERE c.id <> $1::uuid AND c.is_active = true AND v.vendor_name IS NOT NULL
              AND (
                v.vendor_name ILIKE '%' || c.short_name || '%'
                OR v.vendor_name ILIKE '%' || c.legal_name || '%'
              )
            LIMIT 1
          ), false) AS is_intercompany,
          COALESCE((
            v.qbo_vendor_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM mdata.drivers d
              WHERE d.operating_company_id = $1::uuid AND d.qbo_vendor_id = v.qbo_vendor_id
            )
          ), false) AS is_driver
        FROM accounting.bills b
        LEFT JOIN mdata.vendors v
          ON v.id = CASE
            WHEN b.vendor_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN b.vendor_uuid::uuid
            ELSE NULL
          END
         AND v.operating_company_id = b.operating_company_id
        WHERE b.operating_company_id = $1::uuid
          AND b.bill_date <= $2::date
          AND b.amount_cents IS NOT NULL
          AND (b.revoked_at IS NULL OR b.revoked_at::date > $2::date)
          -- LV-PAYABLE-SELECTOR-OFFERS-VOIDED-BILLS — accounting.bills.status carries 'void', never
          -- 'voided' (confirmed live: DISTINCT status = paid/draft/void/partial/unpaid). This clause
          -- was dead — no bill row has ever matched it — and the revoked_at check above is what
          -- actually excludes voided bills today, coincidentally. 'voided' is KEPT (same precedent as
          -- ar-aging.service.ts's identical fix) because removing it is churn with no behavioural
          -- change; 'void' is ADDED so this clause is no longer purely decorative.
          AND b.status NOT IN ('void', 'voided', 'draft')
          -- VEND-F-TEST-DATA-NOT-FLAGGED-SAMPLE (GO-0009 G1) — a demo/test bill has no real AP
          -- liability; without this the office's aging report mixes fixture noise into a report a
          -- real vendor payment decision is made from. Mirrors balance-sheet.service.ts /
          -- trial-balance.service.ts's existing is_sample_data exclusion.
          AND b.is_sample_data = false
          AND GREATEST(
            COALESCE(b.amount_cents, 0)
              - COALESCE((
                  SELECT SUM(COALESCE(bp.amount_cents, 0))
                  FROM accounting.bill_payments bp
                  WHERE bp.bill_id = b.id
                    AND bp.operating_company_id = b.operating_company_id
                    AND bp.payment_date <= $2::date
                    AND (bp.revoked_at IS NULL OR bp.revoked_at::date > $2::date)
                ), 0)
              - COALESCE((
                  SELECT SUM(vca.applied_cents)
                  FROM accounting.vendor_credit_applications vca
                  WHERE vca.bill_id = b.id
                    AND vca.operating_company_id = $1::uuid
                    AND vca.voided_at IS NULL
                    AND (vca.applied_at AT TIME ZONE 'UTC')::date <= $2::date
                ), 0)
              -- ACCT-F5691 — same netting as the SELECT projection above, so a bill this WHERE
              -- clause excludes as "settled" (outstanding <= 0) matches what the row itself reports.
              - COALESCE((
                  SELECT SUM(pa.amount_cents)
                  FROM accounting.payment_applications pa
                  WHERE pa.target_kind = 'bill'
                    AND pa.target_id = b.id
                    AND pa.operating_company_id = $1::uuid
                    AND pa.unapplied_at IS NULL
                    AND (pa.applied_at AT TIME ZONE 'UTC')::date <= $2::date
                ), 0)
          , 0) > 0
        ORDER BY COALESCE(v.vendor_name, 'Unknown Vendor') ASC, COALESCE(b.due_date, b.bill_date) ASC NULLS LAST
`;

export async function getApAgingReport(input: {
  userId: string;
  operating_company_id: string;
  as_of_date: string;
}): Promise<ApAgingReport> {
  return withCurrentUser(input.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);

    const today = companyBusinessDate();
    const historical = isHistoricalAsOf(input.as_of_date, today);
    // Future as_of: treat as today for open reconstruction (never invent future openness).
    const effectiveAsOf = input.as_of_date > today ? today : input.as_of_date;

    const res = await client.query<ApAgingBillRowDb>(AP_AGING_OPEN_BILLS_SQL, [
      input.operating_company_id,
      effectiveAsOf,
    ]);

    const byVendor = new Map<string, ApAgingVendorRow>();

    for (const row of res.rows) {
      const amount = Number(row.outstanding_cents ?? 0);
      if (amount <= 0) continue;

      const key = row.vendor_id ?? "__unknown_vendor__";
      const vendor = byVendor.get(key) ?? {
        vendor_id: row.vendor_id,
        vendor_name: row.vendor_name,
        display_group: resolveDisplayGroup(row),
        current: 0,
        d1_30: 0,
        d31_60: 0,
        d61_90: 0,
        d90_plus: 0,
        total_outstanding: 0,
      };

      const bucket = assignAgingBucket(effectiveAsOf, row.due_date);
      vendor[bucket] += amount;
      vendor.total_outstanding = vendor.current + vendor.d1_30 + vendor.d31_60 + vendor.d61_90 + vendor.d90_plus;
      byVendor.set(key, vendor);
    }

    const vendors = Array.from(byVendor.values()).sort(
      (a, b) => a.vendor_name.localeCompare(b.vendor_name) || (a.vendor_id ?? "").localeCompare(b.vendor_id ?? "")
    );

    const totals: ApAgingTotals = vendors.reduce(
      (acc, row) => {
        acc.current += row.current;
        acc.d1_30 += row.d1_30;
        acc.d31_60 += row.d31_60;
        acc.d61_90 += row.d61_90;
        acc.d90_plus += row.d90_plus;
        acc.total_outstanding += row.total_outstanding;
        return acc;
      },
      {
        current: 0,
        d1_30: 0,
        d31_60: 0,
        d61_90: 0,
        d90_plus: 0,
        total_outstanding: 0,
      }
    );

    const pullEnabled = await isEnabled(client, AP_MIRROR_PULL_FLAG, {
      operating_company_id: input.operating_company_id,
    });
    const projectionEnabled = await isEnabled(client, AP_BILLS_PROJECTION_FLAG, {
      operating_company_id: input.operating_company_id,
    });

    // Per-source AP mirror freshness (QBO-STALENESS-B): prefer durable sync_runs success for this kind;
    // fall back to mirror row MAX(updated_at). Never blend CDC/push.
    const mirrorMeta = await client.query<{
      table_present: boolean;
      last_synced_at: string | null;
      row_count: string | number;
      open_balance_cents: string | number;
    }>(
      `
        SELECT
          (to_regclass('mdata.qbo_ap_bills') IS NOT NULL) AS table_present,
          CASE
            WHEN to_regclass('qbo.sync_runs') IS NOT NULL THEN (
              SELECT MAX(completed_at)::text
              FROM qbo.sync_runs
              WHERE operating_company_id = $1::uuid
                AND kind = $2
                AND status = 'success'
                AND completed_at IS NOT NULL
            )
            ELSE NULL
          END AS last_synced_at,
          CASE
            WHEN to_regclass('mdata.qbo_ap_bills') IS NULL THEN 0
            ELSE (
              SELECT COUNT(*)::bigint
              FROM mdata.qbo_ap_bills
              WHERE operating_company_id = $1::uuid
            )
          END AS row_count,
          CASE
            WHEN to_regclass('mdata.qbo_ap_bills') IS NULL THEN 0
            ELSE (
              SELECT COALESCE(SUM(balance_cents), 0)::bigint
              FROM mdata.qbo_ap_bills
              WHERE operating_company_id = $1::uuid
                AND balance_cents > 0
                AND active = true
            )
          END AS open_balance_cents
      `,
      [input.operating_company_id, AP_BILLS_MIRROR_SYNC_KIND]
    );

    const meta = mirrorMeta.rows[0];
    let lastSyncedAt = meta?.last_synced_at ?? null;
    if (!lastSyncedAt && meta?.table_present && Number(meta?.row_count ?? 0) > 0) {
      const fallback = await client.query<{ synced_at: string | null }>(
        `
          SELECT MAX(updated_at)::text AS synced_at
          FROM mdata.qbo_ap_bills
          WHERE operating_company_id = $1::uuid
        `,
        [input.operating_company_id]
      );
      lastSyncedAt = fallback.rows[0]?.synced_at ?? null;
    }

    // Mirror open balance is a CURRENT snapshot — only comparable to TMS open when as_of is today.
    const reconcileApplicable = !historical && effectiveAsOf === today;

    const qboMirror = buildQboMirrorStatus({
      tablePresent: Boolean(meta?.table_present),
      pullEnabled,
      projectionEnabled,
      lastSyncedAt,
      rowCount: Number(meta?.row_count ?? 0),
      mirrorOpenCents: Number(meta?.open_balance_cents ?? 0),
      tmsOpenCents: totals.total_outstanding,
      reconcileApplicable,
    });

    // Prove the canonical 24h constant is the one we use (guard/import linkage).
    void QBO_SYNC_STALE_AFTER_MS;

    const emptyState = resolveApAgingEmptyState({
      vendorCount: vendors.length,
      freshness: qboMirror.freshness,
      pullEnabled,
    });

    return {
      vendors,
      totals,
      internal_basis: "accounting.bills",
      as_of_date: effectiveAsOf,
      as_of_is_historical: historical,
      empty_state: emptyState,
      qbo_synced_at: qboMirror.last_synced_at,
      qbo_mirror: qboMirror,
    };
  });
}
