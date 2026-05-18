import { Fragment, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { MessageSquare, Paperclip } from "lucide-react";
import {
  categorizeTransaction,
  getBankingSuggestions,
  getCoaAccounts,
  getPlaidCompanyTransactions,
  skipBankTransactionInvestigation,
  splitTransaction,
  uploadBankStatementCsv,
  type PlaidBankAccount,
  type PlaidBankTransaction,
} from "../../../api/banking";
import { ActionButton } from "../../../components/shared/ActionButton";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { useToast } from "../../../components/Toast";

type Props = {
  companyId: string;
  accounts: PlaidBankAccount[];
  selectedAccountId: string | null;
  onSelectAccount: (accountId: string) => void;
  onManageConnections: () => void;
  onDataChanged: () => void;
};

type RowDetailDraft = {
  mode: "match" | "categorize";
  fromTo: string;
  accountId: string;
  className: string;
  location: string;
  productService: string;
  customerProject: string;
  billable: boolean;
  memo: string;
};

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatBankTransactionDate(rawDate: string | null | undefined) {
  if (!rawDate) return "—";
  const dateMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) return `${dateMatch[2]}/${dateMatch[3]}/${dateMatch[1]}`;
  const dt = new Date(rawDate);
  if (Number.isNaN(dt.getTime())) return rawDate;
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const yyyy = String(dt.getUTCFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

function spentReceived(tx: PlaidBankTransaction) {
  if (tx.is_credit) return { spent: 0, received: tx.amount_cents };
  return { spent: tx.amount_cents, received: 0 };
}

function transactionLabel(tx: PlaidBankTransaction) {
  return tx.description || tx.merchant_name || "—";
}

export function BankingTransactionsDesignView({
  companyId,
  accounts,
  selectedAccountId,
  onSelectAccount,
  onManageConnections,
  onDataChanged,
}: Props) {
  const { pushToast } = useToast();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [descriptionFilter, setDescriptionFilter] = useState("");
  const [spentMin, setSpentMin] = useState("");
  const [receivedMin, setReceivedMin] = useState("");
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const [actionMenuTxId, setActionMenuTxId] = useState<string | null>(null);
  const [linkMenuOpen, setLinkMenuOpen] = useState(false);
  const [postingTxId, setPostingTxId] = useState<string | null>(null);
  const [excludingTxId, setExcludingTxId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RowDetailDraft>>({});

  const selectedAccount = useMemo(() => {
    if (selectedAccountId) {
      const exact = accounts.find((a) => a.id === selectedAccountId);
      if (exact) return exact;
    }
    return accounts[0] ?? null;
  }, [accounts, selectedAccountId]);

  const transactionsQuery = useQuery({
    queryKey: ["banking", "transactions-design", companyId, selectedAccount?.id ?? "", descriptionFilter],
    queryFn: () =>
      getPlaidCompanyTransactions(companyId, {
        limit: 300,
        bank_account_id: selectedAccount?.id ?? undefined,
        q: descriptionFilter.trim() || undefined,
        sort: "date_desc",
      }),
    enabled: Boolean(companyId),
  });

  const suggestionsQuery = useQuery({
    queryKey: ["banking", "tx-suggestions", companyId, expandedTxId ?? ""],
    queryFn: () => getBankingSuggestions(String(expandedTxId), companyId),
    enabled: Boolean(companyId && expandedTxId),
  });

  const coaQuery = useQuery({
    queryKey: ["banking", "tx-coa", companyId],
    queryFn: () => getCoaAccounts(),
    enabled: Boolean(companyId),
    staleTime: 120_000,
  });

  const filteredRows = useMemo(() => {
    const rows = transactionsQuery.data?.transactions ?? [];
    const spentLimit = spentMin.trim() ? Math.max(0, Number(spentMin)) : null;
    const receivedLimit = receivedMin.trim() ? Math.max(0, Number(receivedMin)) : null;
    return rows.filter((tx) => {
      const { spent, received } = spentReceived(tx);
      if (spentLimit != null && spent / 100 < spentLimit) return false;
      if (receivedLimit != null && received / 100 < receivedLimit) return false;
      return true;
    });
  }, [transactionsQuery.data?.transactions, spentMin, receivedMin]);

  const otherAccounts = useMemo(
    () => accounts.filter((a) => a.id !== selectedAccount?.id).slice(0, 4),
    [accounts, selectedAccount?.id]
  );

  function makeDefaultDraft(tx: PlaidBankTransaction): RowDetailDraft {
    return {
      mode: "categorize",
      fromTo: tx.merchant_name || tx.description || "",
      accountId: "",
      className: "",
      location: "",
      productService: "",
      customerProject: "",
      billable: false,
      memo: tx.notes || "",
    };
  }

  function getDraft(tx: PlaidBankTransaction): RowDetailDraft {
    const existing = drafts[tx.id];
    if (existing) return existing;
    return makeDefaultDraft(tx);
  }

  function setDraft(tx: PlaidBankTransaction, patch: Partial<RowDetailDraft>) {
    setDrafts((prev) => ({ ...prev, [tx.id]: { ...(prev[tx.id] ?? makeDefaultDraft(tx)), ...patch } }));
  }

  async function postTransaction(tx: PlaidBankTransaction) {
    const draft = getDraft(tx);
    setPostingTxId(tx.id);
    try {
      await categorizeTransaction(tx.id, companyId, {
        action_type: "create_expense",
        payload: {
          memo: draft.memo || undefined,
          account_id: draft.accountId || undefined,
          class_name: draft.className || undefined,
          location: draft.location || undefined,
          product_service: draft.productService || undefined,
          customer_project: draft.customerProject || undefined,
          billable: draft.billable,
          mode: draft.mode,
        },
      });
      pushToast("Transaction posted", "success");
      onDataChanged();
    } catch (error) {
      pushToast(String((error as Error).message || "Post failed"), "error");
    } finally {
      setPostingTxId(null);
    }
  }

  async function excludeTransaction(tx: PlaidBankTransaction) {
    setExcludingTxId(tx.id);
    try {
      await skipBankTransactionInvestigation(tx.id, companyId, { note: "Excluded from Banking transactions view." });
      pushToast("Transaction excluded", "success");
      onDataChanged();
    } catch (error) {
      pushToast(String((error as Error).message || "Exclude failed"), "error");
    } finally {
      setExcludingTxId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Current account</span>
          <button
            type="button"
            className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-sm font-semibold text-blue-900"
            onClick={() => selectedAccount && onSelectAccount(selectedAccount.id)}
          >
            {selectedAccount ? `${selectedAccount.institution_name || "Bank"} - ${selectedAccount.account_name || "Account"}` : "No account selected"}
          </button>
          {otherAccounts.map((account) => (
            <button
              key={account.id}
              type="button"
              className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => onSelectAccount(account.id)}
            >
              {account.account_name || "Account"} {account.account_mask ? `••••${account.account_mask}` : ""}
            </button>
          ))}
          <div className="relative ml-auto">
            <button
              type="button"
              className="rounded border border-gray-300 px-2 py-1 text-sm font-medium text-gray-800 hover:bg-gray-50"
              onClick={() => setLinkMenuOpen((v) => !v)}
            >
              Link account ▾
            </button>
            {linkMenuOpen ? (
              <div className="absolute right-0 z-20 mt-1 min-w-[220px] rounded border border-gray-200 bg-white shadow-md">
                <button
                  type="button"
                  className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  onClick={() => {
                    setLinkMenuOpen(false);
                    uploadInputRef.current?.click();
                  }}
                >
                  Upload from file
                </button>
                <button
                  type="button"
                  className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  onClick={() => {
                    setLinkMenuOpen(false);
                    onManageConnections();
                  }}
                >
                  Manage connections
                </button>
                <Link
                  to={selectedAccount ? `/banking/accounts/${selectedAccount.id}` : "/banking"}
                  className="block px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={() => setLinkMenuOpen(false)}
                >
                  Go to bank register
                </Link>
              </div>
            ) : null}
          </div>
          <input
            ref={uploadInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file || !selectedAccount) return;
              void uploadBankStatementCsv(file, selectedAccount.id)
                .then(() => {
                  pushToast("Statement uploaded", "success");
                  onDataChanged();
                })
                .catch((error) => pushToast(String((error as Error).message || "Upload failed"), "error"));
            }}
          />
        </div>
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <input
            value={spentMin}
            onChange={(event) => setSpentMin(event.target.value)}
            placeholder="Filter by Spent (min USD)"
            className="rounded border border-gray-300 px-2 py-1 text-sm"
            inputMode="decimal"
          />
          <input
            value={receivedMin}
            onChange={(event) => setReceivedMin(event.target.value)}
            placeholder="Filter by Received (min USD)"
            className="rounded border border-gray-300 px-2 py-1 text-sm"
            inputMode="decimal"
          />
          <input
            value={descriptionFilter}
            onChange={(event) => setDescriptionFilter(event.target.value)}
            placeholder="Filter by description text"
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-[1550px] w-full text-left">
          <thead className="bg-gray-50 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-2 py-2">☐</th>
              <th className="px-2 py-2">Date</th>
              <th className="px-2 py-2">Description</th>
              <th className="px-2 py-2">Spent</th>
              <th className="px-2 py-2">Received</th>
              <th className="px-2 py-2">Receipt</th>
              <th className="px-2 py-2">Message</th>
              <th className="px-2 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {transactionsQuery.isLoading ? (
              <tr>
                <td className="px-3 py-4 text-sm text-gray-500" colSpan={8}>
                  Loading Plaid transactions...
                </td>
              </tr>
            ) : null}
            {!transactionsQuery.isLoading && filteredRows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-sm text-gray-500" colSpan={8}>
                  No transactions for selected account and filters.
                </td>
              </tr>
            ) : null}
            {filteredRows.map((tx) => {
              const { spent, received } = spentReceived(tx);
              const expanded = expandedTxId === tx.id;
              const menuOpen = actionMenuTxId === tx.id;
              const draft = getDraft(tx);
              return (
                <Fragment key={tx.id}>
                  <tr
                    className="cursor-pointer border-t border-gray-100 text-sm hover:bg-gray-50"
                    onClick={() => setExpandedTxId((cur) => (cur === tx.id ? null : tx.id))}
                  >
                    <td className="px-2 py-2 align-top">
                      <input type="checkbox" onClick={(e) => e.stopPropagation()} />
                    </td>
                    <td className="px-2 py-2 align-top text-gray-700">{formatBankTransactionDate(tx.transaction_date)}</td>
                    <td className="max-w-[760px] px-2 py-2 align-top">
                      <p className="truncate whitespace-nowrap text-gray-900">{transactionLabel(tx)}</p>
                    </td>
                    <td className="px-2 py-2 align-top text-red-700">{spent > 0 ? USD.format(spent / 100) : "—"}</td>
                    <td className="px-2 py-2 align-top text-emerald-700">{received > 0 ? USD.format(received / 100) : "—"}</td>
                    <td className="px-2 py-2 align-top text-gray-500">
                      <Paperclip className="h-4 w-4" />
                    </td>
                    <td className="px-2 py-2 align-top text-gray-500">
                      <MessageSquare className="h-4 w-4" />
                    </td>
                    <td className="px-2 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                      <div className="relative flex items-center gap-1">
                        <ActionButton onClick={() => void postTransaction(tx)} disabled={postingTxId === tx.id}>
                          {postingTxId === tx.id ? "Posting..." : "Post"}
                        </ActionButton>
                        <button
                          type="button"
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                          onClick={() => setActionMenuTxId((cur) => (cur === tx.id ? null : tx.id))}
                        >
                          ▾
                        </button>
                        {menuOpen ? (
                          <div className="absolute right-0 top-7 z-20 min-w-[220px] rounded border border-gray-200 bg-white shadow-md">
                            <button
                              type="button"
                              className="block w-full border-b border-gray-100 px-3 py-2 text-left text-xs hover:bg-gray-50"
                              onClick={() => {
                                setActionMenuTxId(null);
                                void splitTransaction(tx.id, companyId, [{ category: "split", amount: Number((tx.amount_cents / 100).toFixed(2)) }])
                                  .then(() => {
                                    pushToast("Split posted as single-line placeholder", "success");
                                    onDataChanged();
                                  })
                                  .catch((error) => pushToast(String((error as Error).message || "Split failed"), "error"));
                              }}
                            >
                              split
                            </button>
                            <button
                              type="button"
                              className="block w-full border-b border-gray-100 px-3 py-2 text-left text-xs hover:bg-gray-50"
                              onClick={() => {
                                setActionMenuTxId(null);
                                pushToast("backdated check is available via detailed categorization flow", "info");
                              }}
                            >
                              backdated check
                            </button>
                            <Link
                              to="/banking/categorization-rules"
                              className="block border-b border-gray-100 px-3 py-2 text-xs hover:bg-gray-50"
                              onClick={() => setActionMenuTxId(null)}
                            >
                              create rule
                            </Link>
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left text-xs text-red-700 hover:bg-red-50"
                              onClick={() => {
                                setActionMenuTxId(null);
                                void excludeTransaction(tx);
                              }}
                              disabled={excludingTxId === tx.id}
                            >
                              {excludingTxId === tx.id ? "excluding..." : "exclude"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr key={`${tx.id}-expanded`} className="border-t border-gray-100 bg-gray-50">
                      <td className="px-3 py-3" colSpan={8}>
                        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                          <div className="rounded border border-gray-200 bg-white p-2">
                            <div className="mb-2 flex items-center gap-2">
                              <button
                                type="button"
                                className={`rounded px-2 py-1 text-xs ${draft.mode === "match" ? "bg-blue-100 text-blue-900" : "bg-gray-100 text-gray-700"}`}
                                  onClick={() => setDraft(tx, { mode: "match" })}
                              >
                                Match
                              </button>
                              <button
                                type="button"
                                className={`rounded px-2 py-1 text-xs ${draft.mode === "categorize" ? "bg-blue-100 text-blue-900" : "bg-gray-100 text-gray-700"}`}
                                  onClick={() => setDraft(tx, { mode: "categorize" })}
                              >
                                Categorize
                              </button>
                            </div>
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                              <label className="text-xs text-gray-600">
                                Transaction type
                                <input
                                  className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                  value={tx.is_credit ? "received" : "spent"}
                                  readOnly
                                />
                              </label>
                              <label className="text-xs text-gray-600">
                                From/To
                                <input
                                  className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                  value={draft.fromTo}
                                  onChange={(event) => setDraft(tx, { fromTo: event.target.value })}
                                />
                              </label>
                              <label className="text-xs text-gray-600">
                                Account
                                <SelectCombobox
                                  className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                  value={draft.accountId}
                                  onChange={(event) => setDraft(tx, { accountId: event.target.value })}
                                >
                                  <option value="">Select account</option>
                                  {(coaQuery.data?.accounts ?? []).map((account) => (
                                    <option key={account.id} value={account.id}>
                                      {account.account_number ? `${account.account_number} · ` : ""}
                                      {account.account_name}
                                    </option>
                                  ))}
                                </SelectCombobox>
                              </label>
                              <label className="text-xs text-gray-600">
                                Class
                                <input
                                  className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                  value={draft.className}
                                  onChange={(event) => setDraft(tx, { className: event.target.value })}
                                />
                              </label>
                              <label className="text-xs text-gray-600">
                                Location
                                <input
                                  className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                  value={draft.location}
                                  onChange={(event) => setDraft(tx, { location: event.target.value })}
                                />
                              </label>
                              <label className="text-xs text-gray-600">
                                Product/Service
                                <input
                                  className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                  value={draft.productService}
                                  onChange={(event) => setDraft(tx, { productService: event.target.value })}
                                />
                              </label>
                              <label className="text-xs text-gray-600">
                                Customer/project
                                <input
                                  className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                  value={draft.customerProject}
                                  onChange={(event) => setDraft(tx, { customerProject: event.target.value })}
                                />
                              </label>
                              <label className="flex items-center gap-2 text-xs text-gray-700">
                                <input
                                  type="checkbox"
                                  checked={draft.billable}
                                  onChange={(event) => setDraft(tx, { billable: event.target.checked })}
                                />
                                Billable
                              </label>
                            </div>
                            <label className="mt-2 block text-xs text-gray-600">
                              Memo
                              <textarea
                                className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                rows={3}
                                value={draft.memo}
                                onChange={(event) => setDraft(tx, { memo: event.target.value })}
                              />
                            </label>
                            <div className="mt-2 text-xs text-gray-500">Files: no files attached for this transaction.</div>
                          </div>

                          <div className="rounded border border-gray-200 bg-white p-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Match candidates</p>
                            {suggestionsQuery.isLoading ? <p className="mt-2 text-sm text-gray-500">Loading suggestions...</p> : null}
                            {!suggestionsQuery.isLoading && (suggestionsQuery.data?.suggestions ?? []).length === 0 ? (
                              <p className="mt-2 text-sm text-gray-500">No match candidates returned.</p>
                            ) : null}
                            <div className="mt-2 space-y-1">
                              {(suggestionsQuery.data?.suggestions ?? []).slice(0, 6).map((suggestion, index) => (
                                <button
                                  key={`${tx.id}-s-${index}`}
                                  type="button"
                                  className="block w-full rounded border border-gray-100 px-2 py-1 text-left text-xs hover:bg-gray-50"
                                  onClick={() => {
                                    void categorizeTransaction(tx.id, companyId, {
                                      action_type: "match",
                                      linked_entity_id: String(suggestion.id ?? ""),
                                      payload: { source: "suggestion" },
                                    })
                                      .then(() => {
                                        pushToast("Transaction matched", "success");
                                        onDataChanged();
                                      })
                                      .catch((error) => pushToast(String((error as Error).message || "Match failed"), "error"));
                                  }}
                                >
                                  {String(suggestion.category ?? suggestion.kind ?? "candidate")} · {String(suggestion.id ?? "")}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
