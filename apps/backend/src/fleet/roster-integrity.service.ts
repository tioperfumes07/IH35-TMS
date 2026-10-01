/**
 * ROUND 313 CC-1 #1 — E-17 FLEET ROSTER INTEGRITY.
 * Reconciles every active unit (mdata.units, operating entity = COALESCE(currently_leased_to_company_id,
 * owner_company_id)) against the systems that must agree with it:
 *   Samsara   integrations.samsara_vehicles (local_unit_id, else samsara_vehicle_id)
 *   insurance insurance.policy_unit -> mdata.assets.unit_id -> insurance.policy (status, expiry)
 *   IRP       mdata.units.irp_account_number / texas_irp_number / irp_expiration (trucks)
 *   lease     the entity that actually ran the truck's loads vs owner / leased-to
 * One row per mismatch in fleet.roster_findings; a finding no longer detected is RESOLVED, never deleted.
 * IFTA is licensed per carrier, not per unit, so it is not a per-unit check here.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export const ROSTER_RULES = {
  SAMSARA_UNLINKED: { severity: "warning", label: "No Samsara vehicle linked" },
  SAMSARA_STALE: { severity: "warning", label: "Samsara silent > 72 h" },
  SAMSARA_VIN_MISMATCH: { severity: "critical", label: "Samsara VIN differs from the unit VIN" },
  SAMSARA_ORPHAN: { severity: "warning", label: "Samsara vehicle reporting with no TMS unit" },
  SAMSARA_REPORTS_FOR_DEACTIVATED_UNIT: { severity: "warning", label: "Deactivated unit still reporting to Samsara" },
  SAMSARA_OPCO_MISMATCH: { severity: "critical", label: "Samsara vehicle filed under a different entity" },
  INSURANCE_NOT_SCHEDULED: { severity: "critical", label: "Active unit not on any active insurance schedule" },
  INSURANCE_POLICY_EXPIRED: { severity: "critical", label: "Unit only on expired / cancelled policies" },
  INSURANCE_ON_DEACTIVATED_UNIT: { severity: "warning", label: "Deactivated unit still on an active policy (premium)" },
  INSURANCE_ASSET_UNLINKED: { severity: "warning", label: "Insured tractor asset not linked to a TMS unit" },
  IRP_MISSING: { severity: "warning", label: "Truck has no IRP account" },
  IRP_EXPIRED: { severity: "critical", label: "IRP registration expired" },
  LEASE_ENTITY_MISMATCH: { severity: "critical", label: "Truck ran loads for an entity that neither owns nor leases it" },
  VEHICLE_TYPE_UNCLASSIFIED: { severity: "info", label: "Vehicle type not set" },
} as const;
export type RosterRule = keyof typeof ROSTER_RULES;
export const SAMSARA_STALE_HOURS = 72;
export const LEASE_LOOKBACK_DAYS = 30;
const TRUCK_TYPES = ["Tractor", "Straight Truck", "Box Truck"];

export type DetectedFinding = {
  rule_code: RosterRule;
  unit_id: string | null;
  samsara_vehicle_id: string | null;
  policy_id: string | null;
  asset_id: string | null;
  detail: string;
  evidence: Record<string, unknown>;
};

/** Pure: the stable key that makes one OPEN finding per mismatch. */
export function findingKey(f: Pick<DetectedFinding, "rule_code" | "unit_id" | "samsara_vehicle_id" | "policy_id" | "asset_id">): string {
  return [f.rule_code, f.unit_id ?? "-", f.samsara_vehicle_id ?? "-", f.policy_id ?? "-", f.asset_id ?? "-"].join("|");
}

export async function detectRosterFindings(client: DbClient, opco: string): Promise<DetectedFinding[]> {
  const r = await client.query<DetectedFinding & { evidence: Record<string, unknown> }>(
    `WITH u AS (
       SELECT u.* FROM mdata.units u
        WHERE COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid
          AND COALESCE(u.is_sample_data, false) = false),
     active AS (SELECT * FROM u WHERE deactivated_at IS NULL),
     sv AS (
       SELECT DISTINCT ON (a.id) a.id AS unit_id, s.samsara_vehicle_id, s.operating_company_id AS sv_opco, s.last_seen_at,
              NULLIF(btrim(s.raw_payload->>'vin'), '') AS sv_vin
         FROM u a
         JOIN integrations.samsara_vehicles s
           ON s.local_unit_id = a.id OR (s.local_unit_id IS NULL AND s.samsara_vehicle_id = a.samsara_vehicle_id)
        ORDER BY a.id, (s.local_unit_id = a.id) DESC NULLS LAST, s.last_seen_at DESC NULLS LAST),
     -- Freshness = the unit's latest REAL position (telematics.vehicle_locations). Measured 2026-10-01:
     -- integrations.samsara_vehicles.last_seen_at is not refreshed by the live ingest (all 16 USMCA trucks read
     -- 05/23/2026 11:38 while positions flowed today), so it is only the fallback.
     pos AS (
       SELECT a.id AS unit_id,
              (SELECT max(v.captured_at) FROM telematics.vehicle_locations v
                WHERE v.operating_company_id = $1::uuid AND v.unit_id = a.id
                  AND v.captured_at >= now() - interval '30 days') AS last_position_at
         FROM u a),
     ins AS (
       SELECT a.unit_id, pu.policy_id, pu.asset_id, p.policy_number, p.status, p.expiry_date, p.cancelled_on
         FROM insurance.policy_unit pu
         JOIN mdata.assets a ON a.id = pu.asset_id
         JOIN insurance.policy p ON p.id = pu.policy_id
        WHERE pu.removed_at IS NULL AND pu.operating_company_id = $1::uuid)
     SELECT 'SAMSARA_UNLINKED' AS rule_code, a.id::text AS unit_id, NULL::text AS samsara_vehicle_id, NULL::text AS policy_id, NULL::text AS asset_id,
            'Unit ' || a.unit_number || ' has no Samsara vehicle linked' AS detail,
            jsonb_build_object('unit_number', a.unit_number, 'units_samsara_vehicle_id', a.samsara_vehicle_id) AS evidence
       FROM active a WHERE NOT EXISTS (SELECT 1 FROM sv WHERE sv.unit_id = a.id)
     UNION ALL
     SELECT 'SAMSARA_STALE', a.id::text, sv.samsara_vehicle_id, NULL, NULL,
            'Unit ' || a.unit_number || ' last reported a position ' ||
              COALESCE(to_char(COALESCE(pos.last_position_at, sv.last_seen_at) AT TIME ZONE 'America/Chicago', 'MM/DD/YYYY HH24:MI'), 'never'),
            jsonb_build_object('last_position_at', pos.last_position_at, 'samsara_last_seen_at', sv.last_seen_at)
       FROM active a JOIN sv ON sv.unit_id = a.id LEFT JOIN pos ON pos.unit_id = a.id
      WHERE COALESCE(pos.last_position_at, sv.last_seen_at) IS NULL
         OR COALESCE(pos.last_position_at, sv.last_seen_at) < now() - make_interval(hours => $2::int)
     UNION ALL
     SELECT 'SAMSARA_VIN_MISMATCH', a.id::text, sv.samsara_vehicle_id, NULL, NULL,
            'Unit ' || a.unit_number || ' VIN ' || a.vin || ' but Samsara reports ' || sv.sv_vin,
            jsonb_build_object('unit_vin', a.vin, 'samsara_vin', sv.sv_vin)
       FROM active a JOIN sv ON sv.unit_id = a.id
      WHERE NULLIF(btrim(a.vin), '') IS NOT NULL AND sv.sv_vin IS NOT NULL AND upper(btrim(a.vin)) <> upper(sv.sv_vin)
     UNION ALL
     SELECT 'SAMSARA_OPCO_MISMATCH', a.id::text, sv.samsara_vehicle_id, NULL, NULL,
            'Unit ' || a.unit_number || ' Samsara vehicle is filed under another entity',
            jsonb_build_object('samsara_operating_company_id', sv.sv_opco)
       FROM active a JOIN sv ON sv.unit_id = a.id WHERE sv.sv_opco IS DISTINCT FROM $1::uuid
     UNION ALL
     SELECT 'SAMSARA_REPORTS_FOR_DEACTIVATED_UNIT', d.id::text, sv.samsara_vehicle_id, NULL, NULL,
            'Deactivated unit ' || d.unit_number || ' still reported a position ' || to_char(COALESCE(pos.last_position_at, sv.last_seen_at) AT TIME ZONE 'America/Chicago', 'MM/DD/YYYY HH24:MI'),
            jsonb_build_object('deactivated_at', d.deactivated_at, 'last_position_at', pos.last_position_at)
       FROM u d JOIN sv ON sv.unit_id = d.id LEFT JOIN pos ON pos.unit_id = d.id
      WHERE d.deactivated_at IS NOT NULL AND COALESCE(pos.last_position_at, sv.last_seen_at) >= now() - make_interval(hours => $2::int)
     UNION ALL
     SELECT 'SAMSARA_ORPHAN', NULL, s.samsara_vehicle_id, NULL, NULL,
            'Samsara vehicle ' || COALESCE(s.raw_payload->>'name', s.samsara_vehicle_id) || ' reports but has no TMS unit',
            jsonb_build_object('samsara_name', s.raw_payload->>'name', 'samsara_vin', s.raw_payload->>'vin', 'last_seen_at', s.last_seen_at)
       FROM integrations.samsara_vehicles s
      WHERE s.operating_company_id = $1::uuid AND s.local_unit_id IS NULL
        AND s.last_seen_at >= now() - interval '30 days'
        AND NOT EXISTS (SELECT 1 FROM mdata.units x WHERE x.samsara_vehicle_id = s.samsara_vehicle_id)
     UNION ALL
     SELECT 'INSURANCE_NOT_SCHEDULED', a.id::text, NULL, NULL, NULL,
            'Unit ' || a.unit_number || ' is on no insurance schedule' ||
              CASE WHEN NULLIF(btrim(a.us_insurance_policy_number), '') IS NOT NULL THEN ' (unit card names policy ' || a.us_insurance_policy_number || ')' ELSE '' END,
            jsonb_build_object('unit_card_policy', a.us_insurance_policy_number, 'unit_card_expiration', a.us_insurance_expiration)
       FROM active a WHERE NOT EXISTS (SELECT 1 FROM ins WHERE ins.unit_id = a.id)
     UNION ALL
     SELECT 'INSURANCE_POLICY_EXPIRED', a.id::text, NULL, (array_agg(ins.policy_id::text ORDER BY ins.expiry_date DESC NULLS LAST))[1], NULL,
            'Unit ' || a.unit_number || ' is only on expired or cancelled policies (latest ' || max(ins.policy_number) || ', expiry ' || COALESCE(to_char(max(ins.expiry_date), 'MM/DD/YYYY'), 'none') || ')',
            jsonb_build_object('policies', jsonb_agg(jsonb_build_object('policy_number', ins.policy_number, 'status', ins.status, 'expiry_date', ins.expiry_date, 'cancelled_on', ins.cancelled_on)))
       FROM active a JOIN ins ON ins.unit_id = a.id
      GROUP BY a.id, a.unit_number
     HAVING bool_and(ins.cancelled_on IS NOT NULL OR (ins.expiry_date IS NOT NULL AND ins.expiry_date < CURRENT_DATE))
     UNION ALL
     SELECT 'INSURANCE_ON_DEACTIVATED_UNIT', d.id::text, NULL, ins.policy_id::text, ins.asset_id::text,
            'Deactivated unit ' || d.unit_number || ' is still on policy ' || ins.policy_number,
            jsonb_build_object('deactivated_at', d.deactivated_at, 'policy_number', ins.policy_number)
       FROM u d JOIN ins ON ins.unit_id = d.id
      WHERE d.deactivated_at IS NOT NULL AND ins.cancelled_on IS NULL AND (ins.expiry_date IS NULL OR ins.expiry_date >= CURRENT_DATE)
     UNION ALL
     SELECT 'INSURANCE_ASSET_UNLINKED', NULL, NULL, pu.policy_id::text, a.id::text,
            'Insured tractor asset ' || COALESCE(a.unit_code, a.vin, a.id::text) || ' is not linked to a TMS unit',
            jsonb_build_object('unit_code', a.unit_code, 'vin', a.vin)
       FROM insurance.policy_unit pu JOIN mdata.assets a ON a.id = pu.asset_id
      WHERE pu.removed_at IS NULL AND pu.operating_company_id = $1::uuid
        AND a.asset_type = 'tractor' AND a.unit_id IS NULL
     UNION ALL
     SELECT 'IRP_MISSING', a.id::text, NULL, NULL, NULL,
            'Truck ' || a.unit_number || ' has no IRP account number',
            jsonb_build_object('vehicle_type', a.vehicle_type)
       FROM active a
      WHERE a.vehicle_type = ANY($4::text[])
        AND NULLIF(btrim(a.irp_account_number), '') IS NULL AND NULLIF(btrim(a.texas_irp_number), '') IS NULL
     UNION ALL
     SELECT 'IRP_EXPIRED', a.id::text, NULL, NULL, NULL,
            'Truck ' || a.unit_number || ' IRP expired ' || to_char(a.irp_expiration, 'MM/DD/YYYY'),
            jsonb_build_object('irp_expiration', a.irp_expiration)
       FROM active a WHERE a.irp_expiration IS NOT NULL AND a.irp_expiration < CURRENT_DATE
     UNION ALL
     SELECT 'LEASE_ENTITY_MISMATCH', x.id::text, NULL, NULL, NULL,
            'Truck ' || x.unit_number || ' ran ' || count(l.id) || ' load(s) for this entity in the last ' || $3::int || ' days but is neither owned by nor leased to it',
            jsonb_build_object('owner_company_id', x.owner_company_id, 'currently_leased_to_company_id', x.currently_leased_to_company_id, 'loads', count(l.id))
       FROM mdata.loads l JOIN mdata.units x ON x.id = l.assigned_unit_id
      WHERE l.operating_company_id = $1::uuid AND l.voided_at IS NULL AND l.canceled_at IS NULL
        AND l.created_at >= now() - make_interval(days => $3::int)
        AND x.owner_company_id IS DISTINCT FROM $1::uuid AND x.currently_leased_to_company_id IS DISTINCT FROM $1::uuid
      GROUP BY x.id, x.unit_number, x.owner_company_id, x.currently_leased_to_company_id
     UNION ALL
     SELECT 'VEHICLE_TYPE_UNCLASSIFIED', a.id::text, NULL, NULL, NULL,
            'Unit ' || a.unit_number || ' has no vehicle type -- it cannot be counted as a truck or excluded',
            '{}'::jsonb
       FROM active a WHERE a.vehicle_type IS NULL`,
    [opco, SAMSARA_STALE_HOURS, LEASE_LOOKBACK_DAYS, TRUCK_TYPES]
  );
  return r.rows;
}

/** Upserts open findings and resolves the ones no longer detected. Never deletes. */
export async function persistRosterFindings(client: DbClient, opco: string, found: DetectedFinding[]): Promise<{ open: number; resolved: number }> {
  const keys: string[] = [];
  for (const f of found) {
    const key = findingKey(f);
    keys.push(key);
    await client.query(
      `INSERT INTO fleet.roster_findings
         (operating_company_id, rule_code, severity, finding_key, unit_id, samsara_vehicle_id, policy_id, asset_id, detail, evidence)
       VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6, $7::uuid, $8::uuid, $9, $10::jsonb)
       ON CONFLICT (operating_company_id, finding_key) WHERE resolved_at IS NULL AND voided_at IS NULL
       DO UPDATE SET last_detected_at = now(), detail = EXCLUDED.detail, evidence = EXCLUDED.evidence, updated_at = now()`,
      [opco, f.rule_code, ROSTER_RULES[f.rule_code].severity, key, f.unit_id, f.samsara_vehicle_id, f.policy_id, f.asset_id, f.detail, JSON.stringify(f.evidence ?? {})]
    );
  }
  const resolved = await client.query<{ n: string }>(
    `WITH r AS (
       UPDATE fleet.roster_findings SET resolved_at = now(), updated_at = now()
        WHERE operating_company_id = $1::uuid AND resolved_at IS NULL AND voided_at IS NULL
          AND NOT (finding_key = ANY($2::text[]))
       RETURNING 1)
     SELECT count(*)::text AS n FROM r`,
    [opco, keys]
  );
  return { open: found.length, resolved: Number(resolved.rows[0]?.n ?? 0) };
}

export async function runRosterIntegrityForTenant(client: DbClient, opco: string) {
  const found = await detectRosterFindings(client, opco);
  return persistRosterFindings(client, opco, found);
}

/** Nightly: one short transaction per entity. */
export async function runRosterIntegrityCronTick(): Promise<void> {
  const companies = await withLuciaBypass(async (client) =>
    (await (client as DbClient).query<{ id: string }>(`SELECT id::text FROM org.companies WHERE is_active = true AND deactivated_at IS NULL ORDER BY 1`)).rows
  );
  for (const c of companies) {
    assertTenantContext(c.id, "fleet.roster_integrity_cron");
    await withLuciaBypass(async (client) => {
      // membership-scope-exempt: internally-iterated-active-company
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [c.id]);
      await runRosterIntegrityForTenant(client as DbClient, c.id);
    });
  }
}

const companyQuery = z.object({ operating_company_id: z.string().uuid(), include_closed: z.coerce.boolean().optional().default(false) });
const voidBody = z.object({ operating_company_id: z.string().uuid(), reason: z.string().trim().min(3).max(500) });
const idParams = z.object({ id: z.string().uuid() });

export async function registerRosterIntegrityRoutes(app: FastifyInstance) {
  app.get("/api/v1/fleet/roster-integrity", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return;
    const user = req.user;
    if (!user) return;
    const q = companyQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [q.data.operating_company_id]);
      const rows = await (client as DbClient).query(
        `SELECT f.id::text, f.rule_code, f.severity, f.detail, f.evidence, f.first_detected_at, f.last_detected_at, f.resolved_at, f.voided_at, f.void_reason,
                f.unit_id::text, u.unit_number, f.samsara_vehicle_id, f.policy_id::text, p.policy_number, p.vendor_id::text AS insurer_vendor_id, f.asset_id::text
           FROM fleet.roster_findings f
           LEFT JOIN mdata.units u ON u.id = f.unit_id
           LEFT JOIN insurance.policy p ON p.id = f.policy_id
          WHERE f.operating_company_id = $1::uuid AND ($2::boolean OR (f.resolved_at IS NULL AND f.voided_at IS NULL))
          ORDER BY CASE f.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, u.unit_number NULLS LAST, f.rule_code`,
        [q.data.operating_company_id, q.data.include_closed]
      );
      const last = await (client as DbClient).query<{ at: string | null }>(
        `SELECT max(last_detected_at)::text AS at FROM fleet.roster_findings WHERE operating_company_id = $1::uuid`,
        [q.data.operating_company_id]
      );
      return { rules: ROSTER_RULES, last_run_at: last.rows[0]?.at ?? null, findings: rows.rows };
    });
  });

  app.post("/api/v1/fleet/roster-integrity/run", { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return;
    const user = req.user;
    if (!user) return;
    const q = companyQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [q.data.operating_company_id]);
      return runRosterIntegrityForTenant(client as DbClient, q.data.operating_company_id);
    });
  });

  app.post("/api/v1/fleet/roster-integrity/:id/void", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return;
    const user = req.user;
    if (!user) return;
    const p = idParams.safeParse(req.params ?? {});
    const b = voidBody.safeParse(req.body ?? {});
    if (!p.success || !b.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(user.uuid, b.data.operating_company_id);
    const out = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [b.data.operating_company_id]);
      return (await (client as DbClient).query(
        `UPDATE fleet.roster_findings SET voided_at = now(), void_reason = $3, voided_by_user_id = $4::uuid, updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL RETURNING id::text`,
        [p.data.id, b.data.operating_company_id, b.data.reason, user.uuid]
      )).rows[0];
    });
    if (!out) return reply.code(404).send({ error: "finding_not_found_or_already_void" });
    return { voided: out.id };
  });
}
