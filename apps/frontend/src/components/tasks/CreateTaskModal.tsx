import { useEffect, useMemo, useState } from "react";
import { DatePicker } from "../forms/DatePicker";
import { DateTimePicker } from "../forms/DateTimePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../Modal";
import { useToast } from "../Toast";
import {
  createTask,
  createTaskType,
  fetchTaskTypes,
  type TaskCategory,
  type TaskLinkInput,
  type TaskTargetType,
  type TaskType,
} from "../../api/tasks";
import { listAssignableUsers } from "../../api/identity";
import { Combobox } from "../Combobox";
import { EntityPicker } from "../parity/EntityPicker";
import type { IdentityUser } from "../../types/api";
import { companyToday } from "../../lib/businessDate";
import { userFacingApiError } from "../../lib/api-error-message";
import { entityLabel } from "../../lib/entity-label";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  /** Pre-fill the scheduled date (YYYY-MM-DD); defaults to today. */
  defaultDate?: string;
  /** Pre-attach an "about" link (e.g. opened from a vendor/customer detail Tasks tab). */
  presetLink?: { target_type: TaskTargetType; target_id: string; label?: string };
  onClose: () => void;
  onCreated?: () => void;
};

const CATEGORIES: { value: TaskCategory; label: string }[] = [
  { value: "dispatch", label: "Dispatch" },
  { value: "load", label: "Load" },
  { value: "maintenance", label: "Maintenance" },
  { value: "safety", label: "Safety" },
  { value: "admin", label: "Admin" },
];

const PRIORITIES = [
  { value: 0, label: "Normal" },
  { value: 1, label: "High" },
  { value: 2, label: "Urgent" },
];

// Entity kinds with a company-scoped picker (limit:200 — never truncate at the 50-cap).
const ENTITY_KINDS: { value: TaskTargetType; label: string }[] = [
  { value: "vendor", label: "Vendor" },
  { value: "customer", label: "Customer" },
  { value: "driver", label: "Driver" },
  { value: "unit", label: "Unit" },
  { value: "load", label: "Load" },
];

function userLabel(u: IdentityUser): string {
  const full = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return entityLabel(u.name || full || u.email, u.id, "User");
}

// Company-local "today" (Central), not UTC — avoids defaulting the scheduled date to tomorrow.
function todayISO(): string {
  return companyToday();
}

// datetime-local (no tz) -> ISO with offset for the backend (z.string().datetime({offset:true})).
function localDateTimeToISO(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function CreateTaskModal({ open, operatingCompanyId, defaultDate, presetLink, onClose, onCreated }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [scheduledDate, setScheduledDate] = useState(defaultDate ?? todayISO());
  const [dueDate, setDueDate] = useState("");
  const [category, setCategory] = useState<TaskCategory>("dispatch");
  const [priority, setPriority] = useState(0);
  const [description, setDescription] = useState("");
  const [taskTypeId, setTaskTypeId] = useState("");
  const [alarmAt, setAlarmAt] = useState("");
  const [anticipatedCategory, setAnticipatedCategory] = useState("");
  const [entityKind, setEntityKind] = useState<TaskTargetType | "">("");
  const [entityId, setEntityId] = useState("");
  const [showAddProfile, setShowAddProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");

  const usersQuery = useQuery({
    queryKey: ["identity", "users", "assignable", operatingCompanyId],
    queryFn: ({ signal }) => listAssignableUsers(operatingCompanyId, signal),
    enabled: open && Boolean(operatingCompanyId),
  });
  const users = useMemo(
    () => (usersQuery.data?.users ?? []).filter((u) => !u.deactivated_at).sort((a, b) => userLabel(a).localeCompare(userLabel(b))),
    [usersQuery.data]
  );

  const profilesQuery = useQuery({
    queryKey: ["task-types", operatingCompanyId],
    queryFn: () => fetchTaskTypes(operatingCompanyId),
    enabled: open && Boolean(operatingCompanyId),
  });
  const profiles = profilesQuery.data?.types ?? [];

  // When a profile is chosen, adopt its category and suggest an alarm from its lead days + due date.
  const applyProfile = (p: TaskType | undefined) => {
    if (!p) return;
    if (p.category && CATEGORIES.some((c) => c.value === p.category)) setCategory(p.category as TaskCategory);
    if (p.alarm_lead_days != null && dueDate) {
      const d = new Date(`${dueDate}T09:00`);
      d.setDate(d.getDate() - p.alarm_lead_days);
      const pad = (n: number) => String(n).padStart(2, "0");
      setAlarmAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    }
  };

  const reset = () => {
    setTitle("");
    setAssignedTo("");
    setScheduledDate(defaultDate ?? todayISO());
    setDueDate("");
    setCategory("dispatch");
    setPriority(0);
    setDescription("");
    setTaskTypeId("");
    setAlarmAt("");
    setAnticipatedCategory("");
    setEntityKind("");
    setEntityId("");
    setShowAddProfile(false);
    setNewProfileName("");
  };

  useEffect(() => {
    if (!open) return;
    setScheduledDate(defaultDate ?? todayISO());
  }, [open, defaultDate]);

  const addProfileMutation = useMutation({
    mutationFn: () => createTaskType(operatingCompanyId, newProfileName.trim()),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["task-types", operatingCompanyId] });
      setTaskTypeId(res.type.id);
      setShowAddProfile(false);
      setNewProfileName("");
      pushToast("Profile added", "success");
    },
    onError: (err) => pushToast(userFacingApiError(err, "Could not add profile"), "error"),
  });

  const mutation = useMutation({
    mutationFn: () => {
      const links: TaskLinkInput[] = [];
      if (presetLink) links.push({ role: "about", target_type: presetLink.target_type, target_id: presetLink.target_id });
      if (entityKind && entityId) links.push({ role: "about", target_type: entityKind, target_id: entityId });
      return createTask({
        operating_company_id: operatingCompanyId,
        category,
        title: title.trim(),
        assigned_to_user_id: assignedTo,
        scheduled_date: scheduledDate,
        priority,
        ...(dueDate ? { due_date: dueDate } : {}),
        ...(taskTypeId ? { task_type_id: taskTypeId } : {}),
        ...(localDateTimeToISO(alarmAt) ? { alarm_at: localDateTimeToISO(alarmAt) } : {}),
        ...(anticipatedCategory.trim() ? { anticipated_category: anticipatedCategory.trim() } : {}),
        ...(description.trim() ? { description: description.trim(), notes: description.trim() } : {}),
        ...(links.length ? { links } : {}),
      });
    },
    onSuccess: () => {
      pushToast("Task created", "success");
      void queryClient.invalidateQueries({ queryKey: ["planner"] });
      void queryClient.invalidateQueries({ queryKey: ["tasks-by-target"] });
      reset();
      onCreated?.();
      onClose();
    },
    onError: (err) => pushToast(userFacingApiError(err, "Could not create task"), "error"),
  });

  const canSubmit =
    Boolean(operatingCompanyId) && title.trim().length > 0 && assignedTo.length > 0 && scheduledDate.length > 0 && !mutation.isPending;

  const profileOptions = useMemo(
    () => profiles.map((p) => ({ value: p.id, label: p.name })),
    [profiles],
  );
  const assigneeOptions = useMemo(
    () => users.map((u) => ({ value: u.id, label: userLabel(u) })),
    [users],
  );

  const labelCls = "block text-[11px] font-semibold uppercase tracking-wide text-gray-600";
  const inputCls = "mt-1 w-full rounded-sm border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800 focus:border-slate-300 focus:outline-hidden";

  return (
    <Modal variant="drawer" open={open} onClose={onClose} title="Create task" modalKind="create-task" sizePreset="md">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (canSubmit) mutation.mutate();
        }}
      >
        <div>
          <label className={labelCls} htmlFor="create-task-title">Title</label>
          <input
            id="create-task-title"
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            maxLength={200}
            autoFocus
          />
        </div>

        {presetLink ? (
          <p className="text-[11px] text-slate-600">
            Linked to <span className="font-semibold">{presetLink.label ?? `${presetLink.target_type}`}</span> — appears in its Tasks tab.
          </p>
        ) : null}

        {/* Profile picker + inline add (first-row + Add new — not an external sibling button) */}
        <div data-testid="create-task-profile-picker">
          <label className={labelCls}>Profile</label>
          <div className="mt-1">
            <Combobox
              options={profileOptions}
              value={taskTypeId || null}
              onChange={(next) => {
                const id = next ?? "";
                setTaskTypeId(id);
                applyProfile(profiles.find((p) => p.id === id));
              }}
              placeholder={profilesQuery.isLoading ? "Loading…" : "No profile"}
              loading={profilesQuery.isLoading}
              allowAddNew={{
                label: "+ Add new profile",
                onAdd: () => setShowAddProfile(true),
              }}
            />
          </div>
          {showAddProfile ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                className={inputCls}
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="New profile name (e.g. License Plate / IRP Renewal)"
                maxLength={100}
              />
              <button
                type="button"
                disabled={!newProfileName.trim() || addProfileMutation.isPending}
                className="whitespace-nowrap rounded-sm border border-slate-300 bg-slate-100 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                onClick={() => addProfileMutation.mutate()}
              >
                {addProfileMutation.isPending ? "Adding…" : "Save"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div data-testid="create-task-assignee-picker">
            <label className={labelCls}>Assignee</label>
            <div className="mt-1">
              <Combobox
                options={assigneeOptions}
                value={assignedTo || null}
                onChange={(next) => setAssignedTo(next ?? "")}
                placeholder={usersQuery.isLoading ? "Loading…" : "Select an employee"}
                loading={usersQuery.isLoading}
              />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="create-task-date">Scheduled date</label>
            <DatePicker id="create-task-date" className={inputCls} value={scheduledDate} onChange={setScheduledDate} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="create-task-due">Due date</label>
            <DatePicker id="create-task-due" className={inputCls} value={dueDate} onChange={setDueDate} />
          </div>
          <div>
            <label className={labelCls} htmlFor="create-task-alarm">Alarm (reminder)</label>
            <DateTimePicker
              id="create-task-alarm"
              className={inputCls}
              aria-label="Alarm (reminder)"
              value={alarmAt}
              onChange={setAlarmAt}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="create-task-category">Category</label>
            <select id="create-task-category" className={inputCls} value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="create-task-priority">Priority</label>
            <select id="create-task-priority" className={inputCls} value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Optional entity link (only when not preset from a detail page) */}
        {!presetLink ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="create-task-entity-kind">Linked to</label>
              <select
                id="create-task-entity-kind"
                className={inputCls}
                value={entityKind}
                onChange={(e) => {
                  setEntityKind(e.target.value as TaskTargetType | "");
                  setEntityId("");
                }}
              >
                <option value="">None</option>
                {ENTITY_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="create-task-entity-id">Record</label>
              <div className="mt-0" data-testid="create-task-entity-picker">
                {!entityKind ? (
                  <select id="create-task-entity-id" className={inputCls} disabled value="">
                    <option value="">Pick a type first</option>
                  </select>
                ) : (
                  <EntityPicker
                    kind={entityKind as "customer" | "vendor" | "driver" | "unit" | "load"}
                    operatingCompanyId={operatingCompanyId}
                    value={entityId || null}
                    onChange={(next) => setEntityId(next ?? "")}
                    enabled={open}
                    allowCreate={entityKind === "customer" || entityKind === "vendor"}
                    placeholder={`Select ${entityKind}…`}
                    dataTestId={`create-task-entity-${entityKind}`}
                  />
                )}
              </div>
            </div>
          </div>
        ) : null}

        <div>
          <label className={labelCls} htmlFor="create-task-anticipated">Anticipated category (optional)</label>
          <input
            id="create-task-anticipated"
            className={inputCls}
            value={anticipatedCategory}
            onChange={(e) => setAnticipatedCategory(e.target.value)}
            placeholder='e.g. "License plates" — resolved when the expense/bill is created'
            maxLength={200}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="create-task-desc">Description</label>
          <textarea
            id="create-task-desc"
            className={`${inputCls} h-20 resize-y`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional detail / notes"
            maxLength={2000}
          />
        </div>

        <p className="text-[11px] text-gray-500">New tasks start with status <span className="font-semibold">Pending</span>; change it on the board after creating.</p>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" className="rounded-sm border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-sm bg-[#1f2a44] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0f1729] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mutation.isPending ? "Creating…" : "Create task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
