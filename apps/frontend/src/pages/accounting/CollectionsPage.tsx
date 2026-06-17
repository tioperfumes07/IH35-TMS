import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import {
  getTask,
  listTasks,
  logContact,
  resolveTask,
  triggerSync,
  type CollectionAgingBucket,
  type CollectionContactType,
  type CollectionTaskResolution,
} from "../../api/collections";
import { AccountingSubNav } from "./AccountingSubNav";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function CollectionsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [bucket, setBucket] = useState<CollectionAgingBucket | "all">("all");
  const [owner, setOwner] = useState<string>("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [contactType, setContactType] = useState<CollectionContactType>("call");
  const [contactNotes, setContactNotes] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");
  const [resolution, setResolution] = useState<CollectionTaskResolution>("paid");

  const taskFilters = useMemo(
    () => ({
      bucket: bucket === "all" ? undefined : bucket,
      owner: owner === "all" ? undefined : owner === "unassigned" ? "unassigned" : owner,
    }),
    [bucket, owner]
  );

  const tasksQuery = useQuery({
    queryKey: ["accounting", "collections", companyId, taskFilters.bucket, taskFilters.owner],
    queryFn: () => listTasks(companyId, taskFilters),
    enabled: Boolean(companyId),
  });

  const selectedTask = selectedTaskId ?? tasksQuery.data?.tasks[0]?.id ?? null;
  const detailQuery = useQuery({
    queryKey: ["accounting", "collections", "detail", companyId, selectedTask],
    queryFn: () => getTask(String(selectedTask), companyId),
    enabled: Boolean(companyId && selectedTask),
  });

  const invalidateCollections = async () => {
    await queryClient.invalidateQueries({ queryKey: ["accounting", "collections", companyId] });
    await queryClient.invalidateQueries({ queryKey: ["accounting", "collections", "detail", companyId] });
  };

  const syncMutation = useMutation({
    mutationFn: () => triggerSync({ operating_company_id: companyId }),
    onSuccess: async (result) => {
      await invalidateCollections();
      pushToast(`Collections sync complete: +${result.created} created, ${result.resolved} resolved`, "success");
    },
    onError: (error) => pushToast(String((error as Error).message ?? "Collections sync failed"), "error"),
  });

  const logContactMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTask) throw new Error("Select a task first");
      return logContact(selectedTask, {
        operating_company_id: companyId,
        contact_type: contactType,
        notes: contactNotes,
        next_action_date: nextActionDate || undefined,
      });
    },
    onSuccess: async () => {
      await invalidateCollections();
      setContactNotes("");
      pushToast("Contact logged", "success");
    },
    onError: (error) => pushToast(String((error as Error).message ?? "Contact log failed"), "error"),
  });

  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTask) throw new Error("Select a task first");
      return resolveTask(selectedTask, {
        operating_company_id: companyId,
        resolution,
      });
    },
    onSuccess: async () => {
      await invalidateCollections();
      pushToast("Task resolved", "success");
    },
    onError: (error) => pushToast(String((error as Error).message ?? "Resolve failed"), "error"),
  });

  return (
    <div className="space-y-3">
      <AccountingSubNav />
      <PageHeader
        title="AR collections workflow"
        subtitle="Accrual-only overdue follow-up queue with contact history and next-action scheduling."
      />

      {!companyId ? <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Select an operating company before managing collections.</p> : null}

      <div className="grid gap-3 rounded border border-gray-200 bg-white p-3 lg:grid-cols-4">
        <label className="text-xs text-gray-600">
          Aging bucket
          <select value={bucket} onChange={(event) => setBucket(event.target.value as CollectionAgingBucket | "all")} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm">
            <option value="all">All</option>
            <option value="1_30">1-30</option>
            <option value="31_60">31-60</option>
            <option value="61_90">61-90</option>
            <option value="91_plus">91+</option>
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Owner
          <select value={owner} onChange={(event) => setOwner(event.target.value)} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm">
            <option value="all">All</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </label>
        <div className="lg:col-span-2 flex items-end justify-end">
          <Button size="sm" onClick={() => syncMutation.mutate()} disabled={!companyId || syncMutation.isPending}>
            Run sync now
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <section className="rounded border border-gray-200 bg-white lg:col-span-2">
          <header className="border-b border-gray-100 px-3 py-2 text-sm font-semibold">Queue</header>
          <div className="max-h-[34rem] overflow-auto">
            {(tasksQuery.data?.tasks ?? []).map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => setSelectedTaskId(task.id)}
                className={`w-full border-b border-gray-100 px-3 py-2 text-left ${selectedTask === task.id ? "bg-blue-50" : "hover:bg-gray-50"}`}
              >
                <div className="text-sm font-medium text-gray-900">{task.customer_name ?? "Unknown customer"}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-600">
                  <span>{task.aging_bucket.replace("_", "-")}</span>
                  <span>{task.days_overdue}d overdue</span>
                  <span>{money(task.owed_cents)}</span>
                  <span className="font-semibold">{task.status}</span>
                </div>
              </button>
            ))}
            {tasksQuery.isLoading ? <p className="px-3 py-3 text-sm text-gray-500">Loading tasks...</p> : null}
            {!tasksQuery.isLoading && (tasksQuery.data?.tasks.length ?? 0) === 0 ? <p className="px-3 py-3 text-sm text-gray-500">No tasks match current filters.</p> : null}
          </div>
        </section>

        <section className="rounded border border-gray-200 bg-white lg:col-span-3">
          <header className="border-b border-gray-100 px-3 py-2 text-sm font-semibold">Task detail</header>
          {!selectedTask ? (
            <p className="px-3 py-4 text-sm text-gray-500">Select a task from the queue.</p>
          ) : (
            <div className="space-y-4 p-3">
              <div className="grid gap-2 text-sm md:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500">Invoice</div>
                  <div className="font-medium">{detailQuery.data?.task.invoice_id ?? "-"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500">Amount due</div>
                  <div className="font-medium">{money(detailQuery.data?.task.owed_cents ?? 0)}</div>
                </div>
              </div>

              <div className="grid gap-2 rounded border border-gray-200 p-3 md:grid-cols-3">
                <label className="text-xs text-gray-600">
                  Contact type
                  <select value={contactType} onChange={(event) => setContactType(event.target.value as CollectionContactType)} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm">
                    <option value="call">Call</option>
                    <option value="email">Email</option>
                    <option value="letter">Letter</option>
                    <option value="sms">SMS</option>
                  </select>
                </label>
                <label className="text-xs text-gray-600">
                  Next action date
                  <DatePicker value={nextActionDate} onChange={(next) => setNextActionDate(next)} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm" />
                </label>
                <div className="flex items-end justify-end">
                  <Button size="sm" onClick={() => logContactMutation.mutate()} disabled={!companyId || !selectedTask || !contactNotes.trim() || logContactMutation.isPending}>
                    Log contact
                  </Button>
                </div>
                <label className="md:col-span-3 text-xs text-gray-600">
                  Notes
                  <textarea value={contactNotes} onChange={(event) => setContactNotes(event.target.value)} rows={3} className="mt-1 w-full rounded border border-gray-300 px-2 py-2 text-sm" placeholder="Conversation summary, promises, dispute details..." />
                </label>
              </div>

              <div className="grid gap-2 rounded border border-gray-200 p-3 md:grid-cols-3">
                <label className="text-xs text-gray-600 md:col-span-2">
                  Resolution
                  <select value={resolution} onChange={(event) => setResolution(event.target.value as CollectionTaskResolution)} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm">
                    <option value="paid">Paid</option>
                    <option value="disputed">Disputed</option>
                    <option value="written_off">Written off</option>
                  </select>
                </label>
                <div className="flex items-end justify-end">
                  <Button size="sm" variant="secondary" onClick={() => resolveMutation.mutate()} disabled={!companyId || !selectedTask || resolveMutation.isPending}>
                    Resolve task
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">Contact timeline</h3>
                <div className="space-y-2">
                  {(detailQuery.data?.contacts ?? []).map((contact) => (
                    <article key={contact.id} className="rounded border border-gray-200 p-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                        <span className="font-semibold uppercase">{contact.contact_type}</span>
                        <span>{new Date(contact.created_at).toLocaleString()}</span>
                        {contact.next_action_date ? <span>next: {contact.next_action_date}</span> : null}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap">{contact.notes}</p>
                    </article>
                  ))}
                  {!detailQuery.isLoading && (detailQuery.data?.contacts.length ?? 0) === 0 ? <p className="text-sm text-gray-500">No contact entries yet.</p> : null}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
