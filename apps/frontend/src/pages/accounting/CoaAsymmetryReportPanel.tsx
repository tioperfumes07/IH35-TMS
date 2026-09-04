import { useQuery } from "@tanstack/react-query";
import { getCoaAsymmetryReport } from "../../api/coaAsymmetryReport";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { ParityTable } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";

type Props = {
  enabled: boolean;
};

export function CoaAsymmetryReportPanel({ enabled }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coa-asymmetry-report"],
    queryFn: getCoaAsymmetryReport,
    enabled,
    staleTime: 60_000,
  });

  if (!enabled) return null;

  return (
    <section
      className="mb-4 rounded-sm border border-slate-200 bg-slate-100 p-4"
      data-testid="coa-asymmetry-report-panel"
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold text-slate-900">Entity CoA asymmetry (read-only)</h2>
        <span className="text-xs font-medium uppercase tracking-wide text-slate-700">Owner-eyes · change nothing</span>
      </div>
      <p className="mb-3 text-xs text-slate-700">
        Grouped diff across TRK / TRANSP / USMCA postable charts. Reserve / holdback / retainage accounts are
        owner-manual only (Rule 19) — this panel does not create, merge, or deactivate any account.
      </p>

      {isError ? <ListErrorBanner onRetry={() => refetch()} /> : null}
      {isLoading ? <p className="text-xs text-slate-600">Loading grouped diff…</p> : null}

      {data ? (
        <div className="space-y-4 text-xs text-slate-800">
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
              TRK postable numbers absent on TRANSP:{" "}
              <span className="font-semibold tabular-nums">{data.diff_summary.trk_postable_absent_on_transp}</span>
            </p>
            <p>
              TRANSP postable numbers absent on TRK:{" "}
              <span className="font-semibold tabular-nums">{data.diff_summary.transp_postable_absent_on_trk}</span>
            </p>
          </div>

          {data.trk_only_postable_by_type.length ? (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                TRK-only postable by account type
              </h3>
              <ul className="grid gap-1 sm:grid-cols-2">
                {data.trk_only_postable_by_type.map((row) => (
                  <li key={row.account_type}>
                    {row.account_type}: <span className="tabular-nums font-medium">{row.trk_only_postable}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {data.sample_trk_only_postable.length ? (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Sample TRK-only postable (first 15)
              </h3>
              <ul className="space-y-1 text-xs">
                {data.sample_trk_only_postable.map((row) => (
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

          <p className="text-xs text-slate-600">{data.disclaimer}</p>
        </div>
      ) : null}
    </section>
  );
}
