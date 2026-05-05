import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { ApiError } from "../api/client";
import { createCustomer, listCustomers, updateCustomer, type Customer } from "../api/mdata";
import { useAuth } from "../auth/useAuth";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { useToast } from "../components/Toast";
import { KpiCard } from "../components/layout/KpiCard";
import { KpiStrip } from "../components/layout/KpiStrip";
import { PageHeader } from "../components/layout/PageHeader";
import { StatusBadge } from "../components/layout/StatusBadge";
import { colors } from "../design/tokens";

const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  customer_code: z.string().trim().max(100).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  mc_number: z.string().trim().max(100).optional(),
  dot_number: z.string().trim().max(100).optional(),
  customer_type: z.enum(["broker", "direct_shipper"]).optional().or(z.literal("")),
  status: z.enum(["active", "inactive", "credit_hold", "blacklist"]).default("active"),
  credit_limit: z.coerce.number().min(0).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const updateCustomerSchema = createCustomerSchema;

function emptyCreateForm() {
  return {
    name: "",
    customer_code: "",
    email: "",
    phone: "",
    mc_number: "",
    dot_number: "",
    customer_type: "",
    status: "active",
    credit_limit: "",
    notes: "",
  };
}

type CustomerFormState = ReturnType<typeof emptyCreateForm>;

function customerTypeLabel(value: "broker" | "direct_shipper" | null) {
  if (value === "broker") return "Broker";
  if (value === "direct_shipper") return "Direct Shipper";
  return "Not set";
}

function customerStatusLabel(status: Customer["status"]) {
  if (status === "credit_hold") return "Credit Hold";
  if (status === "blacklist") return "Blacklist";
  if (status === "inactive") return "Inactive";
  return "Active";
}

function customerStatusVariant(status: Customer["status"]): "crit" | "warn" | "neutral" | "positive" {
  if (status === "blacklist") return "crit";
  if (status === "credit_hold") return "warn";
  if (status === "inactive") return "neutral";
  return "positive";
}

function formatMoney(value: string | number | null) {
  if (value === null) return "-";
  return `$${Number(value).toFixed(2)}`;
}

export function CustomersPage() {
  const navigate = useNavigate();
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
  const activeCount = customers.filter((customer) => customer.status === "active").length;
  const creditHoldCount = customers.filter((customer) => customer.status === "credit_hold").length;
  const blacklistCount = customers.filter((customer) => customer.status === "blacklist").length;

  return (
    <div className="space-y-3">
      <PageHeader title="Customers" subtitle={`${customers.length} records`} actions={canManage ? <Button onClick={() => setAddOpen(true)}>Add Customer</Button> : null} />

      <KpiStrip>
        <KpiCard label="Active" number={activeCount} accent={colors.positive.strong} />
        <KpiCard label="Credit Hold" number={creditHoldCount} accent={colors.warn.strong} />
        <KpiCard label="Blacklist" number={blacklistCount} accent={colors.crit.strong} />
      </KpiStrip>

      {customersQuery.isLoading ? (
        <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-500">Loading customers...</div>
      ) : (
        <div className="space-y-3">
          <DataTable
            rows={customers}
            rowKey={(row) => row.id}
            onRowClick={(row) => navigate(`/customers/${row.id}`)}
            columns={[
              { key: "name", label: "Customer", render: (row) => row.name },
              { key: "customer_code", label: "Code", render: (row) => row.customer_code ?? "-" },
              { key: "type", label: "Type", render: (row) => customerTypeLabel(row.customer_type) },
              {
                key: "status",
                label: "Status",
                render: (row) => <StatusBadge variant={customerStatusVariant(row.status)}>{customerStatusLabel(row.status)}</StatusBadge>,
              },
              { key: "mc_dot", label: "MC / DOT", render: (row) => `${row.mc_number ?? "-"} / ${row.dot_number ?? "-"}` },
              { key: "contact", label: "Main Contact", render: (row) => row.main_contact_name ?? "-" },
              { key: "ar_email", label: "A/R Email", render: (row) => row.ar_email ?? "-" },
              { key: "detention", label: "Detention", render: (row) => `${formatMoney(row.detention_rate_per_hour)}/hr` },
              {
                key: "actions",
                label: "Actions",
                render: (row) =>
                  canManage ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedCustomer(row);
                        setEditForm({
                          name: row.name,
                          customer_code: row.customer_code ?? "",
                          email: row.email ?? "",
                          phone: row.phone ?? "",
                          mc_number: row.mc_number ?? "",
                          dot_number: row.dot_number ?? "",
                          customer_type: row.customer_type ?? "",
                          status: row.status,
                          credit_limit: row.credit_limit ? String(row.credit_limit) : "",
                          notes: row.notes ?? "",
                        });
                        setEditOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                  ) : null,
              },
            ]}
          />
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
                customer_type: parsed.data.customer_type ? (parsed.data.customer_type as "broker" | "direct_shipper") : undefined,
                status: parsed.data.status,
                credit_limit: parsed.data.credit_limit,
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
          <CustomerFormFields form={createForm} setForm={setCreateForm} />
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
                  customer_type: parsed.data.customer_type ? (parsed.data.customer_type as "broker" | "direct_shipper") : null,
                  status: parsed.data.status,
                  credit_limit: parsed.data.credit_limit ?? null,
                  notes: parsed.data.notes || null,
                },
              });
            } catch {
              pushToast("Failed to update customer", "error");
            }
          }}
        >
          <CustomerFormFields form={editForm} setForm={setEditForm} />
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
}: {
  form: CustomerFormState;
  setForm: Dispatch<SetStateAction<CustomerFormState>>;
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
          ["credit_limit", "Credit Limit"],
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
        <div className="mb-2 text-xs font-semibold text-gray-700">Commercial Configuration</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Customer Type</label>
            <select
              value={form.customer_type}
              onChange={(event) => setForm((current) => ({ ...current, customer_type: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="">Not set</option>
              <option value="broker">Broker</option>
              <option value="direct_shipper">Direct Shipper</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Status</label>
            <select
              value={form.status}
              onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="credit_hold">Credit Hold</option>
              <option value="blacklist">Blacklist</option>
            </select>
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
