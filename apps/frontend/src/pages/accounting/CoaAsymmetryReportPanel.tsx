import { useQuery } from "@tanstack/react-query";
import { getCoaAsymmetryReport } from "../../api/coaAsymmetryReport";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { ParityTable } from "../../components/parity/ParityTable";
import { InfoPopover } from "../../components/shared/InfoPopover";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";

type Props = {
  enabled: boolean;
  operatingCompanyId: string;
};

export function CoaAsymmetryReportPanel({ enabled, operatingCompanyId }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coa-asymmetry-report", operatingCompanyId],
    queryFn: () => getCoaAsymmetryReport(operatingCompanyId),
    enabled: enabled && Boolean(operatingCompanyId),
    staleTime: 60_000,
  });

  if (!enabled) return null;

  return (
    <section
      className="mb-4 rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] p-4"
      data-testid="coa-asymmetry-report-panel"
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-1 text-xs font-semibold text-[#0F1219]">
          Frozen-entity CoA asymmetry (read-only)
          <InfoPopover label="About the CoA asymmetry report">
            Active entity postable chart vs frozen-entity pool (TRK / TRANSP). Shows accounts unique to the active
            entity and accounts present on frozen entities that the active entity is missing. Read-only — no account is
            created, merged, or deactivated (Rule 19).
          </InfoPopover>
        </h2>
        <span className="text-xs font-medium uppercase tracking-wide text-[#1F2A44]">Owner-eyes · change nothing</span>
      </div>

      {isError ? <ListErrorBanner onRetry={() => refetch()} /> : null}
      {isLoading ? <p className="text-xs text-[#4B5563]">Loading grouped diff…</p> : null}

      {data ? (
        <div className="space-y-4 text-xs text-[#1F2A44]">
          {/* ACCT-F3574: ParityTable owns Search+Range+gear on postable-by-entity summary leaf. */}
          <ParityTable<(typeof data.postable_by_entity)[number]>
            rows={data.postable_by_entity}
            rowKey={(r) => r.entity_code}
            storageKey="coa-asymmetry-postable-by-entity"
            exportFilename="coa-asymmetry-postable-by-entity"
            tableTestId="coa-asymmetry-postable-by-entity-table"
            emptyText="No entity postable counts to display."
            columns={[
              { key: "entity_code", label: "Entity", render: (r) => <span className="font-medium">{r.entity_code}</span> },
              {
                key: "postable",
                label: "Postable",
                className: "text-right",
                cellClass: "text-right tabular-nums",
                render: (r) => r.postable,
              },
              {
                key: "total_active",
                label: "Active total",
                className: "text-right",
                cellClass: "text-right tabular-nums",
                render: (r) => r.total_active,
              },
            ]}
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <p>
              Active-entity-only postable:{" "}
              <span className="font-semibold tabular-nums">{data.diff_summary.active_only_postable}</span>
            </p>
            <p>
              Frozen-entity postable absent on active:{" "}
              <span className="font-semibold tabular-nums">{data.diff_summary.frozen_absent_on_active}</span>
            </p>
          </div>

          {data.active_only_by_type.length ? (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#4B5563]">
                Active-entity-only postable by account type
              </h3>
              <ul className="grid gap-1 sm:grid-cols-2">
                {data.active_only_by_type.map((row) => (
                  <li key={row.account_type}>
                    {row.account_type}: <span className="tabular-nums font-medium">{row.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {data.sample_active_only.length ? (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#4B5563]">
                Active-entity-only postable accounts (first 20)
              </h3>
              <ul className="space-y-1 text-xs">
                {data.sample_active_only.map((row) => (
                  <li key={row.account_id}>
                    <span className="font-mono">{row.account_number}</span> ·{" "}
                    <EntityLink
                      kind="account"
                      id={row.account_id}
                      label={entityLabel(row.account_name, row.account_id, "Account")}
                      data-testid="coa-asymmetry-account-link"
                    />{" "}
                    · {row.account_type}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-xs text-[#4B5563]">{data.disclaimer}</p>
        </div>
      ) : null}
    </section>
  );
}
