import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDrivers } from "../../api/mdata";
import { listSettlements } from "../../api/driverFinance";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useSettlementDisputes, type SettlementDisputeType } from "../../hooks/useSettlementDisputes";

const DISPUTE_TYPES: Array<{ value: SettlementDisputeType; label: string }> = [
  { value: "missing_line", label: "Missing line item" },
  { value: "incorrect_rate", label: "Incorrect rate" },
  { value: "duplicate_deduction", label: "Duplicate deduction" },
  { value: "wrong_unit", label: "Wrong unit" },
  { value: "other", label: "Other" },
];

type SettlementDisputeModalProps = {
  open: boolean;
  onClose: () => void;
};

export function SettlementDisputeModal({ open, onClose }: SettlementDisputeModalProps) {
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { createDispute, isCreating } = useSettlementDisputes({ enabled: false });

  const [driverId, setDriverId] = useState("");
  const [settlementId, setSettlementId] = useState("");
  const [disputeType, setDisputeType] = useState<SettlementDisputeType>("missing_line");
  const [claimedDollars, setClaimedDollars] = useState("");
  const [description, setDescription] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);

  const driversQuery = useQuery({
    queryKey: ["drivers", "dispute-modal", companyId],
    enabled: open && Boolean(companyId),
    queryFn: () => listDrivers({ operating_company_id: companyId, status: "All" }).then((r) => r.drivers),
  });

  const settlementsQuery = useQuery({
    queryKey: ["settlements", "dispute-modal", companyId, driverId],
    enabled: open && Boolean(companyId && driverId),
    queryFn: () => listSettlements(companyId).then((r) => (r.settlements ?? []).filter((s) => s.driver_id === driverId)),
  });

  const driverOptions = useMemo(
    () =>
      (driversQuery.data ?? []).map((driver) => ({
        value: driver.id,
        label: `${driver.first_name} ${driver.last_name}`,
      })),
    [driversQuery.data]
  );

  const settlementOptions = useMemo(
    () =>
      (settlementsQuery.data ?? []).map((settlement) => ({
        value: settlement.id,
        label: settlement.driver_display_id ?? settlement.id,
      })),
    [settlementsQuery.data]
  );

  async function handleSubmit() {
    const claimedCents = Math.round(Number(claimedDollars) * 100);
    if (!driverId || !settlementId || !Number.isFinite(claimedCents) || claimedCents <= 0) {
      pushToast("Driver, settlement, and claimed amount are required", "error");
      return;
    }
    if (description.trim().length < 10) {
      pushToast("Description must be at least 10 characters", "error");
      return;
    }

    const evidenceDocIds: string[] = [];
    for (const file of evidenceFiles) {
      const form = new FormData();
      form.append("file", file);
      const uploadRes = await fetch("/api/v1/docs/files/upload", { method: "POST", body: form, credentials: "include" });
      if (uploadRes.ok) {
        const uploaded = (await uploadRes.json()) as { id?: string; document_id?: string };
        const docId = uploaded.id ?? uploaded.document_id;
        if (docId) evidenceDocIds.push(docId);
      }
    }

    try {
      await createDispute({
        settlementId,
        driver_id: driverId,
        dispute_type: disputeType,
        claimed_amount_cents: claimedCents,
        description: description.trim(),
        evidence_doc_ids: evidenceDocIds.length > 0 ? evidenceDocIds : undefined,
      });
      pushToast("Dispute submitted", "success");
      setDriverId("");
      setSettlementId("");
      setClaimedDollars("");
      setDescription("");
      setEvidenceFiles([]);
      onClose();
    } catch (error) {
      pushToast(String((error as Error).message ?? "submit_failed"), "error");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Submit settlement dispute">
      <div className="space-y-3 text-sm" data-testid="settlement-dispute-modal">
        <label className="block space-y-1">
          <span className="font-medium">Driver</span>
          <select
            className="w-full rounded border border-gray-300 px-2 py-1"
            value={driverId}
            onChange={(e) => {
              setDriverId(e.target.value);
              setSettlementId("");
            }}
          >
            <option value="">Select driver</option>
            {driverOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="font-medium">Settlement</span>
          <select
            className="w-full rounded border border-gray-300 px-2 py-1"
            value={settlementId}
            disabled={!driverId}
            onChange={(e) => setSettlementId(e.target.value)}
          >
            <option value="">Select settlement</option>
            {settlementOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="font-medium">Dispute type</span>
          <select
            className="w-full rounded border border-gray-300 px-2 py-1"
            value={disputeType}
            onChange={(e) => setDisputeType(e.target.value as SettlementDisputeType)}
          >
            {DISPUTE_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="font-medium">Claimed amount (USD)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            className="w-full rounded border border-gray-300 px-2 py-1"
            value={claimedDollars}
            onChange={(e) => setClaimedDollars(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span className="font-medium">Description</span>
          <textarea
            className="min-h-24 w-full rounded border border-gray-300 px-2 py-1"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Explain what is wrong with this settlement (min 10 characters)"
          />
        </label>

        <label className="block space-y-1">
          <span className="font-medium">Evidence files</span>
          <input
            type="file"
            multiple
            className="w-full text-xs"
            onChange={(e) => setEvidenceFiles(Array.from(e.target.files ?? []))}
          />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={isCreating} onClick={() => void handleSubmit()}>
            Submit dispute
          </Button>
        </div>
      </div>
    </Modal>
  );
}
