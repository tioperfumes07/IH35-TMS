/**
 * ROUND 326.5 — Driver Hub Home board (docs/design/boards/driver-customers-vendors/Main.dc.html): six tiles, status
 * chips, the driver list sorted by settlement due, and the selected driver's panel (five figures, integrity, recent
 * activity, linked counts). Every figure is computed here; nothing is a board constant.
 *
 *  settle due   = driver_finance.driver_settlements, not a pre-settlement, payment_state 'unpaid', not void/reversed
 *  on loads     = active drivers holding a load in assigned_not_dispatched / dispatched
 *  escrow held  = accounting.escrow_accounts (holder_type driver) balance
 *  unit         = open telematics.vehicle_driver_assignments row (else the latest)
 *  pay basis    = active driver_finance.driver_pay_rates row
 */

import { driverSamsaraSql } from "../../telematics/driver-miles.sql.js";

type Q = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
const n = (v: unknown) => Number(v ?? 0);
const cents = (dollars: unknown) => Math.round(Number(dollars ?? 0) * 100);

const DUE_SQL = `s.voided_at IS NULL AND s.reversed_at IS NULL AND coalesce(s.is_presettlement, false) = false
  AND s.payment_state = 'unpaid' AND s.paid_at IS NULL AND coalesce(s.is_sample_data, false) = false`;
const ON_LOAD_STATUSES = `('assigned_not_dispatched', 'dispatched')`;

export const PAY_BASIS_LABEL: Record<string, string> = { per_mile_pay: "Per mile", per_load_pay: "Per load" };

export async function readDriverHub(client: Q, oc: string) {
  const rows = (
    await client.query(
      `SELECT d.id, d.first_name, d.last_name, d.status::text AS status, d.deactivated_at, d.phone, d.cdl_number,
              (SELECT u.unit_number FROM telematics.vehicle_driver_assignments a JOIN mdata.units u ON u.id = a.unit_id
                WHERE a.operating_company_id = $1::uuid AND a.driver_id = d.id ORDER BY (a.ended_at IS NULL) DESC, a.started_at DESC LIMIT 1) AS unit,
              (SELECT r.basis_type FROM driver_finance.driver_pay_rates r
                WHERE r.operating_company_id = $1::uuid AND r.driver_id = d.id AND r.is_active
                  AND (r.effective_to IS NULL OR r.effective_to >= current_date) ORDER BY r.effective_from DESC LIMIT 1) AS basis,
              (SELECT coalesce(sum(s.net_pay), 0) FROM driver_finance.driver_settlements s
                WHERE s.operating_company_id = $1::uuid AND s.driver_id = d.id AND ${DUE_SQL}) AS due,
              (SELECT count(*) FROM driver_finance.driver_settlements s
                WHERE s.operating_company_id = $1::uuid AND s.driver_id = d.id AND ${DUE_SQL})::int AS due_count,
              EXISTS (SELECT 1 FROM mdata.loads l WHERE l.operating_company_id = $1::uuid
                        AND (l.assigned_primary_driver_id = d.id OR l.assigned_secondary_driver_id = d.id)
                        AND l.voided_at IS NULL AND l.soft_deleted_at IS NULL AND l.canceled_at IS NULL AND l.status IN ${ON_LOAD_STATUSES}) AS on_load
         FROM mdata.drivers d
        WHERE d.operating_company_id = $1::uuid AND d.merged_into_driver_id IS NULL`,
      [oc]
    )
  ).rows.map((r) => ({
    id: r.id, name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(), status: r.status ?? "Inactive",
    phone: r.phone ?? null, cdl: r.cdl_number ? String(r.cdl_number) : null, unit: r.unit ?? null,
    basis: r.basis ? PAY_BASIS_LABEL[r.basis] ?? r.basis : null, due_cents: cents(r.due), due_count: n(r.due_count), on_load: r.on_load === true,
  }));
  rows.sort((a, b) => b.due_cents - a.due_cents || a.name.localeCompare(b.name));
  const by = (s: string) => rows.filter((r) => r.status === s);
  const active = by("Active");
  const escrow = (await client.query(
    `SELECT coalesce(sum(balance_cents), 0) AS c FROM driver_finance.v_driver_escrow_balance WHERE operating_company_id = $1::uuid`, [oc])).rows[0];
  const companyName = (await client.query(`SELECT legal_name AS name FROM org.companies WHERE id = $1`, [oc])).rows[0]?.name ?? null;
  const onLoads = active.filter((r) => r.on_load).length;
  return {
    company_name: companyName,
    kpis: {
      active: active.length, total: rows.length, on_loads: onLoads, available: active.length - onLoads,
      on_leave: by("OnLeave").length, settle_due: rows.reduce((s, r) => s + r.due_count, 0), escrow_held_cents: n(escrow.c),
    },
    chips: { Active: active.length, Probation: by("Probation").length, OnLeave: by("OnLeave").length, Inactive: by("Inactive").length + by("Terminated").length, All: rows.length },
    rows,
  };
}

/** The selected driver's panel: five figures, integrity (90 days), recent activity, linked counts. */
export async function readDriverHubPanel(client: Q, oc: string, driverId: string) {
  const d = (await client.query(
    `SELECT d.id, d.first_name, d.last_name, d.status::text AS status, d.cdl_state, d.hire_date,
            (SELECT u.unit_number FROM telematics.vehicle_driver_assignments a JOIN mdata.units u ON u.id = a.unit_id
              WHERE a.operating_company_id = $1::uuid AND a.driver_id = d.id ORDER BY (a.ended_at IS NULL) DESC, a.started_at DESC LIMIT 1) AS unit
       FROM mdata.drivers d WHERE d.id = $2 AND d.operating_company_id = $1::uuid`, [oc, driverId])).rows[0];
  if (!d) return null;
  const one = async (sql: string) => (await client.query(sql, [oc, driverId])).rows[0];
  const due = await one(`SELECT coalesce(sum(s.net_pay), 0) AS v FROM driver_finance.driver_settlements s WHERE s.operating_company_id = $1::uuid AND s.driver_id = $2 AND ${DUE_SQL}`);
  const escrow = await one(`SELECT coalesce(sum(balance_cents), 0) AS v, count(*)::int AS n FROM driver_finance.v_driver_escrow_balance WHERE operating_company_id = $1::uuid AND driver_id = $2`);
  const adv = await one(`SELECT coalesce(sum(vb.outstanding_cents), 0) / 100.0 AS v FROM driver_finance.driver_advances a JOIN driver_finance.v_driver_advance_balances vb ON vb.advance_id = a.id WHERE a.operating_company_id = $1::uuid AND a.driver_id = $2 AND a.voided_at IS NULL`);
  // CC-3 2e: the one driver-miles definition (Samsara per-driver distance) — never a planned-miles fallback.
  const miles = await one(
    `SELECT ${driverSamsaraSql("distance_mi", "$2::uuid", "now() - interval '30 days'", "now()")} AS v,
            (SELECT count(*)::int FROM integrations.samsara_fuel_reports fr WHERE fr.subject_kind = 'driver' AND fr.driver_id = $2::uuid
              AND fr.report_date >= (now() - interval '30 days')::date) AS n WHERE $1::uuid IS NOT NULL`);
  const integrity = await one(`SELECT count(*)::int AS n FROM safety.integrity_alerts WHERE operating_company_id = $1::uuid AND subject_driver_id = $2 AND created_at >= now() - interval '90 days'`);
  const activity = (await client.query(
    `SELECT * FROM (
       SELECT 'Report' AS kind, r.reported_at AS at, coalesce(r.report_type, 'Driver report') || coalesce(' — ' || left(r.description, 60), '') AS what, NULL::bigint AS cents, 'driver_report' AS entity, r.id::text AS id
         FROM maintenance.driver_reports r WHERE r.operating_company_id = $1::uuid AND r.driver_id = $2
       UNION ALL
       SELECT 'Fuel', coalesce(f.purchased_at, f.transaction_at), coalesce(v.vendor_name, 'Fuel') || coalesce(' · ' || round(f.gallons::numeric, 1) || ' gal', ''), round(f.total_cost * 100)::bigint, 'fuel_transaction', f.id::text
         FROM fuel.fuel_transactions f LEFT JOIN mdata.vendors v ON v.id = f.vendor_id
        WHERE f.operating_company_id = $1::uuid AND f.driver_id = $2 AND f.voided_at IS NULL AND f.archived_at IS NULL
       UNION ALL
       SELECT 'Load', (SELECT max(s.actual_arrival_at) FROM mdata.load_stops s WHERE s.load_id = l.id), 'Load ' || l.load_number || ' ' || replace(l.status::text, '_', ' '), l.rate_total_cents, 'load', l.id::text
         FROM mdata.loads l WHERE l.operating_company_id = $1::uuid AND (l.assigned_primary_driver_id = $2 OR l.assigned_secondary_driver_id = $2)
          AND l.voided_at IS NULL AND l.soft_deleted_at IS NULL AND l.canceled_at IS NULL
       UNION ALL
       SELECT 'Settle', coalesce(s.finalized_at, s.updated_at), 'Settlement ' || coalesce(s.display_id, '') || ' ' || s.status::text, round(s.net_pay * 100)::bigint, 'settlement', s.id::text
         FROM driver_finance.driver_settlements s WHERE s.operating_company_id = $1::uuid AND s.driver_id = $2 AND s.voided_at IS NULL AND s.reversed_at IS NULL
       UNION ALL
       SELECT 'Escrow', p.posted_at, replace(initcap(p.posting_type), '_', ' '), p.amount_cents, 'journal_entry', p.linked_journal_entry_id::text
         FROM accounting.escrow_postings p JOIN accounting.escrow_accounts a ON a.id = p.escrow_account_id
        WHERE p.operating_company_id = $1::uuid AND a.holder_type = 'driver' AND a.holder_id = $2
     ) x WHERE at IS NOT NULL ORDER BY at DESC LIMIT 5`, [oc, driverId])).rows.map((r) => ({ ...r, cents: r.cents == null ? null : n(r.cents) }));
  const linked = await one(
    `SELECT
       (SELECT count(*) FROM mdata.loads l WHERE l.operating_company_id = $1::uuid AND (l.assigned_primary_driver_id = $2 OR l.assigned_secondary_driver_id = $2) AND l.voided_at IS NULL AND l.soft_deleted_at IS NULL AND l.canceled_at IS NULL)::int AS loads,
       (SELECT count(*) FROM driver_finance.driver_settlements s WHERE s.operating_company_id = $1::uuid AND s.driver_id = $2 AND s.voided_at IS NULL AND s.reversed_at IS NULL)::int AS settlements,
       (SELECT count(*) FROM fuel.fuel_transactions f WHERE f.operating_company_id = $1::uuid AND f.driver_id = $2 AND f.voided_at IS NULL AND f.archived_at IS NULL)::int AS fuel,
       (SELECT count(*) FROM maintenance.driver_reports r WHERE r.operating_company_id = $1::uuid AND r.driver_id = $2)::int AS driver_reports,
       (SELECT count(*) FROM safety.accidents a WHERE a.operating_company_id = $1::uuid AND a.driver_id = $2 AND a.voided_at IS NULL)::int AS accidents,
       (SELECT count(*) FROM insurance.claim c WHERE c.operating_company_id = $1::uuid AND c.driver_id = $2)::int AS insurance_claims,
       (SELECT count(*) FROM legal.matters m WHERE m.operating_company_id = $1::uuid AND m.related_driver_id = $2)::int AS legal,
       (SELECT count(*) FROM docs.file_links fl JOIN docs.files f ON f.id = fl.file_id
         WHERE fl.entity_type = 'driver' AND fl.entity_id = $2 AND fl.deleted_at IS NULL AND f.deleted_at IS NULL AND f.operating_company_id = $1::uuid)::int AS documents`);
  return {
    driver: { id: d.id, name: `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim(), status: d.status, unit: d.unit ?? null, cdl_state: d.cdl_state ?? null, hire_date: d.hire_date ?? null },
    figures: { settlement_due_cents: cents(due.v), escrow_held_cents: escrow.n ? n(escrow.v) : null, advances_open_cents: cents(adv.v), miles_30d: miles.n ? Math.round(n(miles.v)) : null },
    integrity: { flags_90d: n(integrity.n) },
    activity,
    linked: Object.fromEntries(Object.entries(linked).map(([k, v]) => [k, n(v)])) as Record<string, number>,
  };
}
