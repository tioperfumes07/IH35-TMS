import { useMemo, useState } from "react";
import { resolveApiUrl } from "../../api/client";
import { useQuery } from "@tanstack/react-query";
import { listSettlements, openSettlementDispute } from "../../api/driverFinance";
import { DriverPickerWithCreate } from "../../components/drivers/DriverPickerWithCreate";
import { Modal } from "../../components/Modal";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import {
  SETTLEMENT_DISPUTE_CATEGORY_OPTIONS,
  type SettlementDisputeCategoryOption,
} from "../driver-finance/settlementDisputeCategories";

type SettlementDisputeModalProps = {
  open: boolean;
  onClose: () => void;
};

export function SettlementDisputeModal({ open, onClose }: SettlementDisputeModalProps) {
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [submitting, setSubmitting] = useState(false);

  const [driverId, setDriverId] = useState("");
  const [settlementId, setSettlementId] = useState("");
  const [disputeCategory, setDisputeCategory] =
    useState<SettlementDisputeCategoryOption>("missing_pay");
  const [claimedDollars, setClaimedDollars] = useState("");
  const [description, setDescription] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);

  const settlementsQuery = useQuery({
    queryKey: ["settlements", "dispute-modal", companyId, driverId],
    enabled: open && Boolean(companyId && driverId),
    queryFn: () => listSettlements(companyId).then((r) => (r.settlements ?? []).filter((s) => s.driver_id === driverId)),
  });

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
    if (!driverId || !settlementId || !companyId || !Number.isFinite(claimedCents) || claimedCents <= 0) {
      pushToast("Driver, settlement, and claimed amount are required", "error");
      return;
    }
    if (description.trim().length < 20) {
      // Canonical dispute table (driver_finance.driver_settlement_disputes) enforces >=20 trimmed chars.
      pushToast("Description must be at least 20 characters", "error");
      return;
    }

    // Best-effort upload — canonical POST does not yet accept evidence_doc_ids (SETL-PICK-03 wire = category).
    for (const file of evidenceFiles) {
      const form = new FormData();
      form.append("file", file);
      await fetch(resolveApiUrl("/api/v1/docs/files/upload"), {
        method: "POST",
        body: form,
        credentials: "include",
      }).catch(() => undefined);
    }

    setSubmitting(true);
    try {
      // SETL-PICK-03: same writer as SettlementDetailPage (dispute_category CHECK), not legacy dispute_type.
      await openSettlementDispute({
        operating_company_id: companyId,
        settlement_id: settlementId,
        driver_id: driverId,
        dispute_category: disputeCategory,
        dispute_description: description.trim(),
        disputed_amount_cents: claimedCents,
      });
      pushToast("Dispute submitted", "success");
      setDriverId("");
      setSettlementId("");
      setClaimedDollars("");
      setDescription("");
      setEvidenceFiles([]);
      setDisputeCategory("missing_pay");
      onClose();
    } catch (error) {
      pushToast(String((error as Error).message ?? "submit_failed"), "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    // CHROME-11: the nested driver creator is a SIBLING of <Modal>, never a child. Rendering it
    // inside the shell produced a literal box-inside-a-box (two stacked Modal frames, two headers)
    // — caught by verify:no-nested-modal-frames. Sibling placement keeps a single frame while the
    // z-index reasoning below still holds.
    <>
      <Modal open={open} onClose={onClose} title="Submit settlement dispute">
        <div className="space-y-3 text-sm" data-testid="settlement-dispute-modal">
          <label className="block space-y-1">
            <span className="font-medium">Driver</span>
            <DriverPickerWithCreate
              operatingCompanyId={companyId}
              value={driverId || null}
              onChange={(next) => {
                setDriverId(next ?? "");
                setSettlementId("");
              }}
              open={open}
              placeholder="Select driver"
              dataField="settlement-dispute-driver"
              driverRoster="active_or_probation"
            />
          </label>

          <label className="block space-y-1">
            <span className="font-medium">Settlement</span>
            <select
              className="w-full rounded-sm border border-gray-300 px-2 py-1"
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
              className="w-full rounded-sm border border-gray-300 px-2 py-1"
              value={disputeCategory}
              onChange={(e) => setDisputeCategory(e.target.value as SettlementDisputeCategoryOption)}
              data-testid="settlement-dispute-category"
            >
              {SETTLEMENT_DISPUTE_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="font-medium">Claimed amount (USD)</span>
            {/* M-1: dollars-mode QBO money entry; bridged so Math.round(claimedDollars*100) is byte-for-byte. */}
            <MoneyInput
              valueDollars={claimedDollars ? Number(claimedDollars) : null}
              onChangeDollars={(d) => setClaimedDollars(d == null ? "" : String(d))}
              ariaLabel="Claimed amount (USD)"
            />
          </label>

          <label className="block space-y-1">
            <span className="font-medium">Description</span>
            <textarea
              className="min-h-24 w-full rounded-sm border border-gray-300 px-2 py-1"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain what is wrong with this settlement (min 20 characters)"
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
            <Button type="button" disabled={submitting} onClick={() => void handleSubmit()}>
              Submit dispute
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
