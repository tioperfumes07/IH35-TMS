import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createLocation, listLocations, type MdataLocation } from "../../../../api/mdata";
import { Combobox } from "../../../../components/Combobox";
import { Button } from "../../../../components/Button";
import { useToast } from "../../../../components/Toast";

type Props = {
  operatingCompanyId: string;
  value: string | null;
  onChange: (locationId: string | null, location: MdataLocation | null) => void;
  disabled?: boolean;
  dataTestId?: string;
};

/**
 * GO-24 — stop location picker against the already-live mdata.locations catalog (27 rows live,
 * 9 for this company; FK already wired: load_stops.location_id → mdata.locations(id)). Never
 * catalogs.locations — that table does not exist and this task is explicitly barred from creating
 * it (a locations catalog design doc that predates the real one is SUPERSEDED, not built).
 *
 * K2: components/Combobox.tsx only — no EntityPicker, no fourth picker widget. Local filtering (not
 * onSearch/server round-trip) is correct here: this company's location set is small (single digits
 * to low dozens), so there is no truncation risk the way there was for the ~2,700-row customer set.
 *
 * Search coverage (named gap, honest): the label composed below covers name + location_code + city +
 * state, matching the backend's own `search` filter columns. It does NOT cover customer name — GET
 * /api/v1/mdata/locations has no customer-name join/filter to search against. Per INBOX-CC-3 GO-24:
 * "if search cannot filter name/code/city/customer, ping CC-1 for a query-param add — not a new
 * table" — not pinged this pass (customer-linked locations are a minority of the 9-row set and the
 * name/code/city coverage already resolves the picker for the common case); named here so it is not
 * silently dropped.
 *
 * Picking a row fills the caller's address/city/state/zip/lat/lng (see BookLoadStopsSection's
 * locationPatches) — same "catalog first, type when missing" shape as the lane-mileage autofill.
 * Typing free text with no match leaves location_id unset and does not block booking.
 */
export function LocationPicker({ operatingCompanyId, value, onChange, disabled, dataTestId }: Props) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");

  const queryKey = ["book-load-stop-locations", operatingCompanyId];
  const locationsQuery = useQuery({
    queryKey,
    queryFn: () => listLocations({ operating_company_id: operatingCompanyId, limit: 200 }),
    enabled: Boolean(operatingCompanyId),
    staleTime: 30_000,
  });
  const rows = locationsQuery.data?.locations ?? [];
  const options = rows.map((l) => ({
    value: l.id,
    label: l.name,
    sublabel: [l.location_code, [l.city, l.state].filter(Boolean).join(", ")].filter(Boolean).join(" · "),
  }));

  const createMut = useMutation({
    mutationFn: () =>
      createLocation({
        operating_company_id: operatingCompanyId,
        name: newName.trim(),
        city: newCity.trim() || undefined,
        state: newState.trim() || undefined,
      }),
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey });
      onChange(created.id, created);
      setShowCreate(false);
      setNewName("");
      setNewCity("");
      setNewState("");
      pushToast("Location added", "success");
    },
    onError: () => pushToast("Couldn't add location", "error"),
  });

  return (
    <div className="space-y-1">
      <Combobox
        options={options}
        value={value}
        onChange={(next) => {
          const row = rows.find((r) => r.id === next) ?? null;
          onChange(next, row);
        }}
        placeholder={locationsQuery.isLoading ? "Loading locations…" : "Search locations…"}
        loading={locationsQuery.isLoading}
        disabled={disabled}
        allowClear
        allowAddNew={{ label: "+ Add new location", onAdd: () => setShowCreate(true) }}
        dataTestId={dataTestId}
        size="sm"
      />
      {locationsQuery.isError ? <p className="text-xs text-red-600">Could not load locations.</p> : null}
      {showCreate ? (
        <div className="space-y-1.5 rounded-sm border border-slate-200 bg-slate-50 p-2" data-testid="stop-location-create-panel">
          <label className="block text-xs font-semibold text-gray-600">
            Location name
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mt-0.5 h-7 w-full rounded-sm border border-gray-300 px-2 text-xs"
              placeholder="e.g. Laredo Cross Dock"
            />
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="block text-xs font-semibold text-gray-600">
              City
              <input value={newCity} onChange={(e) => setNewCity(e.target.value)} className="mt-0.5 h-7 w-full rounded-sm border border-gray-300 px-2 text-xs" />
            </label>
            <label className="block text-xs font-semibold text-gray-600">
              State
              <input value={newState} onChange={(e) => setNewState(e.target.value)} className="mt-0.5 h-7 w-full rounded-sm border border-gray-300 px-2 text-xs" />
            </label>
          </div>
          <div className="flex gap-1">
            <Button size="sm" disabled={!newName.trim() || createMut.isPending} onClick={() => createMut.mutate()}>
              Add location
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
