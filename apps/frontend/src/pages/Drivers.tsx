import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { ApiError } from "../api/client";
import { createDriver, listDrivers } from "../api/mdata";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";

const statusOptions = ["All", "Probation", "Active", "Suspended", "Terminated"] as const;

const createDriverSchema = z.object({
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  email: z.string().trim().email().optional().or(z.literal("")),
  cdl_number: z.string().trim().optional(),
  cdl_state: z.string().trim().optional(),
  cdl_class: z.enum(["A", "B", "C"]).optional(),
  cdl_expires_at: z.string().optional(),
  hire_date: z.string().optional(),
  dot_medical_expires_at: z.string().optional(),
  status: z.enum(["Probation", "Active", "Inactive", "Terminated", "OnLeave"]).default("Probation"),
});

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export function DriversPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof statusOptions)[number]>("All");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    cdl_number: "",
    cdl_state: "",
    cdl_class: "A",
    cdl_expires_at: "",
    hire_date: "",
    dot_medical_expires_at: "",
    status: "Probation",
  });

  const driversQuery = useQuery({
    queryKey: ["drivers", { status: statusFilter, search }],
    queryFn: () =>
      listDrivers({
        status: statusFilter,
        search,
      }).then((result) => result.drivers),
  });

  const createMutation = useMutation({
    mutationFn: createDriver,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      setAddOpen(false);
      pushToast("Driver created", "success");
      setForm({
        first_name: "",
        last_name: "",
        phone: "",
        email: "",
        cdl_number: "",
        cdl_state: "",
        cdl_class: "A",
        cdl_expires_at: "",
        hire_date: "",
        dot_medical_expires_at: "",
        status: "Probation",
      });
    },
  });

  const drivers = useMemo(() => driversQuery.data ?? [], [driversQuery.data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Drivers</h1>
        <Button onClick={() => setAddOpen(true)}>Add Driver</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as (typeof statusOptions)[number])}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          {statusOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name"
          className="w-full max-w-xs rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <DataTable
        rows={drivers}
        loading={driversQuery.isLoading}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/drivers/${row.id}`)}
        columns={[
          {
            key: "name",
            label: "Name",
            sortable: true,
            render: (row) => `${row.first_name} ${row.last_name}`,
          },
          { key: "phone", label: "Phone" },
          { key: "cdl_number", label: "CDL #" },
          {
            key: "cdl_expires_at",
            label: "CDL Expires",
            render: (row) => formatDate(row.cdl_expires_at),
          },
          {
            key: "status",
            label: "Status",
            render: (row) => <StatusBadge status={row.status} />,
          },
          {
            key: "hire_date",
            label: "Hire Date",
            render: (row) => formatDate(row.hire_date),
          },
        ]}
      />

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Driver">
        <form
          className="grid grid-cols-1 gap-3 md:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const parsed = createDriverSchema.safeParse(form);
            if (!parsed.success) {
              pushToast("Please complete required fields", "error");
              return;
            }

            try {
              await createMutation.mutateAsync({
                ...parsed.data,
                email: parsed.data.email || undefined,
                cdl_number: parsed.data.cdl_number || undefined,
                cdl_state: parsed.data.cdl_state || undefined,
                cdl_expires_at: parsed.data.cdl_expires_at || undefined,
                hire_date: parsed.data.hire_date || undefined,
                dot_medical_expires_at: parsed.data.dot_medical_expires_at || undefined,
              });
            } catch (error) {
              if (error instanceof ApiError && error.status === 409) {
                pushToast("Driver with this CDL # already exists", "error");
                return;
              }
              pushToast("Failed to create driver", "error");
            }
          }}
        >
          {[
            ["first_name", "First Name"],
            ["last_name", "Last Name"],
            ["phone", "Phone"],
            ["email", "Email"],
            ["cdl_number", "CDL #"],
            ["cdl_state", "CDL State"],
            ["cdl_expires_at", "CDL Expires"],
            ["hire_date", "Hire Date"],
            ["dot_medical_expires_at", "DOT Medical Expires"],
          ].map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">{label}</label>
              <input
                type={key.includes("date") || key.includes("expires") ? "date" : "text"}
                value={form[key] ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                className="rounded border border-gray-300 px-2 py-2 text-sm"
              />
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">CDL Class</label>
            <select
              value={form.cdl_class}
              onChange={(event) => setForm((current) => ({ ...current, cdl_class: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Status</label>
            <select
              value={form.status}
              onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="Probation">Probation</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Terminated">Terminated</option>
              <option value="OnLeave">OnLeave</option>
            </select>
          </div>

          <div className="col-span-full flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
