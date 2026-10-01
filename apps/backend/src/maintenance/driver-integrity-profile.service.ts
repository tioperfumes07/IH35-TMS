/**
 * ROUND 305 B-50/B-51 (+ B-43 item 3) — the driver integrity profile: one record per driver,
 * composed of NAMED components, each with its own status, its arithmetic and its evidence.
 *
 * Components: fuel (B-47 two-signal), damage (B-48 events), accidents, tire events, geofence
 * integrity findings (B-49), complaints (B-51).
 *
 * NO INVENTED WEIGHTS. The owner has not set weights or thresholds for blending these, and a
 * weighted total nobody chose is an accusation dressed as a number. The profile's score is a COUNT
 * the reader can check by eye: how many components are at "finding", how many at "suspicion", how
 * many have observations, how many could not be measured. Only the fuel component has an
 * owner-defined finding rule (two independent signals); every other component reports what it
 * observed, with evidence, and leaves the judgement to a person.
 *
 * COMPLAINTS (B-51). safety.complaints already exists — extended, not rebuilt. A complaint counts
 * against a driver only when (a) the driver is linked — respondent_driver_id, or the legacy
 * respondent_id when respondent_type = 'driver' and it resolves to a real mdata.drivers row — and
 * (b) it names who recorded it (created_by), a field the order makes mandatory. Anything else is
 * listed as excluded, with the reason. safety.complaints has no load_id or unit_id column, so
 * load -> complaints linkage is reported as unavailable, never inferred.
 */
import { computeDriverFuelIntegrity, type DriverFuelIntegrity } from "./fuel-integrity.service.js";
import { computeDamageEventAttribution, type DamageEvent } from "./damage-event-attribution.service.js";
import { listIntegrityFindingsAttribution, type AttributedFinding } from "./integrity-findings-attribution.service.js";
import { computeDriverDamageScorecard, type DriverDamageScorecardRow } from "./driver-damage-scorecard.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type ComplaintEvidence = {
  complaint_id: string;
  complaint_date: string | null;
  source: string;
  source_name: string | null;
  category: string | null;
  severity: string | null;
  status: string | null;
  summary: string | null;
  recorded_by_user_id: string | null;
  driver_link: "respondent_driver_id" | "legacy_respondent_id";
  load_id: null;
  unit_id: null;
  counted: boolean;
  excluded_reason: string | null;
};

export type ComponentStatus = "finding" | "suspicion" | "observed" | "none" | "insufficient_data";

export type ProfileComponent = {
  component: "fuel" | "damage" | "accidents" | "tire_events" | "geofence_findings" | "complaints";
  status: ComponentStatus;
  arithmetic: string;
  basis: string;
  evidence: unknown[];
};

export type DriverIntegrityProfile = {
  driver_id: string;
  driver_name: string | null;
  period_start: string;
  period_end: string;
  score: { findings: number; suspicions: number; observed: number; insufficient: number; arithmetic: string };
  components: ProfileComponent[];
};

type ComplaintRow = {
  complaint_id: string;
  complaint_date: string | null;
  complainant_type: string | null;
  source_name: string | null;
  category: string | null;
  severity: string | null;
  status: string | null;
  summary: string | null;
  created_by: string | null;
  driver_id: string;
  driver_link: "respondent_driver_id" | "legacy_respondent_id";
};

export async function listDriverComplaints(
  client: DbClient,
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string
): Promise<Map<string, ComplaintEvidence[]>> {
  const res = await client.query<ComplaintRow>(
    `
    SELECT c.id::text AS complaint_id, c.complaint_date::text AS complaint_date, c.complainant_type,
           COALESCE(cu.customer_name, c.complainant_external_name, c.complainant_name) AS source_name,
           COALESCE(ct.type_code, c.complaint_type) AS category, c.severity, c.status, c.summary,
           c.created_by::text AS created_by,
           d.id::text AS driver_id,
           CASE WHEN c.respondent_driver_id IS NOT NULL THEN 'respondent_driver_id' ELSE 'legacy_respondent_id' END AS driver_link
      FROM safety.complaints c
      JOIN mdata.drivers d
        ON d.id = COALESCE(c.respondent_driver_id, CASE WHEN c.respondent_type = 'driver' THEN c.respondent_id END)
      LEFT JOIN mdata.customers cu ON cu.id = c.complainant_customer_id
      LEFT JOIN catalogs.complaint_types ct ON ct.id = c.complaint_type_id
     WHERE c.operating_company_id = $1::uuid AND c.voided_at IS NULL
       AND c.complaint_date >= $2::date AND c.complaint_date < ($3::timestamptz)::date + 1
     ORDER BY c.complaint_date DESC`,
    [operatingCompanyId, periodStart, periodEnd]
  );
  const out = new Map<string, ComplaintEvidence[]>();
  for (const r of res.rows) {
    const list = out.get(r.driver_id) ?? [];
    list.push({
      complaint_id: r.complaint_id,
      complaint_date: r.complaint_date,
      source: r.complainant_type ?? "unknown",
      source_name: r.source_name,
      category: r.category,
      severity: r.severity,
      status: r.status,
      summary: r.summary,
      recorded_by_user_id: r.created_by,
      driver_link: r.driver_link,
      load_id: null,
      unit_id: null,
      counted: r.created_by !== null,
      excluded_reason: r.created_by === null ? "no recorded_by user — the order requires who recorded it; not counted" : null,
    });
    out.set(r.driver_id, list);
  }
  return out;
}

/** Pure: the score is a count a reader can verify, never a weighted blend. */
export function scoreProfile(components: ProfileComponent[]): DriverIntegrityProfile["score"] {
  const by = (s: ComponentStatus) => components.filter((c) => c.status === s);
  const findings = by("finding");
  const suspicions = by("suspicion");
  const observed = by("observed");
  const insufficient = by("insufficient_data");
  return {
    findings: findings.length,
    suspicions: suspicions.length,
    observed: observed.length,
    insufficient: insufficient.length,
    arithmetic:
      `${findings.length} of ${components.length} components at finding` +
      (findings.length ? ` (${findings.map((c) => c.component).join(", ")})` : "") +
      `; ${suspicions.length} suspicion` +
      (suspicions.length ? ` (${suspicions.map((c) => c.component).join(", ")})` : "") +
      `; ${observed.length} with observations` +
      (observed.length ? ` (${observed.map((c) => c.component).join(", ")})` : "") +
      `; ${insufficient.length} not measurable. No weighted total — the owner has not set weights.`,
  };
}

function eventsComponent(
  component: ProfileComponent["component"],
  events: DamageEvent[],
  per100k: number | null,
  milesDriven: number | null,
  milesLabel: string
): ProfileComponent {
  if (events.length === 0) {
    return { component, status: "none", arithmetic: "0 events attributed in the period", basis: "nothing attributed to this driver", evidence: [] };
  }
  return {
    component,
    status: "observed",
    arithmetic:
      `${events.length} event(s)` +
      (per100k !== null && milesDriven !== null ? ` / ${milesDriven} mi x 100,000 = ${per100k} per 100k mi (${milesLabel})` : "; per-100k withheld — no measured miles"),
    basis: "observed; no owner-set threshold, so no judgement is made here",
    evidence: events,
  };
}

export async function computeDriverIntegrityProfiles(
  client: DbClient,
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string
): Promise<DriverIntegrityProfile[]> {
  const fuel = await computeDriverFuelIntegrity(client, operatingCompanyId, periodStart, periodEnd);
  const damage = await computeDamageEventAttribution(client, operatingCompanyId, periodStart, periodEnd);
  const damageScore = await computeDriverDamageScorecard(client, operatingCompanyId, periodStart, periodEnd);
  const findings = await listIntegrityFindingsAttribution(client, operatingCompanyId, { periodStart, periodEnd });
  const complaints = await listDriverComplaints(client, operatingCompanyId, periodStart, periodEnd);

  const fuelBy = new Map<string, DriverFuelIntegrity>(fuel.rows.map((r) => [r.driver_id, r]));
  const scoreBy = new Map<string, DriverDamageScorecardRow>(damageScore.map((r) => [r.driver_id, r]));
  const eventsBy = new Map<string, DamageEvent[]>();
  for (const e of damage.events) if (e.driver_id) eventsBy.set(e.driver_id, [...(eventsBy.get(e.driver_id) ?? []), e]);
  const findingsBy = new Map<string, AttributedFinding[]>();
  for (const f of findings.rows) if (f.driver_id) findingsBy.set(f.driver_id, [...(findingsBy.get(f.driver_id) ?? []), f]);

  const driverIds = new Set<string>([...fuelBy.keys(), ...eventsBy.keys(), ...findingsBy.keys(), ...complaints.keys()]);
  const names = await client.query<{ id: string; name: string }>(
    `SELECT id::text, trim(concat_ws(' ', first_name, last_name)) AS name FROM mdata.drivers WHERE id = ANY($1::uuid[])`,
    [[...driverIds]]
  );
  const nameBy = new Map(names.rows.map((r) => [r.id, r.name]));

  const profiles: DriverIntegrityProfile[] = [];
  for (const driverId of [...driverIds].sort()) {
    const f = fuelBy.get(driverId);
    const sc = scoreBy.get(driverId) ?? null;
    const ev = eventsBy.get(driverId) ?? [];
    const fd = findingsBy.get(driverId) ?? [];
    const cp = complaints.get(driverId) ?? [];
    const counted = cp.filter((c) => c.counted);
    const milesLabel = sc?.miles_source_label ?? damageScore[0]?.miles_source_label ?? "daily snapshot miles";

    const components: ProfileComponent[] = [
      f
        ? {
            component: "fuel",
            status: f.status === "clear" ? "none" : f.status,
            arithmetic: f.signals.map((s) => `${s.signal}: ${s.verdict} — ${s.arithmetic}`).join(" | "),
            basis: f.basis,
            evidence: f.signals,
          }
        : { component: "fuel", status: "insufficient_data", arithmetic: "no fuel signal reached this driver", basis: "no fills, no stop-odometer miles, no Relay fills attributed", evidence: [] },
      eventsComponent("damage", ev.filter((e) => e.source === "work_order_repair"), sc?.damage_wo_per_100k_miles ?? null, sc?.miles_driven ?? null, milesLabel),
      eventsComponent(
        "accidents",
        ev.filter((e) => e.source === "work_order_accident" || e.source === "safety_accident" || e.source === "accident_report"),
        sc?.accident_wo_per_100k_miles ?? null,
        sc?.miles_driven ?? null,
        milesLabel
      ),
      eventsComponent("tire_events", ev.filter((e) => e.source === "tire_event"), sc?.tire_event_per_100k_miles ?? null, sc?.miles_driven ?? null, milesLabel),
      fd.length === 0
        ? { component: "geofence_findings", status: "none", arithmetic: "0 geofence integrity findings attributed", basis: "nothing placed on this driver", evidence: [] }
        : {
            component: "geofence_findings",
            status: "observed",
            arithmetic: Object.entries(
              fd.reduce<Record<string, number>>((a, x) => ({ ...a, [x.anomaly_class]: (a[x.anomaly_class] ?? 0) + 1 }), {})
            )
              .map(([k, v]) => `${v} ${k}`)
              .join(", "),
            basis: "attributed through the assignment window at occurred_at; no owner-set threshold",
            evidence: fd,
          },
      cp.length === 0
        ? { component: "complaints", status: "none", arithmetic: "0 complaints against this driver", basis: "none on record", evidence: [] }
        : {
            component: "complaints",
            status: counted.length > 0 ? "observed" : "none",
            arithmetic:
              `${counted.length} counted of ${cp.length} on record` +
              (counted.length
                ? ` (${Object.entries(counted.reduce<Record<string, number>>((a, x) => ({ ...a, [x.category ?? "uncategorised"]: (a[x.category ?? "uncategorised"] ?? 0) + 1 }), {}))
                    .map(([k, v]) => `${v} ${k}`)
                    .join(", ")})`
                : "") +
              (cp.length > counted.length ? `; ${cp.length - counted.length} excluded (no recorded_by)` : ""),
            basis: "no owner-set threshold; load/unit linkage unavailable — safety.complaints has no load_id/unit_id column",
            evidence: cp,
          },
    ];

    profiles.push({
      driver_id: driverId,
      driver_name: nameBy.get(driverId) ?? null,
      period_start: periodStart,
      period_end: periodEnd,
      score: scoreProfile(components),
      components,
    });
  }
  return profiles;
}
