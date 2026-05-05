import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Pencil } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { z } from "zod";
import {
  createDriverLoadStatus,
  listDriverLoadStatuses,
  updateDriverLoadStatus,
  type DriverLoadStatus,
  type DriverLoadStatusPhase,
} from "../api/catalogs";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/useAuth";
import { Button } from "../components/Button";
import { PageHeader } from "../components/layout/PageHeader";
import { Modal } from "../components/Modal";
import { useToast } from "../components/Toast";

const createSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]+$/, "Code must be uppercase with underscores")
    .min(2)
    .max(60),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  phase: z.enum(["pickup", "transit_to_pickup", "at_pickup", "transit_to_delivery", "at_delivery", "completed", "other"]),
  sort_order: z.coerce.number().int().min(0).max(10000).default(100),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  phase: z.enum(["pickup", "transit_to_pickup", "at_pickup", "transit_to_delivery", "at_delivery", "completed", "other"]),
  sort_order: z.coerce.number().int().min(0).max(10000),
  is_active: z.boolean(),
});

const phaseLabel: Record<DriverLoadStatusPhase, string> = {
  pickup: "Pickup",
  transit_to_pickup: "Transit to Pickup",
  at_pickup: "At Pickup",
  transit_to_delivery: "Transit to Delivery",
  at_delivery: "At Delivery",
  completed: "Completed",
  other: "Other",
};

function emptyForm() {
  return {
    code: "",
    name: "",
    description: "",
    phase: "transit_to_pickup",
    sort_order: "100",
    is_active: "true",
  };
}
type StatusFormState = ReturnType<typeof emptyForm>;

export function DriverLoadStatusesPage() {
  const auth = useAuth();
  const canManage = auth.user?.role === "Owner" || auth.user?.role === "Administrator";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [includeInactive, setIncludeInactive] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<DriverLoadStatus | null>(null);
  const [createForm, setCreateForm] = useState<StatusFormState>(emptyForm());
  const [editForm, setEditForm] = useState<StatusFormState>(emptyForm());
  const [searchParams] = useSearchParams();

  const statusesQuery = useQuery({
    queryKey: ["catalogs", "driver-load-statuses", includeInactive],
    queryFn: () => listDriverLoadStatuses(includeInactive).then((result) => result.statuses),
  });

  const createMutation = useMutation({
    mutationFn: createDriverLoadStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalogs", "driver-load-statuses"] });
      setAddOpen(false);
      setCreateForm(emptyForm());
      pushToast("Driver load status created", "success");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateDriverLoadStatus>[1] }) =>
      updateDriverLoadStatus(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalogs", "driver-load-statuses"] });
      setEditOpen(false);
      setSelectedStatus(null);
      pushToast("Driver load status updated", "success");
    },
  });

  const statuses = useMemo(() => statusesQuery.data ?? [], [statusesQuery.data]);
  const highlightId = searchParams.get("highlight");

  useEffect(() => {
    if (!highlightId) return;
    document.getElementById(`driver-status-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Driver Load Statuses Catalog"
        subtitle={`${statuses.length} statuses`}
        actions={
          <div className="flex items-center gap-2">
            {canManage ? (
              <label className="flex items-center gap-2 rounded border border-gray-300 px-2 py-1 text-xs text-gray-600">
                <input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
                Show inactive
              </label>
            ) : null}
            {canManage ? <Button onClick={() => setAddOpen(true)}>Add Status</Button> : null}
          </div>
        }
      />

      {statusesQuery.isLoading ? (
        <div className="rounded border border-gray-200 bg-white p-3 text-[13px] text-gray-500">Loading statuses...</div>
      ) : (
        <div className="space-y-2">
          {statuses.map((status) => (
            <div
              key={status.id}
              id={`driver-status-${status.id}`}
              className={`rounded border bg-white p-2.5 ${
                highlightId === status.id ? "border-blue-300 ring-1 ring-blue-200" : "border-gray-200"
              }`}
            >
              <div className="flex min-h-8 items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">{status.code}</span>
                    <span className="text-[13px] font-semibold text-gray-900">{status.name}</span>
                    <span className="rounded bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">{phaseLabel[status.phase]}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                        status.is_active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {status.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-gray-600">Sort {status.sort_order}</div>
                  {status.description ? <div className="mt-0.5 text-[11px] text-gray-600">{status.description}</div> : null}
                </div>
                {canManage ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSelectedStatus(status);
                      setEditForm({
                        code: status.code,
                        name: status.name,
                        description: status.description ?? "",
                        phase: status.phase,
                        sort_order: String(status.sort_order),
                        is_active: String(status.is_active),
                      });
                      setEditOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          {statuses.length === 0 ? <div className="rounded border border-gray-200 bg-white p-3 text-[13px] text-gray-500">No statuses found.</div> : null}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Driver Load Status">
        <StatusForm
          form={createForm}
          setForm={setCreateForm}
          onCancel={() => setAddOpen(false)}
          onSubmit={async () => {
            const parsed = createSchema.safeParse(createForm);
            if (!parsed.success) {
              pushToast(parsed.error.issues[0]?.message ?? "Please complete required fields", "error");
              return;
            }
            try {
              await createMutation.mutateAsync({
                code: parsed.data.code,
                name: parsed.data.name,
                description: parsed.data.description || undefined,
                phase: parsed.data.phase,
                sort_order: parsed.data.sort_order,
              });
            } catch (error) {
              if (error instanceof ApiError && error.status === 409) {
                pushToast("Status code already exists", "error");
                return;
              }
              pushToast("Failed to create status", "error");
            }
          }}
          submitLabel="Save"
          submitting={createMutation.isPending}
          disableCode={false}
        />
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Driver Load Status">
        <StatusForm
          form={editForm}
          setForm={setEditForm}
          onCancel={() => setEditOpen(false)}
          onSubmit={async () => {
            if (!selectedStatus) return;
            const parsed = updateSchema.safeParse({
              ...editForm,
              sort_order: Number(editForm.sort_order),
              is_active: editForm.is_active === "true",
            });
            if (!parsed.success) {
              pushToast(parsed.error.issues[0]?.message ?? "Please complete required fields", "error");
              return;
            }
            try {
              await updateMutation.mutateAsync({
                id: selectedStatus.id,
                payload: {
                  name: parsed.data.name,
                  description: parsed.data.description || "",
                  phase: parsed.data.phase,
                  sort_order: parsed.data.sort_order,
                  is_active: parsed.data.is_active,
                },
              });
            } catch {
              pushToast("Failed to update status", "error");
            }
          }}
          submitLabel="Save"
          submitting={updateMutation.isPending}
          disableCode
        />
      </Modal>
    </div>
  );
}

function StatusForm({
  form,
  setForm,
  onSubmit,
  onCancel,
  submitLabel,
  submitting,
  disableCode,
}: {
  form: StatusFormState;
  setForm: Dispatch<SetStateAction<StatusFormState>>;
  onSubmit: () => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  submitting: boolean;
  disableCode: boolean;
}) {
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit();
      }}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Code</label>
          <input
            value={form.code}
            disabled={disableCode}
            onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") }))}
            className="rounded border border-gray-300 px-2 py-2 text-sm disabled:bg-gray-100"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Name</label>
          <input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            className="rounded border border-gray-300 px-2 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Phase</label>
          <select
            value={form.phase}
            onChange={(event) => setForm((current) => ({ ...current, phase: event.target.value }))}
            className="rounded border border-gray-300 px-2 py-2 text-sm"
          >
            {(Object.keys(phaseLabel) as DriverLoadStatusPhase[]).map((phase) => (
              <option key={phase} value={phase}>
                {phaseLabel[phase]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Sort Order</label>
          <input
            type="number"
            min={0}
            value={form.sort_order}
            onChange={(event) => setForm((current) => ({ ...current, sort_order: event.target.value }))}
            className="rounded border border-gray-300 px-2 py-2 text-sm"
          />
        </div>
        <div className="md:col-span-2 flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Description</label>
          <textarea
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            rows={2}
            className="rounded border border-gray-300 px-2 py-2 text-sm"
          />
        </div>
        {disableCode ? (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Active</label>
            <select
              value={form.is_active}
              onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        ) : null}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
