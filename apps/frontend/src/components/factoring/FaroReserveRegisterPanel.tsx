// Lead 2026-10-02 FARO-REPORTS-ARE-THE-BANK-FEED — one Faro reserve register (Escrow -> 1230, Cash -> 1235): Faro's report
// lines as imported, each linked to its purchase / invoice / customer through Faro's invoice number, and its posting.
//   Import (Owner only — the owner runs it): choose Faro's CSV, see what would land and every rejected row with the reason
//   (e.g. 405560 Inv/PO swapped), then import. Re-importing adds nothing.
//   Post: escrow held matches the purchase's funding entry; escrow -> cash, schedule fee, short-pay and a client payable
//   to IH 35 post their own entry. Rsv deposits post with their payment match; a client payable to us posts as a transfer.
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  commitFaroReserveReport,
  getFaroReserveEntry,
  listFaroReserveEntries,
  postFaroReserveEntry,
  previewFaroReserveReport,
  type FaroEntryKind,
  type FaroImportPreview,
  type FaroRegister,
  type FaroReserveEntry,
} from "../../api/factoring-faro-reserve";
import { DataPanel } from "../layout/DataPanel";
import { ListErrorState } from "../ListErrorState";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { EntityLink } from "../shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";

const KIND_LABEL: Record<FaroEntryKind, string> = {
  escrow_held: "Escrow reserve held",
  escrow_to_cash: "Transfer escrow to cash",
  schedule_fee: "Schedule fee (default interest)",
  short_pay: "Short-pay to reserve",
  rsv_deposit: "Rsv deposit",
  client_payable: "Client payable",
};
const POSTABLE: FaroEntryKind[] = ["escrow_held", "escrow_to_cash", "schedule_fee", "short_pay", "client_payable"];
const ACTION = "rounded-sm border border-gray-300 px-2 py-0.5 text-xs text-slate-700 disabled:opacity-50";
const REGISTER_PATH: Record<FaroRegister, string> = { escrow: "/factoring/escrow-account", cash: "/factoring/cash-reserve" };

function postHint(e: FaroReserveEntry): string | null {
  if (e.journal_entry_id) return null;
  if (e.entry_kind === "rsv_deposit") return "Posts with its Faro payment match";
  if (e.entry_kind === "client_payable" && e.counterparty !== "ih35_transportation") return "Posts as a transfer to our bank";
  if (e.faro_invoice_number && !e.invoice_id) return `No purchase line carries Faro Inv ${e.faro_invoice_number}`;
  return null;
}

export function FaroReserveRegisterPanel({
  companyId,
  register,
  isOwner,
  canPost,
}: {
  companyId: string;
  register: FaroRegister;
  isOwner: boolean;
  canPost: boolean;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const focusId = params.get("faro_entry");
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [preview, setPreview] = useState<FaroImportPreview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const entries = useQuery({
    queryKey: ["factoring", "faro-reserve", register, companyId],
    queryFn: () => listFaroReserveEntries(companyId, register),
    enabled: Boolean(companyId),
  });

  // A journal-entry drill-back lands here with ?faro_entry=; an entry on the other register moves to its own tab.
  useEffect(() => {
    if (!focusId || !companyId) return;
    let live = true;
    void getFaroReserveEntry(companyId, focusId)
      .then((e) => {
        if (live && e.register !== register) navigate(`${REGISTER_PATH[e.register]}?faro_entry=${encodeURIComponent(focusId)}`, { replace: true });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [focusId, companyId, register, navigate]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["factoring", "faro-reserve"] });
    await queryClient.invalidateQueries({ queryKey: ["factoring", "reserves"] });
  };

  const columns = useMemo<Array<ParityColumn<FaroReserveEntry>>>(
    () => [
      { key: "entry_date", label: "Date", sortable: true, render: (e) => formatDateUS(e.entry_date) },
      { key: "faro_entry_id", label: "Faro ID", sortable: true, render: (e) => e.faro_entry_id ?? "—" },
      { key: "entry_kind", label: "Entry", sortable: true, render: (e) => KIND_LABEL[e.entry_kind] },
      { key: "faro_invoice_number", label: "Faro Inv", sortable: true, render: (e) => e.faro_invoice_number ?? "—" },
      {
        key: "invoice_display_id",
        label: "Invoice",
        sortable: true,
        render: (e) => (e.invoice_id ? <EntityLink kind="invoice" id={e.invoice_id} label={e.invoice_display_id ?? "Invoice"} /> : "—"),
      },
      {
        key: "customer_name",
        label: "Customer",
        sortable: true,
        render: (e) =>
          e.customer_id ? (
            <EntityLink kind="customer" id={e.customer_id} label={entityLabel(e.customer_name, e.customer_id, "Customer")} />
          ) : (
            e.debtor_name ?? (e.counterparty === "ih35_transportation" ? "IH 35 TRANSPORTATION (affiliate)" : "—")
          ),
      },
      {
        key: "purchase_display_id",
        label: "Purchase",
        sortable: true,
        render: (e) => (e.purchase_id ? <EntityLink kind="factoring_purchase" id={e.purchase_id} label={e.purchase_display_id ?? "Purchase"} /> : "—"),
      },
      { key: "amount_cents", label: "Amount", kind: "money", sortable: true, render: (e) => formatUsdCents(e.amount_cents) },
      { key: "running_balance_cents", label: "Faro balance", kind: "money", sortable: true, render: (e) => (e.running_balance_cents == null ? "—" : formatUsdCents(e.running_balance_cents)) },
      {
        key: "journal_entry_id",
        label: "Posting",
        render: (e) =>
          e.journal_entry_id ? (
            <EntityLink kind="journal_entry" id={e.journal_entry_id} label="Posted" />
          ) : postHint(e) ? (
            <span className="text-slate-600">{postHint(e)}</span>
          ) : canPost && POSTABLE.includes(e.entry_kind) ? (
            <button
              type="button"
              className={ACTION}
              disabled={busy === e.id}
              data-testid={`faro-entry-post-${e.id}`}
              onClick={() =>
                void run(e.id, async () => {
                  const r = await postFaroReserveEntry(companyId, e.id);
                  if ("status" in r) {
                    // Faro's Schedule Fee is the Default Interest: interest through its date is proposed first and a
                    // second person approves it (Month close), then this line posts.
                    setMessage(
                      `Default interest of ${formatUsdCents(r.interest_due_cents)} through ${formatDateUS(e.entry_date)} proposed — a second person approves it on Month close, then post this line again.`
                    );
                  }
                  await refresh();
                })
              }
            >
              Post
            </button>
          ) : (
            <span className="text-slate-600">Not posted</span>
          ),
      },
    ],
    [busy, canPost, companyId]
  );

  const rows = entries.data?.rows ?? [];
  const title = register === "escrow" ? "Faro Escrow Reserve report (GL 1230)" : "Faro Cash Reserve report (GL 1235)";

  return (
    <DataPanel title={title}>
      {isOwner ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs" data-testid={`faro-import-${register}`}>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="text-xs"
            aria-label={`Faro ${register} reserve report CSV`}
            onChange={(ev) => {
              const file = ev.target.files?.[0];
              setPreview(null);
              setMessage(null);
              if (!file) return;
              void run("read", async () => {
                const text = await file.text();
                setCsvText(text);
                setPreview(await previewFaroReserveReport(companyId, register, text));
              });
            }}
          />
          {preview ? (
            <>
              <span className="tabular-nums text-slate-700">
                {preview.new_count} new · {preview.rows.length - preview.new_count} already imported · {preview.rejected.length} rejected ·
                ending balance {preview.ending_balance_cents == null ? "—" : formatUsdCents(preview.ending_balance_cents)}
                {preview.unresolved_invoice_count ? ` · ${preview.unresolved_invoice_count} with no purchase line for their Faro Inv yet` : ""}
              </span>
              <button
                type="button"
                className={ACTION}
                disabled={!csvText || preview.new_count === 0 || busy === "commit"}
                onClick={() =>
                  void run("commit", async () => {
                    const r = await commitFaroReserveReport(companyId, register, csvText!);
                    setMessage(`Imported ${r.imported} line(s) (${r.batch_ref}); ${r.already_imported} already imported; ${r.rejected.length} rejected.`);
                    setPreview(null);
                    setCsvText(null);
                    if (fileRef.current) fileRef.current.value = "";
                    await refresh();
                  })
                }
              >
                Import {preview.new_count} line(s)
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {preview?.rejected.length ? (
        <ul className="mb-2 list-disc pl-5 text-xs text-red-700" data-testid={`faro-import-rejected-${register}`}>
          {preview.rejected.map((r) => (
            <li key={`${r.line}-${r.reason}`}>
              Line {r.line}
              {r.faro_entry_id ? ` (Faro ID ${r.faro_entry_id})` : ""}: {r.reason.replace(/_/g, " ")}
              {r.detail ? ` — ${r.detail}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {message ? <p className="mb-2 text-xs text-slate-700">{message}</p> : null}
      {error ? <p className="mb-2 text-xs text-red-700" role="alert">{error}</p> : null}
      {entries.isError ? (
        <ListErrorState
          title="Couldn't load the Faro register"
          status={0}
          message={(entries.error as Error | undefined)?.message}
          onRetry={() => void entries.refetch()}
        />
      ) : (
        <ParityTable<FaroReserveEntry>
          columns={columns}
          rows={focusId ? [...rows].sort((a, b) => Number(b.id === focusId) - Number(a.id === focusId)) : rows}
          rowKey={(e) => e.id}
          loading={entries.isLoading}
          emptyText="No Faro report lines imported for this register yet."
          storageKey={`factoring-faro-register-${register}`}
          tableTestId={`factoring-faro-register-${register}`}
        />
      )}
    </DataPanel>
  );
}
