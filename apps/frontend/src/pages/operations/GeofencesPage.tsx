import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { Combobox } from "../../components/Combobox";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { useCompanyContext } from "../../contexts/CompanyContext";
import {
  createGeofence,
  listGeofences,
  updateGeofence,
  type Geofence,
  type GeofenceLocationKind,
} from "../../api/geofencing";
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

function vertexCount(item: Geofence) {
  return Math.max(0, (item.polygon_geojson.coordinates?.[0]?.length ?? 0) - 1);
}

export function GeofencesPage() {
  const { selectedCompanyId, companies } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? companies[0]?.id ?? "";
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [locationKind, setLocationKind] = useState<GeofenceLocationKind>("custom");
  const [locationRefId, setLocationRefId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [vendorSearch, setVendorSearch] = useState("");
  const [polygonText, setPolygonText] = useState("-97.7431,30.2672\n-97.7350,30.2672\n-97.7350,30.2620\n-97.7431,30.2620");
  const [saving, setSaving] = useState(false);

  const geofencesQuery = useQuery({
    queryKey: ["telematics", "geofences", operatingCompanyId],
    queryFn: () => listGeofences(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const customersQuery = useQuery({
    queryKey: ["mdata", "customers", operatingCompanyId, customerSearch],
    queryFn: () =>
      listCustomers({
        operating_company_id: operatingCompanyId,
        limit: 5000,
        search: customerSearch || undefined,
      }),
    enabled: Boolean(operatingCompanyId) && locationKind === "customer_site",
  });

  const vendorsQuery = useQuery({
    queryKey: ["mdata", "vendors", operatingCompanyId, vendorSearch],
    queryFn: () =>
      listVendors({
        operating_company_id: operatingCompanyId,
        limit: 5000,
        search: vendorSearch || undefined,
      }),
    enabled: Boolean(operatingCompanyId) && locationKind === "vendor_site",
  });

  const yardsQuery = useQuery({
    queryKey: ["mdata", "locations", operatingCompanyId],
    queryFn: () => listLocations({ operating_company_id: operatingCompanyId }),
    enabled: Boolean(operatingCompanyId),
  });

  const locationOptions = useMemo(() => {
    if (locationKind === "yard") {
      return (yardsQuery.data?.locations ?? [])
        .filter((loc) => String((loc as { location_type?: string }).location_type ?? "") === "yard")
        .map((loc) => ({
          value: String((loc as { id?: string }).id ?? ""),
          label: String((loc as { name?: string }).name ?? "Yard"),
        }))
        .filter((option) => option.value);
    }
    return [];
  }, [locationKind, yardsQuery.data?.locations]);

  const customerRefOptions = useMemo(
    () =>
      (customersQuery.data?.customers ?? []).map((customer) => ({
        value: customer.id,
        label: customer.name,
      })),
    [customersQuery.data?.customers]
  );

  const vendorRefOptions = useMemo(
    () =>
      (vendorsQuery.data?.vendors ?? []).map((vendor) => ({
        value: vendor.id,
        label: vendor.name,
      })),
    [vendorsQuery.data?.vendors]
  );

  const geofences = geofencesQuery.data?.geofences ?? [];

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

  const toggleActive = useCallback(
    async (id: string, isActive: boolean) => {
      await updateGeofence(id, { is_active: !isActive });
      await queryClient.invalidateQueries({ queryKey: ["telematics", "geofences", operatingCompanyId] });
    },
    [operatingCompanyId, queryClient],
  );

  const geofenceColumns = useMemo<Array<ParityColumn<Geofence>>>(
    () => [
      { key: "label", label: "Label", sortable: true, render: (item) => item.label },
      { key: "location_kind", label: "Kind", sortable: true, render: (item) => item.location_kind },
      {
        key: "location_ref_id",
        label: "Linked ref",
        sortable: true,
        // C5 — this printed a bare UUID and was a dead click. NOTE, against the C5 brief: this is
        // NOT a load reference. `GeofenceLocationKind` is
        // customer_site | yard | vendor_site | custom | dot_inspection_station
        // (api/geofencing.ts:3 and the identical `locationKindSchema` in
        // apps/backend/src/telematics/geofences.routes.ts:6) — there is no load kind, so
        // location_ref_id can never be a load id. It is drilled to the entity it actually points
        // at; yard / custom / dot_inspection_station have no per-id detail route, so those stay
        // plain text rather than becoming a fabricated link.
        render: (item) => {
          if (!item.location_ref_id) return "—";
          if (item.location_kind === "customer_site") {
            return <EntityLink kind="customer" id={item.location_ref_id} label={entityLabel(null, item.location_ref_id, "Customer")} />;
          }
          if (item.location_kind === "vendor_site") {
            return <EntityLink kind="vendor" id={item.location_ref_id} label={entityLabel(null, item.location_ref_id, "Vendor")} />;
          }
          return entityLabel(null, item.location_ref_id, "Location");
        },
      },
      {
        key: "vertices",
        label: "Vertices",
        sortable: true,
        sortValue: (item) => vertexCount(item),
        render: (item) => vertexCount(item),
      },
      {
        key: "is_active",
        label: "Status",
        sortable: true,
        render: (item) => (item.is_active ? "Active" : "Inactive"),
      },
      {
        key: "action",
        label: "Action",
        render: (item) => (
          <button
            type="button"
            className="rounded-sm border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => void toggleActive(item.id, item.is_active)}
          >
            {item.is_active ? "Deactivate" : "Activate"}
          </button>
        ),
      },
    ],
    [toggleActive],
  );

  const polygonPreview = polygonTextToGeoJson(polygonText);

  return (
    <div className="space-y-4">
      <PageHeader title="Geofences" subtitle="Polygon geofences for customer sites, yards, and vendor locations." />
      <section className="rounded-sm border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-semibold text-slate-900">Create geofence</h3>
        <p className="mt-1 text-xs text-slate-600">Polygon editor: one `lng,lat` pair per line. Minimum 3 points.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-xs text-slate-700">
            Label
            <input
              className="mt-1 block h-9 w-full rounded-sm border border-slate-300 px-2 text-sm"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <label className="text-xs text-slate-700">
            Location kind
            <select
              className="mt-1 block h-9 w-full rounded-sm border border-slate-300 px-2 text-sm"
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
            {locationKind === "customer_site" ? (
              <div className="mt-1">
                <ReferenceSelect
                  value={locationRefId || null}
                  onChange={(next) => setLocationRefId(next ?? "")}
                  options={customerRefOptions}
                  createKind="customer"
                  operatingCompanyId={operatingCompanyId}
                  placeholder="Select customer site"
                  disabled={!operatingCompanyId}
                  loading={customersQuery.isLoading}
                  onSearch={setCustomerSearch}
                />
              </div>
            ) : locationKind === "vendor_site" ? (
              <div className="mt-1">
                <ReferenceSelect
                  value={locationRefId || null}
                  onChange={(next) => setLocationRefId(next ?? "")}
                  options={vendorRefOptions}
                  createKind="vendor"
                  operatingCompanyId={operatingCompanyId}
                  placeholder="Select vendor site"
                  disabled={!operatingCompanyId}
                  loading={vendorsQuery.isLoading}
                  onSearch={setVendorSearch}
                />
              </div>
            ) : locationKind === "yard" ? (
              <Combobox
                className="mt-1"
                dataTestId="geofence-yard-location-picker"
                options={locationOptions}
                value={locationRefId || null}
                onChange={(next) => setLocationRefId(next ?? "")}
                placeholder="None"
                loading={yardsQuery.isLoading}
                error={yardsQuery.isError ? "Couldn't load yard locations" : undefined}
              />
            ) : (
              <p className="mt-1 text-xs text-slate-500">No linked entity for custom geofences.</p>
            )}
          </label>
          <label className="text-xs text-slate-700 md:col-span-2">
            Polygon points (`lng,lat`)
            <textarea
              className="mt-1 block h-36 w-full rounded-sm border border-slate-300 px-2 py-2 font-mono text-xs"
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

      <section className="rounded-sm border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-semibold text-slate-900">Active geofences</h3>
        {geofencesQuery.isError ? (
          <ListErrorState
            title="Couldn't load geofences"
            status={0}
            message={(geofencesQuery.error as Error)?.message}
            onRetry={() => void geofencesQuery.refetch()}
          />
        ) : (
          <div className="mt-2">
            <ParityTable<Geofence>
              columns={geofenceColumns}
              rows={geofences}
              rowKey={(item) => item.id}
              loading={geofencesQuery.isLoading}
              emptyText="No geofences configured yet. Use the form above to create one."
              storageKey="operations-geofences"
              exportFilename="geofences"
            />
          </div>
        )}
      </section>
    </div>
  );
}
