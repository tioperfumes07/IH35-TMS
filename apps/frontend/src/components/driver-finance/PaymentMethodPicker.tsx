import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Combobox, type ComboboxOption } from "../Combobox";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { getCoaAccounts } from "../../api/banking";
import { createPaymentMethod, listPaymentMethods } from "../../api/paymentMethods";
import { useToast } from "../Toast";

type Props = {
  operatingCompanyId: string;
  value: string | null;
  onChange: (value: string | null, glAccountId: string | null) => void;
  disabled?: boolean;
};

/**
 * Payment-method picker for the catalogs.payment_methods CATALOG — mirrors the software-wide
 * ReferenceSelect "+ Add new" pattern (Combobox with the create row ALWAYS first, opens an
 * inline mini-create panel, returns already-selected on save) without depending on
 * QuickCreateEntityModal's fixed vendor/customer/item/category/part kinds (payment_method
 * isn't one of them). Vocab: "+ Add new payment method" — never "+ New"/"+ Add".
 */
export function PaymentMethodPicker({ operatingCompanyId, value, onChange, disabled }: Props) {
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [glAccountId, setGlAccountId] = useState<string | null>(null);

  const methodsQuery = useQuery({
    queryKey: ["catalogs", "payment-methods", operatingCompanyId],
    queryFn: () => listPaymentMethods(operatingCompanyId, false),
    enabled: Boolean(operatingCompanyId),
  });

  const accountsQuery = useQuery({
    queryKey: ["catalogs", "accounts", "for-payment-methods", operatingCompanyId],
    queryFn: () => getCoaAccounts(operatingCompanyId),
    enabled: createOpen && Boolean(operatingCompanyId),
  });

  const methods = methodsQuery.data ?? [];
  const options: ComboboxOption[] = methods.map((m) => ({ value: m.id, label: m.name }));

  const createMut = useMutation({
    mutationFn: () => createPaymentMethod(operatingCompanyId, { name: name.trim(), gl_account_id: glAccountId }),
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: ["catalogs", "payment-methods", operatingCompanyId] });
      onChange(created.id, created.gl_account_id ?? null);
      pushToast("Payment method created", "success");
      setCreateOpen(false);
      setName("");
      setGlAccountId(null);
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : "Create failed", "error"),
  });

  return (
    <div>
      <Combobox
        options={options}
        value={value}
        onChange={(v) => onChange(v, methods.find((m) => m.id === v)?.gl_account_id ?? null)}
        placeholder="Select payment method"
        loading={methodsQuery.isLoading}
        disabled={disabled}
        allowAddNew={{ label: "+ Add new payment method", onAdd: (query) => { setName(query); setCreateOpen(true); } }}
      />

      <Modal variant="drawer" open={createOpen} onClose={() => setCreateOpen(false)} title="Add new payment method">
        <div className="space-y-3 text-xs">
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Name *</span>
            <input
              className="mt-1 h-10 w-full rounded-sm border border-gray-300 px-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Zelle"
              aria-label="Payment method name"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">GL account (cash/bank)</span>
            <div className="mt-1">
              <Combobox
                options={(accountsQuery.data?.accounts ?? []).map((a) => ({ value: a.id, label: a.account_name, sublabel: a.account_number }))}
                value={glAccountId}
                onChange={setGlAccountId}
                placeholder="Select GL account (optional)"
                loading={accountsQuery.isLoading}
                allowClear
              />
            </div>
          </label>
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={name.trim().length === 0 || createMut.isPending}
              loading={createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
