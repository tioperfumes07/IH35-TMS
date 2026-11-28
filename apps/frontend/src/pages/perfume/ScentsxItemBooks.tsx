/**
 * SCENTSX M21 (LEAD ROUND L.32) — Items → books. Every stock item with the ScentsX accounts it posts to (inventory 1201–1204 /
 * COGS 5001–5004 by its category, else 1200 / 5000; income by channel 4000 / 4010 / 4020) and its product in Products & Services.
 * Bulk: "Make ScentsX item" for the ticked rows or for ALL matching (500 at a time until none is left), and "Set category" for
 * ALL matching (the item file's own bulk edit, 500 at a time) so the category's accounts apply.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ParityTable } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { getScentsxItemBooks, makeScentsxItems, syncScentsxItemAccounts, type ScentsxItemBookRow, type ScentsxItemBooksFilter } from "../../api/scentsx";
import { bulkEditPerfumeItems, listPerfumeCatalogs } from "../../api/perfume";
import { DASH } from "./perfumeDocParts";

const PAGE = 100;
const ctl = "h-[28px] rounded-sm border border-[#C6D1DC] px-1 text-xs";
const btn = "h-[28px] rounded-sm border border-[#1F2A44] bg-white px-2 text-xs font-semibold text-[#1F2A44] disabled:opacity-50";

export function ScentsxItemBooks() {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [f, setF] = useState<ScentsxItemBooksFilter>({ linked: "no" });
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [setCat, setSetCat] = useState("");
  const q = useQuery({ queryKey: ["scentsx", "item-books", f, page], queryFn: () => getScentsxItemBooks({ ...f, limit: PAGE, offset: page * PAGE }) });
  const cats = useQuery({ queryKey: ["perfume", "catalogs"], queryFn: listPerfumeCatalogs, staleTime: 60_000 });
  const categories = cats.data?.kinds.find((k) => k.kind === "item_category")?.values.map((v) => v.value) ?? [];
  const d = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ["scentsx", "item-books"] });
  const upd = (p: Partial<ScentsxItemBooksFilter>) => { setF((x) => ({ ...x, ...p })); setPage(0); };

  const makeTicked = async (rows: ScentsxItemBookRow[]) => {
    setBusy("Making ScentsX items…");
    try { const r = await makeScentsxItems({ item_ids: rows.map((x) => x.id) }); pushToast(`${r.created} made · ${r.already_linked} already ScentsX items`, "success"); await refresh(); }
    catch (e) { pushToast(userFacingApiError(e, "Not made"), "error"); } finally { setBusy(null); }
  };
  const makeAll = async () => {
    let made = 0;
    try {
      for (;;) {
        const r = await makeScentsxItems({ filter: f, max: 500 });
        made += r.created;
        setBusy(`Making ScentsX items… ${made.toLocaleString("en-US")} made, ${(r.remaining ?? 0).toLocaleString("en-US")} left`);
        if (!r.remaining || r.created === 0) break;
      }
      pushToast(`${made.toLocaleString("en-US")} ScentsX items made`, "success");
    } catch (e) { pushToast(userFacingApiError(e, `Stopped after ${made} made`), "error"); }
    finally { setBusy(null); await refresh(); }
  };
  const syncAccounts = async () => {
    let done = 0;
    try {
      for (;;) {
        const r = await syncScentsxItemAccounts(500);
        done += r.updated;
        setBusy(`Updating ScentsX items… ${done.toLocaleString("en-US")} updated, ${r.remaining.toLocaleString("en-US")} left`);
        if (!r.remaining || r.updated === 0) break;
      }
      pushToast(`${done.toLocaleString("en-US")} ScentsX items now post to their category's COGS account`, "success");
    } catch (e) { pushToast(userFacingApiError(e, `Stopped after ${done} updated`), "error"); }
    finally { setBusy(null); await refresh(); }
  };
  const setCategoryAll = async () => {
    if (!setCat || !d) return;
    let done = 0;
    try {
      // The item file's own bulk edit (history row per item), 500 at a time, over every row the filter matches.
      // Rows that leave the filter once set (a category filter other than the one being set) are read again from the top.
      const leaves = !!f.category && f.category !== setCat;
      for (let off = 0, n = 0; off < d.total && n <= Math.ceil(d.total / 500); off += 500, n++) {
        const chunk = await getScentsxItemBooks({ ...f, limit: 500, offset: leaves ? 0 : off });
        if (!chunk.rows.length) break;
        await bulkEditPerfumeItems({ ids: chunk.rows.map((r) => r.id), set: { category: setCat } });
        done += chunk.rows.length;
        setBusy(`Setting category ${setCat}… ${done.toLocaleString("en-US")} of ${d.total.toLocaleString("en-US")}`);
      }
      pushToast(`${done.toLocaleString("en-US")} items set to ${setCat}`, "success");
    } catch (e) { pushToast(userFacingApiError(e, `Stopped after ${done}`), "error"); }
    finally { setBusy(null); await refresh(); }
  };

  return (
    <div className="space-y-2 rounded-[3px] border border-[#D8E0E8] p-3" data-testid="scentsx-item-books">
      <div className="text-xs font-bold uppercase text-[#14314F]">Items → books</div>
      <p className="text-xs text-gray-600">
        {`Income by sales channel: ${(d?.income_accounts ?? []).map((a) => `${a.number} ${a.name}`).join(" · ") || DASH}. Inventory and COGS by the item's category (set them under Item accounts above).`}
      </p>
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label>Search <input className={ctl} value={f.q ?? ""} onChange={(e) => upd({ q: e.target.value || undefined })} data-testid="scentsx-item-books-q" /></label>
        <label>Category{" "}
          <select className={ctl} value={f.category ?? ""} onChange={(e) => upd({ category: e.target.value || undefined })} data-testid="scentsx-item-books-category">
            <option value="">All</option><option value="none">No category</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>Conc.{" "}
          <select className={ctl} value={f.conc ?? ""} onChange={(e) => upd({ conc: e.target.value || undefined })} data-testid="scentsx-item-books-conc">
            <option value="">All</option>{["EDP", "EDT", "EDC", "PARFUM", "EXTRAIT", "MIST"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>ScentsX item{" "}
          <select className={ctl} value={f.linked ?? ""} onChange={(e) => upd({ linked: (e.target.value || undefined) as ScentsxItemBooksFilter["linked"] })} data-testid="scentsx-item-books-linked">
            <option value="">All</option><option value="no">Not yet</option><option value="yes">Made</option>
          </select>
        </label>
        <button type="button" className={btn} disabled={!!busy || !d?.total || f.linked === "yes"} onClick={() => void makeAll()} data-testid="scentsx-item-books-make-all">
          {`Make ScentsX item — all ${(d ? d.total - d.linked : 0).toLocaleString("en-US")} matching`}
        </button>
        {d?.account_drift ? (
          <button type="button" className={btn} disabled={!!busy} onClick={() => void syncAccounts()} data-testid="scentsx-item-books-sync">
            {`Update COGS account on ${d.account_drift.toLocaleString("en-US")} ScentsX items whose category changed`}
          </button>
        ) : null}
        <label>Set category{" "}
          <select className={ctl} value={setCat} onChange={(e) => setSetCat(e.target.value)} data-testid="scentsx-item-books-setcat">
            <option value="">—</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <button type="button" className={btn} disabled={!!busy || !setCat || !d?.total} onClick={() => void setCategoryAll()} data-testid="scentsx-item-books-setcat-all">
          {`Set for all ${(d?.total ?? 0).toLocaleString("en-US")} matching`}
        </button>
      </div>
      {busy ? <div className="text-xs font-semibold text-[#1F2A44]" data-testid="scentsx-item-books-busy">{busy}</div> : null}
      <div className="text-xs text-gray-700" data-testid="scentsx-item-books-count">
        {d ? `${d.total.toLocaleString("en-US")} items match · ${d.linked.toLocaleString("en-US")} already ScentsX items · showing ${d.rows.length ? page * PAGE + 1 : 0}–${page * PAGE + d.rows.length}` : ""}
        {d && d.total > PAGE ? (
          <span className="ml-2">
            <button type="button" className="underline disabled:opacity-40" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>{" · "}
            <button type="button" className="underline disabled:opacity-40" disabled={(page + 1) * PAGE >= d.total} onClick={() => setPage((p) => p + 1)}>Next</button>
          </span>
        ) : null}
      </div>
      {/* TABLE_DATE_OMIT: an item-to-account setup list — each row is an item's current account mapping, not a dated event (LEAD fix for main red after #30023). */}
      <ParityTable<ScentsxItemBookRow> selectable
        rows={d?.rows ?? []} rowKey={(r) => r.id} loading={q.isLoading} storageKey="scentsx-item-books-v1" exportFilename="ScentsX items to books" exportExcel
        hidePager page={1} pageSize={PAGE} emptyText="No items match."
        batchActions={(sel) => <button type="button" className={btn} disabled={!!busy} onClick={() => void makeTicked(sel)} data-testid="scentsx-item-books-make-ticked">{`Make ScentsX item (${sel.length})`}</button>}
        columns={[
          { className: "text-left", key: "display_name", sortable: true, label: "Item", render: (r) => r.display_name, exportValue: (r) => r.display_name },
          { className: "text-left", key: "category", sortable: true, label: "Category", render: (r) => r.category ?? DASH, exportValue: (r) => r.category ?? "" },
          { className: "text-left", key: "inventory_account", sortable: true, label: "Inventory account", render: (r) => r.inventory_account ?? DASH, exportValue: (r) => r.inventory_account ?? "" },
          { className: "text-left", key: "cogs_account", sortable: true, label: "COGS account", render: (r) => r.cogs_account ?? DASH, exportValue: (r) => r.cogs_account ?? "" },
          { className: "text-left", key: "accounts_from", sortable: true, label: "Accounts from", render: (r) => (r.accounts_from === "role" ? "Default (no category)" : r.accounts_from === "category" ? "Its category" : "Item override"), exportValue: (r) => r.accounts_from },
          { className: "text-left", key: "catalog_item_name", label: "ScentsX item", render: (r) => (r.catalog_item_id ? <Link className="underline" to={`/catalogs/items?id=${encodeURIComponent(r.catalog_item_id)}`}>{r.catalog_item_name}</Link> : "Not yet"), exportValue: (r) => r.catalog_item_name ?? "" },
        ]}
      />
    </div>
  );
}
