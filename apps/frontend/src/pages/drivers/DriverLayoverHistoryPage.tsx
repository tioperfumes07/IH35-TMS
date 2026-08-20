import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { getDriver } from "../../api/mdata";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { DriverLayoverHistory } from "./DriverLayoverHistory";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";

// Route target for the "View history" button on the driver profile Layovers card
// (/dispatch/layovers/driver/:driverId). Wraps the DriverLayoverHistory panel with the
// standard module header + company/driver context so the button lands on a real page
// instead of dead-ending to Home.
export function DriverLayoverHistoryPage() {
  const { driverId = "" } = useParams();
  const { selectedCompanyId, companies } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? companies[0]?.id ?? "";

  const driverQuery = useQuery({
    queryKey: ["driver", driverId, operatingCompanyId, "layover-history-header"],
    queryFn: () => getDriver(driverId, operatingCompanyId),
    enabled: Boolean(driverId && operatingCompanyId),
  });
  const driverName = driverQuery.data
    ? [driverQuery.data.first_name, driverQuery.data.last_name].filter(Boolean).join(" ").trim() || null
    : null;

  return (
    <div className="space-y-3">
      <PageHeader
        breadcrumb={["Drivers", "Layovers"]}
        title="Driver Layover History"
        subtitle={
          driverQuery.data
            ? `${driverQuery.data.first_name} ${driverQuery.data.last_name}`
            : "Layovers, billable time and per-diem eligibility"
        }
        actions={
          driverId ? (
            <EntityLinkOrTombstone
              kind="driver"
              id={driverId}
              name={driverName}
              noun="Driver"
              className="rounded-sm border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700"
            />
          ) : null
        }
      />

      {!operatingCompanyId ? (
        <div className="rounded-sm border border-slate-200 bg-slate-100 p-3 text-sm text-slate-700">
          Select an operating company to view layovers.
        </div>
      ) : !driverId ? (
        <div className="rounded-sm border border-slate-200 bg-slate-100 p-3 text-sm text-slate-700">
          No driver selected.
        </div>
      ) : (
        <section className="rounded-sm border border-gray-200 bg-white p-3">
          <DriverLayoverHistory driverUuid={driverId} operatingCompanyId={operatingCompanyId} />
        </section>
      )}
    </div>
  );
}

export default DriverLayoverHistoryPage;
