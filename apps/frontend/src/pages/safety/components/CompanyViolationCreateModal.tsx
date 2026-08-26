import { useMemo, useState } from "react";
import { DatePicker } from "../../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createCompanyViolation } from "../../../api/safety";
import { Button } from "../../../components/Button";
import { userFacingApiError } from "../../../lib/api-error-message";
import { Modal } from "../../../components/Modal";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { listCompanyViolationTypes } from "../../../api/catalogs-safety";
import { companyToday } from "../../../lib/businessDate";
import { CappedListNotice } from "../../../components/CappedListNotice";
import { EntityPicker } from "../../../components/parity/EntityPicker";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: () => void;
};

export function CompanyViolationCreateModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  const [violationType, setViolationType] = useState("DOT_inspection");
  const [severity, setSeverity] = useState("minor");
  const [reportedDate, setReportedDate] = useState(companyToday());
  const [description, setDescription] = useState("");
  const [correctivePlan, setCorrectivePlan] = useState("");
  // SAF-F15 (universal picker law): the specific violation type comes from the real catalog
  // (catalogs.company_violation_types) and is sent as violation_type_uuid — the FK the row has always
  // had and nothing ever populated. The enum above is the DOT CATEGORY and is a different axis; both
  // are kept (additive), neither replaces the other.
  const [violationTypeUuid, setViolationTypeUuid] = useState<string | null>(null);
  // SAF-F31: the detail drawer and reverse profile read the normalized FK join tables. Collect the
  // canonical entities here so newly-created violations can actually populate those surfaces.
  const [relatedDriverId, setRelatedDriverId] = useState<string | null>(null);
  const [relatedUnitId, setRelatedUnitId] = useState<string | null>(null);
  // SAF-B29 wave-4: catalog capped at 200 — typed term must reach listCompanyViolationTypes.
  const [typeSearch, setTypeSearch] = useState("");
  const queryClient = useQueryClient();

  const typesQuery = useQuery({
    queryKey: ["catalogs", "company-violation-types", operatingCompanyId, typeSearch],
    queryFn: () =>
      listCompanyViolationTypes(operatingCompanyId, { limit: 200, search: typeSearch || undefined }),
    enabled: open && Boolean(operatingCompanyId),
  });

  const typeOptions = useMemo(
    () =>
      (typesQuery.data?.rows ?? []).map((row) => ({
        value: String(row.id ?? ""),
        label: `${String(row.type_code ?? "")} — ${String(row.type_name ?? "")}`.replace(/^ — |^— /, ""),
      })),
    [typesQuery.data]
  );

  const mutation = useMutation({
    mutationFn: () => {
      // SAF-F15: catalogs.company_violation_types must be selected — free-text / enum-only creates
      // left violation_type_uuid NULL so Lists catalog rows never joined.
      if (!violationTypeUuid) {
        throw new Error("Violation type (catalog) is required");
      }
      return createCompanyViolation(operatingCompanyId, {
        violation_type: violationType,
        violation_type_uuid: violationTypeUuid,
        violation_severity: severity,
        reported_date: reportedDate,
        description,
        corrective_action_plan: correctivePlan || null,
        related_drivers: relatedDriverId ? [relatedDriverId] : [],
        related_units: relatedUnitId ? [relatedUnitId] : [],
      });
    },
    onSuccess: () => {
      onCreated();
      onClose();
    },
  });

  const canSubmit = Boolean(violationTypeUuid) && description.trim().length > 0;

  return (
    <Modal variant="drawer" open={open} onClose={onClose} title="Create Company Violation">
      <form
        className="space-y-3"
        data-testid="company-violation-create-modal"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          mutation.mutate();
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1 md:col-span-2">
            <label className="text-xs font-semibold text-gray-600">Violation type (catalog) *</label>
            {/*
              LST-PICKER-01: External Combobox mini-create is not VERIFY-2.
              ReferenceSelect first-row create → POST catalogs.company_violation_types.
            */}
            <ReferenceSelect
              value={violationTypeUuid}
              onChange={setViolationTypeUuid}
              options={typeOptions}
              createKind="company_violation_type"
              operatingCompanyId={operatingCompanyId}
              placeholder="Select catalogued type"
              loading={typesQuery.isLoading}
              onSearch={setTypeSearch}
              onOptionCreated={() => {
                void queryClient.invalidateQueries({
                  queryKey: ["catalogs", "company-violation-types", operatingCompanyId],
                });
                void typesQuery.refetch();
              }}
            />
            <CappedListNotice
              shown={typeOptions.length}
              limit={200}
              total={typesQuery.data?.total}
              hint="Type to search the full company-violation-type catalog."
              className="text-xs text-slate-600"
            />
            <span className="text-[11px] text-gray-500">
              Required. Carries the catalogued default fine amount. Without it the amount cannot resolve.
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Source category</label>
            <SelectCombobox
              value={violationType}
              onChange={(event) => setViolationType(event.target.value)}
              className="rounded-sm border border-gray-300 h-9 px-2 text-[13px]"
            >
              <option value="FMCSA_audit">FMCSA audit</option>
              <option value="DOT_inspection">DOT inspection</option>
              <option value="CSA_intervention">CSA intervention</option>
              <option value="state_audit">State audit</option>
              <option value="IRP">IRP</option>
              <option value="IFTA">IFTA</option>
              <option value="other">Other</option>
            </SelectCombobox>
            <span className="text-[11px] text-gray-500">
              DOT/FMCSA axis (not a substitute for the Lists catalog type above).
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Severity</label>
            <SelectCombobox
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
              className="rounded-sm border border-gray-300 h-9 px-2 text-[13px]"
            >
              <option value="warning">Warning</option>
              <option value="minor">Minor</option>
              <option value="major">Major</option>
              <option value="severe">Severe</option>
              <option value="OOS">OOS</option>
            </SelectCombobox>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="company-violation-reported-date" className="text-xs font-semibold text-gray-600">Reported date</label>
            <DatePicker
              id="company-violation-reported-date"
              value={reportedDate}
              onChange={(next) => setReportedDate(next)}
              className=""
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Related driver</label>
            <EntityPicker
              kind="driver"
              operatingCompanyId={operatingCompanyId}
              value={relatedDriverId}
              onChange={setRelatedDriverId}
              enabled={open}
              placeholder="Select driver"
              nestedInDrawer
              dataTestId="company-violation-related-driver"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Related unit</label>
            <EntityPicker
              kind="unit"
              operatingCompanyId={operatingCompanyId}
              value={relatedUnitId}
              onChange={setRelatedUnitId}
              enabled={open}
              placeholder="Select unit"
              nestedInDrawer
              dataTestId="company-violation-related-unit"
            />
          </div>
          <div className="md:col-span-2 flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Description</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
              rows={3}
            />
          </div>
          <div className="md:col-span-2 flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Corrective action plan</label>
            <textarea
              value={correctivePlan}
              onChange={(event) => setCorrectivePlan(event.target.value)}
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
              rows={2}
            />
          </div>
        </div>
        {mutation.isError ? (
          <p className="text-xs text-red-700" data-testid="company-violation-create-error">
            {userFacingApiError(mutation.error, "Could not create the company violation.")}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending} disabled={!canSubmit}>
            Save violation
          </Button>
        </div>
      </form>
    </Modal>
  );
}
