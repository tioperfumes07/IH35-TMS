import { useMemo, useState } from "react";
import { DatePicker } from "../../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createCompanyViolation } from "../../../api/safety";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { Combobox } from "../../../components/Combobox";
import { createCompanyViolationType, listCompanyViolationTypes } from "../../../api/catalogs-safety";
import { companyToday } from "../../../lib/businessDate";

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
  // SAF-F15 + SAF-F24 precedent: "+ Add new" must open an INLINE mini-create that returns with the
  // new value selected — never a link out to the catalog page. Sending the operator to another route
  // mid-create loses everything already typed here; that was exactly the SAF-F24 defect.
  const [typeCreateOpen, setTypeCreateOpen] = useState(false);
  const [newTypeCode, setNewTypeCode] = useState("");
  const [newTypeName, setNewTypeName] = useState("");
  const queryClient = useQueryClient();

  const createTypeMutation = useMutation({
    mutationFn: () =>
      createCompanyViolationType(operatingCompanyId, {
        type_code: newTypeCode.trim(),
        type_name: newTypeName.trim(),
        default_severity: 1,
        amount_cents: null,
        is_active: true,
      }),
    onSuccess: async (row) => {
      await queryClient.invalidateQueries({ queryKey: ["catalogs", "company-violation-types", operatingCompanyId] });
      // Return with the new value SELECTED — the picker-law contract.
      setViolationTypeUuid(String(row.id));
      setTypeCreateOpen(false);
      setNewTypeCode("");
      setNewTypeName("");
    },
  });

  const typesQuery = useQuery({
    queryKey: ["catalogs", "company-violation-types", operatingCompanyId],
    queryFn: () => listCompanyViolationTypes(operatingCompanyId, { limit: 200 }),
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
    mutationFn: () =>
      createCompanyViolation(operatingCompanyId, {
        violation_type: violationType,
        violation_type_uuid: violationTypeUuid || null,
        violation_severity: severity,
        reported_date: reportedDate,
        description,
        corrective_action_plan: correctivePlan || null,
      }),
    onSuccess: () => {
      onCreated();
      onClose();
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Create Company Violation">
      <form
        className="space-y-3"
        data-testid="company-violation-create-modal"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Violation type</label>
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
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Violation type (catalog)</label>
            <Combobox
              options={typeOptions}
              value={violationTypeUuid}
              onChange={setViolationTypeUuid}
              placeholder="Select catalogued type"
              loading={typesQuery.isLoading}
              allowAddNew={{
                label: "+ Add new violation type",
                onAdd: () => setTypeCreateOpen(true),
              }}
            />
            <span className="text-[11px] text-gray-500">
              Carries the catalogued default fine amount. Without it the amount cannot resolve.
            </span>
          </div>
          {typeCreateOpen ? (
            <div
              className="flex flex-col gap-2 rounded-sm border border-gray-300 bg-gray-50 p-2 md:col-span-2"
              data-testid="company-violation-type-create-inline"
            >
              <span className="text-xs font-semibold text-gray-700">New violation type</span>
              <label className="block text-xs">
                <span className="text-slate-600">Type code</span>
                <input
                  className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2"
                  value={newTypeCode}
                  onChange={(event) => setNewTypeCode(event.target.value)}
                />
              </label>
              <label className="block text-xs">
                <span className="text-slate-600">Type name</span>
                <input
                  className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2"
                  value={newTypeName}
                  onChange={(event) => setNewTypeName(event.target.value)}
                />
              </label>
              {createTypeMutation.isError ? (
                <p className="text-[11px] text-red-600">
                  {(createTypeMutation.error as Error)?.message ?? "Could not create the type."}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button type="button" className="rounded-sm border border-gray-300 px-3 py-1 text-xs" onClick={() => setTypeCreateOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-sm bg-[#1F2A44] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  disabled={!newTypeCode.trim() || !newTypeName.trim() || createTypeMutation.isPending}
                  onClick={() => createTypeMutation.mutate()}
                >
                  {createTypeMutation.isPending ? "Saving…" : "+ Create"}
                </button>
              </div>
            </div>
          ) : null}
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
            <label className="text-xs font-semibold text-gray-600">Reported date</label>
            <DatePicker
              value={reportedDate}
              onChange={(next) => setReportedDate(next)}
              className="rounded-sm border border-gray-300 px-2 text-sm py-2"
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
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Save violation
          </Button>
        </div>
      </form>
    </Modal>
  );
}
