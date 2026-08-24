import { useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { formatDateUS } from "../../lib/formatDate";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";

type Plate = {
  id: string;
  country: string;
  jurisdiction: string;
  plate_number: string;
  expiration?: string | null;
  status: string;
};

function platesUrl(unitId: string, companyId: string, plateId?: string) {
  const base = `/api/v1/mdata/units/${unitId}/plates`;
  const qs = `operating_company_id=${encodeURIComponent(companyId)}`;
  return plateId ? `${base}/${plateId}?${qs}` : `${base}?${qs}`;
}

const COLUMNS: Array<ParityColumn<Plate>> = [
  {
    key: "country",
    label: "Country",
    sortable: true,
  },
  {
    key: "jurisdiction",
    label: "Jurisdiction",
    sortable: true,
  },
  {
    key: "plate_number",
    label: "Plate #",
    sortable: true,
  },
  {
    key: "expiration",
    label: "Expiration",
    sortable: true,
    sortValue: (row) => row.expiration ?? "",
    render: (row) => (row.expiration ? formatDateUS(row.expiration) || "—" : "—"),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
  },
];

export function PlatesTable({ unitId, companyId, plates }: { unitId: string; companyId: string; plates: Plate[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState<"US" | "MX">("US");
  const [jurisdiction, setJurisdiction] = useState("TX");
  const [plateNumber, setPlateNumber] = useState("");
  const [expiration, setExpiration] = useState("");

  const refresh = () => void qc.invalidateQueries({ queryKey: ["unit-profile", unitId, companyId] });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest(platesUrl(unitId, companyId), {
        method: "POST",
        body: { country, jurisdiction, plate_number: plateNumber, expiration: expiration || undefined },
      }),
    onSuccess: () => {
      setOpen(false);
      refresh();
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (plateId: string) =>
      apiRequest(`/api/v1/mdata/units/${unitId}/plates/${plateId}/archive?operating_company_id=${encodeURIComponent(companyId)}`, {
        method: "POST",
      }),
    onSuccess: refresh,
  });
  const createValid = jurisdiction.trim().length > 0 && plateNumber.trim().length > 0;

  return (
    <div className="mt-3" data-testid="vp-plates-table">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold text-gray-600">Plates</div>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          + Create Plate
        </Button>
      </div>
      <ParityTable
        rows={plates}
        columns={COLUMNS}
        rowKey={(row) => row.id}
        loading={false}
        storageKey="vehicle-profile-plates"
        emptyText="No plates on file."
        exportFilename="vehicle-plates"
        tableTestId="vp-plates-parity-table"
        rowTestId={(row) => `vp-plates-row-${row.id}`}
        rowActions={(row) => (
          <button
            type="button"
            className="text-slate-700 underline"
            onClick={() => archiveMutation.mutate(row.id)}
            disabled={archiveMutation.isPending}
          >
            Archive
          </button>
        )}
      />
      {archiveMutation.isError ? (
        <p className="mt-2 text-xs text-red-700" role="alert">
          Couldn&apos;t archive plate. {(archiveMutation.error as Error)?.message ?? "Try again."}
        </p>
      ) : null}
      <Modal variant="drawer" open={open} title="Add plate" onClose={() => setOpen(false)}>
        <div className="space-y-2 text-sm">
          <select className="w-full border px-2 py-1" value={country} onChange={(e) => setCountry(e.target.value as "US" | "MX")}>
            <option value="US">US</option>
            <option value="MX">MX</option>
          </select>
          <input
            className="w-full border px-2 py-1"
            placeholder="Jurisdiction"
            value={jurisdiction}
            aria-invalid={!jurisdiction.trim()}
            onChange={(e) => {
              setJurisdiction(e.target.value);
              createMutation.reset();
            }}
          />
          <input
            className="w-full border px-2 py-1"
            placeholder="Plate number"
            value={plateNumber}
            aria-invalid={!plateNumber.trim()}
            onChange={(e) => {
              setPlateNumber(e.target.value);
              createMutation.reset();
            }}
          />
          <DatePicker className="w-full" value={expiration} onChange={(next) => setExpiration(next)} />
          {!createValid ? <p className="text-xs text-gray-600">Jurisdiction and plate number are required.</p> : null}
          {createMutation.isError ? (
            <p className="text-xs text-red-700" role="alert">
              Couldn&apos;t save plate. {(createMutation.error as Error)?.message ?? "Check the jurisdiction and try again."}
            </p>
          ) : null}
          <Button size="sm" loading={createMutation.isPending} disabled={!createValid} onClick={() => createMutation.mutate()}>
            Save plate
          </Button>
        </div>
      </Modal>
    </div>
  );
}
