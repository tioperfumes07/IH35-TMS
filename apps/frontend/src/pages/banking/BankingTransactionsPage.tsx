import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  categorizeBankTransaction,
  getAllAccounts,
  getBankingTiles,
  getPlaidBankAccounts,
  type BankingTile,
  type PlaidBankAccount,
  undoCategorization,
} from "../../api/banking";
import {
  getBankTransactionMatchCandidates,
  getBankingTransactionsList,
  getBankingTransactionsReview,
  postBankTransactionAccept,
  postBankTransactionExclude,
  postBankTransactionMatch,
  type BankingReviewState,
} from "../../api/banking-wave2";
import { ApiError } from "../../api/client";
import { QboCombobox } from "../../components/forms/QboCombobox";
import { useToast } from "../../components/Toast";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { filterBankingTilesForCompany, filterPlaidBankAccountsForCompany } from "../../lib/banking-company-filter";
import { formatCurrencyCents } from "../../lib/format";
import { ManageAccountsModal } from "./components/ManageAccountsModal";

type TabId = "for_review" | "categorized" | "excluded";

const PAGE_SIZE = 50;
const LIST_LIMIT = 300;

function formatDateMDY(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

function txAmount(tx: Record<string, unknown>): number {
  if (tx.amount_cents != null && tx.amount_cents !== "") return Number(tx.amount_cents);
  return 0;
}

function readReviewState(tx: Record<string, unknown>): string {
  return String(tx.review_state ?? tx.status ?? "");
}

function suggestionCount(tx: Record<string, unknown>): number {
  const n = tx.suggestion_count;
  if (typeof n === "number" && !Number.isNaN(n)) return n;
  const sug = tx.suggestions;
  if (Array.isArray(sug)) return sug.length;
  if (tx.suggestion && typeof tx.suggestion === "object") return 1;
  const mc = tx.match_candidates;
  if (Array.isArray(mc)) return mc.length;
  return 0;
}

function tabToReviewState(tab: TabId): BankingReviewState {
  if (tab === "for_review") return "for_review";
  if (tab === "categorized") return "categorized";
  return "excluded";
}

function normalizeTab(raw: string | null): TabId {
  if (raw === "categorized" || raw === "excluded" || raw === "for_review") return raw;
  return "for_review";
}

function statusDotClass(pa: PlaidBankAccount | undefined): string {
  if (!pa) return "bg-emerald-500";
  const s = pa.sync_status;
  if (s === "disconnected" || s === "needs_reauth" || s === "error") return "bg-red-500";
  if (s === "pending") return "bg-amber-500";
  return "bg-emerald-500";
}

function tileBalanceCents(tile: BankingTile): number {
  const n = Number(tile.current_balance);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

function addedOrMatchedCell(tx: Record<string, unknown>): ReactNode {
  const kind = String(tx.linked_kind ?? tx.match_kind ?? tx.matched_kind ?? "").toLowerCase();
  const displayId = String(tx.linked_display_id ?? tx.matched_display_id ?? "");
  const label = String(tx.linked_label ?? "");
  const invoiceId = String(tx.linked_entity_id ?? tx.invoice_id ?? "");

  if (kind.includes("invoice")) {
    const id = displayId || label;
    return id ? (
      <span>
        Matched to: Invoice{" "}
        {invoiceId ? (
          <Link className="text-blue-700 hover:underline" to={`/accounting/invoices/${invoiceId}`}>
            {id}
          </Link>
        ) : (
          id
        )}
      </span>
    ) : (
      "—"
    );
  }
  if (kind.includes("bill")) {
    const id = displayId || label;
    return id ? <span>Matched to: Bill {id}</span> : "—";
  }
  if (kind.includes("transfer")) {
    return <span>Matched to: Transfer {formatDateMDY(String(tx.linked_date ?? tx.transaction_date))}</span>;
  }
  const added = String(tx.added_to_summary ?? tx.categorization_summary ?? "");
  if (added.trim()) return <span>Added to: {added}</span>;
  const single = String(tx.coa_account_name ?? tx.account_name ?? "");
  if (readReviewState(tx) === "categorized" && single) return <span>Added to: {single}</span>;
  return "—";
}

function categoryCell(tx: Record<string, unknown>, tab: TabId): React.ReactNode {
  if (tx.is_split === true || String(tx.split_flag ?? "") === "split") {
    return <span className="text-gray-500">-Split-</span>;
  }
  const name = String(tx.coa_account_name ?? tx.category_name ?? tx.account_name ?? "");
  const sug = String(tx.suggested_account_name ?? "");
  if (tab === "for_review" && !name && sug) {
    return <span className="italic text-gray-600">{sug}</span>;
  }
  if (!name) return "—";
  return <span className="text-blue-700">{name}</span>;
}

export function BankingTransactionsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = normalizeTab(params.get("state"));
  const accountIdFromUrl = params.get("account_id") ?? "";
  const [searchInput, setSearchInput] = useState(params.get("search") ?? "");
  const [page, setPage] = useState(Number(params.get("page") ?? "1") || 1);
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [inlineFor, setInlineFor] = useState<string | null>(null);
  const [matchFor, setMatchFor] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const [inlineVendorId, setInlineVendorId] = useState<string | null>(null);
  const [inlineVendorLabel, setInlineVendorLabel] = useState("");
  const [inlineAccountId, setInlineAccountId] = useState<string | null>(null);
  const [inlineAccountLabel, setInlineAccountLabel] = useState("");
  const [inlineClass, setInlineClass] = useState("");
  const [inlineMemo, setInlineMemo] = useState("");

  const tilesQuery = useQuery({
    queryKey: ["banking", "tiles", companyId],
    queryFn: () => getBankingTiles(companyId),
    enabled: Boolean(companyId),
  });
  const plaidQuery = useQuery({
    queryKey: ["banking", "plaid-accounts", companyId, "tx-page"],
    queryFn: () => getPlaidBankAccounts(companyId),
    enabled: Boolean(companyId),
  });
  const allAccountsQuery = useQuery({
    queryKey: ["banking", "all-accounts", companyId, "tx-page"],
    queryFn: () => getAllAccounts(companyId, { include_inactive: false }),
    enabled: Boolean(companyId),
  });

  const tiles = useMemo(
    () => filterBankingTilesForCompany(tilesQuery.data?.tiles ?? [], companyId),
    [tilesQuery.data?.tiles, companyId]
  );
  const plaidAccounts = useMemo(
    () => filterPlaidBankAccountsForCompany(plaidQuery.data?.accounts ?? [], companyId),
    [plaidQuery.data?.accounts, companyId]
  );
  const plaidById = useMemo(() => new Map(plaidAccounts.map((a) => [a.id, a])), [plaidAccounts]);

  const disconnectedAccounts = useMemo(
    () => plaidAccounts.filter((a) => a.sync_status === "disconnected" || a.sync_status === "needs_reauth"),
    [plaidAccounts]
  );

  useEffect(() => {
    if (!accountIdFromUrl && tiles.length > 0) {
      setParams(
        (p) => {
          p.set("account_id", tiles[0].id);
          return p;
        },
        { replace: true }
      );
    }
  }, [accountIdFromUrl, tiles, setParams]);

  const selectedAccountId = accountIdFromUrl || tiles[0]?.id || "";
  const selectedTile = tiles.find((t) => t.id === selectedAccountId) ?? null;

  const reviewCountQuery = useQuery({
    queryKey: ["banking", "for-review-count", companyId, selectedAccountId],
    queryFn: async () => {
      try {
        const res = await getBankingTransactionsReview(companyId, {
          state: "for_review",
          account_id: selectedAccountId || undefined,
          limit: 500,
        });
        return res.items?.length ?? 0;
      } catch {
        return 0;
      }
    },
    enabled: Boolean(companyId),
  });

  const listQuery = useQuery({
    queryKey: ["banking", "transactions-full", companyId, selectedAccountId, tab, searchInput, LIST_LIMIT],
    queryFn: async () => {
      try {
        const res = await getBankingTransactionsList(companyId, {
          account_id: selectedAccountId || undefined,
          review_state: tabToReviewState(tab),
          search: searchInput.trim() || undefined,
          limit: LIST_LIMIT,
        });
        return { ...res, pendingDeploy: false as const };
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          return { items: [] as Array<Record<string, unknown>>, next_cursor: 0, total: 0, pendingDeploy: true as const };
        }
        throw e;
      }
    },
    enabled: Boolean(companyId) && Boolean(selectedAccountId),
  });

  const rowsRaw = listQuery.data?.items ?? [];

  const sortedRows = useMemo(() => {
    return [...rowsRaw].sort((a, b) => {
      const da = new Date(String(a.transaction_date ?? "")).getTime();
      const db = new Date(String(b.transaction_date ?? "")).getTime();
      return db - da;
    });
  }, [rowsRaw]);

  const totalRows = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageRows = sortedRows.slice(pageStart, pageStart + PAGE_SIZE);

  const pageMonthBuckets = useMemo(() => {
    const map = new Map<string, { key: string; label: string; rows: Array<Record<string, unknown>> }>();
    for (const tx of pageRows) {
      const d = new Date(String(tx.transaction_date ?? ""));
      if (Number.isNaN(d.getTime())) {
        const key = "unknown";
        if (!map.has(key)) map.set(key, { key, label: "Unknown date", rows: [] });
        map.get(key)!.rows.push(tx);
        continue;
      }
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      if (!map.has(key)) map.set(key, { key, label, rows: [] });
      map.get(key)!.rows.push(tx);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.key === "unknown") return 1;
      if (b.key === "unknown") return -1;
      const [ya, ma] = a.key.split("-").map(Number);
      const [yb, mb] = b.key.split("-").map(Number);
      if (ya !== yb) return yb - ya;
      return mb - ma;
    });
  }, [pageRows]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const matchCandidatesQuery = useQuery({
    queryKey: ["banking", "match-candidates", companyId, matchFor],
    queryFn: () => getBankTransactionMatchCandidates(matchFor!, companyId),
    enabled: Boolean(companyId && matchFor),
  });

  const invalidateBanking = () => {
    void queryClient.invalidateQueries({ queryKey: ["banking"] });
  };

  const acceptOne = async (tx: Record<string, unknown>) => {
    const id = String(tx.id ?? "");
    const vendorId = inlineVendorId;
    const accountId = inlineAccountId;
    try {
      await postBankTransactionAccept(id, companyId, {
        vendor_id: vendorId,
        account_id: accountId,
        class_id: inlineClass.trim() || null,
        memo: inlineMemo.trim() || null,
      });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 400 || e.status === 501)) {
        await categorizeBankTransaction(id, companyId, {
          category_kind: "bank_expense",
          vendor_id: vendorId ?? undefined,
          gl_account_id: accountId ?? undefined,
          memo: inlineMemo.trim() || undefined,
        });
        return;
      }
      throw e;
    }
  };

  const acceptMut = useMutation({
    mutationFn: acceptOne,
    onSuccess: () => {
      pushToast("Transaction saved", "success");
      setInlineFor(null);
      invalidateBanking();
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Save failed"), "error"),
  });

  const undoMut = useMutation({
    mutationFn: (id: string) => undoCategorization(id, companyId),
    onSuccess: () => {
      pushToast("Undo complete", "success");
      invalidateBanking();
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Undo failed"), "error"),
  });

  const excludeMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => postBankTransactionExclude(id, companyId, { reason }),
    onSuccess: () => {
      pushToast("Excluded", "success");
      invalidateBanking();
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Exclude failed"), "error"),
  });

  const matchMut = useMutation({
    mutationFn: (args: { transactionId: string; kind: string; target_id: string }) =>
      postBankTransactionMatch(args.transactionId, companyId, { kind: args.kind, target_id: args.target_id }),
    onSuccess: () => {
      pushToast("Matched", "success");
      setMatchFor(null);
      invalidateBanking();
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Match failed"), "error"),
  });

  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);

  const onBulkExclude = () => {
    if (!selectedIds.length) return;
    const reason = window.prompt("Reason for excluding these transactions?");
    if (!reason?.trim()) return;
    void (async () => {
      for (const id of selectedIds) {
        await excludeMut.mutateAsync({ id, reason: reason.trim() });
      }
      setSelected({});
    })();
  };

  const toggleRow = (id: string) => {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  };

  const setTab = useCallback(
    (next: TabId) => {
      setPage(1);
      setParams(
        (p) => {
          p.set("state", next);
          p.delete("page");
          return p;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  const selectTile = (id: string) => {
    setPage(1);
    setParams(
      (p) => {
        p.set("account_id", id);
        p.delete("page");
        return p;
      },
      { replace: true }
    );
  };

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setParams(
      (p) => {
        if (searchInput.trim()) p.set("search", searchInput.trim());
        else p.delete("search");
        p.delete("page");
        return p;
      },
      { replace: true }
    );
  };

  const openInline = (tx: Record<string, unknown>) => {
    const id = String(tx.id ?? "");
    setInlineFor(id);
    setInlineVendorId(null);
    setInlineVendorLabel(String(tx.vendor_display_name ?? ""));
    setInlineAccountId(null);
    setInlineAccountLabel("");
    setInlineClass("");
    setInlineMemo("");
  };

  const headerAccountLabel = selectedTile?.display_name ?? "Select account";

  if (!companyId) {
    return <p className="text-sm text-amber-800">Select an operating company.</p>;
  }

  return (
    <div className="space-y-3 pb-24">
      {!bannerDismissed && disconnectedAccounts.length > 0 ? (
        <div className="flex items-start gap-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          <span className="text-lg" aria-hidden>
            ⚠
          </span>
          <div className="min-w-0 flex-1">
            <p>
              <span className="font-medium">{disconnectedAccounts[0].account_name ?? "Bank account"}</span> — Bank Sync Account
              disconnected. You can send a request to Owner or fix now. All options keep your existing transactions in QuickBooks.
            </p>
            {disconnectedAccounts.length > 1 ? (
              <button type="button" className="mt-1 text-xs font-medium text-red-800 underline" aria-label="Show more sync errors">
                {disconnectedAccounts.length - 1} more errors
              </button>
            ) : null}
          </div>
          <button
            type="button"
            className="text-red-800 hover:text-red-950"
            aria-label="Dismiss bank sync error banner"
            onClick={() => setBannerDismissed(true)}
          >
            ✕
          </button>
        </div>
      ) : null}

      {listQuery.data?.pendingDeploy ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Backend Wave 2 not yet deployed. Refresh in a minute.
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-xl font-semibold text-gray-900">{headerAccountLabel}</h1>
          <button
            type="button"
            className="text-gray-500 hover:text-gray-800"
            aria-label="Edit account name"
            onClick={() => setManageOpen(true)}
          >
            ✎
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <a className="text-blue-700 hover:underline" href="/help/banking">
            Try new banking page
          </a>
          <button type="button" className="rounded border border-gray-300 bg-white px-3 py-1" aria-label="Link account menu">
            Link account ▾
          </button>
          <button type="button" className="rounded border border-gray-300 bg-white px-3 py-1" aria-label="Update banking data">
            Update
          </button>
          <button type="button" className="rounded border border-gray-300 bg-white px-3 py-1" aria-label="Explore banking">
            Explore
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {tiles.map((tile) => {
          const pa = plaidById.get(tile.id);
          const selected = tile.id === selectedAccountId;
          const balCents = tileBalanceCents(tile);
          const neg = balCents < 0;
          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => selectTile(tile.id)}
              className={`relative h-[100px] w-[140px] flex-shrink-0 rounded-lg border bg-white px-2 py-2 text-left transition-shadow ${
                selected ? "border-2 border-emerald-600 shadow-md" : "border border-gray-200"
              }`}
              aria-label={`Select account ${tile.display_name}`}
              aria-pressed={selected}
            >
              <span
                className={`absolute right-2 top-2 h-2 w-2 rounded-full ${statusDotClass(pa)}`}
                aria-hidden
                title={pa?.sync_status ?? "ok"}
              />
              <div className="truncate text-xs font-medium text-gray-900">{tile.display_name}</div>
              <div className={`mt-1 text-2xl font-semibold ${neg ? "text-red-600" : "text-gray-900"}`}>
                {formatCurrencyCents(tileBalanceCents(tile))}
              </div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Bank balance</div>
              <div className="text-[10px] text-gray-500">
                {pa?.last_synced_at
                  ? `Updated ${formatDateMDY(pa.last_synced_at)}`
                  : tile.last_txn_date
                    ? `Updated ${formatDateMDY(tile.last_txn_date)}`
                    : "Updated —"}
              </div>
              <div className="mt-1 text-[10px] font-medium uppercase text-gray-500">In QuickBooks</div>
              <div className="text-xs text-gray-800">{tile.uncategorized_count ?? 0} uncategorized</div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={`border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === "for_review" ? "border-emerald-600 text-gray-900" : "border-transparent text-gray-500"
            }`}
            onClick={() => setTab("for_review")}
            aria-label="For review tab"
          >
            For review ({reviewCountQuery.data ?? 0})
          </button>
          <button
            type="button"
            className={`border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === "categorized" ? "border-emerald-600 text-gray-900" : "border-transparent text-gray-500"
            }`}
            onClick={() => setTab("categorized")}
            aria-label="Categorized tab"
          >
            Categorized
          </button>
          <button
            type="button"
            className={`border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === "excluded" ? "border-emerald-600 text-gray-900" : "border-transparent text-gray-500"
            }`}
            onClick={() => setTab("excluded")}
            aria-label="Excluded tab"
          >
            Excluded
          </button>
        </div>
        <div className="flex flex-wrap gap-3 pb-2 text-xs text-blue-700">
          <a className="hover:underline" href="/help/banking-tutorials">
            Video tutorials
          </a>
          <a className="hover:underline" href="/help/banking-tour">
            Take a tour
          </a>
          <Link className="hover:underline" to={`/banking/accounts/${selectedAccountId}`}>
            Go to bank register
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className="rounded border border-gray-300 bg-white px-2 py-1 text-sm" aria-label="Date filter" defaultValue="">
          <option value="">All dates</option>
          <option value="today">Today</option>
        </select>
        <select className="rounded border border-gray-300 bg-white px-2 py-1 text-sm" aria-label="Transaction type filter" defaultValue="">
          <option value="">All transactions</option>
        </select>
        <button type="button" className="rounded border border-gray-300 bg-white px-3 py-1 text-sm" aria-label="Open advanced filters">
          Filter
        </button>
        <form onSubmit={onSearchSubmit} className="min-w-[12rem] flex-1">
          <input
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
            placeholder="Search by description, check number, or amount"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search transactions"
          />
        </form>
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <span>
            {totalRows === 0 ? "0" : `${pageStart + 1}-${Math.min(pageStart + PAGE_SIZE, totalRows)}`} of {totalRows} total
          </span>
          <span>
            Page {safePage} of {totalPages}
          </span>
          <button
            type="button"
            className="rounded border border-gray-300 px-2 py-0.5"
            aria-label="Previous page"
            disabled={safePage <= 1}
            onClick={() => {
              const np = Math.max(1, safePage - 1);
              setPage(np);
              setParams(
                (p) => {
                  p.set("page", String(np));
                  return p;
                },
                { replace: true }
              );
            }}
          >
            ←
          </button>
          <button
            type="button"
            className="rounded border border-gray-300 px-2 py-0.5"
            aria-label="Next page"
            disabled={safePage >= totalPages}
            onClick={() => {
              const np = Math.min(totalPages, safePage + 1);
              setPage(np);
              setParams(
                (p) => {
                  p.set("page", String(np));
                  return p;
                },
                { replace: true }
              );
            }}
          >
            →
          </button>
          <button type="button" aria-label="Print transactions" className="text-gray-600">
            ⎙
          </button>
          <button type="button" aria-label="Export transactions" className="text-gray-600">
            ⤓
          </button>
          <button type="button" aria-label="Table settings" className="text-gray-600">
            ⚙
          </button>
        </div>
      </div>

      {listQuery.isError ? <ListErrorBanner onRetry={() => void listQuery.refetch()} /> : null}
      {listQuery.isLoading ? <p className="text-sm text-gray-600">Loading…</p> : null}

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-600">
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 px-2 py-2">
                <span className="sr-only">Select</span>
              </th>
              <th className="px-2 py-2">Date ▾</th>
              <th className="px-2 py-2">Bank detail</th>
              <th className="px-2 py-2 text-right">Amount</th>
              <th className="px-2 py-2">Payee</th>
              <th className="px-2 py-2">Added or matched</th>
              <th className="px-2 py-2">Category</th>
              <th className="px-2 py-2">Rule</th>
              <th className="px-2 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {!listQuery.isLoading && totalRows === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-600">
                  No transactions for this view.
                </td>
              </tr>
            ) : null}
            {pageMonthBuckets.flatMap((bucket) => {
              const collapsed = collapsedMonths[bucket.key];
              const head = (
                <tr key={`h-${bucket.key}`} className="bg-gray-100">
                  <td colSpan={9} className="px-2 py-1 text-xs font-semibold text-gray-800">
                    <button
                      type="button"
                      className="mr-2 inline-flex items-center gap-1"
                      aria-label={`Toggle month ${bucket.label}`}
                      onClick={() => setCollapsedMonths((m) => ({ ...m, [bucket.key]: !collapsed }))}
                    >
                      <span aria-hidden>{collapsed ? "▸" : "▾"}</span>
                      {bucket.label} ({bucket.rows.length})
                    </button>
                  </td>
                </tr>
              );
              if (collapsed) return [head];
              const body = bucket.rows.map((tx) => {
                  const id = String(tx.id ?? "");
                  const amount = txAmount(tx);
                  const desc = String(tx.description ?? tx.merchant_name ?? "");
                  const payeeId = String(tx.matched_vendor_id ?? tx.vendor_id ?? "");
                  const payeeName = String(tx.vendor_display_name ?? tx.payee_name ?? "");
                  const sn = suggestionCount(tx);
                  const review = readReviewState(tx);
                  const categorizedRow = review === "categorized" || review === "matched";
                  const showMatchPill = tab === "for_review" && sn > 0 && !categorizedRow;
                  const showUndo = categorizedRow;
                  const showAdd = tab === "for_review" && sn === 0 && !categorizedRow;
                  const showMatch = tab === "for_review" && sn > 0 && !categorizedRow;
                  return (
                    <tr key={id} className="group border-b border-gray-100 hover:bg-gray-50">
                      <td className="sticky left-0 z-10 bg-white px-2 py-2 group-hover:bg-gray-50">
                        <input type="checkbox" checked={Boolean(selected[id])} onChange={() => toggleRow(id)} aria-label={`Select row ${id}`} />
                      </td>
                      <td className="whitespace-nowrap px-2 py-2">{formatDateMDY(String(tx.transaction_date ?? ""))}</td>
                      <td className="max-w-[240px] truncate px-2 py-2" title={desc}>
                        {desc.length > 80 ? `${desc.slice(0, 80)}…` : desc}
                      </td>
                      <td className={`whitespace-nowrap px-2 py-2 text-right font-medium ${amount < 0 ? "text-red-600" : ""}`}>
                        {formatCurrencyCents(amount)}
                      </td>
                      <td className="px-2 py-2">
                        {payeeId ? (
                          <Link className="text-blue-700 hover:underline" to={`/vendors/${payeeId}`}>
                            {payeeName || payeeId}
                          </Link>
                        ) : (
                          payeeName || "—"
                        )}
                      </td>
                      <td className="px-2 py-2 text-xs">
                        {showMatchPill ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                            {sn} {sn === 1 ? "match" : "matches"} found
                          </span>
                        ) : (
                          addedOrMatchedCell(tx)
                        )}
                      </td>
                      <td className="px-2 py-2 text-xs">{categoryCell(tx, tab)}</td>
                      <td className="px-2 py-2 text-xs">{String(tx.banking_rule_name ?? tx.rule_name ?? "") || "—"}</td>
                      <td className="px-2 py-2 text-xs">
                        {showUndo ? (
                          <button
                            type="button"
                            className="text-blue-700 hover:underline"
                            aria-label={`Undo categorization for ${id}`}
                            onClick={() => void undoMut.mutateAsync(id)}
                          >
                            Undo
                          </button>
                        ) : null}
                        {showAdd ? (
                          <button
                            type="button"
                            className="font-medium text-blue-700 hover:underline"
                            aria-label={`Add categorization for ${id}`}
                            onClick={() => openInline(tx)}
                          >
                            Add
                          </button>
                        ) : null}
                        {showMatch ? (
                          <button
                            type="button"
                            className="font-medium text-blue-700 hover:underline"
                            aria-label={`Match transaction ${id}`}
                            onClick={() => setMatchFor(id)}
                          >
                            Match
                          </button>
                        ) : null}
                        {tab === "excluded" ? (
                          <span className="text-blue-700">View</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                });
              return [head, ...body];
            })}
          </tbody>
        </table>
      </div>

      {inlineFor ? (
        <div className="rounded border border-emerald-200 bg-emerald-50/40 p-3">
          <div className="mb-2 text-sm font-semibold text-gray-900">Quick add</div>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs text-gray-700">
              Vendor
              <QboCombobox
                entityType="vendor"
                operatingCompanyId={companyId}
                value={inlineVendorId}
                displayValue={inlineVendorLabel}
                onChange={(qid, label) => {
                  setInlineVendorId(qid);
                  setInlineVendorLabel(label);
                }}
                onPick={(row) => setInlineVendorId(row.id)}
                placeholder="Search vendor…"
              />
            </label>
            <label className="text-xs text-gray-700">
              Account (required)
              <QboCombobox
                entityType="account"
                operatingCompanyId={companyId}
                value={inlineAccountId}
                displayValue={inlineAccountLabel}
                onChange={(qid, label) => {
                  setInlineAccountId(qid);
                  setInlineAccountLabel(label);
                }}
                onPick={(row) => setInlineAccountId(row.id)}
                placeholder="Search account…"
                allowFreeText={false}
              />
            </label>
            <label className="text-xs text-gray-700">
              Class
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                value={inlineClass}
                onChange={(e) => setInlineClass(e.target.value)}
                aria-label="Class identifier"
              />
            </label>
            <label className="md:col-span-2 text-xs text-gray-700">
              Memo
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                value={inlineMemo}
                onChange={(e) => setInlineMemo(e.target.value)}
                aria-label="Memo"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              aria-label="Save categorized transaction"
              disabled={!inlineAccountId || acceptMut.isPending}
              onClick={() => {
                const tx = sortedRows.find((r) => String(r.id) === inlineFor);
                if (tx) void acceptMut.mutateAsync(tx);
              }}
            >
              Add
            </button>
            <button
              type="button"
              className="text-sm text-blue-700 hover:underline"
              aria-label="Cancel inline add"
              onClick={() => setInlineFor(null)}
            >
              Cancel
            </button>
            <span className="text-xs text-gray-500">Split lines: use banking split flow from the register.</span>
          </div>
        </div>
      ) : null}

      {matchFor ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-black/20"
            aria-label="Close match drawer"
            onClick={() => setMatchFor(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="match-drawer-title"
            className="fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-y-auto border-l border-gray-200 bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h2 id="match-drawer-title" className="text-base font-semibold">
                Match transaction
              </h2>
              <button type="button" className="text-gray-600 hover:text-gray-900" aria-label="Close match drawer" onClick={() => setMatchFor(null)}>
                ✕
              </button>
            </div>
            <div className="space-y-2 p-4 text-sm">
              {matchCandidatesQuery.isLoading ? <p>Loading candidates…</p> : null}
              {(matchCandidatesQuery.data?.candidates ?? []).map((c, idx) => {
                const kind = String(c.kind ?? c.type ?? "record");
                const target = String(c.target_id ?? c.id ?? "");
                const candVendor = String(c.vendor_name ?? "");
                const candAmt = txAmount(c as Record<string, unknown>);
                return (
                  <div key={`${target}-${idx}`} className="rounded border border-gray-100 p-2">
                    <div className="text-xs text-gray-600">{kind}</div>
                    <div className="font-medium">{candVendor || String(c.label ?? target)}</div>
                    <div className="text-xs text-gray-700">
                      {formatCurrencyCents(candAmt)} · {formatDateMDY(String(c.date ?? ""))}
                    </div>
                    <button
                      type="button"
                      className="mt-2 rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white"
                      aria-label="Apply match for candidate"
                      disabled={matchMut.isPending}
                      onClick={() =>
                        void matchMut.mutateAsync({
                          transactionId: matchFor,
                          kind,
                          target_id: target,
                        })
                      }
                    >
                      Match
                    </button>
                  </div>
                );
              })}
              {!matchCandidatesQuery.isLoading && (matchCandidatesQuery.data?.candidates ?? []).length === 0 ? (
                <p className="text-sm text-gray-600">No candidates returned.</p>
              ) : null}
              <button type="button" className="text-xs font-medium text-blue-700 hover:underline" aria-label="Find more matches">
                + Find more matches
              </button>
            </div>
          </div>
        </>
      ) : null}

      {selectedIds.length > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-30 flex flex-wrap items-center gap-3 border-t border-gray-200 bg-white px-4 py-2 shadow-lg">
          <span className="text-sm font-medium">{selectedIds.length} selected</span>
          <button type="button" className="rounded border border-gray-300 px-2 py-1 text-sm" aria-label="Categorize selected">
            Categorize…
          </button>
          <button type="button" className="rounded border border-gray-300 px-2 py-1 text-sm" aria-label="Match selected">
            Match…
          </button>
          <button
            type="button"
            className="rounded border border-gray-300 px-2 py-1 text-sm"
            aria-label="Exclude selected transactions"
            onClick={onBulkExclude}
          >
            Exclude…
          </button>
          <button
            type="button"
            className="text-sm text-blue-700 hover:underline"
            aria-label="Clear selection"
            onClick={() => setSelected({})}
          >
            Clear selection
          </button>
        </div>
      ) : null}

      <ManageAccountsModal
        open={manageOpen}
        operatingCompanyId={companyId}
        accounts={(allAccountsQuery.data?.accounts ?? []).map((account) => ({
          id: String(account.id),
          display_name: String(account.display_name ?? ""),
          account_type: String(account.account_type ?? ""),
          visible: Boolean(account.visible),
          tag: String(account.tag ?? ""),
          is_dip: Boolean(account.is_dip),
        }))}
        onClose={() => setManageOpen(false)}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ["banking"] });
        }}
      />
    </div>
  );
}
