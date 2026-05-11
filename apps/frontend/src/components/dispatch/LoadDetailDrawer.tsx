import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { updateLoad, useCancelLoad, useLoad, useLoadAudit } from "../../api/loads";
import { createInvoiceFromLoad } from "../../api/accounting";
import { cancelDispatchLoad, distributeLoadInstructions, getDispatchAssignmentHistory } from "../../api/dispatch";
import { useToast } from "../Toast";
import { Button } from "../Button";
import { DocumentsTab } from "../documents/DocumentsTab";
import { CancelLoadModal } from "./CancelLoadModal";
import { STATUS_LABEL, formatMoneyCents, toRouteSummary } from "./constants";

type Props = {
  loadId: string | null;
  isOpen: boolean;
  canEdit: boolean;
  onClose: () => void;
};

const tabs = ["Overview", "Stops", "Documents", "Assignment History", "Audit History"] as const;
type DrawerTab = (typeof tabs)[number];

export function LoadDetailDrawer({ loadId, isOpen, canEdit, onClose }: Props) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<DrawerTab>("Overview");
  const [editing, setEditing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const { pushToast } = useToast();

  const loadQuery = useLoad(loadId);
  const auditQuery = useLoadAudit(loadId);
  const cancelMutation = useCancelLoad();
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => updateLoad(id, body),
  });
  const createInvoiceMutation = useMutation({
    mutationFn: ({ operatingCompanyId, loadId }: { operatingCompanyId: string; loadId: string }) =>
      createInvoiceFromLoad(operatingCompanyId, { load_id: loadId }),
  });
  const distributeMutation = useMutation({
    mutationFn: ({ loadId, operatingCompanyId }: { loadId: string; operatingCompanyId: string }) =>
      distributeLoadInstructions(loadId, operatingCompanyId),
    onSuccess: () => pushToast("Driver instructions distributed", "success"),
  });

  const load = loadQuery.data;
  const assignmentHistoryQuery = useQuery({
    queryKey: ["dispatch", "assignment-history", loadId, load?.operating_company_id],
    queryFn: () => getDispatchAssignmentHistory(loadId as string, load?.operating_company_id as string),
    enabled: Boolean(loadId && load?.operating_company_id && activeTab === "Assignment History"),
  });
  const [notesDraft, setNotesDraft] = useState("");
  const [rateDraft, setRateDraft] = useState("");

  const routeSummary = useMemo(() => {
    if (!load) return "-";
    return toRouteSummary(load.first_pickup_city, load.first_delivery_city);
  }, [load]);
  const canInvoiceFromLoad = useMemo(() => {
    if (!load) return false;
    return ["delivered", "invoiced", "paid", "closed"].includes(load.status);
  }, [load]);

  if (!isOpen || !loadId) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 h-full w-full overflow-y-auto bg-white shadow-xl md:w-[600px]">
        <header className="sticky top-0 border-b border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Load {load?.load_number ?? loadId}</h2>
              <p className="text-xs text-gray-500">{routeSummary}</p>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
          <div className="mt-3 flex gap-2">
            {tabs.map((tab) => (
              <Button key={tab} type="button" size="sm" variant={activeTab === tab ? "primary" : "secondary"} onClick={() => setActiveTab(tab)}>
                {tab}
              </Button>
            ))}
          </div>
        </header>

        <div className="p-4">
          {activeTab === "Overview" ? (
            load ? (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Customer" value={load.customer_name ?? "-"} />
                  <Field label="Status" value={STATUS_LABEL[load.status]} />
                  <Field label="Driver" value={load.assigned_primary_driver_name ?? "Unassigned"} />
                  <Field label="Unit" value={load.assigned_unit_number ?? "-"} />
                  <Field label="Rate" value={formatMoneyCents(load.rate_total_cents, load.currency_code)} />
                  <Field label="Created" value={new Date(load.created_at).toLocaleString()} />
                </div>

                {editing ? (
                  <div className="space-y-2 rounded border border-gray-200 p-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-600">Rate (cents)</label>
                      <input
                        value={rateDraft}
                        onChange={(event) => setRateDraft(event.target.value.replace(/[^\d]/g, ""))}
                        className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-600">Notes</label>
                      <textarea value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} rows={3} className="w-full rounded border border-gray-300 px-2 py-2 text-sm" />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        loading={updateMutation.isPending}
                        onClick={async () => {
                          if (!loadId) return;
                          await updateMutation.mutateAsync({
                            id: loadId,
                            body: {
                              rate_total_cents: Number(rateDraft || "0"),
                              notes: notesDraft || null,
                            },
                          });
                          pushToast("Load updated", "success");
                          setEditing(false);
                          void loadQuery.refetch();
                        }}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 rounded border border-gray-200 p-3">
                    <div>
                      <div className="text-xs text-gray-600">Notes</div>
                      <div className="mt-1 text-sm text-gray-800">{load.notes ?? "-"}</div>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-2">
                      <div>
                        <div className="text-xs font-semibold text-gray-700">Invoice</div>
                        <div className="text-[11px] text-gray-500">
                          {canInvoiceFromLoad ? "Delivered loads can create/view invoice." : "Invoice creation is available once load is delivered."}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={async () => {
                          if (!load) return;
                          const result = await createInvoiceMutation.mutateAsync({
                            operatingCompanyId: load.operating_company_id,
                            loadId: load.id,
                          });
                          const invoiceId = result.invoice?.id;
                          if (!invoiceId) return;
                          navigate(`/accounting/invoices/${invoiceId}`);
                        }}
                        loading={createInvoiceMutation.isPending}
                        disabled={!canInvoiceFromLoad}
                      >
                        Create / View Invoice
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-500">Loading load overview...</div>
            )
          ) : null}

          {activeTab === "Stops" ? (
            <div className="space-y-2">
              {load?.stops?.map((stop) => (
                <div key={stop.id} className="rounded border border-gray-200 p-3 text-sm">
                  <div className="font-semibold text-gray-800">
                    #{stop.sequence_number} · {stop.stop_type}
                  </div>
                  <div className="text-gray-600">{stop.city ?? "-"}, {stop.state ?? "-"} ({stop.country ?? "-"})</div>
                  <div className="text-xs text-gray-500">Scheduled: {stop.scheduled_arrival_at ? new Date(stop.scheduled_arrival_at).toLocaleString() : "-"}</div>
                </div>
              ))}
              {load && load.stops.length === 0 ? <div className="text-sm text-gray-500">No stops found.</div> : null}
            </div>
          ) : null}

          {activeTab === "Documents" ? (
            load ? (
              <div className="space-y-2">
                <div className="rounded border border-indigo-200 bg-indigo-50 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-indigo-900">Driver Instructions PDF + Portal/SMS/WhatsApp distribution</div>
                    <Button
                      size="sm"
                      onClick={() =>
                        distributeMutation.mutate({ loadId: load.id, operatingCompanyId: load.operating_company_id })
                      }
                      loading={distributeMutation.isPending}
                    >
                      Distribute instructions
                    </Button>
                  </div>
                </div>
                <DocumentsTab entityType="load" entityId={load.id} entityName={load.load_number} />
              </div>
            ) : (
              <div className="text-sm text-gray-500">Loading...</div>
            )
          ) : null}

          {activeTab === "Audit History" ? (
            <div className="space-y-2">
              {auditQuery.isLoading ? <div className="text-sm text-gray-500">Loading audit history...</div> : null}
              {(auditQuery.data ?? []).map((event) => (
                <div key={event.uuid} className="rounded border border-gray-200 p-3 text-sm">
                  <div className="font-semibold text-gray-800">{event.event_class}</div>
                  <div className="text-xs text-gray-500">{new Date(event.created_at).toLocaleString()}</div>
                  <pre className="mt-2 overflow-x-auto rounded bg-gray-50 p-2 text-xs text-gray-700">
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                </div>
              ))}
              {!auditQuery.isLoading && (auditQuery.data ?? []).length === 0 ? <div className="text-sm text-gray-500">No audit events found.</div> : null}
            </div>
          ) : null}
          {activeTab === "Assignment History" ? (
            <div className="space-y-2">
              <pre className="overflow-x-auto rounded bg-gray-50 p-2 text-xs text-gray-700">
                {JSON.stringify(assignmentHistoryQuery.data?.rows ?? [], null, 2)}
              </pre>
            </div>
          ) : null}
        </div>

        <footer className="sticky bottom-0 flex items-center justify-between border-t border-gray-200 bg-white p-4">
          <Button type="button" variant="danger" size="sm" onClick={() => setCancelOpen(true)} disabled={!load || load.status === "cancelled"}>
            Cancel Load
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!canEdit || !load}
              onClick={() => {
                if (!load) return;
                setRateDraft(String(load.rate_total_cents));
                setNotesDraft(load.notes ?? "");
                setEditing((current) => !current);
                setActiveTab("Overview");
              }}
            >
              Edit
            </Button>
            <Button type="button" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </footer>
      </aside>

      {load ? (
        <CancelLoadModal
          open={cancelOpen}
          operatingCompanyId={load.operating_company_id}
          onClose={() => setCancelOpen(false)}
          onSubmit={async (payload) => {
            await cancelDispatchLoad(load.id, {
              operating_company_id: load.operating_company_id,
              ...payload,
            });
            await cancelMutation.mutateAsync({ id: load.id, reasonCode: payload.reason_code, notes: payload.cancellation_notes });
            pushToast("Load cancellation submitted", "success");
            setCancelOpen(false);
            void loadQuery.refetch();
            void auditQuery.refetch();
          }}
        />
      ) : null}
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-200 p-2">
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="text-sm font-medium text-gray-800">{value}</div>
    </div>
  );
}
