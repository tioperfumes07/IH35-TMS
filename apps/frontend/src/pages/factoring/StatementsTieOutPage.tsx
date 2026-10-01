/**
 * R313 Cursor item 2 — /factoring/statements tie-out chrome for CC-2 FACT-TIEOUT-01 engine.
 * Chrome only: upload + match grid + unmatched strip. Engine (parse/auto-match) is CC-2.
 * Does not invent statement rows — honest empty until CC-2 wires factor.faro_statement_lines.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { Button } from "../../components/Button";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { listFactoringAdvances } from "../../api/accounting";
import { entityLabel } from "../../lib/entity-label";
import { formatUsdCents } from "../../lib/money";
import { formatDateUS } from "../../lib/formatDate";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { FACTORING_TAB_PATH } from "../../router/route-manifest";

/** Locked section header — GLOBAL-TYPE-SIZE-BASELINE via .text-section-header (11px), no raw text-[Npx]. */
const SECTION_HEADER_CLASS = "text-section-header font-bold uppercase tracking-wide text-[#4B5563]";

type TieOutStubRow = {
  id: string;
  line_kind: string;
  statement_ref: string;
  amount_cents: number;
  match_state: "unmatched" | "matched" | "amount_mismatch";
  factoring_advance_id: string | null;
  bank_transaction_id: string | null;
};

export function StatementsTieOutPage() {
  const { selectedCompanyId } = useCompanyContext();
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);

  const advancesQuery = useQuery({
    queryKey: ["factoring", "statements-tieout-advances", selectedCompanyId],
    queryFn: () => listFactoringAdvances(selectedCompanyId!, { status: "active", limit: 100 }),
    enabled: Boolean(selectedCompanyId),
  });

  // Chrome shell: no statement lines until CC-2 engine posts factor.faro_statement_lines.
  const statementRows = useMemo<TieOutStubRow[]>(() => [], []);

  const columns = useMemo<Array<ParityColumn<TieOutStubRow>>>(
    () => [
      { key: "line_kind", label: "Line", sortable: true },
      { key: "statement_ref", label: "Statement ref", sortable: true },
      {
        key: "amount_cents",
        label: "Amount",
        sortable: true,
        cellClass: "text-right",
        render: (row) => formatUsdCents(row.amount_cents),
      },
      {
        key: "match_state",
        label: "Match",
        sortable: true,
        render: (row) => (
          <span className={row.match_state === "matched" ? "text-slate-700" : "font-semibold text-red-700"}>
            {row.match_state.replaceAll("_", " ")}
          </span>
        ),
      },
      {
        key: "factoring_advance_id",
        label: "Advance",
        render: (row) =>
          row.factoring_advance_id ? (
            <EntityLink kind="factoring_advance" id={row.factoring_advance_id} label={entityLabel(null, row.factoring_advance_id, "Advance")} />
          ) : (
            "—"
          ),
      },
      {
        key: "bank_transaction_id",
        label: "Bank wire",
        render: (row) =>
          row.bank_transaction_id ? (
            <EntityLink kind="bank_transaction" id={row.bank_transaction_id} label={entityLabel(null, row.bank_transaction_id, "Bank")} />
          ) : (
            "—"
          ),
      },
    ],
    [],
  );

  const unmatchedCount = statementRows.filter((r) => r.match_state !== "matched").length;

  return (
    <div className="space-y-3" data-testid="factoring-statements-tieout-page">
      <NavyPageSubNav
        items={[
          { label: "Account Summary", to: FACTORING_TAB_PATH.account_summary },
          { label: "Advances", to: FACTORING_TAB_PATH.advances },
          { label: "Aging", to: FACTORING_TAB_PATH.aging },
          { label: "Reserve", to: FACTORING_TAB_PATH.reserve },
          { label: "Chargebacks", to: FACTORING_TAB_PATH.chargebacks_overpayments },
          { label: "Statements", to: "/factoring/statements" },
          { label: "Settings", to: FACTORING_TAB_PATH.statements_settings },
        ]}
      />

      <PageHeader
        title="Factoring statement tie-out"
        subtitle="Upload Faro statement (PDF/CSV) → parse purchase / reserve / fee / wire / chargeback lines → auto-match advances + bank wires → red unmatched with reason. Engine: CC-2 FACT-TIEOUT-01."
        breadcrumb={[
          { label: "Factoring", href: "/factoring" },
          { label: "Statements" },
        ]}
      />

      <div className="rounded-sm border border-[#E5E7EB] bg-white p-3" data-testid="factoring-statements-upload-chrome">
        <div className={SECTION_HEADER_CLASS}>Upload statement</div>
        <p className="mt-1 text-xs text-gray-600">
          Chrome ready for CC-2. Selecting a file records the name only — parse + persist waits on{" "}
          <code className="text-xs">factor.faro_statement_lines</code> (CC-2). Never auto-creates money rows.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="inline-flex h-7 cursor-pointer items-center rounded-sm border border-[#E5E7EB] bg-white px-2 text-xs font-medium text-[#0F1219] hover:bg-slate-50">
            Choose PDF / CSV
            <input
              type="file"
              accept=".pdf,.csv,text/csv,application/pdf"
              className="sr-only"
              data-testid="factoring-statements-file-input"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFileName(f?.name ?? null);
                setUploadNote(
                  f
                    ? `File selected: ${f.name}. Waiting on CC-2 FACT-TIEOUT-01 engine — no statement lines written.`
                    : null,
                );
              }}
            />
          </label>
          {fileName ? <span className="text-xs text-gray-700">{fileName}</span> : null}
          <Button
            size="sm"
            variant="secondary"
            disabled={!fileName}
            data-testid="factoring-statements-upload-queued"
            onClick={() =>
              setUploadNote(
                fileName
                  ? `Queued for CC-2 engine: ${fileName}. No plug — unmatched lines stay red when the engine lands.`
                  : null,
              )
            }
          >
            Queue for engine
          </Button>
          <Link to="/accounting/factor-reconciliation" className="text-xs font-medium text-slate-700 hover:underline">
            Legacy daily import recon →
          </Link>
        </div>
        {uploadNote ? (
          <p className="mt-2 text-xs text-slate-700" data-testid="factoring-statements-upload-note">
            {uploadNote}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-3" data-testid="factoring-statements-kpi-strip">
        <div className="rounded-sm border border-[#E5E7EB] bg-white px-2 py-1 text-center">
          <div className={SECTION_HEADER_CLASS}>Statement lines</div>
          <div className="text-xs font-semibold text-[#0F1219]">{statementRows.length}</div>
        </div>
        <div className="rounded-sm border border-[#E5E7EB] bg-white px-2 py-1 text-center">
          <div className={SECTION_HEADER_CLASS}>Unmatched (red)</div>
          <div className={`text-xs font-semibold ${unmatchedCount > 0 ? "text-red-700" : "text-[#0F1219]"}`}>{unmatchedCount}</div>
        </div>
        <div className="rounded-sm border border-[#E5E7EB] bg-white px-2 py-1 text-center">
          <div className={SECTION_HEADER_CLASS}>Live advances (match pool)</div>
          <div className="text-xs font-semibold text-[#0F1219]">{advancesQuery.data?.rows?.length ?? (advancesQuery.isLoading ? "…" : 0)}</div>
        </div>
      </div>

      <div className="rounded-sm border border-[#E5E7EB] bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className={SECTION_HEADER_CLASS}>Tie-out grid</div>
          <span className="text-xs text-gray-500">Diff drill: click Advance / Bank wire when matched</span>
        </div>
        <ParityTable
          columns={columns}
          rows={statementRows}
          rowKey={(row) => row.id}
          emptyText="No statement lines yet — honest empty until CC-2 FACT-TIEOUT-01 writes factor.faro_statement_lines for 08-10..08-28 (face/reserve/fee/wire/chargeback)."
          storageKey="factoring-statements-tieout"
          tableTestId="factoring-statements-tieout-table"
          density="compact"
        />
      </div>

      <div className="rounded-sm border border-[#E5E7EB] bg-white p-3" data-testid="factoring-statements-advance-pool">
        <div className={`mb-2 ${SECTION_HEADER_CLASS}`}>
          Match pool — live advances (read-only)
        </div>
        {(advancesQuery.data?.rows ?? []).length === 0 ? (
          <p className="text-xs text-gray-500">No active advances in pool.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {(advancesQuery.data?.rows ?? []).slice(0, 25).map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-2 border-b border-[#E5E7EB] py-1 last:border-0">
                <EntityLink kind="factoring_advance" id={row.id} label={entityLabel(row.display_id, row.id, "Advance")} />
                <span className="text-gray-600">{row.factoring_company_name}</span>
                <span className="tabular-nums">{formatUsdCents(row.advance_amount_cents)}</span>
                <span className="text-gray-500">{formatDateUS(row.submitted_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
