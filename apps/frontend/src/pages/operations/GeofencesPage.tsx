import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { createGeofence, listGeofences, updateGeofence, type GeofenceLocationKind } from "../../api/geofencing";
import { listCustomers, listLocations, listVendors } from "../../api/mdata";

const LOCATION_KIND_OPTIONS: Array<{ id: GeofenceLocationKind; label: string }> = [
  { id: "customer_site", label: "Customer site" },
  { id: "yard", label: "Yard" },
  { id: "vendor_site", label: "Vendor site" },
  { id: "custom", label: "Custom" },
];

function polygonTextToGeoJson(input: string) {
  const rows = input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((p) => Number(p.trim())))
    .filter((pair) => pair.length === 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1])) as number[][];

  if (rows.length < 3) return null;
  const closed = [...rows];
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) closed.push(first);
  return { type: "Polygon" as const, coordinates: [closed] };
}

export function GeofencesPage() {
  const { selectedCompanyId, companies } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? companies[0]?.id ?? "";
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [locationKind, setLocationKind] = useState<GeofenceLocationKind>("custom");
  const [locationRefId, setLocationRefId] = useState("");
  const [polygonText, setPolygonText] = useState("-97.7431,30.2672\n-97.7350,30.2672\n-97.7350,30.2620\n-97.7431,30.2620");
  const [saving, setSaving] = useState(false);

  const geofencesQuery = useQuery({
    queryKey: ["telematics", "geofences", operatingCompanyId],
    queryFn: () => listGeofences(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const customersQuery = useQuery({
    queryKey: ["mdata", "customers", operatingCompanyId],
    queryFn: () => listCustomers({ operating_company_id: operatingCompanyId }),
    enabled: Boolean(operatingCompanyId),
  });

  const vendorsQuery = useQuery({
    queryKey: ["mdata", "vendors", operatingCompanyId],
    queryFn: () => listVendors({ operating_company_id: operatingCompanyId }),
    enabled: Boolean(operatingCompanyId),
  });

  const yardsQuery = useQuery({
    queryKey: ["mdata", "locations", operatingCompanyId],
    queryFn: () => listLocations({ operating_company_id: operatingCompanyId }),
    enabled: Boolean(operatingCompanyId),
  });

  const locationOptions = useMemo(() => {
    if (locationKind === "customer_site") {
      return (customersQuery.data?.customers ?? []).map((customer) => ({ id: customer.id, label: customer.name }));
    }
    if (locationKind === "vendor_site") {
      return (vendorsQuery.data?.vendors ?? []).map((vendor) => ({ id: vendor.id, label: vendor.name }));
    }
    if (locationKind === "yard") {
      return (yardsQuery.data?.locations ?? [])
        .filter((loc) => String((loc as { location_type?: string }).location_type ?? "") === "yard")
        .map((loc) => ({
          id: String((loc as { id?: string }).id ?? ""),
          label: String((loc as { name?: string }).name ?? "Yard"),
        }));
    }
    return [];
  }, [customersQuery.data?.customers, locationKind, vendorsQuery.data?.vendors, yardsQuery.data?.locations]);

  async function handleCreate() {
    if (!operatingCompanyId || !label.trim()) return;
    const polygon = polygonTextToGeoJson(polygonText);
    if (!polygon) return;
    setSaving(true);
    try {
      await createGeofence({
        operating_company_id: operatingCompanyId,
        label: label.trim(),
        location_kind: locationKind,
        location_ref_id: locationRefId || null,
        polygon_geojson: polygon,
      });
      setLabel("");
      setLocationRefId("");
      await queryClient.invalidateQueries({ queryKey: ["telematics", "geofences", operatingCompanyId] });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    await updateGeofence(id, { is_active: !isActive });
    await queryClient.invalidateQueries({ queryKey: ["telematics", "geofences", operatingCompanyId] });
  }

  const polygonPreview = polygonTextToGeoJson(polygonText);

  return (
    <div className="space-y-4">
      <PageHeader title="Geofences" subtitle="Polygon geofences for customer sites, yards, and vendor locations." />
      <section className="rounded border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-semibold text-slate-900">Create geofence</h3>
        <p className="mt-1 text-xs text-slate-600">Polygon editor: one `lng,lat` pair per line. Minimum 3 points.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-xs text-slate-700">
            Label
            <input
              className="mt-1 block h-9 w-full rounded border border-slate-300 px-2 text-sm"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <label className="text-xs text-slate-700">
            Location kind
            <select
              className="mt-1 block h-9 w-full rounded border border-slate-300 px-2 text-sm"
              value={locationKind}
              onChange={(event) => setLocationKind(event.target.value as GeofenceLocationKind)}
            >
              {LOCATION_KIND_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-700 md:col-span-2">
            Link to existing location (optional)
            <select
              className="mt-1 block h-9 w-full rounded border border-slate-300 px-2 text-sm"
              value={locationRefId}
              onChange={(event) => setLocationRefId(event.target.value)}
            >
              <option value="">None</option>
              {locationOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-700 md:col-span-2">
            Polygon points (`lng,lat`)
            <textarea
              className="mt-1 block h-36 w-full rounded border border-slate-300 px-2 py-2 font-mono text-xs"
              value={polygonText}
              onChange={(event) => setPolygonText(event.target.value)}
            />
          </label>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {polygonPreview ? `${polygonPreview.coordinates[0].length - 1} vertices` : "Invalid polygon format"}
          </p>
          <Button size="sm" onClick={() => void handleCreate()} disabled={saving || !polygonPreview || !label.trim()}>
            {saving ? "Saving..." : "Create geofence"}
          </Button>
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-semibold text-slate-900">Active geofences</h3>
        {geofencesQuery.isLoading ? <p className="mt-2 text-sm text-slate-500">Loading...</p> : null}
        <div className="mt-2 overflow-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-600">
              <tr>
                <th className="px-2 py-2">Label</th>
                <th className="px-2 py-2">Kind</th>
                <th className="px-2 py-2">Linked ref</th>
                <th className="px-2 py-2">Vertices</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {(geofencesQuery.data?.geofences ?? []).map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="px-2 py-2 font-medium text-slate-900">{item.label}</td>
                  <td className="px-2 py-2">{item.location_kind}</td>
                  <td className="px-2 py-2">{item.location_ref_id ?? "—"}</td>
                  <td className="px-2 py-2">{Math.max(0, (item.polygon_geojson.coordinates?.[0]?.length ?? 0) - 1)}</td>
                  <td className="px-2 py-2">{item.is_active ? "Active" : "Inactive"}</td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => void toggleActive(item.id, item.is_active)}
                    >
                      {item.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
