import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { SubscriptionEditor, type SubscriptionFormValues } from "../../components/reports/SubscriptionEditor";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../auth/useAuth";
import { MobileOptimizedTable } from "../../components/shared/MobileOptimizedTable";
import { ReportsSubNav } from "./ReportsSubNav";

type SubscriptionRow = {
  uuid: string;
  report_slug: string;
  cadence: string;
  day_of_week: number | null;
  day_of_month: number | null;
  time_of_day: string;
  timezone: string;
  recipient_emails: string[];
  is_active: boolean;
  last_sent_at: string | null;
  next_scheduled_at: string | null;
  delivery_format: string;
};

type DeliveryLogRow = {
  uuid: string;
  subscription_uuid: string;
  sent_at: string;
  status: string;
  error_message: string | null;
  recipients: string[] | null;
};

const REPORT_LABELS: Record<string, string> = {
  "weekly-cash-position": "Weekly cash position",
  "weekly-driver-settlement-preview": "Weekly driver settlement preview",
  "weekly-ar-aging-60": "Weekly A/R aging > 60 days",
  "monthly-pnl": "Monthly P&L",
  "quarterly-ifta-preview": "Quarterly IFTA preview",
  "daily-safety-alerts-digest": "Daily safety alerts digest",
};

function withCompany(path: string, companyId: string) {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}operating_company_id=${encodeURIComponent(companyId)}`;
}

function cadenceLabel(row: SubscriptionRow) {
  const time = row.time_of_day?.slice(0, 5) ?? "—";
  if (row.cadence === "weekly" && row.day_of_week != null) {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `${row.cadence} · ${days[row.day_of_week] ?? "?"} ${time}`;
  }
  if (row.cadence === "monthly" && row.day_of_month != null) {
    return `${row.cadence} · day ${row.day_of_month} ${time}`;
  }
  if (row.cadence === "quarterly") return `${row.cadence} · Q-end +7 ${time}`;
  return `${row.cadence} · ${time}`;
}

export function SubscriptionManager() {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SubscriptionRow | null>(null);
  const isOwner = String(user?.role ?? "") === "Owner";

  const subsQuery = useQuery({
    queryKey: ["gap43-subscriptions", companyId],
    queryFn: () =>
      apiRequest<{ rows: SubscriptionRow[] }>(withCompany("/api/v1/reports/scheduled/subscriptions", companyId)),
    enabled: Boolean(companyId),
  });

  const logQuery = useQuery({
    queryKey: ["gap43-delivery-log", companyId],
    queryFn: () =>
      apiRequest<{ rows: DeliveryLogRow[] }>(withCompany("/api/v1/reports/scheduled/delivery-log", companyId)),
    enabled: Boolean(companyId),
  });

  const saveMut = useMutation({
    mutationFn: async (values: SubscriptionFormValues) => {
      if (editing) {
        return apiRequest(withCompany(`/api/v1/reports/scheduled/subscriptions/${editing.uuid}`, companyId), {
          method: "PATCH",
          body: values,
        });
      }
      return apiRequest(withCompany("/api/v1/reports/scheduled/subscriptions", companyId), {
        method: "POST",
        body: values,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["gap43-subscriptions"] });
      pushToast("Subscription saved", "success");
      setEditorOpen(false);
      setEditing(null);
    },
    onError: () => pushToast("Save failed", "error"),
  });

  const deactivateMut = useMutation({
    mutationFn: (uuid: string) =>
      apiRequest(withCompany(`/api/v1/reports/scheduled/subscriptions/${uuid}/deactivate`, companyId), {
        method: "PATCH",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["gap43-subscriptions"] });
      pushToast("Subscription deactivated", "success");
    },
    onError: () => pushToast("Deactivate failed", "error"),
  });

  const reportOptions = useMemo(
    () =>
      Object.entries(REPORT_LABELS).map(([slug, label]) => ({
        slug,
        label,
      })),
    []
  );

  const rows = subsQuery.data?.rows ?? [];
  const logRows = logQuery.data?.rows ?? [];

  return (
    <div className="space-y-4 p-2 md:p-4" data-testid="subscription-manager">
      <ReportsSubNav />
      <PageHeader
        title="Scheduled report subscriptions"
        subtitle="Q8 auto-emailed reports — Owner manages cadence and recipients"
        actions={
          isOwner ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
              disabled={!companyId}
            >
              Add subscription
            </Button>
          ) : null
        }
      />

      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}
      {subsQuery.isLoading ? <p className="text-sm text-gray-500">Loading subscriptions…</p> : null}

      <div className="rounded border border-gray-200 bg-white p-2">
        <MobileOptimizedTable
          rows={rows}
          rowKey={(row) => row.uuid}
          emptyMessage={
            subsQuery.isSuccess
              ? "No subscriptions found. Run migration 202606080206 to seed Q8 defaults."
              : "Loading subscriptions…"
          }
          columns={[
            {
              key: "report",
              header: "Report",
              render: (row) => REPORT_LABELS[row.report_slug] ?? row.report_slug,
            },
            { key: "cadence", header: "Cadence", render: (row) => cadenceLabel(row) },
            { key: "recipients", header: "Recipients", render: (row) => row.recipient_emails.join(", ") },
            { key: "format", header: "Format", render: (row) => row.delivery_format.toUpperCase() },
            { key: "last", header: "Last sent", render: (row) => row.last_sent_at?.slice(0, 19) ?? "—" },
            { key: "next", header: "Next", render: (row) => row.next_scheduled_at?.slice(0, 19) ?? "—" },
            {
              key: "status",
              header: "Status",
              render: (row) => (
                <span
                  className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${
                    row.is_active ? "border-emerald-200 bg-emerald-100 text-emerald-900" : "border-gray-200 bg-gray-100 text-gray-700"
                  }`}
                >
                  {row.is_active ? "active" : "inactive"}
                </span>
              ),
            },
            ...(isOwner
              ? [
                  {
                    key: "actions",
                    header: "Actions",
                    render: (row: SubscriptionRow) => (
                      <div className="space-x-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditing(row);
                            setEditorOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        {row.is_active ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={deactivateMut.isPending}
                            onClick={() => deactivateMut.mutate(row.uuid)}
                          >
                            Deactivate
                          </Button>
                        ) : null}
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-800">Delivery history</h3>
        <div className="rounded border border-gray-200 bg-white p-2">
          <MobileOptimizedTable
            rows={logRows}
            rowKey={(log) => log.uuid}
            emptyMessage={logQuery.isSuccess ? "No deliveries logged yet." : "Loading delivery history…"}
            columns={[
              { key: "sent", header: "Sent at", render: (log) => log.sent_at.slice(0, 19) },
              { key: "status", header: "Status", render: (log) => log.status },
              { key: "recipients", header: "Recipients", render: (log) => (log.recipients ?? []).join(", ") || "—" },
              {
                key: "error",
                header: "Error",
                render: (log) => <span className="text-red-700">{log.error_message ?? "—"}</span>,
              },
            ]}
          />
        </div>
      </section>

      <SubscriptionEditor
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        onSave={async (values) => {
          await saveMut.mutateAsync(values);
        }}
        saving={saveMut.isPending}
        reportOptions={reportOptions}
        initial={
          editing
            ? {
                report_slug: editing.report_slug,
                cadence: editing.cadence as SubscriptionFormValues["cadence"],
                day_of_week: editing.day_of_week,
                day_of_month: editing.day_of_month,
                time_of_day: editing.time_of_day,
                timezone: editing.timezone,
                recipient_emails: editing.recipient_emails,
                delivery_format: editing.delivery_format as SubscriptionFormValues["delivery_format"],
              }
            : undefined
        }
      />
    </div>
  );
}
