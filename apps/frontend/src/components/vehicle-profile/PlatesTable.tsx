import { useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { Button } from "../Button";
import { Modal } from "../Modal";

type Plate = { id: string; country: string; jurisdiction: string; plate_number: string; expiration?: string | null; status: string };

function platesUrl(unitId: string, companyId: string, plateId?: string) {
  const base = `/api/v1/mdata/units/${unitId}/plates`;
  const qs = `operating_company_id=${encodeURIComponent(companyId)}`;
  return plateId ? `${base}/${plateId}?${qs}` : `${base}?${qs}`;
}

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

  return (
    <div className="mt-3" data-testid="vp-plates-table">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold text-gray-600">Plates</div>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          + Add Plate
        </Button>
      </div>
      <table className="min-w-full text-xs">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="px-2 py-1">Country</th>
            <th className="px-2 py-1">Jurisdiction</th>
            <th className="px-2 py-1">Plate #</th>
            <th className="px-2 py-1">Expiration</th>
            <th className="px-2 py-1">Status</th>
            <th className="px-2 py-1" />
          </tr>
        </thead>
        <tbody>
          {plates.map((p) => (
            <tr key={p.id} className="border-t border-gray-100">
              <td className="px-2 py-1">{p.country}</td>
              <td className="px-2 py-1">{p.jurisdiction}</td>
              <td className="px-2 py-1">{p.plate_number}</td>
              <td className="px-2 py-1">{p.expiration ?? "—"}</td>
              <td className="px-2 py-1">{p.status}</td>
              <td className="px-2 py-1">
                <button type="button" className="text-slate-700 underline" onClick={() => archiveMutation.mutate(p.id)}>
                  Archive
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Modal open={open} title="Add plate" onClose={() => setOpen(false)}>
        <div className="space-y-2 text-sm">
          <select className="w-full border px-2 py-1" value={country} onChange={(e) => setCountry(e.target.value as "US" | "MX")}>
            <option value="US">US</option>
            <option value="MX">MX</option>
          </select>
          <input className="w-full border px-2 py-1" placeholder="Jurisdiction" value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} />
          <input className="w-full border px-2 py-1" placeholder="Plate number" value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} />
          <DatePicker className="w-full border px-2 py-1" value={expiration} onChange={(next) => setExpiration(next)} />
          <Button size="sm" loading={createMutation.isPending} onClick={() => createMutation.mutate()}>
            Save plate
          </Button>
        </div>
      </Modal>
    </div>
  );
}
