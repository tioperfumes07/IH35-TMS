// HOS-MAP (the verbatim-clocks unlock) — READ / PREVIEW ONLY. Writes NOTHING.
//
// Root cause it serves: mdata.drivers.samsara_driver_id is empty for every driver, so the HOS-clocks pull's
// active-driver query (WHERE samsara_driver_id IS NOT NULL) matches nothing and produces zero verbatim clocks.
// This module proposes a driver -> Samsara-id map by STABLE IDENTIFIER (license, then phone) — never by display
// name alone (name is a red herring: ABEL vs Vicente). Name only produces a LOW-confidence suggestion that is
// surfaced, never auto-accepted. A WRONG id would attribute one driver's HOS clocks to another (an FMCSA error),
// so every ambiguous row is reported, never silently resolved.
//
// The actual `UPDATE mdata.drivers SET samsara_driver_id` is a SEPARATE, Jorge-approved step on the rows he
// confirms — NOT here. This file has no INSERT/UPDATE/DELETE.
import { SamsaraClient, type SamsaraDriver } from "./samsara-client.js";
import { getSamsaraConfigForCompany, type PgClient } from "./samsara.service.js";

export type DriverMapCandidate = { samsara_driver_id: string; samsara_name: string | null; basis: "license" | "phone" | "name" };
export type DriverMapRow = {
  local_driver_id: string;
  driver_name: string;
  cdl_number: string | null;
  phone: string | null;
  current_samsara_driver_id: string | null;
  proposed_samsara_driver_id: string | null;
  samsara_name: string | null;
  confidence: "high" | "low" | "none";
  match_basis: "license" | "phone" | "name" | null;
  ambiguous: boolean;
  candidates: DriverMapCandidate[];
};
export type DriverMapPreview = {
  operating_company_id: string;
  generated_at: string;
  our_active_drivers: number;
  samsara_roster: number;
  counts: { matched_high: number; matched_low: number; ambiguous: number; unmatched: number; already_mapped: number };
  // Is the stored samsara_driver_id correct? (settles "don't write": stored == what the matcher independently finds)
  id_reconcile: { stored_matches_proposed: number; stored_differs_from_proposed: number; stored_but_no_roster_match: number; both_null: number };
  // Why does the pull write 0 rows even with samsara_driver_id populated? (READ-ONLY counts; leading suspect = 0 open assignments)
  downstream: {
    active_driver_query_count: number; // EXACT row count of the pull's real active-driver query (drivers ∩ open assignment ∩ has samsara id)
    open_vehicle_driver_assignments: number; // telematics.vehicle_driver_assignments WHERE ended_at IS NULL (the pairing gap suspect)
    linked_samsara_drivers: number; // integrations.samsara_drivers WHERE local_driver_id IS NOT NULL
    last_hos_clocks_pull: { finished_at: string; success: boolean; error_message: string | null; rows_added: number } | null;
  };
  rows: DriverMapRow[];
};

const digits = (s: unknown): string => String(s ?? "").replace(/\D/g, "");
const normPhone = (s: unknown): string | null => {
  const d = digits(s);
  if (d.length < 10) return null;
  return d.slice(-10); // last 10 digits — ignores +1 / country code differences
};
const normLicense = (s: unknown): string | null => {
  const v = String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return v.length >= 4 ? v : null; // guard against junk/too-short license strings
};
const normName = (s: unknown): string | null => {
  const v = String(s ?? "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  return v.length >= 3 ? v.split(" ").sort().join(" ") : null; // order-insensitive so "first last" == "last first"
};
const rawStr = (raw: Record<string, unknown>, key: string): string | null => {
  const v = raw[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

function indexRoster(roster: SamsaraDriver[]) {
  const byLicense = new Map<string, SamsaraDriver[]>();
  const byPhone = new Map<string, SamsaraDriver[]>();
  const byName = new Map<string, SamsaraDriver[]>();
  const push = (m: Map<string, SamsaraDriver[]>, k: string | null, d: SamsaraDriver) => {
    if (!k) return;
    const arr = m.get(k);
    if (arr) arr.push(d);
    else m.set(k, [d]);
  };
  for (const d of roster) {
    const raw = d.raw ?? {};
    push(byLicense, normLicense(rawStr(raw, "licenseNumber")), d);
    push(byPhone, normPhone(rawStr(raw, "phone")), d);
    push(byName, normName(rawStr(raw, "name")), d);
  }
  return { byLicense, byPhone, byName };
}

/** Pure, read-only: propose a driver -> Samsara-id map for THIS carrier. No DB writes; the caller hands the
 *  preview to Jorge, who approves the rows before any UPDATE. */
export async function previewDriverSamsaraMap(client: PgClient, operatingCompanyId: string): Promise<DriverMapPreview> {
  const ours = await client.query(
    `SELECT id::text AS id, trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) AS name,
            cdl_number, mexican_license_number, phone, samsara_driver_id::text AS samsara_driver_id
       FROM mdata.drivers
      WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL
      ORDER BY last_name, first_name`,
    [operatingCompanyId]
  );

  const cfg = await getSamsaraConfigForCompany(client, operatingCompanyId);
  const api = new SamsaraClient({ apiToken: null, samsaraOrgId: cfg && cfg.samsara_org_id ? String(cfg.samsara_org_id) : null });
  const roster = await api.listDrivers();
  const { byLicense, byPhone, byName } = indexRoster(roster);
  const nameOf = (d: SamsaraDriver): string | null => rawStr(d.raw ?? {}, "name");

  const counts = { matched_high: 0, matched_low: 0, ambiguous: 0, unmatched: 0, already_mapped: 0 };
  const rows: DriverMapRow[] = ours.rows.map((r: Record<string, unknown>) => {
    const license = normLicense(r.cdl_number) ?? normLicense(r.mexican_license_number);
    const phone = normPhone(r.phone);
    const name = normName(r.name);

    // Stable-identifier-first: license (high) -> phone (high) -> name (low, never auto-accept).
    const licHits = license ? byLicense.get(license) ?? [] : [];
    const phoneHits = phone ? byPhone.get(phone) ?? [] : [];
    const nameHits = name ? byName.get(name) ?? [] : [];

    let basis: DriverMapRow["match_basis"] = null;
    let hits: SamsaraDriver[] = [];
    if (licHits.length) { basis = "license"; hits = licHits; }
    else if (phoneHits.length) { basis = "phone"; hits = phoneHits; }
    else if (nameHits.length) { basis = "name"; hits = nameHits; }

    const candidates: DriverMapCandidate[] = hits.map((d) => ({
      samsara_driver_id: d.id,
      samsara_name: nameOf(d),
      basis: basis as DriverMapCandidate["basis"],
    }));
    const ambiguous = hits.length > 1;
    const current = (r.samsara_driver_id as string) || null;
    if (current) counts.already_mapped += 1;

    let confidence: DriverMapRow["confidence"] = "none";
    let proposed: string | null = null;
    let samsaraName: string | null = null;
    if (hits.length === 1) {
      proposed = hits[0].id;
      samsaraName = nameOf(hits[0]);
      confidence = basis === "name" ? "low" : "high";
      if (confidence === "high") counts.matched_high += 1;
      else counts.matched_low += 1;
    } else if (hits.length > 1) {
      counts.ambiguous += 1; // multiple candidates — surface, do NOT auto-resolve
    } else {
      counts.unmatched += 1;
    }

    return {
      local_driver_id: r.id as string,
      driver_name: (r.name as string) || "—",
      cdl_number: (r.cdl_number as string) || null,
      phone: (r.phone as string) || null,
      current_samsara_driver_id: current,
      proposed_samsara_driver_id: proposed,
      samsara_name: samsaraName,
      confidence,
      match_basis: basis,
      ambiguous,
      candidates,
    };
  });

  const id_reconcile = {
    stored_matches_proposed: rows.filter((r) => r.current_samsara_driver_id && r.proposed_samsara_driver_id && r.current_samsara_driver_id === r.proposed_samsara_driver_id).length,
    stored_differs_from_proposed: rows.filter((r) => r.current_samsara_driver_id && r.proposed_samsara_driver_id && r.current_samsara_driver_id !== r.proposed_samsara_driver_id).length,
    stored_but_no_roster_match: rows.filter((r) => r.current_samsara_driver_id && !r.proposed_samsara_driver_id).length,
    both_null: rows.filter((r) => !r.current_samsara_driver_id && !r.proposed_samsara_driver_id).length,
  };

  // Downstream diagnostics — all READ-ONLY counts for this company. The leading suspect for the dead clocks is
  // that the pull's INNER JOIN to OPEN vehicle_driver_assignments yields 0 (the pairing gap), not the mapping.
  const [activeQ, openAsgQ, linkedQ, lastPullQ] = await Promise.all([
    client.query(
      `SELECT count(DISTINCT d.id)::int AS n
         FROM mdata.drivers d
         JOIN telematics.vehicle_driver_assignments a ON a.driver_id = d.id AND a.ended_at IS NULL
        WHERE d.operating_company_id = $1::uuid AND d.samsara_driver_id IS NOT NULL AND d.deactivated_at IS NULL`,
      [operatingCompanyId]
    ),
    client.query(
      `SELECT count(*)::int AS n FROM telematics.vehicle_driver_assignments WHERE operating_company_id = $1::uuid AND ended_at IS NULL`,
      [operatingCompanyId]
    ),
    client.query(
      `SELECT count(*)::int AS n FROM integrations.samsara_drivers WHERE operating_company_id = $1::uuid AND local_driver_id IS NOT NULL`,
      [operatingCompanyId]
    ),
    client.query(
      `SELECT finished_at::text AS finished_at, success, error_message, rows_added
         FROM integrations.integration_sync_log
        WHERE operating_company_id = $1::uuid AND integration = 'samsara' AND sync_kind = 'samsara_hos_clocks'
        ORDER BY finished_at DESC LIMIT 1`,
      [operatingCompanyId]
    ),
  ]);
  const downstream = {
    active_driver_query_count: (activeQ.rows[0]?.n as number) ?? 0,
    open_vehicle_driver_assignments: (openAsgQ.rows[0]?.n as number) ?? 0,
    linked_samsara_drivers: (linkedQ.rows[0]?.n as number) ?? 0,
    last_hos_clocks_pull: (lastPullQ.rows[0] as DriverMapPreview["downstream"]["last_hos_clocks_pull"]) ?? null,
  };

  return {
    operating_company_id: operatingCompanyId,
    generated_at: new Date().toISOString(),
    our_active_drivers: ours.rows.length,
    samsara_roster: roster.length,
    counts,
    id_reconcile,
    downstream,
    rows,
  };
}
