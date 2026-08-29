import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { apiRequest, ApiError } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import {
  SubscriptionEditor,
  type SubscriptionFormValues,
} from "../../components/reports/SubscriptionEditor";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../auth/useAuth";
import { MobileOptimizedTable } from "../../components/shared/MobileOptimizedTable";
import { ReportsSubNav } from "./ReportsSubNav";
import { formatDateTimeUS } from "../../lib/formatDate";

// SUBSCRIPTIONS-PRESET-FILTER-SILENT-NOOP: the "Saved" category's "Owner weekly pack" /
// "Quarter close package" shortcuts (CategoryHoverNav.tsx, ReportsRunner.tsx's
// CANONICAL_REPORT_ALIASES) both land here with a real ?preset= query param, but this page never
// read it -- every preset showed the exact same unfiltered 6-row list, live-confirmed (row count
// identical with and without ?preset=owner-weekly). ScheduledReportsPage.tsx (the OTHER scheduled-
// reports surface, /reports/scheduled-custom) already implements this same preset pattern, but its
// REPORT_PRESETS key off the canonical reporting.scheduled_reports slugs (dispatch-board,
// cash-position-ar, ...) -- a disjoint namespace from THIS page's Q8 subscription slugs
// (weekly-cash-position, monthly-pnl, ...), so that definition cannot be reused directly. Grouped by
// cadence, matching each preset's own name: "weekly pack" = the 3 weekly subscriptions; "quarter
// close package" = the period-close artifacts (the monthly P&L and the quarterly IFTA preview).
const Q8_PRESETS: Record<string, { title: string; subtitle: string; slugs: Set<string> }> = {
  "owner-weekly": {
    title: "Owner weekly pack",
    subtitle: "The 3 weekly-cadence Q8 subscriptions",
    slugs: new Set(["weekly-cash-position", "weekly-driver-settlement-preview", "weekly-ar-aging-60"]),
  },
  "quarter-close": {
    title: "Quarter close package",
    subtitle: "Period-close Q8 subscriptions (monthly P&L + quarterly IFTA)",
    slugs: new Set(["monthly-pnl", "quarterly-ifta-preview"]),
  },
};

function subscriptionStatusLabel(isActive: boolean): "Active" | "Inactive" {
  return isActive ? "Active" : "Inactive";
}

function subscriptionTimestampLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return formatDateTimeUS(value) || "—";
}

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
  const [searchParams] = useSearchParams();
  const preset = Q8_PRESETS[searchParams.get("preset") ?? ""] ?? null;
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
      apiRequest<{ rows: SubscriptionRow[] }>(
        withCompany("/api/v1/reports/scheduled/subscriptions", companyId),
      ),
    enabled: Boolean(companyId),
  });

  const logQuery = useQuery({
    queryKey: ["gap43-delivery-log", companyId],
    queryFn: () =>
      apiRequest<{ rows: DeliveryLogRow[] }>(
        withCompany("/api/v1/reports/scheduled/delivery-log", companyId),
      ),
    enabled: Boolean(companyId),
  });

  const saveMut = useMutation({
    mutationFn: async (values: SubscriptionFormValues) => {
      if (editing) {
        return apiRequest(
          withCompany(
            `/api/v1/reports/scheduled/subscriptions/${editing.uuid}`,
            companyId,
          ),
          {
            method: "PATCH",
            body: values,
          },
        );
      }
      return apiRequest(
        withCompany("/api/v1/reports/scheduled/subscriptions", companyId),
        {
          method: "POST",
          body: values,
        },
      );
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
      apiRequest(
        withCompany(
          `/api/v1/reports/scheduled/subscriptions/${uuid}/deactivate`,
          companyId,
        ),
        {
          method: "PATCH",
        },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["gap43-subscriptions"] });
      pushToast("Subscription deactivated", "success");
    },
    // GAP43-SUBSCRIPTIONS-500-ON-EXPECTED-STATE: the backend now returns 409 (not 500) when the row
    // is already inactive/gone. That is a stale list, not a failure — refetch instead of claiming
    // the action failed.
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.status === 409) {
        void qc.invalidateQueries({ queryKey: ["gap43-subscriptions"] });
        pushToast("Already deactivated — list refreshed", "info");
        return;
      }
      pushToast("Deactivate failed", "error");
    },
  });

  const reportOptions = useMemo(
    () =>
      Object.entries(REPORT_LABELS).map(([slug, label]) => ({
        slug,
        label,
      })),
    [],
  );

  const allRows = subsQuery.data?.rows ?? [];
  const rows = preset ? allRows.filter((row) => preset.slugs.has(row.report_slug)) : allRows;
  const logRows = logQuery.data?.rows ?? [];

  return (
    <div className="space-y-4 p-2 md:p-4" data-testid="subscription-manager">
      <ReportsSubNav />
      <PageHeader
        title={preset ? preset.title : "Scheduled report subscriptions"}
        subtitle={preset ? preset.subtitle : "Q8 auto-emailed reports — Owner manages cadence and recipients"}
        backHref="/reports"
        breadcrumb={["Reports", "Scheduled Subscriptions"]}
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

      {!companyId ? (
        <p className="text-sm text-red-600">Select an operating company.</p>
      ) : null}
      {subsQuery.isLoading ? (
        <p className="text-sm text-gray-500">Loading subscriptions…</p>
      ) : null}

      {/*
        Q8-SUBSCRIPTIONS-SILENT-NO-DELIVERY (2026-08-24): the CRUD API/table (reports.scheduled_subscriptions)
        is real and correctly saves cadence/recipients, and createSubscription() does compute a real
        next_scheduled_at -- but no backend worker anywhere in the repo ever reads this table to send an
        email. Confirmed live on Neon: 17 of 18 rows are is_active=true, 0 have ever had last_sent_at set,
        0 have a non-null next_scheduled_at (the oldest active row was created 2026-06-08, so this has been
        silently true for 2.5+ months), and reports.scheduled_delivery_log has 0 rows total, ever. Even a
        freshly-created subscription cannot deliver today: none of the 6 Q8 report_slugs (weekly-cash-position,
        weekly-driver-settlement-preview, weekly-ar-aging-60, monthly-pnl, quarterly-ifta-preview,
        daily-safety-alerts-digest) are in the OTHER scheduled-reports worker's report generator whitelist
        (apps/backend/src/scheduled-reports/report-file-builder.ts LEGACY_IDS), so wiring a worker to that
        existing delivery primitive as-is would immediately throw unsupported_report_id for every row.
        Until a real worker + report generator ships for this table, showing "Active" with a plain "—" for
        Last sent/Next silently misleads the Owner into believing a weekly email is going out when nothing
        ever will. This banner makes that honest instead of silent -- it is not the full fix (that is a
        real worker + 6 report generators, tracked in GUARD-WORKORDERS.md), but it stops the deception now.
      */}
      <div
        className="rounded-sm border border-slate-200 bg-slate-100 p-4 text-sm"
        data-testid="q8-subscriptions-delivery-not-implemented"
      >
        <p className="font-semibold text-slate-700">Email delivery is not implemented yet</p>
        <p className="mt-1 text-slate-600">
          Subscriptions below save correctly, but no backend worker exists to send them — "Active" status
          does not mean emails are going out. Last sent / Next will stay empty for every subscription until
          report delivery ships.
        </p>
      </div>

      <div className="rounded-sm border border-gray-200 bg-white p-2">
        <MobileOptimizedTable
          rows={rows}
          rowKey={(row) => row.uuid}
          emptyMessage={
            // GO-0028: this used to be a binary isSuccess check, so a genuine fetch FAILURE was
            // indistinguishable from "still loading" -- the table showed "Loading subscriptions…"
            // forever with no error, no retry affordance.
            subsQuery.isSuccess
              ? "No subscriptions found."
              : subsQuery.isError
                ? "Failed to load subscriptions — please retry."
                : "Loading subscriptions…"
          }
          columns={[
            {
              key: "report",
              header: "Report",
              render: (row) =>
                REPORT_LABELS[row.report_slug] ?? row.report_slug,
            },
            {
              key: "cadence",
              header: "Cadence",
              render: (row) => cadenceLabel(row),
            },
            {
              key: "recipients",
              header: "Recipients",
              render: (row) => row.recipient_emails.join(", "),
            },
            {
              key: "format",
              header: "Format",
              render: (row) => row.delivery_format.toUpperCase(),
            },
            {
              key: "last",
              header: "Last sent",
              render: (row) => subscriptionTimestampLabel(row.last_sent_at),
            },
            {
              key: "next",
              header: "Next",
              render: (row) => subscriptionTimestampLabel(row.next_scheduled_at),
            },
            {
              key: "status",
              header: "Status",
              render: (row) => (
                <span
                  className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${
                    row.is_active
                      ? "border-slate-200 bg-slate-100 text-slate-900"
                      : "border-gray-200 bg-gray-100 text-gray-700"
                  }`}
                >
                  {subscriptionStatusLabel(row.is_active)}
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
        <h3 className="text-sm font-semibold text-slate-800">
          Delivery history
        </h3>
        <div className="rounded-sm border border-gray-200 bg-white p-2">
          <MobileOptimizedTable
            rows={logRows}
            rowKey={(log) => log.uuid}
            emptyMessage={
              // GO-0028: same fix as subsQuery above -- a fetch failure must not look identical
              // to "still loading" forever.
              logQuery.isSuccess
                ? "No deliveries logged yet."
                : logQuery.isError
                  ? "Failed to load delivery history — please retry."
                  : "Loading delivery history…"
            }
            columns={[
              {
                key: "sent",
                header: "Sent at",
                render: (log) => subscriptionTimestampLabel(log.sent_at),
              },
              { key: "status", header: "Status", render: (log) => log.status },
              {
                key: "recipients",
                header: "Recipients",
                render: (log) => (log.recipients ?? []).join(", ") || "—",
              },
              {
                key: "error",
                header: "Error",
                render: (log) => (
                  <span className="text-red-700">
                    {log.error_message ?? "—"}
                  </span>
                ),
              },
            ]}
          />
        </div>
      </section>

      <SubscriptionEditor
        open={editorOpen}
        mode={editing ? "edit" : "create"}
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
                delivery_format:
                  editing.delivery_format as SubscriptionFormValues["delivery_format"],
              }
            : { recipient_emails: user?.email ? [user.email] : [] }
        }
      />
    </div>
  );
}
