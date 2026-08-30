import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { getIntercompanyTransferGroup, getPlaidBankAccounts, getTransfer, listTransfers, revokeTransfer, type Transfer, type TransferType } from "../../api/banking";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { ActionButton } from "../../components/shared/ActionButton";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { useListState } from "../../components/list-state";
import { formatUsdCents } from "../../lib/money";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel, looksLikeSerializedJson } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";
import { TransferModal } from "./TransferModal";
import { userFacingApiError } from "../../lib/api-error-message";
import { Modal } from "../../components/Modal";
import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";

const PAGE_SIZE = 50;

function formatMoney(cents: number) {
  return formatUsdCents(cents);
}

function typeLabel(type: TransferType) {
  return type.replaceAll("_", " ");
}

// ACCT-F6284: a bank-feed line minted into a transfer can inherit a serialized-JSON
// categorization_memo (apps/backend/src/banking/transfers.service.ts,
// mintTransferForBankFeedLineInClient) — this is a free-text Memo field, not an entity-name lookup,
// so it uses the shared JSON-shape detector directly rather than entityLabel's "not visible" wording.
function memoText(memo: string | null | undefined): string {
  const s = (memo ?? "").trim();
  if (s === "" || looksLikeSerializedJson(s)) return "-";
  return s;
}

export function TransfersListPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  // ACCT-F176 — the banner below states what TRANSFER_GL_POSTING_ENABLED is doing, so it must READ
  // it. Same defect and same live state as the bank-feed banner: global default false, per-entity
  // override TRUE for USMCA, TRANSP and TRK, so "default OFF" was wrong for every real company.
  const transferGlFlag = useFeatureFlag("TRANSFER_GL_POSTING_ENABLED", companyId || undefined);
  const [searchParams] = useSearchParams();
  const deepLinkTransferId = searchParams.get("transfer_id")?.trim() || "";
  const deepLinkGroupId = searchParams.get("group_id")?.trim() || "";

  const [fromDate, setFromDate] = useState(new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<TransferType | "">("");
  const [status, setStatus] = useState<"active" | "revoked" | "">("active");
  const [accountId, setAccountId] = useState("");
  const staged = useStagedListFilters({ applied: { fromDate, toDate, type, status, accountId }, empty: { fromDate: "", toDate: "", type: "" as const, status: "" as const, accountId: "" }, onApply: (next) => { setFromDate(next.fromDate); setToDate(next.toDate); setType(next.type); setStatus(next.status); setAccountId(next.accountId); setOffset(0); } });
  const [offset, setOffset] = useState(0);
  const [revokingId, setRevokingId] = useState("");
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [infoModal, setInfoModal] = useState<{ title: string; body: ReactNode } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Transfer | null>(null);

  const canRevoke = auth.user?.role === "Owner";

  const openIntercompanyGroup = useCallback((groupId: string) => {
    if (!companyId || !groupId) return;
    void getIntercompanyTransferGroup(groupId, companyId)
      .then((detail) => {
        setInfoModal({
          title: "Intercompany transfer group",
          body: detail.legs.length > 0 ? (
            <div className="space-y-2 text-xs text-slate-800">
              {detail.legs.map((leg) => (
                <div key={leg.id} className="flex flex-wrap items-center gap-2">
                  <span>{leg.intercompany_leg ?? "leg"}</span>
                  <span>· {(leg as { entity_code?: string }).entity_code || "Entity"}</span>
                  <span>· {formatMoney(Number(leg.amount_cents))}</span>
                  <span>·</span>
                  <EntityLink kind="transfer" id={leg.id} label={entityLabel(leg.reference_number || leg.memo, leg.id, "Transfer")} />
                </div>
              ))}
            </div>
          ) : "(no legs)",
        });
      })
      .catch((error) => pushToast(userFacingApiError(error, "Failed to load intercompany legs"), "error"));
  }, [companyId, pushToast]);

  useEffect(() => {
    if (deepLinkGroupId) openIntercompanyGroup(deepLinkGroupId);
  }, [deepLinkGroupId, openIntercompanyGroup]);

  const bankAccountsQuery = useQuery({
    queryKey: ["banking", "plaid-accounts", companyId],
    queryFn: () => getPlaidBankAccounts(companyId),
    enabled: Boolean(companyId),
  });
  const transfersQuery = useQuery({
    queryKey: ["banking", "transfers", companyId, fromDate, toDate, type, status, accountId, offset],
    queryFn: () =>
      listTransfers(companyId, {
        from: fromDate || undefined,
        to: toDate || undefined,
        type: (type || undefined) as TransferType | undefined,
        status: (status || undefined) as "active" | "revoked" | undefined,
        accountId: accountId || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    enabled: Boolean(companyId),
  });
  const deepLinkTransferQuery = useQuery({
    queryKey: ["banking", "transfer", companyId, deepLinkTransferId],
    queryFn: () => getTransfer(deepLinkTransferId, companyId).then((r) => r.transfer),
    enabled: Boolean(companyId && deepLinkTransferId),
  });

  const rows = useMemo(() => {
    const listed = transfersQuery.data?.transfers ?? [];
    const deep = deepLinkTransferQuery.data;
    if (!deepLinkTransferId || !deep) return listed;
    if (listed.some((t) => t.id === deep.id)) return listed;
    return [deep, ...listed];
  }, [transfersQuery.data?.transfers, deepLinkTransferQuery.data, deepLinkTransferId]);
  const hasNext = (transfersQuery.data?.transfers ?? []).length === PAGE_SIZE;
  // Empty message renders only once the transfers query settles, never mid-fetch.
  const listState = useListState(transfersQuery, (transfersQuery.data?.transfers ?? []).length === 0 && !deepLinkTransferId);
  const accountNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of bankAccountsQuery.data?.accounts ?? []) {
      map.set(account.id, `${account.institution_name || "Bank"} - ${account.account_name || "Account"}`);
    }
    return map;
  }, [bankAccountsQuery.data?.accounts]);

  // Display-only ParityTable migration: column order, cell formatting (amount sign/currency via
  // formatMoney), and the View/Revoke inline action handlers are preserved 1:1 from the former
  // hand-rolled table markup.
  const columns = useMemo<ParityColumn<Transfer>[]>(
    () => [
      { key: "transfer_date", label: "Date", sortable: true, render: (row) => formatDateUS(row.transfer_date) },
      {
        key: "transfer_type",
        label: "Type",
        sortable: true,
        cellClass: "capitalize",
        render: (row) => typeLabel(row.transfer_type),
      },
      {
        key: "from_account_id",
        label: "From",
        render: (row) => (
          <EntityLink kind="bank_account" id={row.from_account_id} label={entityLabel(row.from_bank_name || row.from_coa_name || accountNameMap.get(row.from_account_id), row.from_account_id, "Account")} />
        ),
      },
      {
        key: "to_account_id",
        label: "To",
        render: (row) => (
          <EntityLink kind="bank_account" id={row.to_account_id} label={entityLabel(row.to_bank_name || row.to_coa_name || accountNameMap.get(row.to_account_id), row.to_account_id, "Account")} />
        ),
      },
      {
        key: "amount_cents",
        label: "Amount",
        sortable: true,
        sortValue: (row) => Number(row.amount_cents),
        render: (row) => formatMoney(Number(row.amount_cents)),
      },
      { key: "memo", label: "Memo", render: (row) => memoText(row.memo) },
      { key: "reference_number", label: "Reference", render: (row) => row.reference_number || "-" },
      {
        key: "journal_entry_id",
        label: "TMS JE",
        render: (row) =>
          row.journal_entry_id ? (
            <EntityLink kind="journal_entry" id={row.journal_entry_id} label={entityLabel(row.journal_entry_memo, row.journal_entry_id, "Journal entry")} />
          ) : (
            <span className="text-xs text-slate-500">—</span>
          ),
      },
      {
        key: "matched_bank_transaction_id",
        label: "Bank",
        render: (row) =>
          row.matched_bank_transaction_id ? (
            <EntityLink
              kind="bank_transaction"
              id={row.matched_bank_transaction_id}
              label={entityLabel(row.matched_bank_transaction_label, row.matched_bank_transaction_id, "Bank transaction")}
            />
          ) : (
            <span className="text-xs text-slate-500">—</span>
          ),
      },
      {
        key: "intercompany_transfer_group_id",
        label: "Interco",
        render: (row) =>
          row.intercompany_transfer_group_id ? (
            <button
              type="button"
              className="text-xs text-slate-800 underline"
              data-testid="transfer-intercompany-group-link"
              onClick={() => {
                if (row.intercompany_transfer_group_id) openIntercompanyGroup(row.intercompany_transfer_group_id);
              }}
            >
              {row.intercompany_leg ?? "group"} · {row.counterparty_code || "Intercompany"}
            </button>
          ) : (
            <span className="text-xs text-slate-500">—</span>
          ),
      },
      {
        key: "qbo_status",
        label: "QBO Status",
        render: (row) =>
          row.revoked_at ? (
            <span className="rounded-sm bg-gray-100 px-2 py-0.5 text-xs text-gray-700">revoked</span>
          ) : row.qbo_journal_entry_id ? (
            <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-xs text-slate-700">synced</span>
          ) : (
            <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-xs text-slate-700">pending</span>
          ),
      },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        render: (row) => (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-xs text-slate-700 hover:underline"
              onClick={() => {
                if (!companyId) return;
                void getTransfer(row.id, companyId)
                  .then((detail) => {
                    setInfoModal({
                      title: `Transfer ${detail.transfer.id}`,
                      body: (
                        <div className="space-y-1 text-xs text-slate-800">
                          <p>Type: {detail.transfer.transfer_type}</p>
                          <p>Amount: {formatMoney(Number(detail.transfer.amount_cents))}</p>
                          <p>Memo: {memoText(detail.transfer.memo)}</p>
                          <p>
                            TMS JE:{" "}
                            {detail.transfer.journal_entry_id ? (
                              <EntityLink kind="journal_entry" id={detail.transfer.journal_entry_id} label={entityLabel(detail.transfer.journal_entry_memo, detail.transfer.journal_entry_id, "Journal entry")} />
                            ) : "none (TRANSFER_GL_POSTING_ENABLED off or not posted)"}
                          </p>
                          <p>
                            Bank txn:{" "}
                            {detail.transfer.matched_bank_transaction_id ? (
                              <EntityLink kind="bank_transaction" id={detail.transfer.matched_bank_transaction_id} label={entityLabel(detail.transfer.matched_bank_transaction_label, detail.transfer.matched_bank_transaction_id, "Bank transaction")} />
                            ) : "none"}
                          </p>
                          <p>QBO JE: {detail.transfer.qbo_journal_entry_id || "pending"}</p>
                        </div>
                      ),
                    });
                  })
                  .catch((error) => pushToast(userFacingApiError(error, "Failed to load transfer detail"), "error"));
              }}
            >
              View
            </button>
            {canRevoke && !row.revoked_at ? (
              <button
                type="button"
                className="text-xs text-red-700 hover:underline disabled:opacity-60"
                disabled={revokingId === row.id}
                onClick={() => {
                  if (!companyId) return;
                  setRevokeTarget(row);
                }}
              >
                Revoke
              </button>
            ) : null}
          </div>
        ),
      },
    ],
    [accountNameMap, canRevoke, revokingId, companyId, pushToast, queryClient, openIntercompanyGroup],
  );

  return (
    <div className="space-y-3">
      <PageHeader
        backHref="/banking"
        title="Transfers"
        subtitle="Bank transfers and credit-card payments"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              data-testid="transfers-page-record-transfer"
              onClick={() => setTransferModalOpen(true)}
            >
              + Record Transfer
            </ActionButton>
            <Link to="/banking" className="text-sm text-slate-700 hover:underline">
              Back to Banking Home
            </Link>
          </div>
        }
      />
      {transfersQuery.isError ? <ListErrorBanner onRetry={() => void transfersQuery.refetch()} /> : null}
      {transfersQuery.isSuccess ? (
        <div
          className="border-l-4 border-slate-400 bg-slate-100 px-3 py-2 text-xs text-slate-700"
          data-testid="banking-transfer-gl-posting-honesty-banner"
        >
          {transferGlFlag.loading || transferGlFlag.error ? (
            <>
              <p className="font-semibold">
                Checking whether recording a transfer posts a journal entry for this company…
              </p>
              <p className="mt-1">
                <code className="text-[11px]">TRANSFER_GL_POSTING_ENABLED</code> is resolved per entity and has not
                been read yet{transferGlFlag.error ? " (the lookup failed)" : ""}. Until it is,{" "}
                <strong>assume recording a transfer DOES post</strong> — that is the assumption that cannot cost you
                an unintended entry.
              </p>
            </>
          ) : transferGlFlag.enabled ? (
            <>
              <p className="font-semibold">
                Recording a transfer DOES post a TMS journal entry —{" "}
                <code className="text-[11px]">TRANSFER_GL_POSTING_ENABLED</code> is ON for this company
              </p>
              <p className="mt-1">
                The transfer poster runs for this entity, so a TMS JE is written to the live ledger and linked in the
                TMS JE column. An EMPTY TMS JE column here therefore means those transfers were recorded before the
                flag was turned on — it does not mean posting is off. Transfer rows still store QBO journal ids
                separately from TMS GL. Reverse drill: JE detail Source links map{" "}
                <code className="text-[11px]">transfer</code> → Banking Transfers.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">
                TMS journal entry link requires <code className="text-[11px]">TRANSFER_GL_POSTING_ENABLED</code>, which
                is OFF for this company
              </p>
              <p className="mt-1">
                Transfer rows store QBO journal ids separately from TMS GL. A TMS JE appears in the TMS JE column only
                when the existing transfer poster ran with the flag ON for this entity. Zero linked JEs with the flag
                OFF is expected — not proof that transfers post to the ledger. Reverse drill: JE detail Source links
                map <code className="text-[11px]">transfer</code> → Banking Transfers.
              </p>
            </>
          )}
        </div>
      ) : null}
      {listState.isEmpty ? (
        <div
          className="rounded-sm border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700"
          data-testid="banking-transfers-never-recorded-banner"
        >
          <p className="font-semibold">No bank transfers recorded for this company in the selected filters.</p>
          <p className="mt-1">
            Transfer workflow is not proven live until at least one transfer is recorded via + Record Transfer (this
            page or Banking Home) or + Pay Credit Card. An empty list is not “all clear” — it is unproven use.
            Inter-account moves that only exist as unmatched for-review bank feed rows still need Match/Categorize on
            Transactions.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="text-xs font-medium text-slate-800 underline"
              data-testid="transfers-empty-record-transfer"
              onClick={() => setTransferModalOpen(true)}
            >
              + Record Transfer
            </button>
            <Link to="/banking/transactions?type=uncategorized" className="text-xs font-medium text-slate-800 underline">
              Open for-review queue
            </Link>
          </div>
        </div>
      ) : null}

      <CollapsedListFilters
        activeFilterCount={
          (fromDate || toDate ? 1 : 0) + (type ? 1 : 0) + (accountId ? 1 : 0) + (status ? 1 : 0)
        }
        onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}
        testIdPrefix="transfers"
        dataAttributes={{ "data-transfers-filter-toolbar": "collapsed" }}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <label className="text-xs text-gray-600">
            From
            <DatePicker value={staged.draft.fromDate} onChange={(next) => staged.setDraft({ ...staged.draft, fromDate: next })} className="mt-1 h-8 w-full" />
          </label>
          <label className="text-xs text-gray-600">
            To
            <DatePicker value={staged.draft.toDate} onChange={(next) => staged.setDraft({ ...staged.draft, toDate: next })} className="mt-1 h-8 w-full" />
          </label>
          <label className="text-xs text-gray-600">
            Type
            <SelectCombobox value={staged.draft.type} onChange={(e) => staged.setDraft({ ...staged.draft, type: e.target.value as TransferType | "" })} className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-sm">
              <option value="">All</option>
              <option value="bank_to_bank">Bank-to-Bank</option>
              <option value="cc_payment">CC Payment</option>
              <option value="cash_deposit">Cash Deposit</option>
              <option value="owner_contribution">Owner Contribution</option>
              <option value="owner_distribution">Owner Distribution</option>
            </SelectCombobox>
          </label>
          <label className="text-xs text-gray-600">
            Account
            <SelectCombobox value={staged.draft.accountId} onChange={(e) => staged.setDraft({ ...staged.draft, accountId: e.target.value })} className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-sm">
              <option value="">All</option>
              {(bankAccountsQuery.data?.accounts ?? []).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.institution_name || "Bank"} - {account.account_name || "Account"}
                </option>
              ))}
            </SelectCombobox>
          </label>
          <label className="text-xs text-gray-600">
            Status
            <SelectCombobox value={staged.draft.status} onChange={(e) => staged.setDraft({ ...staged.draft, status: e.target.value as "active" | "revoked" | "" })} className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-sm">
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="revoked">Revoked</option>
            </SelectCombobox>
          </label>
        </div>
      </CollapsedListFilters>

      <ParityTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={listState.isLoading}
        storageKey="banking-transfers-list"
        tableTestId="banking-transfers-list-table"
        // PARITYTABLE-MISSING-HIDEPAGER-CLASS: this list already fetches one server page
        // (limit: PAGE_SIZE/offset above, own Previous/Next below) -- initialPageSize alone left
        // ParityTable's own internal pager active, computing a contradicting total off just this
        // page's rows.length once transfers exceed PAGE_SIZE. pageSize (controlled) + hidePager
        // matches the fix already shipped for the identical class on Names Master / Legal
        // Matters / Safety Position History.
        pageSize={PAGE_SIZE}
        pageSizeOptions={[PAGE_SIZE]}
        hidePager
        rowClassName={(row) =>
          deepLinkTransferId && row.id === deepLinkTransferId ? "bg-slate-100 ring-1 ring-slate-400" : ""
        }
        // Settled-only empty text (LIST-EMPTY-1): only supplied once listState resolves to "empty",
        // never mid-fetch, so ParityTable's own gate never flashes a false empty.
        emptyText={listState.isEmpty ? "No transfers found for this filter." : undefined}
      />

      <div className="flex justify-end gap-2">
        <ActionButton
          disabled={offset === 0}
          onClick={() => {
            setOffset((value) => Math.max(0, value - PAGE_SIZE));
          }}
        >
          Previous
        </ActionButton>
        <ActionButton
          disabled={!hasNext}
          onClick={() => {
            setOffset((value) => value + PAGE_SIZE);
          }}
        >
          Next
        </ActionButton>
      </div>

      <TransferModal
        open={transferModalOpen}
        operatingCompanyId={companyId}
        onClose={() => setTransferModalOpen(false)}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ["banking", "transfers", companyId] });
          setTransferModalOpen(false);
        }}
      />
      <Modal open={Boolean(infoModal)} onClose={() => setInfoModal(null)} title={infoModal?.title ?? "Detail"}>
        {typeof infoModal?.body === "string" ? (
          <pre className="whitespace-pre-wrap text-xs text-slate-800">{infoModal.body}</pre>
        ) : infoModal?.body}
      </Modal>
      <VoidReasonModal
        open={Boolean(revokeTarget)}
        title="Revoke transfer"
        entityRef={
          revokeTarget
            ? `${typeLabel(revokeTarget.transfer_type)} · ${formatMoney(Number(revokeTarget.amount_cents))}`
            : undefined
        }
        minLength={3}
        postsReversingEntry={false}
        submitLabel="Revoke"
        onClose={() => setRevokeTarget(null)}
        onSubmit={async (reason) => {
          if (!revokeTarget || !companyId) return;
          setRevokingId(revokeTarget.id);
          try {
            await revokeTransfer(revokeTarget.id, companyId, reason);
            pushToast("Transfer revoked", "success");
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ["banking", "transfers"] }),
              queryClient.invalidateQueries({ queryKey: ["banking", "plaid-accounts"] }),
            ]);
          } catch (error) {
            pushToast(userFacingApiError(error, "Failed to revoke transfer"), "error");
            throw error;
          } finally {
            setRevokingId("");
          }
        }}
      />
    </div>
  );
}
