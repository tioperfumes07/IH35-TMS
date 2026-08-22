/**
 * Inline "+ Add new customer" from ReferenceSelect / InlineCreateDrawer.
 * Renders the SAME CustomerProfileForm as Customers module +Create — not a reduced BK7 subset.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createCustomer, listCustomers, listPaymentTermOptions } from "../../../api/mdata";
import {
  CustomerProfileForm,
  emptyCustomerProfileValues,
  profileValuesToCreatePayload,
  validateCustomerProfileForCreate,
  type CustomerProfileFormValues,
} from "../../customers/CustomerProfileForm";
import { ActionButton } from "../../shared/ActionButton";
import { CappedListNotice } from "../../CappedListNotice";
import { useToast } from "../../Toast";
import type { InlineCreateResult } from "../InlineCreateDrawer";
import { userFacingApiError } from "../../../lib/api-error-message";

type Props = {
  operatingCompanyId: string;
  onCreated: (result: InlineCreateResult) => void;
  onClose: () => void;
};

const PARENT_CUSTOMER_FETCH_LIMIT = 200;

export function NewCustomerDrawerForm({ operatingCompanyId, onCreated, onClose }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<CustomerProfileFormValues>(emptyCustomerProfileValues);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"legal_name" | "customer_type" | "email", string>>>({});

  const customersQuery = useQuery({
    queryKey: ["customers", "inline-create-parents", operatingCompanyId],
    queryFn: () =>
      listCustomers({
        operating_company_id: operatingCompanyId,
        limit: PARENT_CUSTOMER_FETCH_LIMIT,
        active_company_only: true,
      }),
    enabled: Boolean(operatingCompanyId),
  });
  const parentCustomerOptions = useMemo(
    () =>
      (customersQuery.data?.customers ?? [])
        .filter((c) => !c.parent_customer_id && c.status !== "inactive" && !c.deactivated_at)
        .map((c) => ({ id: c.id, name: c.name, customer_code: c.customer_code })),
    [customersQuery.data?.customers]
  );

  const paymentTermsQuery = useQuery({
    queryKey: ["payment-term-options", "inline-customer-create", operatingCompanyId],
    queryFn: () => listPaymentTermOptions(operatingCompanyId).then((r) => r.payment_terms),
    enabled: Boolean(operatingCompanyId),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const check = validateCustomerProfileForCreate(values);
      if (!check.ok) {
        const error = new Error(check.message);
        (error as Error & { code?: string }).code = check.code;
        throw error;
      }
      return createCustomer(profileValuesToCreatePayload(values, operatingCompanyId));
    },
    onSuccess: async (customer) => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      const label = customer.customer_code ? `${customer.name} (${customer.customer_code})` : customer.name;
      onCreated({ id: customer.id, label });
      pushToast("Customer created.", "success");
      onClose();
    },
    onError: (error) => {
      // SILENT-VALIDATION-OFFSCREEN: this form scrolls long. An inline field error near the top
      // is invisible if the user clicked Save from further down, and looks like a dead button
      // with no feedback at all. Every required-field code also pushes a toast (same as the
      // catch-all below) so the user always gets a signal, regardless of scroll position.
      const code = (error as Error & { code?: string }).code;
      if (code === "legal_name_required") {
        setFieldErrors({ legal_name: "Legal name is required" });
        pushToast("Legal name is required", "error");
        return;
      }
      if (code === "customer_type_required") {
        setFieldErrors({ customer_type: "Customer type is required" });
        pushToast("Customer type is required", "error");
        return;
      }
      if (code === "email_required") {
        setFieldErrors({ email: "Email is required" });
        pushToast("Email is required", "error");
        return;
      }
      pushToast(userFacingApiError(error, "Could not save customer."), "error");
    },
  });

  return (
    <form
      className="space-y-3"
      data-testid="inline-customer-profile-create-form"
      onSubmit={(event) => {
        // INLINE-CREATE-NESTED-FORM: portal un-nests DOM; stopPropagation un-nests React tree.
        event.preventDefault();
        event.stopPropagation();
        setFieldErrors({});
        createMutation.mutate();
      }}
    >
      {fieldErrors.legal_name ? (
        <span className="block text-xs text-red-700">{fieldErrors.legal_name}</span>
      ) : null}
      {fieldErrors.customer_type ? (
        <span className="block text-xs text-red-700">{fieldErrors.customer_type}</span>
      ) : null}
      {fieldErrors.email ? (
        <span className="block text-xs text-red-700">{fieldErrors.email}</span>
      ) : null}
      <CustomerProfileForm
        values={values}
        onPatch={(patch) => setValues((current) => ({ ...current, ...patch }))}
        operatingCompanyId={operatingCompanyId}
        mode="create"
        paymentTermOptions={paymentTermsQuery.data ?? []}
        onPaymentTermCreated={() => void paymentTermsQuery.refetch()}
        parentCustomerOptions={parentCustomerOptions}
        onParentCustomerCreated={() => void customersQuery.refetch()}
      />
      <CappedListNotice
        shown={parentCustomerOptions.length}
        total={customersQuery.data?.total}
        limit={PARENT_CUSTOMER_FETCH_LIMIT}
        hint="Parent customer dropdown shows the first page — use Customers list to find others."
        className="text-xs text-slate-600"
      />
      <div className="flex justify-end gap-2 border-t border-gray-200 pt-3">
        <ActionButton type="button" onClick={onClose}>
          Cancel
        </ActionButton>
        <ActionButton type="submit" disabled={createMutation.isPending || !operatingCompanyId}>
          {createMutation.isPending ? "Saving..." : "Save"}
        </ActionButton>
      </div>
    </form>
  );
}
