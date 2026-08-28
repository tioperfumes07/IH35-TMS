/**
 * Random Pool Service — GAP-81 / FMCSA Part 382 §382.305
 *
 * Quarterly draw: 12.5 % drug / 2.5 % alcohol minimum selection rates.
 *   49 CFR 382.305 sets ANNUAL random minimums of 50 % controlled substances and
 *   10 % alcohol (of average driver positions). A carrier that draws four times a
 *   year must select 50 % ÷ 4 = 12.5 % (drug) and 10 % ÷ 4 = 2.5 % (alcohol) each
 *   quarter to attain the annual minimum. See computeDrawCounts for the details.
 * Cryptographic randomness (node:crypto randomBytes) for FMCSA audit compliance.
 * Each draw is persisted in safety.da_random_pool_draws with full driver UUID array
 * and per-driver test-kind JSONB so any auditor can reproduce the record.
 */
import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { scheduleTest } from "./program.service.js";
import type { TestKind } from "./program.service.js";
import { companyBusinessDate } from "../../lib/company-business-date.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PoolDrawResult = {
  uuid: string;
  operating_company_id: string;
  draw_date: string;
  pool_size: number;
  drug_drawn_count: number;
  alcohol_drawn_count: number;
  drawn_driver_uuids: string[];
  drawn_test_kinds: Record<string, TestKind>;
  created_at: string;
};

export type DrawSummary = PoolDrawResult & {
  test_records_created: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Cryptographic Fisher-Yates shuffle.
 * Uses randomBytes for each swap position — fully non-deterministic and audit-safe.
 */
export function cryptoShuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const randomBuffer = randomBytes(4);
    const randomUint = randomBuffer.readUInt32BE(0);
    const j = randomUint % (i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Minimum selection counts per FMCSA 49 CFR 382.305.
 *
 * Federal ANNUAL random minimums (of average driver positions):
 *   - Controlled substances (drug):  50 %  — 382.305(b)(2). Raised from 25 % to
 *     50 % effective 2020-01-01 (84 FR 68427) and has remained 50 % every year
 *     since (FMCSA confirms the rate by Federal Register notice each December).
 *   - Alcohol:                        10 %  — 382.305(b)(1). The Administrator may
 *     adjust the alcohol minimum year-to-year based on the industry violation rate.
 *
 * A carrier running four random draws per year must select, per QUARTERLY draw:
 *   drug    = 50 % ÷ 4 = 12.5 %      alcohol = 10 % ÷ 4 = 2.5 %
 * so that four quarters attain the annual minimum. Math.ceil (below) guarantees
 * each draw is at least the target, so the annual total is >= the federal floor.
 * Defaults are overridable so the Administrator's annual alcohol adjustment (or a
 * more frequent draw cadence) can be supplied by the caller.
 */
export function computeDrawCounts(
  poolSize: number,
  targetDrugPct = 12.5,
  targetAlcoholPct = 2.5
): { drugCount: number; alcoholCount: number } {
  if (poolSize === 0) return { drugCount: 0, alcoholCount: 0 };
  const drugCount = Math.max(1, Math.ceil((poolSize * targetDrugPct) / 100));
  const alcoholCount = Math.max(1, Math.ceil((poolSize * targetAlcoholPct) / 100));
  return { drugCount, alcoholCount };
}

// ─── Active pool members ──────────────────────────────────────────────────────

export async function listActiveEnrolledDrivers(
  client: PoolClient,
  operatingCompanyId: string
): Promise<string[]> {
  const res = await client.query<{ driver_uuid: string }>(
    `
      -- SAF-F62: ORDER BY must reference the SELECT-list expression, not the raw column. The select
      -- list is the CAST (e.driver_uuid::text) while the ORDER BY was the uncast e.driver_uuid, so
      -- Postgres rejected the statement at parse time: "for SELECT DISTINCT, ORDER BY expressions
      -- must appear in select list". Reproduced verbatim against prod. Ordering by the output alias
      -- keeps the deterministic ordering the draw's auditability depends on.
      SELECT DISTINCT e.driver_uuid::text AS driver_uuid
      FROM safety.da_program_enrollments e
      WHERE e.operating_company_id::text = $1::uuid::text
        AND e.is_active = true
      ORDER BY driver_uuid
    `,
    [operatingCompanyId]
  );
  return res.rows.map((r) => r.driver_uuid);
}

// ─── Bulk enrollment ────────────────────────────────────────────────────────────

/**
 * Enroll every ACTIVE human driver of the company into the consortium random pool.
 *
 * This is the root-cause fix for the "empty pool" defect: the pool query
 * (listActiveEnrolledDrivers) correctly reads safety.da_program_enrollments — an
 * enrollment-based pool is the correct FMCSA consortium design — but no enrollment
 * rows existed because there was no bulk-enroll path. This inserts one active
 * enrollment per eligible driver that is not already actively enrolled.
 *
 * Idempotent under concurrency: the partial unique index is the source of truth and
 * ON CONFLICT prevents two simultaneous bulk enrollments from creating duplicate members.
 *
 * "Active human driver" matches the mdata.drivers list semantics used elsewhere:
 * status = 'Active', not archived, excluding the system pseudo-drivers.
 * Returns the drivers newly enrolled (for the CRUD-audit count).
 */
export async function bulkEnrollActiveDrivers(
  client: PoolClient,
  operatingCompanyId: string,
  consortiumName: string
): Promise<{ enrolledCount: number; enrolledDriverUuids: string[] }> {
  const res = await client.query<{ driver_uuid: string }>(
    `
      INSERT INTO safety.da_program_enrollments
        (operating_company_id, driver_uuid, consortium_name, enrolled_at, is_active)
      SELECT $1, d.id, $2, CURRENT_DATE, true
      FROM mdata.drivers d
      WHERE d.operating_company_id = $1::uuid
        AND d.status = 'Active'
        AND d.archived_at IS NULL
        AND (
          TRIM(d.first_name) || ' ' || TRIM(d.last_name) NOT IN ('Safety Safety', 'System System')
          AND (d.cdl_number IS NULL OR lower(trim(d.cdl_number)) NOT IN ('safety', 'system'))
        )
      ON CONFLICT (operating_company_id, driver_uuid) WHERE is_active = true
      DO NOTHING
      RETURNING driver_uuid::text
    `,
    [operatingCompanyId, consortiumName]
  );
  return {
    enrolledCount: res.rows.length,
    enrolledDriverUuids: res.rows.map((r) => r.driver_uuid),
  };
}

// ─── Draw ─────────────────────────────────────────────────────────────────────

/**
 * Execute a random pool draw.
 *  1. Load active enrolled drivers.
 *  2. Cryptographic shuffle (randomBytes Fisher-Yates).
 *  3. Assign drug / alcohol test kinds.
 *  4. Persist safety.da_random_pool_draws record.
 *  5. Create safety.da_test_records for each selected driver (type=random).
 *
 * FMCSA audit requirement: drawn_driver_uuids and drawn_test_kinds stored verbatim.
 */
export async function drawRandomPool(
  client: PoolClient,
  operatingCompanyId: string,
  options: { targetDrugPct?: number; targetAlcoholPct?: number } = {}
): Promise<DrawSummary> {
  const { targetDrugPct = 12.5, targetAlcoholPct = 2.5 } = options;

  const allDrivers = await listActiveEnrolledDrivers(client, operatingCompanyId);
  const poolSize = allDrivers.length;
  const { drugCount, alcoholCount } = computeDrawCounts(poolSize, targetDrugPct, targetAlcoholPct);

  const shuffled = cryptoShuffle(allDrivers);
  const drugDrivers = shuffled.slice(0, drugCount);
  const remaining = shuffled.slice(drugCount);
  const alcoholDrivers = remaining.slice(0, alcoholCount);

  const drawnDriverUuids = [...new Set([...drugDrivers, ...alcoholDrivers])];
  const drawnTestKinds: Record<string, TestKind> = {};
  for (const uuid of drugDrivers) {
    drawnTestKinds[uuid] = alcoholDrivers.includes(uuid) ? "both" : "drug";
  }
  for (const uuid of alcoholDrivers) {
    if (!drawnTestKinds[uuid]) drawnTestKinds[uuid] = "alcohol";
  }

  const drawDate = companyBusinessDate();

  const drawRes = await client.query<PoolDrawResult>(
    `
      INSERT INTO safety.da_random_pool_draws (
        operating_company_id,
        draw_date,
        pool_size,
        drug_drawn_count,
        alcohol_drawn_count,
        drawn_driver_uuids,
        drawn_test_kinds
      )
      VALUES ($1, $2::date, $3, $4, $5, $6::uuid[], $7::jsonb)
      RETURNING
        uuid::text,
        operating_company_id,
        draw_date::text,
        pool_size,
        drug_drawn_count,
        alcohol_drawn_count,
        drawn_driver_uuids::text[],
        drawn_test_kinds,
        created_at::text
    `,
    [
      operatingCompanyId,
      drawDate,
      poolSize,
      drugCount,
      alcoholCount,
      drawnDriverUuids,
      JSON.stringify(drawnTestKinds),
    ]
  );
  const draw = drawRes.rows[0];
  if (!draw) throw new Error("random_pool_draw_insert_failed");

  let testRecordsCreated = 0;
  for (const driverUuid of drawnDriverUuids) {
    const kind: TestKind = drawnTestKinds[driverUuid] ?? "drug";
    await scheduleTest(client, operatingCompanyId, driverUuid, "random", kind);
    testRecordsCreated += 1;
  }

  return { ...draw, test_records_created: testRecordsCreated };
}

// ─── Draw history ─────────────────────────────────────────────────────────────

export async function listDrawHistory(
  client: PoolClient,
  operatingCompanyId: string,
  limit = 20
): Promise<PoolDrawResult[]> {
  const res = await client.query<PoolDrawResult>(
    `
      SELECT
        uuid::text,
        operating_company_id,
        draw_date::text,
        pool_size,
        drug_drawn_count,
        alcohol_drawn_count,
        drawn_driver_uuids::text[],
        drawn_test_kinds,
        created_at::text
      FROM safety.da_random_pool_draws
      WHERE operating_company_id::text = $1::uuid::text
      ORDER BY draw_date DESC, created_at DESC
      LIMIT $2
    `,
    [operatingCompanyId, limit]
  );
  return res.rows;
}
