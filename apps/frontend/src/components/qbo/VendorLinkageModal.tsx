import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../Button";
import { Modal } from "../Modal";
import {
  linkQboVendor,
  listQboVendors,
  listQboVendorSuggestions,
  unlinkQboVendor,
  type QboVendorCandidate,
} from "../../api/mdata";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  entityType: "driver" | "unit" | "equipment" | "asset";
  entityId: string;
  entityName: string;
  currentQboVendorId?: string | null;
  canManage: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function VendorLinkageModal({
  open,
  operatingCompanyId,
  entityType,
  entityId,
  entityName,
  currentQboVendorId,
  canManage,
  onClose,
  onSaved,
}: Props) {
  const [search, setSearch] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const vendorsQuery = useQuery({
    queryKey: ["qbo", "vendors", operatingCompanyId, search],
    queryFn: () => listQboVendors(operatingCompanyId, search, 50),
    enabled: open,
  });
  const suggestionsQuery = useQuery({
    queryKey: ["qbo", "vendor-suggestions", operatingCompanyId, entityType, entityId],
    queryFn: () => listQboVendorSuggestions(operatingCompanyId, entityType, entityId),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelectedVendorId(currentQboVendorId ?? null);
    setReason("");
    setError(null);
    setSubmitting(false);
  }, [open, currentQboVendorId]);

  const selectedVendor = useMemo(() => {
    const all = [...(suggestionsQuery.data?.rows ?? []), ...(vendorsQuery.data?.rows ?? [])];
    return all.find((row) => row.qbo_vendor_id === selectedVendorId) ?? null;
  }, [selectedVendorId, suggestionsQuery.data?.rows, vendorsQuery.data?.rows]);

  const renderVendor = (row: QboVendorCandidate) => (
    <button
      key={row.qbo_vendor_id}
      type="button"
      className={`w-full rounded border px-2 py-1.5 text-left text-xs hover:bg-gray-50 ${
        selectedVendorId === row.qbo_vendor_id ? "border-blue-400 bg-blue-50" : "border-gray-200"
      }`}
      onClick={() => setSelectedVendorId(row.qbo_vendor_id)}
    >
      <div className="font-semibold text-gray-900">{row.display_name}</div>
      <div className="text-gray-600">{row.company_name ?? row.qbo_vendor_id}</div>
      {"score" in row && row.score !== undefined ? <div className="text-[11px] text-blue-700">Score: {Number(row.score).toFixed(2)}</div> : null}
    </button>
  );

  return (
    <Modal open={open} onClose={onClose} title="QBO Vendor Linkage">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs">
            <div className="font-semibold text-gray-900">{entityName}</div>
            <div className="text-gray-600">Current: {currentQboVendorId ?? "Unlinked"}</div>
          </div>
          <label className="text-xs font-semibold text-gray-600">
            Search vendors
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="mt-1 h-8 w-full rounded border border-gray-300 px-2 text-[13px]"
              placeholder="Search display/company name"
            />
          </label>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Suggestions</div>
          <div className="max-h-44 space-y-1 overflow-auto">{(suggestionsQuery.data?.rows ?? []).slice(0, 5).map(renderVendor)}</div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Vendor list</div>
          <div className="max-h-52 space-y-1 overflow-auto">{(vendorsQuery.data?.rows ?? []).map(renderVendor)}</div>
        </div>
        <div className="space-y-2">
          <div className="rounded border border-gray-200 p-2 text-xs">
            <div className="font-semibold text-gray-900">Selected vendor</div>
            {selectedVendor ? (
              <>
                <div className="mt-1 text-gray-800">{selectedVendor.display_name}</div>
                <div className="text-gray-600">{selectedVendor.company_name ?? selectedVendor.qbo_vendor_id}</div>
              </>
            ) : (
              <div className="mt-1 text-gray-500">No vendor selected.</div>
            )}
          </div>
          <label className="text-xs font-semibold text-gray-600">
            Reason (required)
            <textarea
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-[13px]"
            />
          </label>
          {error ? <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            {canManage && currentQboVendorId ? (
              <Button
                type="button"
                variant="danger"
                disabled={submitting || reason.trim().length < 3}
                onClick={() => {
                  setSubmitting(true);
                  setError(null);
                  void unlinkQboVendor(operatingCompanyId, entityType, entityId, reason)
                    .then(() => onSaved())
                    .catch((e) => setError(String((e as Error)?.message ?? "Unlink failed")))
                    .finally(() => setSubmitting(false));
                }}
              >
                Unlink
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={!canManage || !selectedVendorId || reason.trim().length < 3 || submitting}
              onClick={() => {
                if (!selectedVendorId) return;
                setSubmitting(true);
                setError(null);
                void linkQboVendor({
                  operating_company_id: operatingCompanyId,
                  entity_type: entityType,
                  entity_id: entityId,
                  qbo_vendor_id: selectedVendorId,
                  reason,
                  force: true,
                })
                  .then(() => onSaved())
                  .catch((e) => setError(String((e as Error)?.message ?? "Link failed")))
                  .finally(() => setSubmitting(false));
              }}
            >
              Link
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
