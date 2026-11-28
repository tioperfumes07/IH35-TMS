/**
 * SCENTSX item → Inventory / COGS accounts (migration 202617050100) — owner 2026-11-27 08:10 CT "money wiring etc chart of accounts …
 * assets". Books: every item category with the Inventory and COGS accounts its stock posts to (blank = the defaults 1200 / 5000), and the
 * history of every change. Item profile: which accounts this item posts to and where that comes from, with an override for one item.
 * The stock-move poster (reused) does the posting; this screen only says which account. Moving an inventory account is refused while
 * covered stock is on hand (the server says so).
 */
import { formatAccountDisplayLabel } from "../../lib/show-account-numbers";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { ParityTable } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import {
  getScentsxItemAccounts, getScentsxItemPostingAccounts, listScentsxAccounts, setScentsxCategoryAccounts, setScentsxItemAccounts,
  type ScentsxAccount, type ScentsxItemAccountMap,
} from "../../api/scentsx";
import { tr } from "./perfumeI18n";

const sel = "h-[30px] rounded-sm border border-[#C6D1DC] bg-white px-2 text-xs";
const label = (a: ScentsxAccount) => formatAccountDisplayLabel(a);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago" }) : "—");

function useAccountChoices() {
  const q = useQuery({ queryKey: ["scentsx", "accounts"], queryFn: listScentsxAccounts, staleTime: 60_000 });
  const all = q.data?.accounts ?? [];
  return {
    // Inventory in transit is the transfers' clearing account (role inventory_in_transit) — never an item's stock account.
    inventory: all.filter((a) => a.account_type === "Asset" && a.account_subtype === "Inventory" && !a.roles.includes("inventory_in_transit")),
    cogs: all.filter((a) => a.account_type === "CostOfGoodsSold"),
  };
}

function AccountPick({ value, options, onChange, placeholder, testId }: { value: string; options: ScentsxAccount[]; onChange: (v: string) => void; placeholder: string; testId?: string }) {
  return (
    <select className={sel} value={value} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} data-testid={testId}>
      <option value="">{placeholder}</option>
      {options.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}
    </select>
  );
}

/** Books → Item accounts. */
export function ScentsxItemAccountsBlock() {
  const { pushToast } = useToast();
  const q = useQuery({ queryKey: ["scentsx", "item-accounts"], queryFn: getScentsxItemAccounts });
  const choices = useAccountChoices();
  const [edit, setEdit] = useState<Record<string, { inv: string; cogs: string }>>({});
  if (q.isError) return <ListErrorState title={tr("scentsx.itemacct.error", "Couldn't load the item accounts")} status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} />;
  const d = q.data;
  const byCat = new Map((d?.mappings ?? []).filter((m) => m.scope === "category").map((m) => [(m.category ?? "").toLowerCase(), m]));
  const rows = (d?.categories ?? []).map((c) => ({ ...c, map: byCat.get(c.value.toLowerCase()) ?? null }));
  const save = (cat: string) => {
    const e = edit[cat]; if (!e) return;
    void setScentsxCategoryAccounts(cat, { inventory_account_id: e.inv || null, cogs_account_id: e.cogs || null })
      .then(() => { pushToast(`${cat}: accounts saved`, "success"); setEdit((x) => { const n = { ...x }; delete n[cat]; return n; }); void q.refetch(); })
      .catch((err) => pushToast(userFacingApiError(err, "Not saved"), "error"));
  };
  type Row = (typeof rows)[number];
  return (
    <section className="space-y-2" data-testid="scentsx-item-accounts">
      <div className="text-card-title">{tr("scentsx.itemacct.title", "Item accounts — where each item category's stock and cost of sales post")}</div>
      <div className="text-xs text-[#64748B]">
        {tr("scentsx.itemacct.defaults", "Blank uses the defaults")}: {d?.defaults.inventory_asset ?? "—"} · {d?.defaults.cogs_goods ?? "—"}. {tr("scentsx.itemacct.rule", "An inventory account cannot be moved while that category has stock on hand — reclass the value first. Sales income follows the channel (wholesale / retail / export).")}
      </div>
      <ParityTable<Row> selectable rows={rows} rowKey={(r) => r.value} loading={q.isLoading} storageKey="scentsx-item-accounts-v1" exportFilename="ScentsX item accounts" exportExcel
        emptyText="No item categories yet — add them on Catalogs or from the item creator."
        columns={[
          { className: "text-left", key: "value", label: "Item category", render: (r) => <span className="font-semibold">{r.value}</span> },
          { key: "items", sortable: true, label: "Items", kind: "number", cellClass: "text-right tabular-nums", render: (r) => r.items.toLocaleString("en-US") },
          { className: "text-left", key: "inv", label: "Inventory account", exportValue: (r) => r.map?.inventory_account ?? "default",
            render: (r) => <AccountPick value={edit[r.value]?.inv ?? r.map?.inventory_account_id ?? ""} options={choices.inventory} placeholder="Default inventory" testId={`scentsx-itemacct-inv-${r.value}`}
              onChange={(v) => setEdit({ ...edit, [r.value]: { inv: v, cogs: edit[r.value]?.cogs ?? r.map?.cogs_account_id ?? "" } })} /> },
          { className: "text-left", key: "cogs", label: "COGS account", exportValue: (r) => r.map?.cogs_account ?? "default",
            render: (r) => <AccountPick value={edit[r.value]?.cogs ?? r.map?.cogs_account_id ?? ""} options={choices.cogs} placeholder="Default COGS" testId={`scentsx-itemacct-cogs-${r.value}`}
              onChange={(v) => setEdit({ ...edit, [r.value]: { inv: edit[r.value]?.inv ?? r.map?.inventory_account_id ?? "", cogs: v } })} /> },
          { key: "save", label: "", render: (r) => (edit[r.value] ? <Button type="button" className="h-[28px] px-2 text-xs" onClick={() => save(r.value)}>{tr("scentsx.itemacct.save", "Save")}</Button> : null) },
        ]} />
      <ParityTable<ScentsxItemAccountMap["history"][number]> selectable cardTitle title={tr("scentsx.itemacct.history", "Item account changes")} rows={d?.history ?? []} rowKey={(h) => h.id}
        storageKey="scentsx-item-accounts-history-v1" exportFilename="ScentsX item account changes" exportExcel emptyText="No changes yet."
        columns={[
          { key: "created_at", sortable: true, label: "Set on", cellClass: "text-right tabular-nums", render: (h) => day(h.created_at) },
          { className: "text-left", key: "what", label: "For", render: (h) => (h.scope === "category" ? `Category: ${h.category}` : `Item: ${h.item}`) },
          { className: "text-left", key: "inventory_account", sortable: true, label: "Inventory", render: (h) => h.inventory_account ?? "default" },
          { className: "text-left", key: "cogs_account", sortable: true, label: "COGS", render: (h) => h.cogs_account ?? "default" },
          { className: "text-left", key: "created_by", sortable: true, label: "By", render: (h) => h.created_by ?? "—" },
          { key: "archived_at", sortable: true, label: "Replaced on", cellClass: "text-right tabular-nums", render: (h) => (h.archived_at ? day(h.archived_at) : "current") },
        ]} />
    </section>
  );
}

/** Item profile → which accounts this item posts to; override for this one item. */
export function ScentsxItemAccountLine({ itemId }: { itemId: string }) {
  const { pushToast } = useToast();
  const q = useQuery({ queryKey: ["scentsx", "item-posting", itemId], queryFn: () => getScentsxItemPostingAccounts(itemId) });
  const choices = useAccountChoices();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ inv: "", cogs: "" });
  const name = (id: string | null, list: ScentsxAccount[]) => (id ? (list.find((a) => a.id === id) ? label(list.find((a) => a.id === id)!) : id) : null);
  if (!q.data) return null;
  const src = q.data.source === "item" ? "this item's own setting" : q.data.source === "category" ? "its item category" : "the defaults";
  const save = () => void setScentsxItemAccounts(itemId, { inventory_account_id: v.inv || null, cogs_account_id: v.cogs || null })
    .then(() => { pushToast("Item accounts saved", "success"); setOpen(false); void q.refetch(); })
    .catch((err) => pushToast(userFacingApiError(err, "Not saved"), "error"));
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="scentsx-item-account-line">
      <span className="text-[#64748B]">{tr("scentsx.itemacct.posts", "Posts to")}:</span>
      <span>{name(q.data.inventory_account_id, choices.inventory) ?? "1200 Inventory (default)"} · {name(q.data.cogs_account_id, choices.cogs) ?? "5000 Cost of Goods Sold (default)"}</span>
      <span className="text-[#64748B]">({src})</span>
      {open ? (
        <>
          <AccountPick value={v.inv} options={choices.inventory} onChange={(x) => setV({ ...v, inv: x })} placeholder="Category / default inventory" />
          <AccountPick value={v.cogs} options={choices.cogs} onChange={(x) => setV({ ...v, cogs: x })} placeholder="Category / default COGS" />
          <Button type="button" className="h-[28px] px-2 text-xs" onClick={save}>{tr("scentsx.itemacct.save", "Save")}</Button>
          <button type="button" className="underline" onClick={() => setOpen(false)}>{tr("perfume.cat.cancel", "Cancel")}</button>
        </>
      ) : <button type="button" className="underline" onClick={() => { setV({ inv: q.data!.source === "item" ? q.data!.inventory_account_id ?? "" : "", cogs: q.data!.source === "item" ? q.data!.cogs_account_id ?? "" : "" }); setOpen(true); }}>{tr("scentsx.itemacct.override", "Set for this item")}</button>}
    </div>
  );
}
