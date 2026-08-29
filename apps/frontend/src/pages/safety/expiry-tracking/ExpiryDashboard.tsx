import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../../../api/client";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ListErrorState } from "../../../components/ListErrorState";
import { formatDateUS } from "../../../lib/formatDate";
import { entityLabel } from "../../../lib/entity-label";
import { EntityLink } from "../../../components/shared/EntityLink";
import { userFacingApiError } from "../../../lib/api-error-message";
import { PageHeader } from "../../../components/forms/shared/PageHeader";
import { Combobox } from "../../../components/Combobox";

type CertSeverity = "critical" | "warn" | "info";
type CertType = "cdl" | "medical_card" | "hazmat_endorsement" | "twic" | "passport" | "drug_test";

type CertExpiryAlert = {
  driver_uuid: string;
  driver_name: string;
  cert_type: CertType;
  cert_label: string;
  expiry_date: string;
  days_until_expiry: number;
  severity: CertSeverity;
};

type CertExpiryResponse = {
  alerts: CertExpiryAlert[];
};

type ExpiryDashboardProps = {
  breadcrumbLabel?: "Cert Expiry" | "DOT Compliance";
};

const CERT_OPTIONS: Array<{ value: "all" | CertType; label: string }> = [
  { value: "all", label: "All certs" },
  { value: "cdl", label: "CDL" },
  { value: "medical_card", label: "Medical Card" },
  { value: "hazmat_endorsement", label: "Hazmat Endorsement" },
  { value: "twic", label: "TWIC" },
  { value: "passport", label: "Passport" },
  { value: "drug_test", label: "Drug Test Due" },
];

const SEVERITY_OPTIONS: Array<{ value: "all" | CertSeverity; label: string }> = [
  { value: "all", label: "All severity" },
  { value: "critical", label: "Critical" },
  { value: "warn", label: "Warn" },
  { value: "info", label: "Info" },
];

function severityClassName(severity: CertSeverity) {
  if (severity === "critical") return "bg-red-100 text-red-700";
  if (severity === "warn") return "bg-slate-100 text-slate-700";
  return "bg-slate-100 text-slate-700";
}

function severityWeight(severity: CertSeverity) {
  if (severity === "critical") return 0;
  if (severity === "warn") return 1;
  return 2;
}

export function ExpiryDashboard({ breadcrumbLabel = "Cert Expiry" }: ExpiryDashboardProps = {}) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [certType, setCertType] = useState<"all" | CertType>("all");
  const [severity, setSeverity] = useState<"all" | CertSeverity>("all");

  const alertsQuery = useQuery({
    queryKey: ["safety", "cert-expiry", companyId],
    enabled: Boolean(companyId),
    queryFn: () =>
      apiRequest<CertExpiryResponse>(`/api/safety/cert-expiry/all?operating_company_id=${encodeURIComponent(companyId)}`).then(
        (payload) => payload.alerts
      ),
  });

  const rows = alertsQuery.data ?? [];
  const filteredRows = useMemo(
    () =>
      rows
        .filter((row) => (certType === "all" ? true : row.cert_type === certType))
        .filter((row) => (severity === "all" ? true : row.severity === severity))
        .sort((a, b) => {
          const sev = severityWeight(a.severity) - severityWeight(b.severity);
          if (sev !== 0) return sev;
          const day = a.days_until_expiry - b.days_until_expiry;
          if (day !== 0) return day;
          return a.driver_name.localeCompare(b.driver_name);
        }),
    [rows, certType, severity]
  );

  const columns = useMemo<Array<ParityColumn<CertExpiryAlert>>>(
    () => [
      {
        key: "driver_name",
        label: "Driver",
        sortable: true,
        render: (row) => (
          <EntityLink
            kind="driver"
            id={row.driver_uuid}
            label={entityLabel(row.driver_name, row.driver_uuid, "Driver")}
          />
        ),
      },
      { key: "cert_label", label: "Certificate", sortable: true, render: (row) => row.cert_label },
      { key: "expiry_date", label: "Expiry", sortable: true, render: (row) => formatDateUS(row.expiry_date) },
      { key: "days_until_expiry", label: "Days", sortable: true, render: (row) => row.days_until_expiry },
      {
        key: "severity",
        label: "Severity",
        sortable: true,
        render: (row) => (
          <span className={`rounded-sm px-2 py-0.5 text-[11px] font-semibold ${severityClassName(row.severity)}`}>{row.severity}</span>
        ),
      },
    ],
    [],
  );

  if (!companyId) {
    return <div className="rounded-sm border border-slate-200 bg-white p-4 text-xs text-slate-600">Select an operating company.</div>;
  }

  return (
    <section className="space-y-3 rounded-sm border border-slate-200 bg-white p-4">
      {/* UI-BACK-BUTTON-MISSING-ENTIRELY: see TrainingProgramsPage.tsx sibling comment. */}
      <PageHeader
        title="Certificate Expiry Dashboard"
        subtitle="Track CDL, medical card, hazmat, TWIC, passport, and drug test due dates."
        breadcrumb={[{ label: "Safety" }, { label: breadcrumbLabel }]}
        backHref="/safety"
        actions={
          <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
            Open {alertsQuery.isError ? "—" : filteredRows.length}
          </span>
        }
      />

      {alertsQuery.isError ? (
        <div data-testid="cert-expiry-query-error">
          <ListErrorState
            title="Couldn't load certificate expiries"
            status={alertsQuery.error instanceof ApiError ? alertsQuery.error.status : 0}
            message={userFacingApiError(alertsQuery.error, "Couldn't load certificate expiries.")}
            onRetry={() => void alertsQuery.refetch()}
          />
        </div>
      ) : (
        <ParityTable<CertExpiryAlert>
          columns={columns}
          rows={filteredRows}
          rowKey={(row) => `${row.driver_uuid}:${row.cert_type}:${row.expiry_date}`}
          loading={alertsQuery.isLoading}
          emptyText="No expiring certificates in the selected filters."
          storageKey="safety-cert-expiry"
          exportFilename="cert-expiry"
          filterBar={
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="flex items-center gap-1">
                <span className="text-slate-500">Cert:</span>
                <label htmlFor="cert-expiry-cert-type" className="sr-only">Certificate type</label>
                <Combobox
                  id="cert-expiry-cert-type"
                  dataTestId="cert-expiry-cert-type"
                  value={certType}
                  options={CERT_OPTIONS}
                  onChange={(next) => setCertType(next as "all" | CertType)}
                  className="min-w-36"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-slate-500">Severity:</span>
                <label htmlFor="cert-expiry-severity" className="sr-only">Severity</label>
                <Combobox
                  id="cert-expiry-severity"
                  dataTestId="cert-expiry-severity"
                  value={severity}
                  options={SEVERITY_OPTIONS}
                  onChange={(next) => setSeverity(next as "all" | CertSeverity)}
                  className="min-w-32"
                />
              </div>
            </div>
          }
        />
      )}
    </section>
  );
}
