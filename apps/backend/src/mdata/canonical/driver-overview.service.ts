/**
 * ROUND 326.5 — DriverDetail board, Overview (docs/design/boards/driver-customers-vendors/DriverDetail.dc.html).
 * Seven tiles; settlements split into line haul / additional / deductions off settlement_lines; additional payments;
 * complaints against the driver; reports & damage he filed; integrity rates against the fleet (per 100k miles he
 * drove); trucks he has held with miles and MPG; pay terms; compliance. Every figure computed here — no board value.
 *
 * Miles and fuel burned come from Samsara's per-driver daily reports (miles HE drove, by ELD login); MPG = miles /
 * gallons burned. Trucks he has held use the vehicle reports inside each assignment window. Fleet = every active /
 * probation driver. Samsara reports begin 2026-09-02, so a 90-day rate covers the days that exist.
 */

import { driverSamsaraSql, unitSamsaraSql } from "../../telematics/driver-miles.sql.js";

type Q = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
const n = (v: unknown) => Number(v ?? 0);
const cents = (dollars: unknown) => Math.round(Number(dollars ?? 0) * 100);
const per100k = (count: number, miles: number) => (miles > 0 ? Math.round((count / miles) * 100_000 * 10) / 10 : null);
const ratio = (a: number, b: number, dp = 1) => (b > 0 ? Math.round((a / b) * 10 ** dp) / 10 ** dp : null);

const LINE_HAUL = `('earnings', 'deadhead_pay', 'team_split_primary', 'team_split_secondary')`;
const ADDITIONAL = `('extra_pay', 'detention_pay', 'reimbursement')`;
const DEDUCTION = `('deduction', 'escrow_contribution', 'abandonment_chargeback')`;
const DUE_SQL = `s.voided_at IS NULL AND s.reversed_at IS NULL AND coalesce(s.is_presettlement, false) = false AND s.payment_state = 'unpaid' AND s.paid_at IS NULL`;
export async function readDriverOverview(client: Q, oc: string, driverId: string) {
  const d = (await client.query(
    `SELECT d.id, d.first_name, d.last_name, d.status::text AS status, d.phone, d.cdl_state, d.cdl_number, d.cdl_expires_at,
            d.dot_medical_expires_at, d.hire_date,
            (SELECT u.unit_number FROM telematics.vehicle_driver_assignments a JOIN mdata.units u ON u.id = a.unit_id
              WHERE a.operating_company_id = $1 AND a.driver_id = d.id ORDER BY (a.ended_at IS NULL) DESC, a.started_at DESC LIMIT 1) AS unit
       FROM mdata.drivers d WHERE d.id = $2 AND d.operating_company_id = $1`, [oc, driverId])).rows[0];
  if (!d) return null;
  const q = async (sql: string, extra: unknown[] = []) => (await client.query(sql, [oc, driverId, ...extra])).rows;

  // Settlements with the line split (last 12, newest first)
  const settlements = (await q(
    `SELECT s.id, coalesce(s.display_id, '—') AS display_id, s.status::text AS status, coalesce(s.finalized_at, s.trip_closed_at, s.updated_at) AS closed_at,
            s.net_pay,
            (SELECT count(DISTINCT sl.load_id) FROM driver_finance.settlement_lines sl WHERE sl.settlement_id = s.id AND sl.voided_at IS NULL AND sl.load_id IS NOT NULL)::int AS loads,
            ${driverSamsaraSql("distance_mi", "s.driver_id", "coalesce(s.trip_started_at, s.period_start::timestamptz)", "coalesce(s.trip_closed_at, s.period_end::timestamptz)")} AS miles,
            (SELECT coalesce(sum(sl.amount), 0) FROM driver_finance.settlement_lines sl WHERE sl.settlement_id = s.id AND sl.voided_at IS NULL AND coalesce(sl.is_active, true) AND sl.line_type IN ${LINE_HAUL}) AS line_haul,
            (SELECT coalesce(sum(sl.amount), 0) FROM driver_finance.settlement_lines sl WHERE sl.settlement_id = s.id AND sl.voided_at IS NULL AND coalesce(sl.is_active, true) AND sl.line_type IN ${ADDITIONAL}) AS additional,
            (SELECT coalesce(sum(abs(sl.amount)), 0) FROM driver_finance.settlement_lines sl WHERE sl.settlement_id = s.id AND sl.voided_at IS NULL AND coalesce(sl.is_active, true) AND sl.line_type IN ${DEDUCTION}) AS deductions
       FROM driver_finance.driver_settlements s
      WHERE s.operating_company_id = $1 AND s.driver_id = $2 AND s.voided_at IS NULL AND s.reversed_at IS NULL AND coalesce(s.is_sample_data, false) = false
      ORDER BY coalesce(s.period_end, s.created_at::date) DESC LIMIT 12`)).map((r) => ({
    id: r.id, display_id: r.display_id, status: r.status, closed_at: r.closed_at, loads: n(r.loads), miles: Math.round(n(r.miles)),
    line_haul_cents: cents(r.line_haul), additional_cents: cents(r.additional), deductions_cents: cents(r.deductions), net_cents: cents(r.net_pay),
  }));
  const settlementCount = n((await q(`SELECT count(*) AS c FROM driver_finance.driver_settlements s WHERE s.operating_company_id = $1 AND s.driver_id = $2 AND s.voided_at IS NULL AND s.reversed_at IS NULL`))[0].c);

  // Additional payments (90 days): every extra / detention / reimbursement line, with who approved it
  const additional = (await q(
    `SELECT sl.id, sl.created_at AS at, sl.line_type, coalesce(nullif(sl.category, ''), sl.line_type) AS kind, sl.description, sl.amount, sl.load_id, l.load_number,
            s.id AS settlement_id, s.display_id AS settlement, coalesce(nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''), u.email) AS approved_by
       FROM driver_finance.settlement_lines sl JOIN driver_finance.driver_settlements s ON s.id = sl.settlement_id
       LEFT JOIN mdata.loads l ON l.id = sl.load_id LEFT JOIN identity.users u ON u.id = sl.approved_by
      WHERE s.operating_company_id = $1 AND s.driver_id = $2 AND s.voided_at IS NULL AND s.reversed_at IS NULL AND sl.voided_at IS NULL
        AND coalesce(sl.is_active, true) AND sl.line_type IN ${ADDITIONAL} AND sl.created_at >= now() - interval '90 days'
      ORDER BY sl.created_at DESC`)).map((r) => ({ ...r, amount_cents: cents(r.amount) }));

  // Complaints against the driver (90 days)
  const complaints = (await q(
    `SELECT c.id, coalesce(c.complaint_date::timestamptz, c.filed_at, c.created_at) AS at, coalesce(c.complaint_type::text, ct.type_name, 'Complaint') AS kind,
            c.summary, c.load_id, l.load_number, coalesce(cu.customer_name, c.complainant_external_name, c.complainant_name, c.complainant_type) AS raised_by,
            coalesce(c.resolution, c.status) AS outcome, c.chargeback_cents, c.severity
       FROM safety.complaints c LEFT JOIN catalogs.complaint_types ct ON ct.id = c.complaint_type_id
       LEFT JOIN mdata.loads l ON l.id = c.load_id LEFT JOIN mdata.customers cu ON cu.id = c.complainant_customer_id
      WHERE c.operating_company_id = $1 AND c.respondent_driver_id = $2 AND c.voided_at IS NULL
        AND coalesce(c.complaint_date::timestamptz, c.filed_at, c.created_at) >= now() - interval '90 days'
      ORDER BY 2 DESC`)).map((r) => ({ ...r, cost_cents: r.chargeback_cents == null ? null : n(r.chargeback_cents) }));

  // Reports & damage he filed: driver reports + DVIRs with a defect (cost through the follow-up WO)
  const reports = (await q(
    `SELECT * FROM (
       SELECT r.id, initcap(replace(coalesce(r.report_type, 'report'), '_', ' ')) AS kind, u.unit_number AS unit, left(r.description, 120) AS what, r.reported_at AS at,
              initcap(replace(coalesce(r.status, 'open'), '_', ' ')) AS outcome, NULL::bigint AS cost_cents, 'driver_report' AS entity
         FROM maintenance.driver_reports r LEFT JOIN mdata.loads l ON l.id = r.load_id LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
        WHERE r.operating_company_id = $1 AND r.driver_id = $2
       UNION ALL
       SELECT v.id, 'DVIR', u.unit_number, CASE WHEN v.has_major_defect THEN 'Major defect' ELSE 'Defect' END, v.submitted_at,
              CASE WHEN w.closed_at IS NOT NULL THEN 'Repaired' WHEN w.id IS NOT NULL THEN 'Work order open' ELSE 'Open' END,
              coalesce(w.actual_cost_cents, round(w.total_actual_cost * 100)::bigint), 'dvir'
         FROM safety.dvir_submissions v LEFT JOIN mdata.units u ON u.id = v.unit_id LEFT JOIN maintenance.work_orders w ON w.id = v.follow_up_wo_id
        WHERE v.operating_company_id = $1 AND v.driver_id = $2 AND v.has_any_defect
     ) x ORDER BY at DESC NULLS LAST LIMIT 12`)).map((r) => ({ ...r, cost_cents: r.cost_cents == null ? null : n(r.cost_cents) }));

  // Integrity: his rates per 100k miles he drove vs the fleet, over 90 days
  const integ = (await q(
    `WITH drv AS (SELECT d.id FROM mdata.drivers d WHERE d.operating_company_id = $1 AND d.merged_into_driver_id IS NULL AND d.status::text IN ('Active', 'Probation')),
     miles AS (SELECT d.id, ${driverSamsaraSql("distance_mi", "d.id", "now() - interval '90 days'", "now()")} AS mi,
                      ${driverSamsaraSql("fuel_burned_gal", "d.id", "now() - interval '90 days'", "now()")} AS burned FROM drv d),
     fuel AS (SELECT f.driver_id AS id, count(*) AS fills, count(*) FILTER (WHERE f.load_id IS NULL) AS unlinked
                FROM fuel.fuel_transactions f WHERE f.operating_company_id = $1 AND f.voided_at IS NULL AND f.archived_at IS NULL
                 AND coalesce(f.purchased_at, f.transaction_at) >= now() - interval '90 days' GROUP BY f.driver_id),
     flags AS (SELECT f.driver_id AS id, count(*) AS n FROM fuel.fraud_alerts a JOIN fuel.fuel_transactions f ON f.id = a.fuel_transaction_uuid
                WHERE a.operating_company_id = $1 AND a.detected_at >= now() - interval '90 days' GROUP BY f.driver_id),
     comp AS (SELECT c.respondent_driver_id AS id, count(*) AS n FROM safety.complaints c WHERE c.operating_company_id = $1 AND c.voided_at IS NULL
                AND coalesce(c.complaint_date::timestamptz, c.filed_at, c.created_at) >= now() - interval '90 days' GROUP BY 1),
     acc AS (SELECT a.driver_id AS id, count(*) AS n FROM safety.accidents a WHERE a.operating_company_id = $1 AND a.voided_at IS NULL AND a.event_datetime >= now() - interval '90 days' GROUP BY 1),
     dmg AS (SELECT v.driver_id AS id, coalesce(sum(coalesce(w.actual_cost_cents, round(w.total_actual_cost * 100))), 0) AS c FROM safety.dvir_submissions v
                JOIN maintenance.work_orders w ON w.id = v.follow_up_wo_id WHERE v.operating_company_id = $1 AND v.submitted_at >= now() - interval '90 days' GROUP BY 1)
     SELECT d.id = $2::uuid AS is_him, coalesce(m.mi, 0) AS mi, coalesce(m.burned, 0) AS gal, coalesce(f.fills, 0) AS fills, coalesce(f.unlinked, 0) AS unlinked,
            coalesce(fl.n, 0) AS flags, coalesce(c.n, 0) AS complaints, coalesce(a.n, 0) AS accidents, coalesce(dm.c, 0) AS damage_cents
       FROM drv d LEFT JOIN miles m ON m.id = d.id LEFT JOIN fuel f ON f.id = d.id LEFT JOIN flags fl ON fl.id = d.id
       LEFT JOIN comp c ON c.id = d.id LEFT JOIN acc a ON a.id = d.id LEFT JOIN dmg dm ON dm.id = d.id`)).map((r) => ({
    him: r.is_him === true, mi: n(r.mi), gal: n(r.gal), fills: n(r.fills), unlinked: n(r.unlinked), flags: n(r.flags), complaints: n(r.complaints), accidents: n(r.accidents), damage: n(r.damage_cents),
  }));
  const me = integ.find((r) => r.him) ?? { mi: 0, gal: 0, fills: 0, unlinked: 0, flags: 0, complaints: 0, accidents: 0, damage: 0 };
  const fleet = integ.reduce((t, r) => ({ mi: t.mi + r.mi, gal: t.gal + r.gal, fills: t.fills + r.fills, unlinked: t.unlinked + r.unlinked, flags: t.flags + r.flags, complaints: t.complaints + r.complaints, accidents: t.accidents + r.accidents, damage: t.damage + r.damage }),
    { mi: 0, gal: 0, fills: 0, unlinked: 0, flags: 0, complaints: 0, accidents: 0, damage: 0 });
  const integrity = [
    { key: "mpg", label: "MPG against fleet", his: ratio(me.mi, me.gal), fleet: ratio(fleet.mi, fleet.gal), worse: "lower" },
    { key: "gal_per_100", label: "Gallons per 100 mi", his: me.mi ? ratio(me.gal * 100, me.mi) : null, fleet: fleet.mi ? ratio(fleet.gal * 100, fleet.mi) : null, worse: "higher" },
    { key: "unlinked_fills_pct", label: "Fills with no load link", his: me.fills ? Math.round((me.unlinked / me.fills) * 100) : null, fleet: fleet.fills ? Math.round((fleet.unlinked / fleet.fills) * 100) : null, worse: "higher", unit: "%" },
    { key: "fuel_flags", label: "Fuel anomaly flags", his: me.flags, fleet: null, worse: "higher" },
    { key: "complaints_100k", label: "Complaints per 100k mi", his: per100k(me.complaints, me.mi), fleet: per100k(fleet.complaints, fleet.mi), worse: "higher" },
    { key: "damage_100k", label: "Damage $ per 100k mi", his: me.mi ? Math.round((me.damage / me.mi) * 100_000) : null, fleet: fleet.mi ? Math.round((fleet.damage / fleet.mi) * 100_000) : null, worse: "higher", money: true },
    { key: "accidents_100k", label: "Accidents per 100k mi", his: per100k(me.accidents, me.mi), fleet: per100k(fleet.accidents, fleet.mi), worse: "higher" },
  ];
  const flagged = integrity.filter((i) => i.his != null && i.fleet != null && (i.worse === "higher" ? i.his > i.fleet * 1.5 : i.his < i.fleet * 0.85)).map((i) => i.key);
  const integrityFlags90 = n((await q(`SELECT count(*) AS c FROM safety.integrity_alerts WHERE operating_company_id = $1 AND subject_driver_id = $2 AND created_at >= now() - interval '90 days'`))[0].c);

  // Trucks he has held: assignment windows, miles on his loads in each window, MPG off his fuel in each window
  const trucks = (await q(
    `WITH a AS (SELECT unit_id, started_at, ended_at, coalesce(ended_at, now()) AS e FROM telematics.vehicle_driver_assignments
                 WHERE operating_company_id = $1 AND driver_id = $2),
          m AS (SELECT a.*, CASE WHEN unit_id = lag(unit_id) OVER w AND started_at <= lag(e) OVER w + interval '1 day' THEN 0 ELSE 1 END AS brk
                  FROM a WINDOW w AS (ORDER BY started_at)),
          g AS (SELECT m.*, sum(brk) OVER (ORDER BY started_at) AS grp FROM m),
          win AS (SELECT grp, unit_id, min(started_at) AS started_at, max(e) AS e, bool_or(ended_at IS NULL) AS open FROM g GROUP BY grp, unit_id)
     SELECT win.unit_id, u.unit_number, win.started_at, CASE WHEN win.open THEN NULL ELSE win.e END AS ended_at,
            ${unitSamsaraSql("distance_mi", "win.unit_id", "win.started_at", "win.e")} AS miles,
            ${unitSamsaraSql("fuel_burned_gal", "win.unit_id", "win.started_at", "win.e")} AS gallons
       FROM win JOIN mdata.units u ON u.id = win.unit_id ORDER BY win.started_at DESC LIMIT 8`)).map((r) => ({
    unit_id: r.unit_id, unit: r.unit_number, from: r.started_at, to: r.ended_at, miles: Math.round(n(r.miles)), mpg: ratio(n(r.miles), n(r.gallons)),
  }));

  // Pay terms
  const rate = (await q(`SELECT basis_type, rate_per_mile_cents, rate_empty_per_mile_cents, flat_per_load_cents, miles_basis FROM driver_finance.driver_pay_rates
      WHERE operating_company_id = $1 AND driver_id = $2 AND is_active AND (effective_to IS NULL OR effective_to >= current_date) ORDER BY effective_from DESC LIMIT 1`))[0] ?? null;
  const settings = (await q(`SELECT escrow_target_cents, worker_class, net_pay_floor_pct FROM driver_finance.driver_pay_settings WHERE operating_company_id = $1 AND driver_id = $2`))[0] ?? null;

  // Compliance
  const lastDrug = (await q(
    `SELECT max(at) AS at FROM (
       SELECT test_date::timestamptz AS at FROM safety.drug_test WHERE operating_company_id = $1 AND driver_id = $2 AND voided_at IS NULL
       UNION ALL SELECT coalesce(collected_at, scheduled_at) FROM safety.da_test_records WHERE operating_company_id::text = $1::text AND driver_uuid = $2
       UNION ALL SELECT test_date::timestamptz FROM compliance.drug_alcohol_test_results WHERE operating_company_id = $1 AND driver_id = $2) x`))[0]?.at ?? null;
  const mvr = (await q(`SELECT max(expiry_date) AS d FROM safety.driver_qualification_files WHERE operating_company_id = $1 AND driver_id = $2 AND voided_at IS NULL AND item_name ~* 'mvr|motor vehicle record'`))[0]?.d ?? null;
  const med = (await q(`SELECT max(expiry_date) AS d FROM safety.medical_cards WHERE operating_company_id = $1 AND driver_id = $2 AND voided_at IS NULL`))[0]?.d ?? d.dot_medical_expires_at ?? null;
  const hosV = n((await q(`SELECT count(*) AS c FROM safety.hos_violations WHERE operating_company_id = $1 AND driver_id = $2 AND voided_at IS NULL AND occurred_at >= now() - interval '90 days'`))[0].c);

  // Tiles
  const due = (await q(`SELECT coalesce(sum(s.net_pay), 0) AS v, count(*)::int AS n FROM driver_finance.driver_settlements s WHERE s.operating_company_id = $1 AND s.driver_id = $2 AND ${DUE_SQL}`))[0];
  const escrow = (await q(`SELECT coalesce(sum(balance_cents), 0) AS v, count(*)::int AS n FROM driver_finance.v_driver_escrow_balance WHERE operating_company_id = $1 AND driver_id = $2`))[0];
  const mi30 = (await q(`SELECT ${driverSamsaraSql("distance_mi", "$2::uuid", "now() - interval '30 days'", "now()")} AS mi,
      ${driverSamsaraSql("fuel_burned_gal", "$2::uuid", "now() - interval '30 days'", "now()")} AS g WHERE $1::uuid IS NOT NULL`))[0];
  const gal30 = mi30;
  const fleet30 = (await q(
    `SELECT coalesce(sum(m.mi), 0) AS mi, coalesce(sum(m.gal), 0) AS gal, count(*) FILTER (WHERE m.mi > 0)::int AS drivers
       FROM (SELECT d.id, ${driverSamsaraSql("distance_mi", "d.id", "now() - interval '30 days'", "now()")} AS mi,
                    ${driverSamsaraSql("fuel_burned_gal", "d.id", "now() - interval '30 days'", "now()")} AS gal FROM mdata.drivers d
              WHERE d.operating_company_id = $1 AND d.merged_into_driver_id IS NULL AND (d.status::text IN ('Active', 'Probation') OR d.id = $2::uuid)) m`))[0];
  const fleetDrivers = Math.max(n(fleet30.drivers), 1);
  const activeDrivers = Math.max(integ.length, 1);
  const additionalSum = additional.reduce((t, r) => t + r.amount_cents, 0);

  return {
    driver: {
      id: d.id, name: `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim(), status: d.status, unit: d.unit ?? null, phone: d.phone ?? null,
      cdl: d.cdl_state || d.cdl_number ? `${d.cdl_state ?? ""} ${d.cdl_number ?? ""}`.trim() : null, hire_date: d.hire_date ?? null,
      pay_basis: rate ? (rate.basis_type === "per_mile_pay" ? "per-mile" : rate.basis_type === "per_load_pay" ? "per-load" : rate.basis_type) : null,
    },
    tiles: {
      settlement_due_cents: cents(due.v), settlements_due: n(due.n),
      additional_pay_cents: additionalSum, additional_items: additional.length,
      escrow_held_cents: n(escrow.n) ? n(escrow.v) : null, escrow_target_cents: settings?.escrow_target_cents == null ? null : n(settings.escrow_target_cents),
      miles_30d: Math.round(n(mi30.mi)), fleet_miles_30d_per_driver: Math.round(n(fleet30.mi) / fleetDrivers),
      mpg_30d: ratio(n(mi30.mi), n(gal30.g)), fleet_mpg_30d: ratio(n(fleet30.mi), n(fleet30.gal)),
      complaints_90d: complaints.length, fleet_complaints_avg_90d: Math.round((fleet.complaints / activeDrivers) * 10) / 10,
      integrity_flags_90d: integrityFlags90 + flagged.length,
    },
    settlements, settlement_count: settlementCount,
    additional, complaints, reports, integrity, integrity_flagged: flagged, trucks,
    pay_terms: {
      basis: rate ? `${rate.basis_type === "per_mile_pay" ? "Per mile" : rate.basis_type === "per_load_pay" ? "Per load" : rate.basis_type}${rate.miles_basis ? `, ${String(rate.miles_basis).replace("_miles", "")}` : ""}` : null,
      rate_per_mile_cents: rate?.rate_per_mile_cents == null ? null : n(rate.rate_per_mile_cents),
      empty_rate_per_mile_cents: rate?.rate_empty_per_mile_cents == null ? null : n(rate.rate_empty_per_mile_cents),
      flat_per_load_cents: rate?.flat_per_load_cents == null ? null : n(rate.flat_per_load_cents),
      worker_class: settings?.worker_class ?? null, net_pay_floor_pct: settings?.net_pay_floor_pct == null ? null : n(settings.net_pay_floor_pct),
      escrow_target_cents: settings?.escrow_target_cents == null ? null : n(settings.escrow_target_cents),
    },
    compliance: { cdl_expires: d.cdl_expires_at ?? null, medical_card: med, mvr_review: mvr, drug_screen_last: lastDrug, hos_violations_90d: hosV },
  };
}
