import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createNonOwnedTrailer,
  listNonOwnedTrailers,
  type NonOwnedTrailer,
} from "../../../../api/dispatch";
import { listVendors, searchCustomersAutocomplete } from "../../../../api/mdata";
import { Combobox } from "../../../../components/Combobox";
import { ReferenceSelect, type ReferenceOption } from "../../../../components/parity/ReferenceSelect";
import { Button } from "../../../../components/Button";
import { CappedListNotice } from "../../../../components/CappedListNotice";
import { useToast } from "../../../../components/Toast";

type Props = {
  operatingCompanyId: string;
  value: string | null;
  onChange: (nonOwnedTrailerId: string | null, trailer: NonOwnedTrailer | null) => void;
  disabled?: boolean;
  /** Pass-through to Combobox's size — "sm" (h-7) for a dense wizard/form row; default "md" (h-9)
   * matches every existing list-toolbar-filter call site unchanged. */
  size?: "md" | "sm";
};

/**
 * GO-23 A1 — interchange (non-owned) trailer source. Reads/writes dispatch.non_owned_trailers via
 * the already-live backend (migration 202613440001, PR #19567). Never touches mdata.units — a
 * non-owned trailer has no owned-fleet identity at all.
 *
 * Counterparty picker is components/Combobox (outside-click dismiss). #19609 imported EntityPicker
 * here and the J1/K2 ratchet went UP.
 */
export function InterchangeTrailerPicker({ operatingCompanyId, value, onChange, disabled, size }: Props) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [newTrailerNumber, setNewTrailerNumber] = useState("");
  const [newCounterpartyType, setNewCounterpartyType] = useState<"customer" | "vendor">("customer");
  const [newCounterpartyId, setNewCounterpartyId] = useState<string | null>(null);
  const [counterpartySearch, setCounterpartySearch] = useState("");
  const [vendorSearch, setVendorSearch] = useState("");

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

  const customersQuery = useQuery({
    queryKey: ["interchange-counterparty-customers", operatingCompanyId, counterpartySearch],
    queryFn: () => searchCustomersAutocomplete(operatingCompanyId, counterpartySearch, { limit: 100 }),
    enabled: Boolean(operatingCompanyId) && showCreate && newCounterpartyType === "customer",
    staleTime: 30_000,
  });
  const vendorsQuery = useQuery({
    queryKey: ["interchange-counterparty-vendors", operatingCompanyId, vendorSearch],
    queryFn: () => listVendors({ operating_company_id: operatingCompanyId, limit: 1000, search: vendorSearch }),
    enabled: Boolean(operatingCompanyId) && showCreate && newCounterpartyType === "vendor",
    staleTime: 30_000,
  });

  const counterpartyOptions =
    newCounterpartyType === "customer"
      ? (customersQuery.data ?? []).map((c) => ({
          value: c.id,
          label: c.display_name.trim() || c.id,
        }))
      : (vendorsQuery.data?.vendors ?? []).map((v) => ({
          value: v.id,
          label: v.name.trim() || v.id,
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
      setCounterpartySearch("");
      pushToast("Interchange trailer added", "success");
    },
    onError: () => pushToast("Couldn't add interchange trailer", "error"),
  });

  return (
    <div className="space-y-1">
      <Combobox
        size={size}
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
        allowAddNew={{ label: "+ Create interchange trailer", onAdd: () => setShowCreate(true) }}
        dataTestId="interchange-trailer-picker"
      />
      {trailersQuery.isError ? <p className="text-xs text-red-600">Could not load interchange trailers.</p> : null}
      {showCreate ? (
        <div className="space-y-1.5 rounded-sm border border-slate-200 bg-slate-50 p-2" data-testid="interchange-trailer-create-panel">
          <label className="block text-xs font-semibold text-gray-600">
            Trailer number
            <input
              value={newTrailerNumber}
              onChange={(e) => setNewTrailerNumber(e.target.value)}
              className="mt-0.5 h-7 w-full rounded-sm border border-gray-300 px-2 text-xs"
              placeholder="e.g. INTERCHG-4471"
            />
          </label>
          <div className="flex gap-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setNewCounterpartyType("customer");
                setNewCounterpartyId(null);
                setCounterpartySearch("");
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
                setCounterpartySearch("");
              }}
              className={`rounded-sm border px-2 py-1 ${newCounterpartyType === "vendor" ? "border-slate-700 bg-slate-700 text-white" : "border-gray-300 text-slate-700"}`}
            >
              Vendor trailer
            </button>
          </div>
          <label className="block text-xs font-semibold text-gray-600">
            {newCounterpartyType === "customer" ? "Customer" : "Vendor"} (owner of this trailer)
            <div className="mt-0.5">
              {newCounterpartyType === "vendor" ? (
                <ReferenceSelect
                  size={size}
                  createKind="vendor"
                  operatingCompanyId={operatingCompanyId}
                  options={counterpartyOptions as ReferenceOption[]}
                  value={newCounterpartyId}
                  onChange={(next) => setNewCounterpartyId(next)}
                  onSearch={setVendorSearch}
                  placeholder="Select vendor"
                  loading={vendorsQuery.isLoading}
                  addNewLabel="+ Add new vendor"
                  onOptionCreated={() => void vendorsQuery.refetch()}
                />
              ) : (
                <Combobox
                  size={size}
                  options={counterpartyOptions}
                  value={newCounterpartyId}
                  onChange={(next) => setNewCounterpartyId(next ?? null)}
                  onSearch={setCounterpartySearch}
                  placeholder="Select customer"
                  loading={customersQuery.isLoading}
                  clearCommittedOnEdit
                  dataField="interchange_counterparty_id"
                  dataTestId="interchange-counterparty-picker"
                />
              )}
              {newCounterpartyType === "vendor" ? (
                <CappedListNotice
                  shown={vendorsQuery.data?.vendors?.length ?? 0}
                  limit={200}
                  total={vendorsQuery.data?.total ?? null}
                  hint="Type to search the full vendor list."
                />
              ) : null}
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
