/**
 * Register row 3 — the unit's photo on its profile header: the primary mdata.unit_photos row, else a truck image the unit
 * already has linked in docs.files (GET /api/v1/mdata/units/:id/photos). Shown whole (object-contain) — never cropped or
 * modified. Renders nothing when the unit has no image; a PDF is never turned into a photo.
 */
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";

type UnitPhotosResponse = {
  photos: Array<{ id: string; signed_url: string | null; caption: string | null; is_primary: boolean }>;
  derived: { file_id: string; original_filename: string; signed_url: string } | null;
};

export function UnitHeaderPhoto(props: { unitId: string; operatingCompanyId: string }) {
  const q = useQuery({
    queryKey: ["unit-header-photo", props.operatingCompanyId, props.unitId],
    queryFn: () => apiRequest<UnitPhotosResponse>(`/api/v1/mdata/units/${props.unitId}/photos?operating_company_id=${props.operatingCompanyId}`),
    retry: false,
  });
  const primary = q.data?.photos.find((p) => p.is_primary && p.signed_url) ?? q.data?.photos.find((p) => p.signed_url) ?? null;
  const src = primary?.signed_url ?? q.data?.derived?.signed_url ?? null;
  if (!src) return null;
  const label = primary?.caption ?? q.data?.derived?.original_filename ?? "Unit photo";
  return (
    <img
      src={src}
      alt={label}
      title={label}
      className="h-24 w-40 rounded-sm border border-gray-200 bg-white object-contain"
      data-testid="unit-header-photo"
    />
  );
}
