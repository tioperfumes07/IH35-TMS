import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { getDriver } from "../../api/mdata";
import { listDriverQualificationItems } from "../../api/safety";
import { KpiCard } from "../../components/layout/KpiCard";
import { KpiStrip } from "../../components/layout/KpiStrip";
import { PageHeader } from "../../components/layout/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { colors } from "../../design/tokens";
import { driverDisplayName, summarizeDriverDqf } from "../../lib/driverDqf";
import { DriverDqfComplianceChip } from "./components/DriverDqfComplianceChip";
import { DriverDqfPanel } from "./components/DriverDqfPanel";

type DriverProfilePageProps = {
  driverId?: string;
  onBack?: () => void;
};

export function DriverProfilePage({ driverId: driverIdProp, onBack }: DriverProfilePageProps = {}) {
  const { id: routeId = "" } = useParams();
  const id = driverIdProp ?? routeId;
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const driverQ = useQuery({
    queryKey: ["driver", id],
    enabled: Boolean(id),
    queryFn: () => getDriver(id),
  });

  const itemsQ = useQuery({
    queryKey: ["safety", "driver-dqf", companyId, id],
    enabled: Boolean(companyId && id),
    queryFn: () => listDriverQualificationItems(id, companyId).then((result) => result.items),
  });

  const summary = summarizeDriverDqf(itemsQ.data);
  const driver = driverQ.data;

  if (!companyId) {
    return <div className="rounded border border-gray-200 bg-white p-4 text-sm text-slate-600">Select an operating company.</div>;
  }

  if (driverQ.isLoading) {
    return <div className="rounded border border-gray-200 bg-white p-4 text-sm text-slate-600">Loading driver profile…</div>;
  }

  if (!driver) {
    return (
      <div className="space-y-2 rounded border border-gray-200 bg-white p-4 text-sm text-slate-600">
        <p>Driver not found.</p>
        {onBack ? (
          <button type="button" onClick={onBack} className="text-xs font-semibold text-sky-700 hover:underline">
            Back to driver list
          </button>
        ) : (
          <Link to="/drivers?subtab=profiles" className="text-xs font-semibold text-sky-700 hover:underline">
            Back to DQF profiles
          </Link>
        )}
      </div>
    );
  }

  const displayName = driverDisplayName(driver.first_name, driver.last_name, driver.id);

  return (
    <div className="space-y-4">
      <PageHeader
        title={displayName}
        subtitle="Driver qualification file (DQF) profile"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <DriverDqfComplianceChip summary={summary} />
            <StatusBadge status={driver.status} />
            <Link to={`/drivers/${driver.id}`} className="text-xs font-semibold text-sky-700 hover:underline">
              Open full driver record
            </Link>
            {onBack ? (
              <button type="button" onClick={onBack} className="text-xs font-semibold text-slate-600 hover:underline">
                Back to list
              </button>
            ) : (
              <Link to="/drivers?subtab=profiles" className="text-xs font-semibold text-slate-600 hover:underline">
                All profiles
              </Link>
            )}
          </div>
        }
      />

      <KpiStrip>
        <KpiCard label="Checklist items" number={String(summary.itemCount)} accent={colors.drivers.strong} />
        <KpiCard label="Present" number={String(summary.presentCount)} accent={colors.positive.strong} />
        <KpiCard label="Missing" number={String(summary.missingCount)} accent={colors.warn.strong} />
        <KpiCard label="Expired" number={String(summary.expiredCount)} accent={colors.crit.strong} />
        <KpiCard
          label="Expiry alerts"
          number={`${summary.redExpiryCount} red · ${summary.amberExpiryCount} amber`}
          accent={colors.info.strong}
        />
      </KpiStrip>

      <section className="rounded border border-gray-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Compliance summary</h2>
        <p className="mb-3 text-xs text-slate-600">
          Profile readiness combines master-data credentials with DQF checklist rows from the Block 01 driver-qualification API.
          File status: <span className="font-medium text-slate-800">{summary.label}</span>.
        </p>
        <div className="mb-3">
          <DriverDqfComplianceChip summary={summary} />
        </div>
        <div className="grid gap-2 text-xs text-slate-700 md:grid-cols-3">
          <div className="rounded border border-gray-100 bg-gray-50 px-3 py-2">
            <div className="font-semibold text-slate-800">CDL</div>
            <div>{driver.cdl_number ?? "—"} · {driver.cdl_state ?? "—"}</div>
            <div>Expires {driver.cdl_expires_at ?? "—"}</div>
          </div>
          <div className="rounded border border-gray-100 bg-gray-50 px-3 py-2">
            <div className="font-semibold text-slate-800">Medical card</div>
            <div>Expires {driver.dot_medical_expires_at ?? "—"}</div>
          </div>
          <div className="rounded border border-gray-100 bg-gray-50 px-3 py-2">
            <div className="font-semibold text-slate-800">Contact</div>
            <div>{driver.phone ?? "—"}</div>
            <div>{driver.email ?? "—"}</div>
          </div>
        </div>
      </section>

      <section className="rounded border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">DQF checklist</h2>
        <DriverDqfPanel companyId={companyId} driverId={id} editable />
      </section>
    </div>
  );
}
