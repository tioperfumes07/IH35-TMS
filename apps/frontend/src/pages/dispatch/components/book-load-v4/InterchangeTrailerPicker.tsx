import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createNonOwnedTrailer,
  listNonOwnedTrailers,
  type NonOwnedTrailer,
} from "../../../../api/dispatch";
import { Combobox } from "../../../../components/Combobox";
import { EntityPicker } from "../../../../components/parity/EntityPicker";
import { Button } from "../../../../components/Button";
import { useToast } from "../../../../components/Toast";

type Props = {
  operatingCompanyId: string;
  value: string | null;
  onChange: (nonOwnedTrailerId: string | null, trailer: NonOwnedTrailer | null) => void;
  disabled?: boolean;
};

/**
 * GO-23 A1 — interchange (non-owned) trailer source. Reads/writes dispatch.non_owned_trailers via
 * the already-live backend (migration 202613440001, PR #19567). Never touches mdata.units — a
 * non-owned trailer has no owned-fleet identity at all.
 */
export function InterchangeTrailerPicker({ operatingCompanyId, value, onChange, disabled }: Props) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [newTrailerNumber, setNewTrailerNumber] = useState("");
  const [newCounterpartyType, setNewCounterpartyType] = useState<"customer" | "vendor">("customer");
  const [newCounterpartyId, setNewCounterpartyId] = useState<string | null>(null);

  const trailersQuery = useQuery({
    queryKey: ["interchange-trailers", operatingCompanyId],
    queryFn: () => listNonOwnedTrailers(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
    staleTime: 30_000,
  });
  const rows = trailersQuery.data?.rows ?? [];
  const options = rows.map((t) => ({
    value: t.id,
    label: `${t.trailer_number}${t.counterparty_name ? ` — ${t.counterparty_name}` : ""}`,
  }));

  const createMut = useMutation({
    mutationFn: () =>
      createNonOwnedTrailer(operatingCompanyId, {
        trailer_number: newTrailerNumber.trim(),
        counterparty_type: newCounterpartyType,
        counterparty_id: newCounterpartyId as string,
      }),
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ["interchange-trailers", operatingCompanyId] });
      const created = await listNonOwnedTrailers(operatingCompanyId);
      const row = created.rows.find((r) => r.id === result.id) ?? null;
      onChange(result.id, row);
      setShowCreate(false);
      setNewTrailerNumber("");
      setNewCounterpartyId(null);
      pushToast("Interchange trailer added", "success");
    },
    onError: () => pushToast("Couldn't add interchange trailer", "error"),
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
        placeholder={trailersQuery.isLoading ? "Loading interchange trailers…" : "Select interchange trailer"}
        loading={trailersQuery.isLoading}
        disabled={disabled}
        allowClear
        allowAddNew={{ label: "+ New interchange trailer", onAdd: () => setShowCreate(true) }}
        dataTestId="interchange-trailer-picker"
      />
      {trailersQuery.isError ? <p className="text-[11px] text-red-600">Could not load interchange trailers.</p> : null}
      {showCreate ? (
        <div className="space-y-1.5 rounded-sm border border-slate-200 bg-slate-50 p-2" data-testid="interchange-trailer-create-panel">
          <label className="block text-[11px] font-semibold text-gray-600">
            Trailer number
            <input
              value={newTrailerNumber}
              onChange={(e) => setNewTrailerNumber(e.target.value)}
              className="mt-0.5 h-7 w-full rounded-sm border border-gray-300 px-2 text-xs"
              placeholder="e.g. INTERCHG-4471"
            />
          </label>
          <div className="flex gap-1 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => {
                setNewCounterpartyType("customer");
                setNewCounterpartyId(null);
              }}
              className={`rounded-sm border px-2 py-1 ${newCounterpartyType === "customer" ? "border-slate-700 bg-slate-700 text-white" : "border-gray-300 text-slate-700"}`}
            >
              Customer trailer
            </button>
            <button
              type="button"
              onClick={() => {
                setNewCounterpartyType("vendor");
                setNewCounterpartyId(null);
              }}
              className={`rounded-sm border px-2 py-1 ${newCounterpartyType === "vendor" ? "border-slate-700 bg-slate-700 text-white" : "border-gray-300 text-slate-700"}`}
            >
              Vendor trailer
            </button>
          </div>
          <label className="block text-[11px] font-semibold text-gray-600">
            {newCounterpartyType === "customer" ? "Customer" : "Vendor"} (owner of this trailer)
            <div className="mt-0.5">
              <EntityPicker
                kind={newCounterpartyType}
                operatingCompanyId={operatingCompanyId}
                value={newCounterpartyId}
                onChange={(next) => setNewCounterpartyId(next ?? null)}
                className="h-7 w-full text-xs"
                placeholder={`Select ${newCounterpartyType}`}
                dataField="interchange_counterparty_id"
              />
            </div>
          </label>
          <div className="flex gap-1">
            <Button
              size="sm"
              disabled={!newTrailerNumber.trim() || !newCounterpartyId || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              Add trailer
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
