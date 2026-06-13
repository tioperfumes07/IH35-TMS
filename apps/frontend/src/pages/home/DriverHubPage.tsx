import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { DriverInbox } from "../../components/driver-inbox/DriverInbox";

// Office roles that may review/approve driver requests (matches the backend
// canReviewCashAdvanceRequest gate: Owner/Administrator/Manager/Accountant/Dispatcher).
const REVIEW_ROLES = ["Owner", "Administrator", "Manager", "Accountant", "Dispatcher"];

export function DriverHubPage() {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const companyId = selectedCompanyId ?? "";
  const canReview = REVIEW_ROLES.includes(String(user?.role ?? ""));

  return (
    <div className="space-y-6">
      <PageHeader title="Driver Hub" subtitle="Driver overview and quick actions" />
      {/* B6: the Driver Inbox replaces the thin Requests section. "Approve & post" runs the B5 cascade. */}
      <DriverInbox companyId={companyId} canReview={canReview} />
    </div>
  );
}
