/**
 * LEAD 10-25 FINAL-4 — the Faro debtor record (READ-ONLY).
 *
 * A Faro debtor is a name on the factor's daily statements; it has no row of its own, so the route carries the name.
 * Every statement line for that name is listed, and the total is computed by the server with the same expression the
 * possible-duplicates panel shows — so the figure that opened this page is the figure at the top of it.
 */
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ApiError, apiRequest } from "../../api/client";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCentsTable } from "../../lib/money";

type FaroDebtorLine = {
  import_id: string;
  statement_date: string | null;
  statement_reference: string | null;
  invoice_number: string | null;
  load_id: string | null;
  due_on: string | null;
  gross_amount_cents: number;
  advance_amount_cents: number | null;
  net_amount_cents: number | null;
};
type FaroDebtorRecord = { name: string; lines: FaroDebtorLine[]; totals: { lines: number; gross_amount_cents: number } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUMNS: Array<ParityColumn<FaroDebtorLine>> = [
  { key: "statement_date", label: "Statement", minWidth: 96, sortValue: (l) => l.statement_date ?? "", render: (l) => <span className="tabular-nums">{l.statement_date ? formatDateUS(l.statement_date) : "—"}</span> },
  { key: "statement_reference", label: "Reference", render: (l) => <span>{l.statement_reference ?? "—"}</span> },
  { key: "invoice_number", label: "Invoice", render: (l) => <span>{l.invoice_number ?? "—"}</span> },
  {
    key: "load_id", label: "Load",
    render: (l) => (l.load_id && UUID.test(l.load_id) ? <EntityLink kind="load" id={l.load_id} label="Open load" /> : <span>{l.load_id ?? "—"}</span>),
  },
  { key: "due_on", label: "Due", minWidth: 96, render: (l) => <span className="tabular-nums">{l.due_on ? formatDateUS(l.due_on) : "—"}</span> },
  { key: "gross_amount_cents", label: "Gross", kind: "money", sortValue: (l) => l.gross_amount_cents, render: (l) => <span className="tabular-nums">{formatUsdCentsTable(l.gross_amount_cents)}</span> },
  { key: "advance_amount_cents", label: "Advance", kind: "money", render: (l) => <span className="tabular-nums">{formatUsdCentsTable(l.advance_amount_cents)}</span> },
  { key: "net_amount_cents", label: "Net", kind: "money", render: (l) => <span className="tabular-nums">{formatUsdCentsTable(l.net_amount_cents)}</span> },
];

export function FaroDebtorRecordPage() {
  const { name = "" } = useParams<{ name: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const q = useQuery({
    queryKey: ["faro-debtor-record", selectedCompanyId, name],
    queryFn: () =>
      apiRequest<FaroDebtorRecord>(
        `/api/v1/factoring/faro-debtors/record?operating_company_id=${selectedCompanyId}&name=${encodeURIComponent(name)}`
      ),
    enabled: Boolean(selectedCompanyId && name),
  });
  if (q.isError) {
    return <ListErrorState status={q.error instanceof ApiError ? q.error.status : 0} message="Could not load this Faro debtor." onRetry={() => void q.refetch()} />;
  }
  const r = q.data;
  return (
    <div className="space-y-3 p-4 text-xs" data-testid="faro-debtor-record">
      <div>
        <Link className="text-[#1F2A44] underline" to="/factoring">Factoring</Link> <span className="text-gray-500">› Faro debtor</span>
      </div>
      <div>
        <h1 className="text-base font-semibold text-[#0F1B2D]">{name || "—"}</h1>
        <p className="text-gray-600" data-testid="faro-debtor-totals">
          {r ? `${r.totals.lines} Faro statement lines · ${formatUsdCentsTable(r.totals.gross_amount_cents)} gross` : "Loading…"}
        </p>
        <p className="text-gray-500">Read-only: lines as the factor reported them on its daily statements.</p>
      </div>
      <ParityTable<FaroDebtorLine>
        appearance="board"
        storageKey="faro-debtor-lines"
        tableTestId="faro-debtor-lines"
        columns={COLUMNS}
        rows={r?.lines ?? []}
        rowKey={(l) => `${l.import_id}:${l.invoice_number ?? ""}:${l.gross_amount_cents}`}
        loading={!r}
        emptyText="No Faro statement line carries this debtor name."
        suppressToolbarSearch
        suppressToolbarRange
        initialPageSize={100}
      />
    </div>
  );
}
