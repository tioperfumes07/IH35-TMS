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
  listPartyAccounts,
  loanRowsOf,
  type LoanDirection,
  type LoanStatus,
  type LoanTargetType,
  type RelatedPartyLoanFacilityRow,
  type RelatedPartyLoanRow,
  type PartyAccount,
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
  "party_paid_vendor",
];

function money(cents: number | null | undefined): string {
  return formatUsdCents(cents);
}

/** Credit-positive party balance: Cr = USMCA owes the party ("Due to"), Dr = the party owes USMCA ("Due from"). */
function balanceText(cents: number): string {
  if (cents === 0) return "Square";
  return cents > 0 ? `Cr ${money(cents)} · Due to` : `Dr ${money(Math.abs(cents))} · Due from`;
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
  // RULING 443.65 #2c — the party ledger is keyed by the party's "Due to / from" GL account (every movement on it).
  const [ledgerAccountId, setLedgerAccountId] = useState<string | null>(null);

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

  const partiesQuery = useQuery({
    queryKey: ["related-party-accounts", companyId],
    queryFn: () => listPartyAccounts(companyId),
    enabled: Boolean(companyId),
    refetchInterval: 30_000,
  });

  const ledgerQuery = useQuery({
    queryKey: ["party-ledger", companyId, ledgerAccountId],
    queryFn: () => getPartyLedger(ledgerAccountId!, companyId),
    enabled: Boolean(companyId) && Boolean(ledgerAccountId),
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
    void partiesQuery.refetch();
    if (ledgerAccountId) void ledgerQuery.refetch();
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
                      setLedgerAccountId((cur) => (cur === r.account_id ? null : r.account_id));
                    }}
                    className="text-xs font-semibold text-[#14314F] underline hover:text-[#0F1729]"
                    data-testid={`party-ledger-btn-${r.id}`}
                  >
                    {ledgerAccountId === r.account_id ? "Close" : "View"}
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

      {companyId && (
        <div className="mt-4" data-testid="party-accounts-section">
          <div className="mb-2 text-section-header font-bold uppercase tracking-wide text-[#4B5563]">
            Party ledgers — Due to / from
          </div>
          <div className="w-full text-xs" data-testid="party-accounts-table">
            <div className="grid grid-cols-[minmax(80px,1fr)_minmax(0,1.4fr)_80px_minmax(120px,1.2fr)_72px] gap-x-2 border-b border-[#E5E7EB] bg-[#EEF2F6] text-section-header font-bold uppercase text-[#1F2937]">
              <div className="px-2 py-1 text-center">Account</div>
              <div className="px-2 py-1 text-center">Party</div>
              <div className="px-2 py-1 text-center">Movements</div>
              <div className="px-2 py-1 text-center">Balance</div>
              <div className="px-2 py-1 text-center">Ledger</div>
            </div>
            {(partiesQuery.data?.parties ?? []).map((p: PartyAccount) => (
              <div
                key={p.account_id}
                className="grid grid-cols-[minmax(80px,1fr)_minmax(0,1.4fr)_80px_minmax(120px,1.2fr)_72px] gap-x-2 border-b border-[#F3F4F6]"
              >
                <div className="px-2 py-1">{formatAccountDisplayLabel(p, { showNumber: showAccountNumbers })}</div>
                <div className="px-2 py-1">{p.party_name}</div>
                <div className="px-2 py-1 text-right">{p.movement_count}</div>
                <div className={`px-2 py-1 ${QBO_MONEY_CELL_CLASS}`}>{balanceText(p.balance_cents)}</div>
                <div className="px-2 py-1 text-center">
                  <button
                    type="button"
                    onClick={() => setLedgerAccountId((cur) => (cur === p.account_id ? null : p.account_id))}
                    className="text-xs font-semibold text-[#14314F] underline hover:text-[#0F1729]"
                    data-testid={`party-account-ledger-btn-${p.account_id}`}
                  >
                    {ledgerAccountId === p.account_id ? "Close" : "View"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {companyId && ledgerAccountId && (
        <div className="mt-4 rounded-sm border border-[#E5E7EB] bg-white p-4" data-testid="party-ledger-panel">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-section-header font-bold uppercase tracking-wide text-[#4B5563]">
              Party Ledger — {ledgerQuery.data?.account.account_name ?? "Loading…"}
            </div>
            {ledgerQuery.data && (
              <div className="text-xs font-semibold" data-testid="party-ledger-balance">
                Balance: {balanceText(ledgerQuery.data.balance_cents)}
              </div>
            )}
          </div>
          {ledgerQuery.isLoading && <div className="text-xs text-[#6B7280]">Loading ledger…</div>}
          {ledgerQuery.isError && <div className="text-xs text-[#B91C1C]">Failed to load ledger.</div>}
          {ledgerQuery.data && ledgerQuery.data.lines.length === 0 && (
            <div className="text-xs text-[#6B7280]">No movements on this account yet.</div>
          )}
          {ledgerQuery.data && ledgerQuery.data.lines.length > 0 && (
            <div className="mt-2 w-full text-xs" data-testid="party-ledger-table">
              <div className="grid grid-cols-[80px_minmax(80px,1fr)_minmax(0,1.4fr)_100px_100px_120px_100px] gap-x-2 border-b border-[#E5E7EB] bg-[#EEF2F6] text-section-header font-bold uppercase text-[#1F2937]">
                <div className="px-2 py-1 text-center">Date</div>
                <div className="px-2 py-1 text-center">Document</div>
                <div className="px-2 py-1 text-center">Bank line</div>
                <div className="px-2 py-1 text-center">Debit</div>
                <div className="px-2 py-1 text-center">Credit</div>
                <div className="px-2 py-1 text-center">Running balance</div>
                <div className="px-2 py-1 text-center">Pair</div>
              </div>
              {ledgerQuery.data.lines.map((line: PartyLedgerLine) => (
                <div
                  key={line.posting_id}
                  className="grid grid-cols-[80px_minmax(80px,1fr)_minmax(0,1.4fr)_100px_100px_120px_100px] gap-x-2 border-b border-[#F3F4F6]"
                >
                  <div className="px-2 py-1 whitespace-nowrap">{formatDateUS(line.date)}</div>
                  <div className="px-2 py-1 whitespace-nowrap">{line.document}</div>
                  <div className="px-2 py-1 max-w-[280px] truncate" title={line.bank_line_description ?? ""}>
                    {line.bank_transaction_id
                      ? `${formatDateUS(line.bank_line_date ?? "")} · ${line.bank_line_description ?? ""}`
                      : "—"}
                  </div>
                  <div className={`px-2 py-1 ${QBO_MONEY_CELL_CLASS}`}>
                    {line.debit_or_credit === "debit" ? money(line.amount_cents) : ""}
                  </div>
                  <div className={`px-2 py-1 ${QBO_MONEY_CELL_CLASS}`}>
                    {line.debit_or_credit === "credit" ? money(line.amount_cents) : ""}
                  </div>
                  <div className={`px-2 py-1 ${QBO_MONEY_CELL_CLASS} font-semibold`}>
                    {balanceText(line.running_balance_cents)}
                  </div>
                  <div className="px-2 py-1 whitespace-nowrap" data-testid="party-ledger-pair">
                    {line.pair_status === "paired"
                      ? `Paired · ${line.pair_document ?? ""}`
                      : line.pair_status === "unpaired"
                        ? "Unpaired"
                        : "—"}
                  </div>
                </div>
              ))}
            </div>
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
