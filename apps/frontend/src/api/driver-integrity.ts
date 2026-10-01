/**
 * C-57 — Driver integrity profiles (CC-2 Round 305 B-50/B-51 engine).
 * GET /api/v1/maintenance/integrity/driver-profiles[+/:driver_id]
 */
import { apiRequest } from "./client";

export type IntegrityComponentStatus = "finding" | "suspicion" | "observed" | "none" | "insufficient_data";

export type IntegrityComponentName =
  | "fuel"
  | "damage"
  | "accidents"
  | "tire_events"
  | "geofence_findings"
  | "complaints";

export type DriverIntegrityComponent = {
  component: IntegrityComponentName;
  status: IntegrityComponentStatus;
  arithmetic: string;
  basis: string;
  evidence: unknown[];
};

export type DriverIntegrityProfile = {
  driver_id: string;
  driver_name: string | null;
  period_start: string;
  period_end: string;
  score: {
    findings: number;
    suspicions: number;
    observed: number;
    insufficient: number;
    arithmetic: string;
  };
  components: DriverIntegrityComponent[];
};

function companyQuery(companyId: string) {
  return new URLSearchParams({ operating_company_id: companyId }).toString();
}

export function listDriverIntegrityProfiles(companyId: string) {
  return apiRequest<{ rows: DriverIntegrityProfile[] }>(
    `/api/v1/maintenance/integrity/driver-profiles?${companyQuery(companyId)}`
  );
}

export function getDriverIntegrityProfile(companyId: string, driverId: string) {
  return apiRequest<DriverIntegrityProfile>(
    `/api/v1/maintenance/integrity/driver-profiles/${encodeURIComponent(driverId)}?${companyQuery(companyId)}`
  );
}

/** Counted complaints = complaints component evidence where counted !== false. */
export function countedComplaints(profile: DriverIntegrityProfile | null | undefined): number {
  const comp = profile?.components.find((c) => c.component === "complaints");
  if (!comp) return 0;
  const evidence = Array.isArray(comp.evidence) ? comp.evidence : [];
  if (evidence.length === 0) return 0;
  return evidence.filter((row) => {
    if (!row || typeof row !== "object") return false;
    return (row as { counted?: boolean }).counted !== false;
  }).length;
}

export function integrityStatusLabel(status: IntegrityComponentStatus): string {
  switch (status) {
    case "finding":
      return "Finding";
    case "suspicion":
      return "Suspicion";
    case "observed":
      return "Observed";
    case "insufficient_data":
      return "Not measurable";
    case "none":
    default:
      return "None";
  }
}

export function integrityComponentLabel(name: IntegrityComponentName): string {
  switch (name) {
    case "fuel":
      return "Fuel";
    case "damage":
      return "Damage";
    case "accidents":
      return "Accidents";
    case "tire_events":
      return "Tire events";
    case "geofence_findings":
      return "Geofence findings";
    case "complaints":
      return "Complaints";
    default:
      return name;
  }
}
