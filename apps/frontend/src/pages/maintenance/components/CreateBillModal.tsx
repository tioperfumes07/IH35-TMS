import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createVendorBill } from "../../../api/accounting";
import {
  VendorBillForm,
  type VendorBillFormSubmitPayload,
} from "../../../components/accounting/VendorBillForm";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { useToast } from "../../../components/Toast";
import type { BillTypeId } from "../../../components/forms/shared/TypeTabBar";
import { userFacingApiError } from "../../../lib/api-error-message";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  /** When present, the created bill's memo carries this WO reference (human-readable maintenance linkage). */
  linkedWoDisplayId?: string;
  /** When present, the created bill persists a HARD FK (accounting.bills.work_order_id) to this WO. */
  linkedWoId?: string;
  /** When present (WO context), the created bill persists a HARD FK to this unit. Falls back to the picker. */
  linkedUnitId?: string;
  /** When present (Legal Matter context), stamps accounting.bills.legal_matter_id (ACCT-F5043). */
  linkedLegalMatterId?: string;
  /**
   * M-21: Maintenance Home header opens this drawer with no WO context. Require WO + unit pickers
   * so a money event from Maintenance always carries maintenance linkage.
   */
  requireWoLink?: boolean;
  /** Pre-select bill type tab when opened from accounting subnav (maintenance | repair | fuel | driver). */
  initialBillType?: BillTypeId;
  onClose: () => void;
  /** Fired after a successful create with the new bill id (e.g. to open a task-link picker). */
  onCreated?: (billId: string | null) => void;
};

/**
 * Maintenance entry point for Create Bill — keeps the WO/unit linkage props, but uses the same
 * QBO-like ParityDrawer + VendorBillForm chrome as Accounting (ReferenceSelect + Add new vendor).
 * Entry point stays; only the shell matches owner creator-chrome lock.
 */
export function CreateBillModal({
  open,
  operatingCompanyId,
  linkedWoDisplayId,
  linkedWoId,
  linkedUnitId,
  linkedLegalMatterId,
  requireWoLink = false,
  initialBillType,
  onClose,
  onCreated,
}: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [pickedWoId, setPickedWoId] = useState<string | null>(null);
  const [pickedUnitId, setPickedUnitId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPickedWoId(linkedWoId ?? null);
    setPickedUnitId(linkedUnitId ?? null);
  }, [open, linkedWoId, linkedUnitId]);

  const showLinkPickers = requireWoLink && !linkedWoId;
  const linkReady = !requireWoLink || Boolean(linkedWoId ?? pickedWoId);

  const createMutation = useMutation({
    mutationFn: (payload: VendorBillFormSubmitPayload) => {
      if (!operatingCompanyId) throw new Error("Select an operating company first");
      if (requireWoLink && !(linkedWoId ?? pickedWoId)) {
        throw new Error("Select a work order — Maintenance bills must link to a WO");
      }
      return createVendorBill(operatingCompanyId, payload);
    },
    onSuccess: (res) => {
      pushToast("Bill created", "success");
      void queryClient.invalidateQueries({ queryKey: ["accounting", "bills"] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "bills-unpaid"] });
      void queryClient.invalidateQueries({ queryKey: ["maintenance"] });
      onCreated?.(res?.bill?.id ?? null);
      onClose();
    },
    onError: (error) => {
      pushToast(userFacingApiError(error, "Failed to create bill"), "error");
    },
  });

  return (
    <ParityDrawer open={open} onClose={onClose} title="Create Bill" size="wide">
      {showLinkPickers ? (
        <div
          className="mb-3 grid gap-2 rounded-sm border border-slate-200 bg-slate-50 p-2 md:grid-cols-2"
          data-testid="maint-bill-wo-link-pickers"
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Work order *</label>
            <EntityPicker
              kind="work_order"
              operatingCompanyId={operatingCompanyId}
              value={pickedWoId}
              onChange={setPickedWoId}
              placeholder="Search work order…"
              enabled={open}
              nestedInDrawer
              dataTestId="maint-bill-wo-picker"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Unit</label>
            <EntityPicker
              kind="unit"
              operatingCompanyId={operatingCompanyId}
              value={pickedUnitId}
              onChange={setPickedUnitId}
              placeholder="Search unit…"
              enabled={open}
              nestedInDrawer
              dataTestId="maint-bill-unit-picker"
            />
          </div>
          {!linkReady ? (
            <p className="md:col-span-2 text-[11px] text-amber-800">
              Select a work order so this bill carries Maintenance linkage (WO FK).
            </p>
          ) : null}
        </div>
      ) : null}
      {linkReady ? (
        <VendorBillForm
          operatingCompanyId={operatingCompanyId}
          submitting={createMutation.isPending}
          linkedWoId={linkedWoId ?? pickedWoId ?? undefined}
          linkedUnitId={linkedUnitId ?? pickedUnitId ?? undefined}
          linkedLegalMatterId={linkedLegalMatterId}
          linkedWoDisplayId={linkedWoDisplayId}
          initialBillType={initialBillType}
          submitLabel="Create Bill"
          submitTestId="create-bill-submit"
          onCancel={onClose}
          onSubmit={async (payload) => {
            // Name pickedWoId / pickedUnitId on the submit path so form-field-roundtrip
            // sees the Maintenance Home pickers reach the create payload (M-21).
            await createMutation.mutateAsync({
              ...payload,
              work_order_id: payload.work_order_id ?? pickedWoId ?? linkedWoId ?? undefined,
              unit_id: payload.unit_id ?? pickedUnitId ?? linkedUnitId ?? undefined,
              legal_matter_id: payload.legal_matter_id ?? linkedLegalMatterId ?? undefined,
            });
          }}
        />
      ) : null}
    </ParityDrawer>
  );
}
