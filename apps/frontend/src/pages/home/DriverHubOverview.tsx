import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { cashAdvanceRequestsOfficeApi } from "../../api/cashAdvanceRequests";
import { getDocumentAlertsInbox } from "../../api/document-alerts";
import { getDriverMessagesInbox } from "../../api/driver-messages";
import { driverSchedulerOfficeApi } from "../../api/driver-scheduler";
import { apiRequest } from "../../api/client";
import { DriverInbox } from "../../components/driver-inbox/DriverInbox";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { DriverSchedulerRequestInboxPage } from "../safety/driver-scheduler/DriverSchedulerRequestInboxPage";

function formatCount(n: number | null, isError: boolean): string {
  if (isError) return "Error";
  if (n === null) return "—";
  return String(n);
}

type AlertCard = {
  title: string;
  count: number | null;
  isError: boolean;
  to: string;
  subtitle: string;
  testId: string;
};

export function DriverHubOverview({ companyId, canReview }: { companyId: string; canReview: boolean }) {
  const [leaveQ, cashQ, roadQ, messagesQ, docAlertsQ] = useQueries({
    queries: [
      {
        queryKey: ["driver-hub-overview", "leave-requests", companyId],
        queryFn: () => driverSchedulerOfficeApi.listPending(companyId, 1, 0),
        enabled: Boolean(companyId) && canReview,
      },
      {
        queryKey: ["driver-hub-overview", "cash-advances", companyId],
        queryFn: () => cashAdvanceRequestsOfficeApi.listPending(companyId),
        enabled: Boolean(companyId) && canReview,
      },
      {
        queryKey: ["driver-hub-overview", "road-service", companyId],
        queryFn: () =>
          apiRequest<{ tickets: Array<Record<string, unknown>> }>(
            `/api/v1/road-service-tickets?operating_company_id=${encodeURIComponent(companyId)}&status=open`
          ),
        enabled: Boolean(companyId) && canReview,
      },
      {
        queryKey: ["driver-hub-overview", "messages", companyId],
        queryFn: () => getDriverMessagesInbox(companyId),
        enabled: Boolean(companyId) && canReview,
      },
      {
        queryKey: ["driver-hub-overview", "document-alerts", companyId],
        queryFn: () => getDocumentAlertsInbox(companyId, { limit: 1, offset: 0 }),
        enabled: Boolean(companyId) && canReview,
      },
    ],
  });

  if (!canReview) {
    return <p className="text-[12px] text-[#8A92AB]">Reviewing requests requires a Manager, Accountant, or Owner role.</p>;
  }
  if (!companyId) {
    return <p className="text-[12px] text-[#8A92AB]">Select an operating company to view driver requests and alerts.</p>;
  }

  const leaveCount = leaveQ.isLoading || leaveQ.isError ? null : (leaveQ.data?.total_count ?? 0);
  const cashCount = cashQ.isLoading || cashQ.isError ? null : (cashQ.data?.requests?.length ?? 0);
  const roadCount = roadQ.isLoading || roadQ.isError ? null : (roadQ.data?.tickets?.length ?? 0);
  const messagesCount =
    messagesQ.isLoading || messagesQ.isError
      ? null
      : (messagesQ.data?.conversations ?? []).reduce((sum, row) => sum + Number(row.unread_count ?? 0), 0);
  const docAlertCount = docAlertsQ.isLoading || docAlertsQ.isError ? null : (docAlertsQ.data?.pending_count ?? 0);

  const anyQueryError = [leaveQ, cashQ, roadQ, messagesQ, docAlertsQ].some((q) => q.isError);

  const cards: AlertCard[] = [
    {
      title: "Leave requests",
      count: leaveCount,
      isError: leaveQ.isError,
      to: "/driver-hub?tab=leave_requests",
      subtitle: "Schedule / time-off awaiting review",
      testId: "driver-hub-alert-leave",
    },
    {
      title: "Cash advances",
      count: cashCount,
      isError: cashQ.isError,
      to: "/driver-finance/cash-advance-requests",
      subtitle: "Settlements · approve in inbox below",
      testId: "driver-hub-alert-cash-advance",
    },
    {
      title: "Road service",
      count: roadCount,
      isError: roadQ.isError,
      to: "/maintenance/road-service",
      subtitle: "Open roadside tickets needing action",
      testId: "driver-hub-alert-road-service",
    },
    {
      title: "Driver messages",
      count: messagesCount,
      isError: messagesQ.isError,
      to: "/drivers/messages",
      subtitle: "Unread driver communications",
      testId: "driver-hub-alert-messages",
    },
    {
      title: "Document alerts",
      count: docAlertCount,
      isError: docAlertsQ.isError,
      to: "/drivers/alerts",
      subtitle: "Expiring credentials · acknowledgments",
      testId: "driver-hub-alert-documents",
    },
  ];

  return (
    <div className="space-y-4" data-testid="driver-hub-overview">
      <section className="space-y-2" data-testid="driver-hub-request-alerts">
        <div>
          <h2 className="text-sm font-semibold text-[#1A1F36]">Requests &amp; alerts</h2>
          <p className="text-xs text-[#8A92AB]">Live counts from driver scheduler, finance, maintenance, and comms inboxes</p>
        </div>
        {anyQueryError ? (
          <ListErrorBanner
            message="Could not load one or more driver-hub alert counts."
            onRetry={() => {
              void leaveQ.refetch();
              void cashQ.refetch();
              void roadQ.refetch();
              void messagesQ.refetch();
              void docAlertsQ.refetch();
            }}
            data-testid="driver-hub-alerts-error"
          />
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {cards.map((card) => (
            <Link
              key={card.title}
              to={card.to}
              data-testid={card.testId}
              className="rounded-sm border border-[#e5e7eb] bg-white p-3 shadow-xs transition hover:border-slate-300 hover:shadow-sm"
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.25px] text-[#6B7280]">{card.title}</div>
              <div className={`mt-1 text-2xl font-bold tabular-nums ${card.isError ? "text-red-700" : "text-[#1A1F36]"}`}>
                {formatCount(card.count, card.isError)}
              </div>
              <p className="mt-1 text-[11px] text-[#8A92AB]">{card.subtitle}</p>
            </Link>
          ))}
        </div>
      </section>

      <section data-testid="driver-hub-inbox-section">
        <DriverInbox companyId={companyId} canReview={canReview} />
      </section>

      <section className="space-y-2" data-testid="driver-hub-leave-preview">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#1A1F36]">Leave requests queue</h2>
          <Link to="/driver-hub?tab=leave_requests" className="text-xs text-slate-700 hover:underline">
            Open full queue →
          </Link>
        </div>
        <DriverSchedulerRequestInboxPage embedded />
      </section>
    </div>
  );
}
