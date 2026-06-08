import { appendCrudAudit } from "../audit/crud-audit.js";

export type Queryable = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type ResolvedSettlementMinNet = {
  pct: number;
  cents: number;
  pctSource: "driver" | "company" | "env";
  centsSource: "driver" | "company" | "env";
};

const SOURCE_TAG = "BLOCK-C-DEDUCTION-CAP";

function envMinNetPct(): number {
  const raw = Number(process.env.SETTLEMENT_MIN_NET_PCT ?? 50);
  if (!Number.isFinite(raw)) return 50;
  return Math.min(100, Math.max(0, raw));
}

async function columnExists(client: Queryable, schema: string, table: string, column: string): Promise<boolean> {
  const res = await client.query<{ ok: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
          AND column_name = $3
      ) AS ok
    `,
    [schema, table, column]
  );
  return Boolean(res.rows[0]?.ok);
}

/**
 * Two-tier resolve of the settlement net floor for a driver, mirroring the
 * resolveCompanyCashAdvanceThresholdDollars existence-probe pattern so the
 * service is safe to run before/with the column migration.
 *
 * Per-field independent coalesce (decision C-1-A): pct and cents each resolve
 * down the chain on their own, so a driver.pct override can combine with a
 * company.cents default.
 *
 * Resolve order per field: per-driver override -> company default -> env.
 */
export async function resolveSettlementMinNet(
  client: Queryable,
  driverId: string,
  operatingCompanyId: string
): Promise<ResolvedSettlementMinNet> {
  let pct: number | null = null;
  let cents: number | null = null;
  let pctSource: ResolvedSettlementMinNet["pctSource"] = "env";
  let centsSource: ResolvedSettlementMinNet["centsSource"] = "env";

  const driverHasCols =
    (await columnExists(client, "mdata", "drivers", "min_net_settlement_pct")) &&
    (await columnExists(client, "mdata", "drivers", "min_net_settlement_cents"));

  if (driverHasCols && driverId) {
    const res = await client.query<{ pct: number | null; cents: number | null }>(
      `
        SELECT min_net_settlement_pct AS pct, min_net_settlement_cents AS cents
        FROM mdata.drivers
        WHERE id = $1
        LIMIT 1
      `,
      [driverId]
    );
    const row = res.rows[0];
    if (row) {
      if (row.pct !== null && row.pct !== undefined) {
        pct = Number(row.pct);
        pctSource = "driver";
      }
      if (row.cents !== null && row.cents !== undefined) {
        cents = Number(row.cents);
        centsSource = "driver";
      }
    }
  }

  const needCompany = pct === null || cents === null;
  if (needCompany) {
    const companyHasCols =
      (await columnExists(client, "org", "companies", "min_net_settlement_pct")) &&
      (await columnExists(client, "org", "companies", "min_net_settlement_cents"));

    if (companyHasCols && operatingCompanyId) {
      const res = await client.query<{ pct: number | null; cents: number | null }>(
        `
          SELECT min_net_settlement_pct AS pct, min_net_settlement_cents AS cents
          FROM org.companies
          WHERE id = $1
          LIMIT 1
        `,
        [operatingCompanyId]
      );
      const row = res.rows[0];
      if (row) {
        if (pct === null && row.pct !== null && row.pct !== undefined) {
          pct = Number(row.pct);
          pctSource = "company";
        }
        if (cents === null && row.cents !== null && row.cents !== undefined) {
          cents = Number(row.cents);
          centsSource = "company";
        }
      }
    }
  }

  if (pct === null) {
    pct = envMinNetPct();
    pctSource = "env";
  }
  if (cents === null) {
    cents = 0;
    centsSource = "env";
  }

  pct = Math.min(100, Math.max(0, pct));
  cents = Math.max(0, Math.round(cents));

  return { pct, cents, pctSource, centsSource };
}

export type ApplyPendingDeductionsResult = {
  appliedCount: number;
  appliedCents: number;
  deferredCount: number;
  deferredCents: number;
  grossCents: number;
  floorCents: number;
  availableCents: number;
};

/**
 * Block C apply step. Pulls a driver's pending deductions (oldest-first) and
 * applies them all-or-nothing against the net-floor cap, inserting a
 * settlement_lines 'deduction' row and stamping applied_to_settlement_id for
 * each applied deduction. Skipped deductions stay unapplied (applied_to_settlement_id
 * IS NULL) and auto roll over to the next settlement; each emits a
 * driver_finance.deduction.deferred_over_cap audit event.
 *
 * Must run inside the settlement-close transaction, after earnings lines exist
 * and BEFORE aggregateSettlementTotals recomputes net_pay.
 *
 * Floor math (decision C-2-A, spec literal): available = gross - floor only.
 * Already-applied abandonment chargebacks are intentionally NOT subtracted from
 * the floor calculation.
 */
export async function applyPendingDeductionsToSettlementWithNetFloor(
  client: Queryable,
  input: {
    settlementId: string;
    driverId: string;
    operatingCompanyId: string;
    actorUserId: string;
  }
): Promise<ApplyPendingDeductionsResult> {
  const empty: ApplyPendingDeductionsResult = {
    appliedCount: 0,
    appliedCents: 0,
    deferredCount: 0,
    deferredCents: 0,
    grossCents: 0,
    floorCents: 0,
    availableCents: 0,
  };

  const reg = await client.query<{ ok: boolean }>(
    `SELECT to_regclass('driver_finance.settlement_lines') IS NOT NULL AS ok`
  );
  if (!reg.rows[0]?.ok) return empty;

  // Gross = earnings lines currently on the settlement (dollars -> cents).
  const grossRes = await client.query<{ gross_cents: string | number | null }>(
    `
      SELECT COALESCE(ROUND(SUM(amount) * 100), 0)::bigint AS gross_cents
      FROM driver_finance.settlement_lines
      WHERE settlement_id = $1
        AND line_type IN ('earnings', 'extra_pay', 'team_split_primary', 'team_split_secondary')
    `,
    [input.settlementId]
  );
  const grossCents = Math.max(0, Math.round(Number(grossRes.rows[0]?.gross_cents ?? 0)));

  const minNet = await resolveSettlementMinNet(client, input.driverId, input.operatingCompanyId);
  const floorCents = Math.max(Math.round((grossCents * minNet.pct) / 100), minNet.cents);
  const availableCents = Math.max(0, grossCents - floorCents);

  const pending = await client.query<{ id: string; amount_cents: string | number; reason: string | null; deduction_type: string | null }>(
    `
      SELECT id, amount_cents::bigint AS amount_cents, reason, deduction_type
      FROM driver_finance.driver_settlement_deductions
      WHERE operating_company_id = $1
        AND driver_id = $2
        AND applied_to_settlement_id IS NULL
      ORDER BY created_at ASC, id ASC
      FOR UPDATE
    `,
    [input.operatingCompanyId, input.driverId]
  );

  let runningTotal = 0;
  const result: ApplyPendingDeductionsResult = {
    ...empty,
    grossCents,
    floorCents,
    availableCents,
  };

  for (const row of pending.rows) {
    const amountCents = Math.max(0, Math.round(Number(row.amount_cents ?? 0)));
    if (amountCents <= 0) continue;

    // All-or-nothing per deduction (no partial split).
    if (runningTotal + amountCents <= availableCents) {
      const dollars = amountCents / 100;
      const description = String(row.reason ?? "Settlement deduction").slice(0, 500);

      const lineRes = await client.query<{ id: string }>(
        `
          INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount)
          VALUES ($1, 'deduction', $2, $3)
          RETURNING id
        `,
        [input.settlementId, description, dollars]
      );
      const lineId = lineRes.rows[0]?.id ? String(lineRes.rows[0].id) : "";
      if (!lineId) continue;

      await client.query(
        `
          UPDATE driver_finance.driver_settlement_deductions
          SET applied_to_settlement_id = $2::uuid,
              updated_at = now()
          WHERE id = $1::uuid
        `,
        [row.id, input.settlementId]
      );

      runningTotal += amountCents;
      result.appliedCount += 1;
      result.appliedCents += amountCents;
    } else {
      // Over cap -> defer (roll over to next settlement).
      result.deferredCount += 1;
      result.deferredCents += amountCents;

      await appendCrudAudit(
        client,
        input.actorUserId,
        "driver_finance.deduction.deferred_over_cap",
        {
          resource_type: "driver_finance.driver_settlement_deductions",
          resource_id: row.id,
          operating_company_id: input.operatingCompanyId,
          driver_id: input.driverId,
          settlement_id: input.settlementId,
          amount_cents: amountCents,
          deduction_type: row.deduction_type ?? null,
          gross_cents: grossCents,
          floor_cents: floorCents,
          available_cents: availableCents,
          applied_so_far_cents: runningTotal,
          min_net_pct: minNet.pct,
          min_net_cents: minNet.cents,
          min_net_pct_source: minNet.pctSource,
          min_net_cents_source: minNet.centsSource,
        },
        "info",
        SOURCE_TAG
      );
    }
  }

  return result;
}
