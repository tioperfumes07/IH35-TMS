import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listPaymentTermOptions, type Customer, type UpdateCustomerInput } from "../../api/mdata";
import { Button } from "../Button";
import { Modal } from "../Modal";
import {
  CustomerProfileForm,
  customerToProfileValues,
  emptyCustomerProfileValues,
  profileValuesToUpdatePayload,
  type CustomerProfileFormValues,
} from "./CustomerProfileForm";

// V6: Edit now emits the FULL customer profile payload (single field source shared
// with Create) — never a subset. Kept as an exported alias so existing imports of
// `CustomerEditFormValues` keep compiling.
export type CustomerEditFormValues = UpdateCustomerInput;

type Props = {
  open: boolean;
  customer: Customer | null;
  operatingCompanyId?: string | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (payload: UpdateCustomerInput) => void | Promise<void>;
};

export function CustomerEditModal({ open, customer, operatingCompanyId, saving = false, onClose, onSave }: Props) {
  const [values, setValues] = useState<CustomerProfileFormValues>(() =>
    customer ? customerToProfileValues(customer) : emptyCustomerProfileValues()
  );
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (open && customer) {
      setValues(customerToProfileValues(customer));
      setFormError("");
    }
  }, [open, customer]);

  const companyId = operatingCompanyId ?? customer?.operating_company_id ?? "";
  const paymentTermsQuery = useQuery({
    queryKey: ["payment-term-options"],
    queryFn: () => listPaymentTermOptions().then((r) => r.payment_terms),
    enabled: open,
  });
  const paymentTermOptions = useMemo(() => paymentTermsQuery.data ?? [], [paymentTermsQuery.data]);

  if (!open || !customer) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Edit Customer · ${customer.name}`} modalKind="customer-edit" sizePreset="xl">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          // D1-5: customer_type must not be cleared on edit — the update endpoint accepts null, so the
          // client is the only guard. Block empty submit before the request.
          if (!values.customer_type) {
            setFormError("Customer type is required.");
            return;
          }
          setFormError("");
          void onSave(profileValuesToUpdatePayload(values));
        }}
      >
        {formError ? (
          <div id="customer_type-error" role="alert" className="rounded-sm border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
            {formError}
          </div>
        ) : null}
        <CustomerProfileForm
          values={values}
          onPatch={(patch) => setValues((current) => ({ ...current, ...patch }))}
          operatingCompanyId={companyId}
          mode="edit"
          paymentTermOptions={paymentTermOptions}
          onPaymentTermCreated={() => void paymentTermsQuery.refetch()}
        />
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !values.name.trim() || !values.customer_type}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
