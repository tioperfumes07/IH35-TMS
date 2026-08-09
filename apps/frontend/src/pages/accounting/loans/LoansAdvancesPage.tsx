/**
 * Loans & Advances register — the missing UI over an already-shipped backend.
 *
 * VERIFIED BEFORE BUILDING (prod br-fancy-credit-akjnd07a, 2026-08-05): the data model
 * (accounting.related_party_loan_entries + related_party_loan_schedule, migrations 202611230000 /
 * 202611260000) is APPLIED, the routes are registered (registerRelatedPartyLoanRoutes in index.ts),
 * and posting / auto-deduct / reminder workers exist. Zero frontend files referenced any of it —
 * the feature was reachable only by calling the API by hand. This page is that door.
 *
 * Entity-scoped: every read passes operating_company_id from CompanyContext, so TRANSP / TRK /
 * USMCA never blend. No GL math here — the backend poster owns the journal entry.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  listRelatedPartyLoans,
  loanRowsOf,
  type LoanDirection,
  type LoanStatus,
  type LoanTargetType,
  type RelatedPartyLoanRow,
} from "../../../api/related-party-loans";
import { PageHeader } from "../../../components/layout/PageHeader";
import { ListErrorState } from "../../../components/ListErrorState";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { formatDateUS } from "../../../lib/formatDate";
import { FORM_SELECT_CLASS } from "../../../components/forms/inputClass";
import { LoanApplicationWizard } from "./LoanApplicationWizard";

const DIRECTIONS: Array<{ value: "" | LoanDirection; label: string }> = [
  { value: "", label: "All directions" },
  { value: "in", label: "To the company (liability)" },
  { value: "out", label: "From the company (receivable)" },
];

const STATUSES: Array<"" | LoanStatus> = ["", "draft", "open", "paid", "reversed"];
const TARGETS: Array<"" | LoanTargetType> = [
  "",
  "bill",
  "settlement",
  "cash_advance",
  "expense",
  "loan_out",
  "repayment",
  "intercompany",
];

function money(cents: number | null | undefined): string {
  const n = Number(cents ?? 0) / 100;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function LoansAdvancesPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [direction, setDirection] = useState<"" | LoanDirection>("");
  const [status, setStatus] = useState<"" | LoanStatus>("");
  const [targetType, setTargetType] = useState<"" | LoanTargetType>("");
  const [wizardOpen, setWizardOpen] = useState(false);

  const listQuery = useQuery({
    queryKey: ["related-party-loans", companyId, direction, status, targetType],
    queryFn: () =>
      listRelatedPartyLoans({
        operating_company_id: companyId,
        ...(direction ? { direction } : {}),
        ...(status ? { status } : {}),
        ...(targetType ? { target_type: targetType } : {}),
        limit: 100,
      }),
    enabled: Boolean(companyId),
    refetchInterval: 30_000,
  });

  const rows: RelatedPartyLoanRow[] = useMemo(() => loanRowsOf(listQuery.data), [listQuery.data]);

  return (
    <div className="p-4">
      <PageHeader
        backHref="/accounting"
        breadcrumb={["Accounting", "Loans & Advances"]}
        title="Loans & Advances"
        subtitle="Loans to the company (liability) and loans from the company (receivable), with terms and interest."
        actions={
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            disabled={!companyId}
            className="rounded-sm bg-[#1f2a44] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#0f1729] disabled:opacity-40"
          >
            + Create
          </button>
        }
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          className={`${FORM_SELECT_CLASS} max-w-[260px]`}
          value={direction}
          onChange={(e) => setDirection(e.target.value as "" | LoanDirection)}
          aria-label="Filter by direction"
        >
          {DIRECTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <select
          className={`${FORM_SELECT_CLASS} max-w-[180px]`}
          value={status}
          onChange={(e) => setStatus(e.target.value as "" | LoanStatus)}
          aria-label="Filter by status"
        >
          {STATUSES.map((s) => (
            <option key={s || "all"} value={s}>
              {s || "All statuses"}
            </option>
          ))}
        </select>
        <select
          className={`${FORM_SELECT_CLASS} max-w-[200px]`}
          value={targetType}
          onChange={(e) => setTargetType(e.target.value as "" | LoanTargetType)}
          aria-label="Filter by target type"
        >
          {TARGETS.map((t) => (
            <option key={t || "all"} value={t}>
              {t || "All target types"}
            </option>
          ))}
        </select>
      </div>

      {!companyId && (
        <div className="mt-4 rounded-sm border border-slate-200 bg-white p-4 text-[13px] text-slate-600">
          Select an operating company to load its loans and advances.
        </div>
      )}

      {listQuery.isError && (
        <div className="mt-4">
          <ListErrorState
            title="Couldn't load loans & advances"
            status={
              typeof (listQuery.error as { status?: number } | null)?.status === "number"
                ? ((listQuery.error as { status?: number }).status as number)
                : 0
            }
            message={listQuery.error instanceof Error ? listQuery.error.message : undefined}
            onRetry={() => void listQuery.refetch()}
          />
        </div>
      )}

      {companyId && !listQuery.isError && (
        <div className="mt-4 overflow-x-auto rounded-sm border border-slate-200 bg-white">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Direction</th>
                <th className="px-3 py-2 font-medium">Counterparty</th>
                <th className="px-3 py-2 font-medium">Relationship</th>
                <th className="px-3 py-2 font-medium">Target</th>
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 text-right font-medium">Principal</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">JE</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                    {listQuery.isLoading
                      ? "Loading…"
                      : "No loans or advances recorded for this entity yet. This is an honest empty register, not a failed read."}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  {/* US date grammar via formatDateUS — a bare ISO string in JSX is locale-ambiguous
                      (verify:no-native-datetime-input C3). */}
                  <td className="px-3 py-2">{formatDateUS(r.entry_date)}</td>
                  <td className="px-3 py-2">{r.direction === "in" ? "To company" : "From company"}</td>
                  <td className="px-3 py-2">{r.counterparty_name ?? r.counterparty_id ?? "—"}</td>
                  <td className="px-3 py-2">{r.relationship}</td>
                  <td className="px-3 py-2">{r.target_type}</td>
                  <td className="px-3 py-2">
                    {/* Linkage law §10: an account reference drills through to the account, never a
                        raw uuid printed as text. Same for the JE below — the loan and its journal
                        entry must be walkable in both directions from this register. */}
                    <EntityLink kind="account" id={r.account_id} label={r.account_name ?? r.account_id} />
                  </td>
                  <td className="px-3 py-2 text-right">{money(r.principal_cents ?? r.amount_cents)}</td>
                  <td className="px-3 py-2">{r.status ?? "—"}</td>
                  <td className="px-3 py-2">
                    {r.je_id ? <EntityLink kind="journal_entry" id={r.je_id} label={entityLabel(null, r.je_id, "Journal entry")} /> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <LoanApplicationWizard
        open={wizardOpen}
        operatingCompanyId={companyId}
        onClose={() => setWizardOpen(false)}
        onCreated={() => void listQuery.refetch()}
      />
    </div>
  );
}
