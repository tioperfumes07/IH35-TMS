import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCustomers, listPaymentTermOptions, type Customer, type UpdateCustomerInput } from "../../api/mdata";
import { CappedListNotice } from "../CappedListNotice";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { ListErrorState } from "../ListErrorState";
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
  // LV-CUSTOMERS-FULL-EDIT-PAYMENT-TERMS-CACHE-SHAPE — share the SAME queryKey+queryFn shape as
  // CustomerDetail (full `{ payment_terms }` envelope). The modal previously `.then(r => r.payment_terms)`
  // while Detail cached the envelope under identical keys → Full Edit consumed a non-array and crashed
  // with `(o ?? []).map is not a function` after #8564 fixed the customers-list path.
  const paymentTermsQuery = useQuery({
    queryKey: ["payment-term-options", companyId],
    queryFn: () => listPaymentTermOptions(companyId),
    enabled: open && Boolean(companyId),
    staleTime: 5 * 60 * 1000,
  });
  const paymentTermOptions = useMemo(() => {
    const raw = paymentTermsQuery.data?.payment_terms;
    return Array.isArray(raw) ? raw : [];
  }, [paymentTermsQuery.data]);

  // D1-4: eligible parents = active, TOP-LEVEL customers in this company, excluding this customer itself.
  const parentCandidatesQuery = useQuery({
    queryKey: ["customer-parent-options", companyId],
    queryFn: () => listCustomers({ operating_company_id: companyId, limit: 5000 }).then((r) => r.customers),
    enabled: open && Boolean(companyId),
    staleTime: 60_000,
  });
  const parentCustomerOptions = useMemo(() => {
    const rows = Array.isArray(parentCandidatesQuery.data) ? parentCandidatesQuery.data : [];
    return rows
      .filter((c) => !c.parent_customer_id && c.id !== customer?.id && c.status !== "inactive" && !c.deactivated_at)
      .map((c) => ({ id: c.id, name: c.name, customer_code: c.customer_code }));
  }, [parentCandidatesQuery.data, customer?.id]);

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
          // CUSTOMER-EMAIL-REQUIRED: email is required for invoice deliverability.
          if (!values.email.trim()) {
            setFormError("Email is required.");
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
        {paymentTermsQuery.isError ? (
          <ListErrorState
            title="Couldn't load payment terms"
            status={0}
            message={(paymentTermsQuery.error as Error)?.message}
            onRetry={() => void paymentTermsQuery.refetch()}
          />
        ) : null}
        {parentCandidatesQuery.isError ? (
          <ListErrorState
            title="Couldn't load parent customer choices"
            status={0}
            message={(parentCandidatesQuery.error as Error)?.message}
            onRetry={() => void parentCandidatesQuery.refetch()}
          />
        ) : null}
        {!paymentTermsQuery.isError && !parentCandidatesQuery.isError ? (
          <CustomerProfileForm
            values={values}
            onPatch={(patch) => setValues((current) => ({ ...current, ...patch }))}
            operatingCompanyId={companyId}
            mode="edit"
            paymentTermOptions={paymentTermOptions}
            onPaymentTermCreated={() => void paymentTermsQuery.refetch()}
            parentCustomerOptions={parentCustomerOptions}
            onParentCustomerCreated={() => void parentCandidatesQuery.refetch()}
            customerId={customer.id}
          />
        ) : null}
        <CappedListNotice
          shown={parentCustomerOptions.length}
          limit={5000}
          hint="Type to search for a parent customer that is not listed."
          className="text-[11px] text-slate-600"
        />
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || paymentTermsQuery.isError || parentCandidatesQuery.isError || !values.name.trim() || !values.customer_type || !values.email.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
