import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { z } from "zod";
import { ApiError } from "../api/client";
import { createCustomer, listCustomers, updateCustomer, type Customer } from "../api/mdata";
import { useAuth } from "../auth/useAuth";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { useToast } from "../components/Toast";

const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  customer_code: z.string().trim().max(100).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  mc_number: z.string().trim().max(100).optional(),
  dot_number: z.string().trim().max(100).optional(),
  customer_type: z.enum(["broker", "direct_shipper"]),
  default_billing_miles_basis: z.enum(["short_miles", "practical_miles"]).default("practical_miles"),
  default_free_time_hours: z.coerce.number().min(0).max(99).default(4),
  default_detention_rate: z.coerce.number().min(0).max(99999.99).default(50),
  notes: z.string().trim().max(2000).optional(),
});

const updateCustomerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  customer_code: z.string().trim().max(100).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  mc_number: z.string().trim().max(100).optional(),
  dot_number: z.string().trim().max(100).optional(),
  customer_type: z.enum(["broker", "direct_shipper"]).optional().or(z.literal("")),
  default_billing_miles_basis: z.enum(["short_miles", "practical_miles"]),
  default_free_time_hours: z.coerce.number().min(0).max(99),
  default_detention_rate: z.coerce.number().min(0).max(99999.99),
  notes: z.string().trim().max(2000).optional(),
});

function emptyCreateForm() {
  return {
    name: "",
    customer_code: "",
    email: "",
    phone: "",
    mc_number: "",
    dot_number: "",
    customer_type: "broker",
    default_billing_miles_basis: "practical_miles",
    default_free_time_hours: "4",
    default_detention_rate: "50",
    notes: "",
  };
}
type CustomerFormState = ReturnType<typeof emptyCreateForm>;

function customerTypeLabel(value: "broker" | "direct_shipper" | null) {
  if (value === "broker") return "Broker";
  if (value === "direct_shipper") return "Direct Shipper";
  return "Not set";
}

function milesBasisLabel(value: "short_miles" | "practical_miles") {
  return value === "short_miles" ? "Short Miles" : "Practical Miles";
}

function formatMoney(value: string) {
  return `$${Number(value).toFixed(2)}`;
}

export function CustomersPage() {
  const { user } = useAuth();
  const canManage = ["Owner", "Administrator", "Manager", "Accountant", "Dispatcher"].includes(user?.role ?? "");
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [createForm, setCreateForm] = useState<CustomerFormState>(emptyCreateForm());
  const [editForm, setEditForm] = useState<CustomerFormState>(emptyCreateForm());

  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: () => listCustomers({ status: "active" }).then((result) => result.customers),
  });

  const createMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setAddOpen(false);
      setCreateForm(emptyCreateForm());
      pushToast("Customer created", "success");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateCustomer>[1] }) => updateCustomer(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setEditOpen(false);
      setSelectedCustomer(null);
      pushToast("Customer updated", "success");
    },
  });

  const customers = useMemo(() => customersQuery.data ?? [], [customersQuery.data]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Customers</h1>
        {canManage ? <Button onClick={() => setAddOpen(true)}>Add Customer</Button> : null}
      </div>

      {customersQuery.isLoading ? (
        <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-500">Loading customers...</div>
      ) : (
        <div className="space-y-3">
          {customers.map((customer) => (
            <div key={customer.id} className="rounded border border-gray-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-gray-900">{customer.name}</h2>
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{customerTypeLabel(customer.customer_type)}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    {customer.customer_code || "No code"} • {customer.email || "No email"} • {customer.phone || "No phone"}
                  </div>
                </div>
                {canManage ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSelectedCustomer(customer);
                      setEditForm({
                        name: customer.name,
                        customer_code: customer.customer_code ?? "",
                        email: customer.email ?? "",
                        phone: customer.phone ?? "",
                        mc_number: customer.mc_number ?? "",
                        dot_number: customer.dot_number ?? "",
                        customer_type: customer.customer_type ?? "broker",
                        default_billing_miles_basis: customer.default_billing_miles_basis,
                        default_free_time_hours: String(customer.default_free_time_hours),
                        default_detention_rate: String(customer.default_detention_rate),
                        notes: customer.notes ?? "",
                      });
                      setEditOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                ) : null}
              </div>

              <div className="mt-2 rounded border border-gray-100 bg-gray-50 p-2.5">
                <div className="mb-2 text-xs font-semibold text-gray-700">Billing Configuration</div>
                <div className="grid grid-cols-1 gap-2 text-xs text-gray-700 md:grid-cols-4">
                  <div>Type: {customerTypeLabel(customer.customer_type)}</div>
                  <div>Miles: {milesBasisLabel(customer.default_billing_miles_basis)}</div>
                  <div>Free Time: {Number(customer.default_free_time_hours).toFixed(2)} hrs</div>
                  <div>Detention: {formatMoney(customer.default_detention_rate)}/hr</div>
                </div>
              </div>
            </div>
          ))}
          {customers.length === 0 ? <div className="rounded border border-gray-200 bg-white p-3 text-[13px] text-gray-500">No customers found.</div> : null}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Customer">
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const parsed = createCustomerSchema.safeParse(createForm);
            if (!parsed.success) {
              pushToast(parsed.error.issues[0]?.message ?? "Please complete required fields", "error");
              return;
            }
            try {
              await createMutation.mutateAsync({
                name: parsed.data.name,
                customer_code: parsed.data.customer_code || undefined,
                email: parsed.data.email || undefined,
                phone: parsed.data.phone || undefined,
                mc_number: parsed.data.mc_number || undefined,
                dot_number: parsed.data.dot_number || undefined,
                customer_type: parsed.data.customer_type,
                default_billing_miles_basis: parsed.data.default_billing_miles_basis,
                default_free_time_hours: parsed.data.default_free_time_hours,
                default_detention_rate: parsed.data.default_detention_rate,
                notes: parsed.data.notes || undefined,
              });
            } catch (error) {
              if (error instanceof ApiError && error.status === 409) {
                pushToast("Customer conflict: code/name/MC/DOT already exists", "error");
                return;
              }
              pushToast("Failed to create customer", "error");
            }
          }}
        >
          <CustomerFormFields form={createForm} setForm={setCreateForm} requireCustomerType />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit Customer${selectedCustomer ? `: ${selectedCustomer.name}` : ""}`}>
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!selectedCustomer) return;
            const parsed = updateCustomerSchema.safeParse(editForm);
            if (!parsed.success) {
              pushToast(parsed.error.issues[0]?.message ?? "Please complete required fields", "error");
              return;
            }
            try {
              await updateMutation.mutateAsync({
                id: selectedCustomer.id,
                payload: {
                  name: parsed.data.name,
                  customer_code: parsed.data.customer_code || null,
                  email: parsed.data.email || null,
                  phone: parsed.data.phone || null,
                  mc_number: parsed.data.mc_number || null,
                  dot_number: parsed.data.dot_number || null,
                  customer_type: parsed.data.customer_type || null,
                  default_billing_miles_basis: parsed.data.default_billing_miles_basis,
                  default_free_time_hours: parsed.data.default_free_time_hours,
                  default_detention_rate: parsed.data.default_detention_rate,
                  notes: parsed.data.notes || null,
                },
              });
            } catch {
              pushToast("Failed to update customer", "error");
            }
          }}
        >
          <CustomerFormFields form={editForm} setForm={setEditForm} requireCustomerType={false} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={updateMutation.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function CustomerFormFields({
  form,
  setForm,
  requireCustomerType,
}: {
  form: CustomerFormState;
  setForm: Dispatch<SetStateAction<CustomerFormState>>;
  requireCustomerType: boolean;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {([
          ["name", "Name"],
          ["customer_code", "Customer Code"],
          ["email", "Email"],
          ["phone", "Phone"],
          ["mc_number", "MC Number"],
          ["dot_number", "DOT Number"],
        ] as Array<[keyof CustomerFormState, string]>).map(([key, label]) => (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">{label}</label>
            <input
              value={form[key] ?? ""}
              onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            />
          </div>
        ))}
      </div>

      <div className="rounded border border-gray-200 p-3">
        <div className="mb-2 text-xs font-semibold text-gray-700">Billing Configuration</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">
              Customer Type {requireCustomerType ? <span className="text-red-500">*</span> : null}
            </label>
            <select
              value={form.customer_type}
              onChange={(event) => setForm((current) => ({ ...current, customer_type: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            >
              {!requireCustomerType ? <option value="">Not set</option> : null}
              <option value="broker">Broker</option>
              <option value="direct_shipper">Direct Shipper</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Default Billing Miles Basis</label>
            <select
              value={form.default_billing_miles_basis}
              onChange={(event) => setForm((current) => ({ ...current, default_billing_miles_basis: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="short_miles">Short Miles</option>
              <option value="practical_miles">Practical Miles</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Default Free Time Hours</label>
            <input
              type="number"
              step="0.25"
              min="0"
              max="99"
              value={form.default_free_time_hours}
              onChange={(event) => setForm((current) => ({ ...current, default_free_time_hours: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Default Detention Rate ($/hr)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="99999.99"
              value={form.default_detention_rate}
              onChange={(event) => setForm((current) => ({ ...current, default_detention_rate: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-600">Notes</label>
        <textarea
          value={form.notes ?? ""}
          onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
          rows={2}
          className="rounded border border-gray-300 px-2 py-2 text-sm"
        />
      </div>
    </>
  );
}
