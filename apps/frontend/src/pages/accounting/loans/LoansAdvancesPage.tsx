/**
 * Loans & Advances register — Option 1 related-party LOC (ROUND 443.22-2b).
 *
 * One facility per person (CoA 2410-family sub-account). Advances and repayments hang under the
 * facility. The wizard still creates documents through POST /related-party-loans; this page never
 * computes GL.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  listRelatedPartyLoanFacilities,
  listRelatedPartyLoans,
  getPartyLedger,
  loanRowsOf,
  type LoanDirection,
  type LoanStatus,
  type LoanTargetType,
  type RelatedPartyLoanFacilityRow,
  type RelatedPartyLoanRow,
  type PartyLedgerLine,
} from "../../../api/related-party-loans";
import { PageHeader } from "../../../components/layout/PageHeader";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable } from "../../../components/parity/ParityTable";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { formatDateUS } from "../../../lib/formatDate";
import { FORM_SELECT_CLASS } from "../../../components/forms/inputClass";
import {
  LoanApplicationWizard,
  type LoanApplicationPrefill,
} from "./LoanApplicationWizard";
import { MultiSelectDropdown } from "../../../components/forms/MultiSelectDropdown";
import { formatUsdCents, QBO_MONEY_CELL_CLASS } from "../../../lib/money";
import { SelectCombobox } from "../../../components/Combobox";
import { formatAccountDisplayLabel } from "../../../lib/show-account-numbers";
import { useShowAccountNumbers } from "../../../lib/useShowAccountNumbers";

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
  "bank_funding",
  "bank_repayment",
  "paid_direct_vendor",
  "party_transfer_out",
];

function money(cents: number | null | undefined): string {
  return formatUsdCents(cents);
}

export function LoansAdvancesPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [showAccountNumbers] = useShowAccountNumbers();
  const [direction, setDirection] = useState<"" | LoanDirection>("");
  // U12 (owner UI register 2026-10-03) — status is a multi-select; none picked = every live status (reversed hidden).
  const [status, setStatus] = useState<LoanStatus[]>([]);
  const [targetType, setTargetType] = useState<"" | LoanTargetType>("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardPrefill, setWizardPrefill] = useState<LoanApplicationPrefill | null>(null);
  const [expandedFacilityId, setExpandedFacilityId] = useState<string | null>(null);
  const [ledgerFacilityId, setLedgerFacilityId] = useState<string | null>(null);

  const facilitiesQuery = useQuery({
    queryKey: ["related-party-loan-facilities", companyId],
    queryFn: () => listRelatedPartyLoanFacilities(companyId),
    enabled: Boolean(companyId),
    refetchInterval: 30_000,
  });

  const listQuery = useQuery({
    queryKey: ["related-party-loans", companyId, direction, status, targetType, expandedFacilityId],
    queryFn: () =>
      listRelatedPartyLoans({
        operating_company_id: companyId,
        ...(direction ? { direction } : {}),
        ...(status.length ? { status } : {}),
        ...(targetType ? { target_type: targetType } : {}),
        ...(expandedFacilityId ? { facility_id: expandedFacilityId } : {}),
        limit: 100,
      }),
    enabled: Boolean(companyId),
    refetchInterval: 30_000,
  });

  const ledgerQuery = useQuery({
    queryKey: ["party-ledger", companyId, ledgerFacilityId],
    queryFn: () => getPartyLedger(ledgerFacilityId!, companyId),
    enabled: Boolean(companyId) && Boolean(ledgerFacilityId),
    refetchInterval: 30_000,
  });

  const facilities: RelatedPartyLoanFacilityRow[] = useMemo(
    () => facilitiesQuery.data?.facilities ?? [],
    [facilitiesQuery.data],
  );
  const rows: RelatedPartyLoanRow[] = useMemo(() => loanRowsOf(listQuery.data), [listQuery.data]);

  const refetchAll = () => {
    void facilitiesQuery.refetch();
    void listQuery.refetch();
    if (ledgerFacilityId) void ledgerQuery.refetch();
  };

  return (
    <div className="p-4">
      <PageHeader
        backHref="/accounting"
        breadcrumb={["Accounting", "Loans & Advances"]}
        title="Loans & Advances"
        subtitle="One running facility per related party. Advances and repayments hang under the person."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setWizardPrefill(null);
                setWizardOpen(true);
              }}
              disabled={!companyId}
              className="h-7 rounded-sm bg-[#14314F] px-2 text-xs font-semibold text-white hover:bg-[#0F1729] disabled:opacity-40"
            >
              + Create
            </button>
            <button
              type="button"
              onClick={() => {
                setWizardPrefill({
                  target_type: "paid_direct_vendor",
                  direction: "in",
                  interest_rate_pct: "4",
                  interest_method: "simple",
                });
                setWizardOpen(true);
              }}
              disabled={!companyId}
              className="h-7 rounded-sm border border-[#E5E7EB] bg-white px-2 text-xs font-semibold text-[#14314F] hover:bg-[#F7F8FA] disabled:opacity-40"
              data-testid="loans-paid-direct-vendor-btn"
            >
              Paid directly to a vendor
            </button>
          </div>
        }
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SelectCombobox
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
        </SelectCombobox>
        <MultiSelectDropdown
          label="Status"
          options={STATUSES.filter((st): st is LoanStatus => st !== "").map((st) => ({ value: st, label: st }))}
          selected={status}
          onChange={(next) => setStatus(next as LoanStatus[])}
          allLabel="All statuses"
          data-testid="loans-status-filter"
        />
        <SelectCombobox
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
        </SelectCombobox>
      </div>

      {!companyId && (
        <div className="mt-4 rounded-sm border border-[#E5E7EB] bg-white p-4 text-xs text-[#6B7280]">
          Select an operating company to load its loans and advances.
        </div>
      )}

      {(facilitiesQuery.isError || listQuery.isError) && (
        <div className="mt-4">
          <ListErrorState
            title="Couldn't load loans & advances"
            status={
              typeof ((facilitiesQuery.error ?? listQuery.error) as { status?: number } | null)?.status ===
              "number"
                ? (((facilitiesQuery.error ?? listQuery.error) as { status?: number }).status as number)
                : 0
            }
            message={
              facilitiesQuery.error instanceof Error
                ? facilitiesQuery.error.message
                : listQuery.error instanceof Error
                  ? listQuery.error.message
                  : undefined
            }
            onRetry={() => refetchAll()}
          />
        </div>
      )}

      {companyId && !facilitiesQuery.isError && (
        <div className="mt-4" data-testid="related-party-loan-facilities-register">
          <div className="mb-2 text-section-header font-bold uppercase tracking-wide text-[#4B5563]">
            Facilities (one per person)
          </div>
          <ParityTable<RelatedPartyLoanFacilityRow>
            rows={facilities}
            rowKey={(r) => r.id}
            storageKey="loans-advances-facilities"
            exportFilename="loan-facilities"
            tableTestId="loans-advances-facilities-table"
            emptyText={
              facilitiesQuery.isLoading
                ? "Loading…"
                : "No related-party facilities yet. Creating an advance opens the person's facility."
            }
            onRowClick={(r) => setExpandedFacilityId((cur) => (cur === r.id ? null : r.id))}
            columns={[
              {
                key: "person",
                label: "Person",
                render: (r) =>
                  entityLabel(r.counterparty_name ?? r.account_name, r.account_id, "Related party"),
              },
              { key: "relationship", label: "Relationship", render: (r) => r.relationship },
              {
                key: "account",
                label: "Account",
                render: (r) => (
                  <EntityLink
                    kind="account"
                    id={r.account_id}
                    label={entityLabel(
                      formatAccountDisplayLabel(
                        { account_name: r.account_name, account_number: r.account_number },
                        { showNumber: showAccountNumbers },
                      ),
                      r.account_id,
                      "Account",
                    )}
                  />
                ),
              },
              {
                key: "advanced",
                label: "Advanced",
                className: "text-right",
                cellClass: "text-right whitespace-nowrap",
                render: (r) => money(r.principal_advanced_cents),
              },
              {
                key: "repaid",
                label: "Repaid",
                className: "text-right",
                cellClass: "text-right whitespace-nowrap",
                render: (r) => money(r.principal_repaid_cents),
              },
              {
                key: "open",
                label: "Open balance",
                className: "text-right",
                cellClass: "text-right whitespace-nowrap",
                render: (r) => money(r.open_balance_cents),
              },
              {
                key: "interest",
                label: "Accrued interest",
                className: "text-right",
                cellClass: "text-right whitespace-nowrap",
                render: (r) => money(r.accrued_interest_cents),
              },
              {
                key: "docs",
                label: "Docs",
                render: (r) => `${r.advance_count} adv / ${r.repayment_count} repay`,
              },
              { key: "status", label: "Status", render: (r) => r.status },
              {
                key: "balance_label",
                label: "Balance direction",
                render: (r) => {
                  const b = r.open_balance_cents;
                  if (b === 0) return <span className="text-[#6B7280]">Settled</span>;
                  if (b > 0) return <span className="text-[#B91C1C]">Due to {r.counterparty_name ?? "party"}</span>;
                  return <span className="text-[#16A34A]">Due from {r.counterparty_name ?? "party"}</span>;
                },
              },
              {
                key: "ledger_link",
                label: "Ledger",
                render: (r) => (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLedgerFacilityId((cur) => (cur === r.id ? null : r.id));
                    }}
                    className="text-xs font-semibold text-[#14314F] underline hover:text-[#0F1729]"
                    data-testid={`party-ledger-btn-${r.id}`}
                  >
                    {ledgerFacilityId === r.id ? "Close" : "View"}
                  </button>
                ),
              },
            ]}
          />
          {expandedFacilityId && (
            <div className="mt-2 text-xs text-[#6B7280]">
              Showing advances and repayments for the selected facility. Click the row again to clear.
            </div>
          )}
        </div>
      )}

      {companyId && ledgerFacilityId && (
        <div className="mt-4 rounded-sm border border-[#E5E7EB] bg-white p-4" data-testid="party-ledger-panel">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-section-header font-bold uppercase tracking-wide text-[#4B5563]">
              Party Ledger —{" "}
              {ledgerQuery.data?.account_name ?? ledgerQuery.data?.counterparty_name ?? "Loading…"}
            </div>
            {ledgerQuery.data && (
              <div className="text-xs font-semibold">
                Net:{" "}
                <span
                  className={
                    ledgerQuery.data.net_balance_cents > 0
                      ? "text-[#B91C1C]"
                      : ledgerQuery.data.net_balance_cents < 0
                        ? "text-[#16A34A]"
                        : "text-[#6B7280]"
                  }
                >
                  {ledgerQuery.data.net_balance_cents > 0
                    ? `Due to party ${money(ledgerQuery.data.net_balance_cents)}`
                    : ledgerQuery.data.net_balance_cents < 0
                      ? `Due from party ${money(Math.abs(ledgerQuery.data.net_balance_cents))}`
                      : "Settled"}
                </span>
              </div>
            )}
          </div>
          {ledgerQuery.isLoading && (
            <div className="text-xs text-[#6B7280]">Loading ledger…</div>
          )}
          {ledgerQuery.isError && (
            <div className="text-xs text-[#B91C1C]">Failed to load ledger.</div>
          )}
          {ledgerQuery.data && ledgerQuery.data.lines.length === 0 && (
            <div className="text-xs text-[#6B7280]">No posted JE lines for this account yet.</div>
          )}
          {ledgerQuery.data && ledgerQuery.data.lines.length > 0 && (
            <table className="mt-2 w-full text-xs" data-testid="party-ledger-table">
              <thead>
                <tr className="border-b border-[#E5E7EB] text-xs font-bold uppercase text-[#4B5563]">
                  <th className="py-1 text-left">Date</th>
                  <th className="py-1 text-left">Memo</th>
                  <th className="py-1 text-left">Doc</th>
                  <th className="py-1 text-right">Debit</th>
                  <th className="py-1 text-right">Credit</th>
                  <th className="py-1 text-right">Running balance</th>
                </tr>
              </thead>
              <tbody>
                {ledgerQuery.data.lines.map((line: PartyLedgerLine) => (
                  <tr key={line.id} className="border-b border-[#F3F4F6]">
                    <td className="py-1">{formatDateUS(line.date)}</td>
                    <td className="py-1 max-w-[200px] truncate">{line.memo ?? "—"}</td>
                    <td className="py-1">{line.loan_display_id ?? "—"}</td>
                    <td className={`py-1 ${QBO_MONEY_CELL_CLASS}`}>
                      {line.debit_or_credit === "debit" ? money(line.amount_cents) : ""}
                    </td>
                    <td className={`py-1 ${QBO_MONEY_CELL_CLASS}`}>
                      {line.debit_or_credit === "credit" ? money(line.amount_cents) : ""}
                    </td>
                    <td
                      className={`py-1 ${QBO_MONEY_CELL_CLASS} font-semibold ${
                        line.running_balance_cents > 0
                          ? "text-[#B91C1C]"
                          : line.running_balance_cents < 0
                            ? "text-[#16A34A]"
                            : "text-[#6B7280]"
                      }`}
                    >
                      {line.running_balance_cents === 0
                        ? "—"
                        : line.running_balance_cents > 0
                          ? `Due to ${money(line.running_balance_cents)}`
                          : `Due from ${money(Math.abs(line.running_balance_cents))}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {companyId && !listQuery.isError && (
        <div className="mt-6">
          <div className="mb-2 text-section-header font-bold uppercase tracking-wide text-[#4B5563]">
            {expandedFacilityId ? "Advances & repayments (selected facility)" : "All advances & repayments"}
          </div>
          <ParityTable<RelatedPartyLoanRow>
            rows={rows}
            rowKey={(r) => r.id}
            storageKey="loans-advances-register"
            exportFilename="loans-advances"
            tableTestId="loans-advances-register-table"
            emptyText={
              listQuery.isLoading
                ? "Loading…"
                : "No loans or advances recorded for this entity yet. This is an honest empty register, not a failed read."
            }
            columns={[
              {
                key: "display_id",
                label: "Document",
                render: (r) => r.display_id ?? "—",
              },
              {
                key: "entry_date",
                label: "Date",
                render: (r) => formatDateUS(r.entry_date),
              },
              {
                key: "direction",
                label: "Direction",
                render: (r) => (r.direction === "in" ? "To company" : "From company"),
              },
              {
                key: "counterparty",
                label: "Counterparty",
                render: (r) => entityLabel(r.counterparty_name, r.counterparty_id, "Counterparty"),
              },
              { key: "relationship", label: "Relationship", render: (r) => r.relationship },
              {
                key: "kind",
                label: "Kind",
                render: (r) => r.document_kind ?? r.target_type,
              },
              {
                key: "note",
                label: "Note",
                render: (r) =>
                  r.note_file_id || r.has_note ? (
                    <EntityLink kind="document" id={r.note_file_id ?? r.id} label="Advance note" />
                  ) : r.direction === "in" && r.document_kind !== "repayment" ? (
                    "Missing"
                  ) : (
                    "—"
                  ),
              },
              {
                key: "account",
                label: "Account",
                render: (r) => (
                  <EntityLink kind="account" id={r.account_id} label={entityLabel(r.account_name, r.account_id, "Account")} />
                ),
              },
              {
                key: "principal",
                label: "Principal",
                className: "text-right",
                cellClass: "text-right whitespace-nowrap",
                render: (r) => money(r.principal_cents ?? r.amount_cents),
              },
              { key: "status", label: "Status", render: (r) => r.status ?? "—" },
              {
                key: "je",
                label: "JE",
                render: (r) =>
                  r.je_id ? (
                    <EntityLink kind="journal_entry" id={r.je_id} label={entityLabel(null, r.je_id, "Journal entry")} />
                  ) : (
                    "—"
                  ),
              },
            ]}
          />
        </div>
      )}

      <LoanApplicationWizard
        open={wizardOpen}
        operatingCompanyId={companyId}
        prefill={wizardPrefill}
        onClose={() => {
          setWizardOpen(false);
          setWizardPrefill(null);
        }}
        onCreated={() => refetchAll()}
      />
    </div>
  );
}
