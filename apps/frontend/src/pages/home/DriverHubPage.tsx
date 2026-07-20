import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { SecondaryNavTabs } from "../../components/shared/SecondaryNavTabs";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { DriverInbox } from "../../components/driver-inbox/DriverInbox";
import { DriverSchedulerGridPage } from "../safety/driver-scheduler/DriverSchedulerGridPage";
import { DriverSchedulerRequestInboxPage } from "../safety/driver-scheduler/DriverSchedulerRequestInboxPage";

// Office roles that may review/approve driver requests (matches the backend
// canReviewCashAdvanceRequest gate: Owner/Administrator/Manager/Accountant/Dispatcher).
const REVIEW_ROLES = ["Owner", "Administrator", "Manager", "Accountant", "Dispatcher"];

const HUB_TAB_IDS = ["overview", "scheduler", "leave_requests"] as const;
type HubTab = (typeof HUB_TAB_IDS)[number];

const TABS: { id: HubTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "scheduler", label: "Driver Scheduler" },
  { id: "leave_requests", label: "Leave Requests" },
];

function parseHubTab(searchParams: URLSearchParams): HubTab {
  const raw = searchParams.get("tab");
  return (HUB_TAB_IDS as readonly string[]).includes(raw ?? "") ? (raw as HubTab) : "overview";
}

export function DriverHubPage() {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const companyId = selectedCompanyId ?? "";
  const canReview = REVIEW_ROLES.includes(String(user?.role ?? ""));
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = useMemo(() => parseHubTab(searchParams), [searchParams]);

  const setTab = (next: HubTab) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "overview") p.delete("tab");
        else p.set("tab", next);
        return p;
      },
      { replace: true },
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Driver Hub"
        subtitle="Driver overview, scheduling, and leave"
        actions={
          canReview ? (
            <Link
              to="/driver-hub/reporting"
              className="rounded-sm border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Reporting
            </Link>
          ) : undefined
        }
      />
      <SecondaryNavTabs
        tabs={TABS}
        activeId={tab}
        onChange={(id) => {
          if ((HUB_TAB_IDS as readonly string[]).includes(id)) setTab(id as HubTab);
        }}
      />
      {/* Reuse the existing Safety Driver Scheduler + Leave Requests components (no rebuild). */}
      {tab === "overview" && <DriverInbox companyId={companyId} canReview={canReview} />}
      {tab === "scheduler" && <DriverSchedulerGridPage />}
      {tab === "leave_requests" && <DriverSchedulerRequestInboxPage />}
    </div>
  );
}
