import { useEffect, useState } from "react";
import type { Customer } from "../../api/mdata";
import { Button } from "../Button";
import { Modal } from "../Modal";

export type CustomerEditFormValues = {
  name: string;
  customer_code: string;
  email: string;
  phone: string;
  dot_number: string;
  mc_number: string;
  tax_id: string;
  billing_state: string;
  status: Customer["status"];
};

type Props = {
  open: boolean;
  customer: Customer | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (values: CustomerEditFormValues) => void | Promise<void>;
};

function toFormValues(customer: Customer): CustomerEditFormValues {
  return {
    name: customer.name ?? "",
    customer_code: customer.customer_code ?? "",
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    dot_number: customer.dot_number ?? "",
    mc_number: customer.mc_number ?? "",
    tax_id: customer.tax_id ?? "",
    billing_state: customer.billing_state ?? "",
    status: customer.status,
  };
}

function NamedField({
  label,
  name,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-semibold text-gray-600">{label}</span>
      <input
        name={name}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="h-9 w-full rounded border border-gray-300 px-2 py-1.5 text-[13px]"
      />
    </label>
  );
}

export function CustomerEditModal({ open, customer, saving = false, onClose, onSave }: Props) {
  const [values, setValues] = useState<CustomerEditFormValues>(() =>
    customer ? toFormValues(customer) : {
      name: "",
      customer_code: "",
      email: "",
      phone: "",
      dot_number: "",
      mc_number: "",
      tax_id: "",
      billing_state: "",
      status: "active",
    }
  );

  useEffect(() => {
    if (open && customer) {
      setValues(toFormValues(customer));
    }
  }, [open, customer]);

  if (!open || !customer) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Edit Customer · ${customer.name}`}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(values);
        }}
      >
        <NamedField label="Legal name *" name="name" value={values.name} onChange={(name) => setValues((current) => ({ ...current, name }))} required />
        <NamedField
          label="Customer code"
          name="customer_code"
          value={values.customer_code}
          onChange={(customer_code) => setValues((current) => ({ ...current, customer_code }))}
        />
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <NamedField label="Email" name="email" type="email" value={values.email} onChange={(email) => setValues((current) => ({ ...current, email }))} />
          <NamedField label="Phone" name="phone" value={values.phone} onChange={(phone) => setValues((current) => ({ ...current, phone }))} />
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <NamedField label="DOT number" name="dot_number" value={values.dot_number} onChange={(dot_number) => setValues((current) => ({ ...current, dot_number }))} />
          <NamedField label="MC number" name="mc_number" value={values.mc_number} onChange={(mc_number) => setValues((current) => ({ ...current, mc_number }))} />
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <NamedField label="Tax ID (EIN)" name="tax_id" value={values.tax_id} onChange={(tax_id) => setValues((current) => ({ ...current, tax_id }))} />
          <NamedField
            label="Billing state"
            name="billing_state"
            value={values.billing_state}
            onChange={(billing_state) => setValues((current) => ({ ...current, billing_state }))}
          />
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-gray-600">Status</span>
          <select
            name="status"
            value={values.status}
            onChange={(event) => setValues((current) => ({ ...current, status: event.target.value as Customer["status"] }))}
            className="h-9 w-full rounded border border-gray-300 px-2 py-1.5 text-[13px]"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="credit_hold">Credit Hold</option>
            <option value="blacklist">Blacklist</option>
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !values.name.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
