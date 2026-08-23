import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  createVendorPaymentMethod,
  listVendorPaymentMethods,
  updateVendorPaymentMethod,
  voidVendorPaymentMethod,
  type VendorPaymentMethod,
} from "../../api/mdata";
import { ApiError } from "../../api/client";
import { Button } from "../../components/Button";
import { DataPanel } from "../../components/layout/DataPanel";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { formatDateUS } from "../../lib/formatDate";

type Props = {
  operatingCompanyId: string;
  vendorId: string;
  /** Matches the backend's write-role gate exactly (Owner/Administrator only, narrower than the
   * Manager/Accountant band elsewhere in the vendor profile — this records how money leaves the company). */
  canWrite: boolean;
};

const METHOD_TYPE_OPTIONS: VendorPaymentMethod["method_type"][] = ["ach", "check", "wire", "other"];

function methodTypeLabel(type: VendorPaymentMethod["method_type"]) {
  return type === "ach" ? "ACH" : type === "wire" ? "Wire" : type === "check" ? "Check" : "Other";
}

// ORPH-003 — the management UI for mdata.vendor_payment_methods (migration 202613110000). Replaces
// Vendors.tsx's buildAchDisplay() notes-text heuristic with real structured records: this is where an
// operator actually records "ACH on file" (or check/wire/other) instead of relying on free-text notes
// mentioning "ach". See docs/specs/CURSOR-AUDIT-2026-07-15/modules/15-CUSTOMERS-VENDORS.md §5 item 5.
export function VendorPaymentMethodsSection({ operatingCompanyId, vendorId, canWrite }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["vendor-payment-methods", operatingCompanyId, vendorId];

  const [addOpen, setAddOpen] = useState(false);
  const [methodType, setMethodType] = useState<VendorPaymentMethod["method_type"]>("ach");
  const [bankName, setBankName] = useState("");
  const [accountMask, setAccountMask] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [notes, setNotes] = useState("");
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const query = useQuery({
    queryKey,
    queryFn: () => listVendorPaymentMethods(vendorId, operatingCompanyId).then((r) => r.payment_methods),
    enabled: Boolean(operatingCompanyId && vendorId),
  });

  function resetAddForm() {
    setMethodType("ach");
    setBankName("");
    setAccountMask("");
    setIsPrimary(false);
    setNotes("");
    setAddOpen(false);
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createVendorPaymentMethod(vendorId, {
        operating_company_id: operatingCompanyId,
        method_type: methodType,
        bank_name: bankName.trim() || undefined,
        account_mask: accountMask.trim() || undefined,
        is_primary: isPrimary,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      pushToast("Payment method added", "success");
      resetAddForm();
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 422) {
        pushToast("Account mask must be the last 4 digits only — never a full account number", "error");
        return;
      }
      if (error instanceof ApiError && error.status === 409) {
        pushToast("Another payment method is already marked primary", "error");
        return;
      }
      pushToast(userFacingApiError(error, "Failed to add payment method"), "error");
    },
  });

  const setPrimaryMutation = useMutation({
    mutationFn: (methodId: string) =>
      updateVendorPaymentMethod(vendorId, methodId, operatingCompanyId, { is_primary: true }),
    onSuccess: () => {
      pushToast("Primary payment method updated", "success");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to update primary method"), "error"),
  });

  const voidMutation = useMutation({
    mutationFn: (methodId: string) => voidVendorPaymentMethod(vendorId, methodId, operatingCompanyId, voidReason.trim()),
    onSuccess: () => {
      pushToast("Payment method voided", "success");
      setVoidingId(null);
      setVoidReason("");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to void payment method"), "error"),
  });

  const methods = (query.data ?? []).filter((m) => !m.deactivated_at);

  return (
    <DataPanel title="Payment methods on file">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs text-gray-600">
          Structured record of how this vendor is paid — masked reference only (last 4 digits), never a
          full account or routing number.
        </div>
        {canWrite ? (
          <Button size="sm" variant="secondary" onClick={() => setAddOpen((open) => !open)}>
            {addOpen ? "Cancel" : "+ Add payment method"}
          </Button>
        ) : null}
      </div>

      {addOpen ? (
        <div className="mb-3 grid gap-2 rounded-sm border border-gray-200 bg-gray-50 p-3 md:grid-cols-2">
          <label className="block text-xs">
            Method
            <select
              className="mt-0.5 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
              value={methodType}
              onChange={(event) => setMethodType(event.target.value as VendorPaymentMethod["method_type"])}
            >
              {METHOD_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {methodTypeLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            Bank name (optional)
            <input
              className="mt-0.5 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
              value={bankName}
              onChange={(event) => setBankName(event.target.value)}
              placeholder="e.g. Chase"
            />
          </label>
          <label className="block text-xs">
            Last 4 digits (optional — never a full account number)
            <input
              className="mt-0.5 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
              value={accountMask}
              maxLength={4}
              onChange={(event) => setAccountMask(event.target.value.replace(/[^0-9A-Za-z]/g, ""))}
              placeholder="1234"
            />
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={isPrimary} onChange={(event) => setIsPrimary(event.target.checked)} />
            Mark as primary
          </label>
          <label className="block text-xs md:col-span-2">
            Notes (optional)
            <textarea
              rows={2}
              className="mt-0.5 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <div className="md:col-span-2">
            <Button size="sm" onClick={() => createMutation.mutate()} loading={createMutation.isPending}>
              + Add
            </Button>
          </div>
        </div>
      ) : null}

      {query.isError ? (
        <ListErrorBanner
          message={userFacingApiError(query.error, "Couldn't load payment methods for this vendor")}
          onRetry={() => void query.refetch()}
        />
      ) : query.isLoading ? (
        <p className="text-xs text-gray-500">Loading payment methods…</p>
      ) : methods.length === 0 ? (
        <p className="text-xs text-gray-500">Not on file.</p>
      ) : (
        <div className="space-y-1" data-testid="vendor-payment-methods-list">
          {methods.map((method) => (
            <div
              key={method.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 px-2 py-1.5 text-xs"
            >
              <span className="flex items-center gap-2">
                <span className="font-semibold text-slate-700">{methodTypeLabel(method.method_type)}</span>
                {method.bank_name ? <span className="text-gray-600">{method.bank_name}</span> : null}
                {method.account_mask ? <span className="text-gray-500">••{method.account_mask}</span> : null}
                {method.is_primary ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                    Primary
                  </span>
                ) : null}
                <span className="text-gray-400">Added {formatDateUS(method.created_at)}</span>
              </span>
              {canWrite ? (
                <span className="flex items-center gap-2">
                  {!method.is_primary ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setPrimaryMutation.mutate(method.id)}
                      loading={setPrimaryMutation.isPending}
                    >
                      Set primary
                    </Button>
                  ) : null}
                  {voidingId === method.id ? (
                    <>
                      <input
                        className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
                        value={voidReason}
                        onChange={(event) => setVoidReason(event.target.value)}
                        placeholder="Reason (required)"
                      />
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={!voidReason.trim()}
                        onClick={() => voidMutation.mutate(method.id)}
                        loading={voidMutation.isPending}
                      >
                        Confirm void
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => { setVoidingId(null); setVoidReason(""); }}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => setVoidingId(method.id)}>
                      Void
                    </Button>
                  )}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </DataPanel>
  );
}
