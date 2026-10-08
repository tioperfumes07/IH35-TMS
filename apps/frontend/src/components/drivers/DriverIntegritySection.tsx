/**
 * C-57 — per-driver integrity profile (tiles already on KPI strip; this is the evidence table).
 * Lines on rows via ParityTable — never vertical column borders.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  countedComplaints,
  getDriverIntegrityProfile,
  integrityComponentLabel,
  integrityStatusLabel,
  type DriverIntegrityComponent,
} from "../../api/driver-integrity";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ListErrorState } from "../ListErrorState";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { EntityLink } from "../shared/EntityLink";
import { MASTER_DETAIL } from "../../design/master-detail";

export function DriverIntegritySection({ driverId }: { driverId: string }) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const q = useQuery({
    queryKey: ["maintenance", "integrity", "driver-profile", companyId, driverId],
    queryFn: () => getDriverIntegrityProfile(companyId, driverId),
    enabled: Boolean(companyId && driverId),
    // 404 = no integrity signal for this driver in the period — honest empty, not an error strip.
    retry: (failureCount, err) => {
      const status = (err as { status?: number } | null)?.status;
      if (status === 404) return false;
      return failureCount < 2;
    },
  });

  const is404 = (q.error as { status?: number } | null)?.status === 404;
  const profile = q.isError && is404 ? null : q.data ?? null;
  const complaints = countedComplaints(profile);

  const columns = useMemo<ParityColumn<DriverIntegrityComponent>[]>(
    () => [
      {
        key: "component",
        label: "Component",
        sortable: true,
        render: (row) => integrityComponentLabel(row.component),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (row) => integrityStatusLabel(row.status),
      },
      {
        key: "arithmetic",
        label: "Arithmetic",
        render: (row) => <span className="text-xs text-[#1F2A44]">{row.arithmetic || "—"}</span>,
      },
      {
        key: "basis",
        label: "Basis",
        render: (row) => <span className="text-xs text-[#4B5563]">{row.basis || "—"}</span>,
      },
      {
        key: "evidence",
        label: "Evidence",
        render: (row) => {
          const n = Array.isArray(row.evidence) ? row.evidence.length : 0;
          return <span className="tabular-nums">{n === 0 ? "—" : String(n)}</span>;
        },
      },
    ],
    []
  );

  return (
    <section
      id="driver-integrity-profile"
      className={`scroll-mt-4 ${MASTER_DETAIL.surfaceClass} p-3`}
      data-testid="driver-integrity-section"
      data-c57-integrity="true"
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold text-[#0F1219]">Integrity profile</h2>
          <p className="text-xs text-[#4B5563]">
            Named components with arithmetic and evidence — no invented weighted score.
          </p>
        </div>
        {profile ? (
          <p className="text-xs text-[#1F2A44]" data-testid="driver-integrity-score-line">
            <span className="tabular-nums font-semibold">{profile.score.findings}</span> findings ·{" "}
            <span className="tabular-nums font-semibold">{profile.score.suspicions}</span> suspicions ·{" "}
            <span className="tabular-nums font-semibold">{complaints}</span> complaints ·{" "}
            <EntityLink
              kind="complaints_driver"
              id={driverId}
              label="Open complaints →"
              className="font-semibold text-[#1F2A44] underline"
            />
          </p>
        ) : null}
      </div>

      {q.isError && !is404 ? (
        <ListErrorState
          title="Couldn't load integrity profile"
          status={0}
          message={(q.error as Error)?.message}
          onRetry={() => void q.refetch()}
        />
      ) : q.isLoading ? (
        <p className="text-xs text-[#6B7280]">Loading integrity…</p>
      ) : !profile ? (
        <p className="text-xs text-[#6B7280]" data-testid="driver-integrity-empty">
          No integrity signals for this driver in the last 30 days.
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-[#4B5563]" data-testid="driver-integrity-arithmetic">
            {profile.score.arithmetic}
          </p>
          <ParityTable
            rows={profile.components}
            columns={columns}
            rowKey={(row) => row.component}
            emptyText="No components."
            storageKey={`driver-integrity-${driverId}`}
            tableTestId="driver-integrity-components-table"
          />
        </>
      )}
    </section>
  );
}
