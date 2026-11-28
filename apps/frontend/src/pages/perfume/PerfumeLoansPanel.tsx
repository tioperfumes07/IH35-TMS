/**
 * TIO Perfumes · Books · Loans & notes payable — ROUND L.31 M13 (owner 2026-11-27 19:38 CT "LIABILITIES … ALL FULLY COMPLETELY DONE").
 * ScentsX LLC's liabilities that are loans: money the owner lent the company (2400 Loans from Owner) and notes payable to a bank or
 * other lender (2500 Notes Payable). One running loan per lender (the facility), each with a loan document, on the ONE related-party
 * loan engine (LoanApplicationWizard → POST /api/v1/accounting/related-party-loans, existing poster — no GL math here). Owner rule:
 * a loan always creates its loan document, one running loan per person, 4% default. QuickBooks-style pop-up.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { ListErrorState } from "../../components/ListErrorState";
import { formatUsdCents } from "../../lib/money";
import { listRelatedPartyLoanFacilities, type RelatedPartyLoanFacilityRow } from "../../api/related-party-loans";
import { getScentsxCompany } from "../../api/scentsx";
import { LoanApplicationWizard, type LoanApplicationPrefill } from "../accounting/loans/LoanApplicationWizard";
import { tr } from "./perfumeI18n";
import { DASH, usDate } from "./perfumeDocParts";

const todayCT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
type Open = { kind: "owner" } | { kind: "note" } | { kind: "repay"; f: RelatedPartyLoanFacilityRow };

export function PerfumeLoansPanel() {
  const co = useQuery({ queryKey: ["scentsx", "company"], queryFn: getScentsxCompany });
  const id = co.data?.company.id ?? "";
  const list = useQuery({ queryKey: ["scentsx", "loan-facilities", id], queryFn: () => listRelatedPartyLoanFacilities(id), enabled: Boolean(id) });
  const [open, setOpen] = useState<Open | null>(null);
  const rows = list.data?.facilities ?? [];
  // Held per opening (not rebuilt each render) so a background refetch never resets the wizard mid-entry.
  const prefill = useMemo<LoanApplicationPrefill | null>(() => {
    if (!open) return null;
    if (open.kind === "owner") return { direction: "in", relationship: "owner", counterparty_kind: "user", account_number: "2400", interest_rate_pct: "4.00", entry_date: todayCT() };
    if (open.kind === "note") return { direction: "in", relationship: "other", counterparty_kind: "other", account_number: "2500", interest_rate_pct: "4.00", entry_date: todayCT() };
    return { direction: "out", target_type: "repayment", account_id: open.f.account_id, counterparty_name: open.f.counterparty_name ?? "", entry_date: todayCT() };
  }, [open]);
  const sum = (k: keyof RelatedPartyLoanFacilityRow) => rows.reduce((s, f) => s + Number(f[k] ?? 0), 0);
  if (co.isError) return <ListErrorState title={tr("scentsx.ln.co_error", "Couldn't load ScentsX")} status={0} message={(co.error as Error)?.message} onRetry={() => void co.refetch()} />;
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-loans-panel" aria-label={tr("scentsx.ln.title", "Loans & notes payable")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-card-title">{tr("scentsx.ln.title", "Loans & notes payable")} · {co.data?.company.legal_name ?? "ScentsX"}</div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!id} onClick={() => setOpen({ kind: "owner" })} data-testid="scentsx-ln-owner">{tr("scentsx.ln.owner", "+ Loan from owner (2400)")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={!id} onClick={() => setOpen({ kind: "note" })} data-testid="scentsx-ln-note">{tr("scentsx.ln.note", "+ Note payable — bank / lender (2500)")}</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-[10px] md:grid-cols-4">
        <KpiCard label={tr("scentsx.ln.kpi_n", "Running loans")} number={String(rows.length)} disabled />
        <KpiCard label={tr("scentsx.ln.kpi_adv", "Borrowed")} number={formatUsdCents(sum("principal_advanced_cents"))} disabled />
        <KpiCard label={tr("scentsx.ln.kpi_rep", "Repaid")} number={formatUsdCents(sum("principal_repaid_cents"))} disabled />
        <KpiCard label={tr("scentsx.ln.kpi_open", "Owed now")} number={formatUsdCents(sum("open_balance_cents"))} disabled />
      </div>
      {list.isError ? <ListErrorState title={tr("scentsx.ln.error", "Couldn't load the loans")} status={0} message={(list.error as Error)?.message} onRetry={() => void list.refetch()} /> : (
        <ParityTable<RelatedPartyLoanFacilityRow> selectable
          rows={rows} rowKey={(f) => f.id} loading={list.isLoading || co.isLoading} storageKey="scentsx-loans-v1" exportFilename="ScentsX loans and notes payable" exportExcel
          emptyText="No loans yet. Money the owner puts in as a loan goes to 2400; a bank or lender note goes to 2500."
          columns={[
            { className: "text-left", cellClass: "text-left font-semibold", key: "counterparty_name", label: "Lender", sortable: true, render: (f) => f.counterparty_name ?? DASH, exportValue: (f) => f.counterparty_name ?? "" },
            { className: "text-left", cellClass: "text-left", key: "account_number", label: "Account", sortable: true, render: (f) => [f.account_number, f.account_name].filter(Boolean).join(" · ") || DASH, exportValue: (f) => `${f.account_number ?? ""} ${f.account_name ?? ""}`.trim() },
            { className: "text-left", cellClass: "text-left", key: "relationship", label: "Type", render: (f) => String(f.relationship).replace(/_/g, " "), exportValue: (f) => String(f.relationship) },
            { key: "created_at", label: "Opened", sortable: true, cellClass: "text-right tabular-nums", render: (f) => (f.created_at ? usDate(f.created_at.slice(0, 10)) : DASH), exportValue: (f) => f.created_at ?? "" },
            { key: "principal_advanced_cents", label: "Borrowed", kind: "number", cellClass: "text-right tabular-nums", render: (f) => formatUsdCents(f.principal_advanced_cents), exportValue: (f) => f.principal_advanced_cents / 100 },
            { key: "principal_repaid_cents", label: "Repaid", kind: "number", cellClass: "text-right tabular-nums", render: (f) => formatUsdCents(f.principal_repaid_cents), exportValue: (f) => f.principal_repaid_cents / 100 },
            { key: "accrued_interest_cents", label: "Interest accrued", kind: "number", cellClass: "text-right tabular-nums", render: (f) => formatUsdCents(f.accrued_interest_cents), exportValue: (f) => f.accrued_interest_cents / 100 },
            { key: "open_balance_cents", label: "Owed now", kind: "number", sortable: true, cellClass: "text-right tabular-nums font-semibold", render: (f) => formatUsdCents(f.open_balance_cents), exportValue: (f) => f.open_balance_cents / 100 },
            { className: "text-left", cellClass: "text-left", key: "status", label: "Status", render: (f) => f.status.replace(/_/g, " "), exportValue: (f) => f.status },
            { key: "repay", label: "", render: (f) => (Number(f.open_balance_cents) > 0 ? <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={(e) => { e.stopPropagation(); setOpen({ kind: "repay", f }); }} data-testid={`scentsx-ln-repay-${f.id}`}>{tr("scentsx.ln.repay", "Repay")}</Button> : DASH) },
          ]}
        />
      )}
      {open && prefill ? (
        <LoanApplicationWizard open operatingCompanyId={id} prefill={prefill} onClose={() => setOpen(null)} onCreated={() => { setOpen(null); void list.refetch(); }} />
      ) : null}
    </section>
  );
}
