import { Link } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";

type AlertCard = { id: string; title: string; description: string; to: string };

const CARDS: AlertCard[] = [
  { id: "accidents", title: "Accidents", description: "Safety accident and incident queue.", to: "/safety/accidents" },
  { id: "cash-advances", title: "Cash advances", description: "Pending cash advance requests.", to: "/driver-finance/cash-advance-requests" },
  { id: "late-arrivals", title: "Late arrivals", description: "Dispatch board — filter by status in product workflows.", to: "/dispatch" },
  { id: "in-transit", title: "In-transit issues", description: "Open maintenance home for in-transit triage workflows.", to: "/maintenance" },
];

export function DispatchAlertsPage() {
  const { selectedCompanyId } = useCompanyContext();

  return (
    <div className="space-y-4">
      <PageHeader title="Dispatch alerts" subtitle={`Operating company: ${selectedCompanyId ?? "—"}`} />
      <p className="text-sm text-gray-600">
        Quick links to operational queues. Tile counts and drawer actions will extend when aggregated alert APIs are available.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {CARDS.map((c) => (
          <Link
            key={c.id}
            to={c.to}
            className="rounded border border-gray-200 bg-white p-4 text-left shadow-sm hover:border-blue-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <p className="text-base font-semibold text-gray-900">{c.title}</p>
            <p className="mt-1 text-sm text-gray-600">{c.description}</p>
            <p className="mt-3 text-sm font-medium text-blue-700">Open queue →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
