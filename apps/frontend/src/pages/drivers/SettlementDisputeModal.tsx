import { entityLabel } from "../../lib/entity-label";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listSettlements, openSettlementDispute } from "../../api/driverFinance";
import { confirmUpload, requestUploadUrlFromFile } from "../../api/docs";
import { DriverPickerWithCreate } from "../../components/drivers/DriverPickerWithCreate";
import { Modal } from "../../components/Modal";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Combobox } from "../../components/Combobox";
import { EntityLink } from "../../components/shared/EntityLink";
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
  const [settlement_id, set_settlement_id] = useState("");
  const [dispute_category, set_dispute_category] =
    useState<SettlementDisputeCategoryOption>("missing_pay");
  const [claimedDollars, setClaimedDollars] = useState("");
  const [dispute_description, set_dispute_description] = useState("");
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
        label: entityLabel(settlement.display_id, settlement.id, "Settlement"),
      })),
    [settlementsQuery.data]
  );

  async function handleSubmit() {
    const claimedCents = Math.round(Number(claimedDollars) * 100);
    if (!driverId || !settlement_id || !companyId || !Number.isFinite(claimedCents) || claimedCents <= 0) {
      pushToast("Driver, settlement, and claimed amount are required", "error");
      return;
    }
    if (dispute_description.trim().length < 20) {
      // Canonical dispute table (driver_finance.driver_settlement_disputes) enforces >=20 trimmed chars.
      pushToast("Description must be at least 20 characters", "error");
      return;
    }

    setSubmitting(true);
    try {
      const evidenceFileIds: string[] = [];
      for (const file of evidenceFiles) {
        const upload = await requestUploadUrlFromFile(file, {
          operating_company_id: companyId,
          entity_links: [{ entity_type: "settlement", entity_id: settlement_id }],
        });
        const put = await fetch(upload.presigned_url, {
          method: "PUT",
          body: file,
          headers: { "content-type": file.type || "application/octet-stream" },
        });
        if (!put.ok) throw new Error(`evidence_upload_failed_${put.status}`);
        await confirmUpload(upload.file_id);
        evidenceFileIds.push(upload.file_id);
      }
      // SETL-PICK-03: same writer as SettlementDetailPage (dispute_category CHECK), not legacy dispute_type.
      await openSettlementDispute({
        operating_company_id: companyId,
        settlement_id: settlement_id,
        driver_id: driverId,
        dispute_category: dispute_category,
        dispute_description: dispute_description.trim(),
        disputed_amount_cents: claimedCents,
        evidence_file_ids: evidenceFileIds,
      });
      pushToast("Dispute submitted", "success");
      setDriverId("");
      set_settlement_id("");
      setClaimedDollars("");
      set_dispute_description("");
      setEvidenceFiles([]);
      set_dispute_category("missing_pay");
      onClose();
    } catch (error) {
      pushToast(userFacingApiError(error, "Could not submit dispute"), "error");
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
                set_settlement_id("");
              }}
              open={open}
              placeholder="Select driver"
              dataField="settlement-dispute-driver"
              driverRoster="active_or_probation"
            />
          </label>

          <div className="block space-y-1">
            <label htmlFor="settlement-dispute-settlement-picker" className="font-medium">Settlement</label>
            <Combobox
              id="settlement-dispute-settlement-picker"
              options={settlementOptions}
              value={settlement_id || null}
              onChange={(next) => set_settlement_id(next ?? "")}
              placeholder="Select settlement"
              disabled={!driverId}
              loading={settlementsQuery.isLoading}
              error={settlementsQuery.isError ? "Couldn't load settlements" : undefined}
            />
            {settlement_id ? (
              <p className="text-xs text-gray-700" data-testid="settlement-dispute-settlement-link">
                Settlement:{" "}
                <EntityLink
                  kind="settlement"
                  id={settlement_id}
                  label={entityLabel(
                    (settlementsQuery.data ?? []).find((s) => s.id === settlement_id)?.display_id,
                    settlement_id,
                    "Settlement"
                  )}
                />
              </p>
            ) : null}
          </div>

          <label className="block space-y-1">
            <span className="font-medium">Dispute type</span>
            <select
              className="w-full rounded-sm border border-gray-300 px-2 py-1"
              value={dispute_category}
              onChange={(e) => set_dispute_category(e.target.value as SettlementDisputeCategoryOption)}
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
              value={dispute_description}
              onChange={(e) => set_dispute_description(e.target.value)}
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
