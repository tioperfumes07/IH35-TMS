/**
 * LST-F10 — client for the BUILT-BUT-UNCALLED driver-team backend.
 *
 * Canonical backend: apps/backend/src/mdata/driver-teams.routes.ts
 *   GET    /api/v1/mdata/driver-teams                     → { teams: [...] }
 *   GET    /api/v1/mdata/driver-teams/:id                 → team row
 *   POST   /api/v1/mdata/driver-teams                     → created row (201)
 *   PATCH  /api/v1/mdata/driver-teams/:id                 → updated row
 *   POST   /api/v1/mdata/driver-teams/:id/deactivate      → SOFT removal (is_active=false + effective_to)
 *   POST   /api/v1/mdata/driver-teams/:id/replace-driver  → deactivates + re-creates with the new slot driver
 *
 * NOT the same API as the `/api/v1/driver-teams` split-percentage routes
 * (apps/backend/src/mdata/driver-team-split.routes.ts) already wired from `api/mdata.ts` for the
 * Drivers module. Both stay — this file only adds the missing client for the mdata roster API.
 *
 * There is NO hard-delete endpoint and this client must never add one: removal is a DEACTIVATE.
 */
import { apiRequest, ApiError } from "./client";
import { entityLabel } from "../lib/entity-label";

export type MdataDriverTeam = {
  id: string;
  operating_company_id: string;
  team_name: string;
  primary_driver_id: string;
  primary_driver_first_name: string | null;
  primary_driver_last_name: string | null;
  secondary_driver_id: string;
  secondary_driver_first_name: string | null;
  secondary_driver_last_name: string | null;
  relationship: string | null;
  notes: string | null;
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by_user_id: string | null;
};

export type MdataDriverTeamCreateBody = {
  operating_company_id: string;
  team_name: string;
  primary_driver_id: string;
  secondary_driver_id: string;
  relationship?: string;
  notes?: string;
  effective_from?: string;
};

export type MdataDriverTeamUpdateBody = {
  team_name?: string;
  relationship?: string | null;
  notes?: string | null;
};

export type MdataDriverTeamSlot = "primary" | "secondary";

/** Entity scope is REQUIRED (no `?`): an unscoped roster read would blend operating companies. */
export function listMdataDriverTeams(params: {
  operating_company_id: string;
  is_active?: "true" | "false";
}) {
  const query = new URLSearchParams({ operating_company_id: params.operating_company_id });
  if (params.is_active) query.set("is_active", params.is_active);
  return apiRequest<{ teams: MdataDriverTeam[] }>(`/api/v1/mdata/driver-teams?${query.toString()}`);
}

export function getMdataDriverTeam(id: string, operatingCompanyId: string) {
  const query = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<MdataDriverTeam>(`/api/v1/mdata/driver-teams/${id}?${query.toString()}`);
}

export function createMdataDriverTeam(body: MdataDriverTeamCreateBody) {
  return apiRequest<MdataDriverTeam>(`/api/v1/mdata/driver-teams`, { method: "POST", body });
}

export function updateMdataDriverTeam(id: string, body: MdataDriverTeamUpdateBody) {
  return apiRequest<MdataDriverTeam>(`/api/v1/mdata/driver-teams/${id}`, { method: "PATCH", body });
}

/**
 * SOFT removal (void-not-delete): sets is_active=false and stamps effective_to. The row and its
 * audit trail stay. There is deliberately no delete helper here.
 */
export function deactivateMdataDriverTeam(id: string) {
  return apiRequest<MdataDriverTeam>(`/api/v1/mdata/driver-teams/${id}/deactivate`, { method: "POST" });
}

/** Membership change: the backend deactivates the current team and re-creates it with the new driver. */
export function replaceMdataDriverTeamDriver(
  id: string,
  body: { driver_slot: MdataDriverTeamSlot; new_driver_id: string }
) {
  return apiRequest<{ previous_team: MdataDriverTeam; replacement_team: MdataDriverTeam }>(
    `/api/v1/mdata/driver-teams/${id}/replace-driver`,
    { method: "POST", body }
  );
}

export function driverTeamMemberName(team: MdataDriverTeam, slot: MdataDriverTeamSlot): string {
  const first = slot === "primary" ? team.primary_driver_first_name : team.secondary_driver_first_name;
  const last = slot === "primary" ? team.primary_driver_last_name : team.secondary_driver_last_name;
  const name = [first, last].filter(Boolean).join(" ").trim();
  const driverId = slot === "primary" ? team.primary_driver_id : team.secondary_driver_id;
  return entityLabel(name, driverId, "Driver");
}

const DRIVER_TEAM_ERROR_COPY: Record<string, string> = {
  validation_error: "Check the highlighted fields and try again.",
  forbidden: "Your role can't change driver teams.",
  operating_company_not_found: "That operating company no longer exists.",
  drivers_not_in_operating_company: "Both drivers must belong to the selected operating company.",
  driver_already_in_active_team: "That driver is already on another active team. Deactivate it first.",
  driver_team_conflict: "A team with those drivers already exists.",
  driver_team_constraint_violation: "Primary and secondary driver must be two different drivers.",
  effective_from_out_of_range: "Effective From can't be more than 30 days in the future.",
  driver_team_not_active: "This team is already inactive.",
  mdata_driver_team_not_found: "That team no longer exists for this operating company.",
};

/** Maps the backend's machine error codes to operator-readable copy (never shows a raw code alone). */
export function driverTeamErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const data = (error.data as Record<string, unknown> | null) ?? {};
    const code = typeof data.error === "string" ? data.error : "";
    if (code && DRIVER_TEAM_ERROR_COPY[code]) return DRIVER_TEAM_ERROR_COPY[code];
    if (code) return `${fallback} (${code})`;
    return fallback;
  }
  return fallback;
}
