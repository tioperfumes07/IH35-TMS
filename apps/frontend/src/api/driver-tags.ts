// DRIVER-F7334-ROSTER-TAG-HAS-NO-CANONICAL-MODEL — canonical company-scoped driver tags.
import { apiRequest } from "./client";

export type DriverTag = {
  id: string;
  code: string;
  label: string;
  color: string | null;
  is_active: boolean;
  created_at: string;
};

export type DriverTagMembership = { tag_id: string; code: string; label: string; color: string | null };

export function listDriverTags(operatingCompanyId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ tags: DriverTag[] }>(`/api/v1/mdata/driver-tags?${q.toString()}`);
}

export function createDriverTag(operatingCompanyId: string, code: string, label: string, color?: string) {
  return apiRequest<{ tag: DriverTag; alreadyExisted: boolean }>(`/api/v1/mdata/driver-tags`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId, code, label, ...(color ? { color } : {}) },
  });
}

export function listDriverTagMemberships(operatingCompanyId: string, driverIds: string[]) {
  if (driverIds.length === 0) return Promise.resolve({ memberships: {} as Record<string, DriverTagMembership[]> });
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId, driver_ids: driverIds.join(",") });
  return apiRequest<{ memberships: Record<string, DriverTagMembership[]> }>(`/api/v1/mdata/driver-tags/memberships?${q.toString()}`);
}

export function bulkTagDrivers(
  operatingCompanyId: string,
  driverIds: string[],
  tagId: string,
  action: "add" | "remove",
  removedReason?: string
) {
  return apiRequest<{ ok: true; affected: number }>(`/api/v1/mdata/drivers/bulk-tag`, {
    method: "POST",
    body: {
      operating_company_id: operatingCompanyId,
      driver_ids: driverIds,
      tag_id: tagId,
      action,
      ...(removedReason ? { removed_reason: removedReason } : {}),
    },
  });
}
