import { entityLabel } from "../../lib/entity-label";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getUnitFinanceLinkage } from "../../api/unit-finance-linkage";
import { listUnitLinkedFinancials } from "../../api/accounting";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { LinkedBankTransactionsPanel } from "../../components/banking/LinkedBankTransactionsPanel";
import { EntityLink } from "../../components/shared/EntityLink";

type UnitFinanceLinkageTabProps = {
  unitId: string;
  companyId: string;
};

const fmtCents = (c: number) => formatUsdCents(c);
const fmtDate = (s: string | null) => formatDateUS(s) || "—";

export function UnitFinanceLinkageTab({ unitId, companyId }: UnitFinanceLinkageTabProps) {
  const linkageQuery = useQuery({
    queryKey: ["unit-finance-linkage", unitId, companyId],
    queryFn: () => getUnitFinanceLinkage(unitId, companyId),
    enabled: Boolean(unitId && companyId),
  });

  const linkedMoneyQuery = useQuery({
    queryKey: ["unit-linked-financials", unitId, companyId],
    queryFn: () => listUnitLinkedFinancials(unitId, companyId),
    enabled: Boolean(unitId && companyId),
  });

  if (linkageQuery.isError) {
    return <ListErrorBanner onRetry={() => void linkageQuery.refetch()} />;
  }

  if (linkageQuery.isLoading) {
    return <p className="text-sm text-gray-500">Loading loan, lease, and depreciation linkage…</p>;
  }

  const data = linkageQuery.data;
  if (!data) return null;

  const hasAny =
    data.fixed_assets.length > 0 || data.leases.length > 0 || data.equipment_loans.length > 0;
  const linkedBills = linkedMoneyQuery.data?.bills ?? [];
  const linkedExpenses = linkedMoneyQuery.data?.expenses ?? [];

  return (
    <div className="space-y-4" data-testid="unit-finance-linkage-tab">
      <p className="text-xs text-gray-600">
        Read-only drill-through to existing finance surfaces — no new GL posting from this tab.
      </p>

      <LinkedBankTransactionsPanel companyId={companyId} linkage={{ kind: "unit_id", id: unitId }} />

      <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="unit-linked-financials">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Linked Bills / Expenses</h3>
          <Link to={`/accounting/bills?unit_id=${encodeURIComponent(unitId)}`} className="text-xs text-slate-700 hover:underline">
            Open Bills →
          </Link>
        </div>
        {linkedMoneyQuery.isLoading ? (
          <p className="text-sm text-gray-500">Loading bills &amp; expenses for this unit…</p>
        ) : null}
        {linkedMoneyQuery.isError ? (
          <p className="text-sm text-amber-800">Linked-financials lookup unavailable in this backend build.</p>
        ) : null}
        {linkedMoneyQuery.data && linkedBills.length === 0 && linkedExpenses.length === 0 ? (
          <p className="text-sm text-gray-500">
            No bills or expenses stamp <code className="text-xs">unit_id</code> on this unit yet (ACCT-LINK-03 density).
          </p>
        ) : null}
        {linkedBills.length > 0 ? (
          <ul className="mb-2 divide-y divide-gray-100">
            {linkedBills.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
                <EntityLink kind="bill" id={b.id} label={entityLabel(b.bill_number, b.id, "Record")} />
                <span className="flex items-center gap-2 text-xs tabular-nums text-gray-600">
                  {b.journal_entry_id ? <EntityLink kind="journal_entry" id={b.journal_entry_id} label={entityLabel(b.journal_entry_memo, b.journal_entry_id, "Journal entry")} /> : null}
                  {fmtCents(b.amount_cents)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {linkedExpenses.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {linkedExpenses.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
                <EntityLink
                  kind="expense"
                  id={e.id}
                  label={entityLabel(
                    e.memo?.trim() ||
                      (e.transaction_date ? `Expense · ${fmtDate(e.transaction_date)}` : null),
                    e.id,
                    "Expense",
                  )}
                />
                <span className="flex items-center gap-2 text-xs tabular-nums text-gray-600">
                  {e.journal_entry_id ? <EntityLink kind="journal_entry" id={e.journal_entry_id} label={entityLabel(e.journal_entry_memo, e.journal_entry_id, "Journal entry")} /> : null}
                  {fmtCents(e.total_amount_cents)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Fixed assets &amp; depreciation</h3>
          <Link to="/accounting/fixed-assets" className="text-xs text-slate-700 hover:underline">
            Open Fixed Assets register →
          </Link>
        </div>
        {data.fixed_assets.length === 0 ? (
          <p className="text-sm text-gray-500">No fixed-asset register rows linked to this unit.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.fixed_assets.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <EntityLink
                    kind="fixed_asset"
                    id={row.id}
                    label={row.name}
                    className="font-medium text-slate-700 hover:underline"
                  />
                  {row.asset_number ? <span className="text-gray-500"> · #{row.asset_number}</span> : null}
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs capitalize text-slate-700">{row.status}</span>
                </div>
                <div className="text-right text-xs tabular-nums text-gray-700">
                  <div>NBV {fmtCents(row.net_book_value_cents)}</div>
                  <div className="text-gray-500">Depr. to date {fmtCents(row.depreciation_to_date_cents)} · in service {fmtDate(row.in_service_date)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">ASC 842 leases</h3>
          <Link to="/finance/hub" className="text-xs text-slate-700 hover:underline">
            Open Finance Hub →
          </Link>
        </div>
        {data.leases.length === 0 ? (
          <p className="text-sm text-gray-500">No lease contract asset lines linked to this unit.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.leases.map((row) => (
              <li key={`${row.lease_contract_id}-${row.fixed_asset_id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <span className="font-medium">{entityLabel(row.display_id, row.lease_contract_id, "Contract")}</span>
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs capitalize text-slate-700">{row.status}</span>
                  <span className="ml-1 text-xs text-gray-500">({row.election})</span>
                </div>
                <div className="text-right text-xs tabular-nums text-gray-700">
                  <div>{fmtCents(row.allocated_cost_cents)} allocated</div>
                  <div className="text-gray-500">
                    {fmtDate(row.commencement_date)} – {fmtDate(row.end_date)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Equipment loans (CCG / factoring)</h3>
          <Link to="/factoring/equipment-loans" className="text-xs text-slate-700 hover:underline">
            Open Equipment Loans →
          </Link>
        </div>
        {data.equipment_loans.length === 0 ? (
          <p className="text-sm text-gray-500">No equipment loans on trailers currently attached to this unit.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.equipment_loans.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <span className="font-medium">{entityLabel(row.equipment_number, row.equipment_id, "Equipment")}</span>
                  {row.lender_vendor_name ? <span className="text-gray-500"> · {row.lender_vendor_name}</span> : null}
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs capitalize text-slate-700">{row.status}</span>
                </div>
                <div className="text-right text-xs tabular-nums text-gray-700">
                  <div>{fmtCents(row.principal_cents)} @ {row.apr_percent}%</div>
                  <div className="text-gray-500">
                    {fmtDate(row.started_on)} – {fmtDate(row.maturity_on)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!hasAny ? (
        <p className="text-xs text-gray-500">
          Link fixed assets by unit on the register, lease asset lines in ASC 842 posting, or equipment loans on attached trailers.
        </p>
      ) : null}
    </div>
  );
}
