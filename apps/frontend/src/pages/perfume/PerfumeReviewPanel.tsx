/** PERFUME-DESK — lines that did not link on their own. The owner confirms once; the desk remembers it. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Combobox } from "../../components/Combobox";
import { ParityTable } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { confirmPerfumeRow, getPerfumeReview, listPerfumeLists, searchPerfumeItems, type PerfumeReviewRow } from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { ListErrorState } from "../../components/ListErrorState";

const PAGE = 100;
const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PerfumeReviewPanel() {
  const [page, setPage] = useState(1);
  // Owner 2026-11-12: "where do I review the Esperanza items?" — review one vendor's list at a time.
  const [listId, setListId] = useState<string | null>(null);
  const lists = useQuery({ queryKey: ["perfume", "lists"], queryFn: listPerfumeLists });
  const listOptions = (lists.data?.lists ?? []).filter((l) => l.is_current)
    .map((l) => ({ value: l.id, label: `${l.vendor_name} · ${String(l.list_date).slice(0, 10)}`, sublabel: l.file_name }));
  const q = useQuery({ queryKey: ["perfume", "review", page, listId], queryFn: () => getPerfumeReview((page - 1) * PAGE, PAGE, listId), placeholderData: (p) => p });
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  if (q.isError) {
    return <ListErrorState title={tr("perfume.review.loadError", "Couldn't load the review lines")} status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} />;
  }
  return (
    <section className="space-y-2" aria-label={tr("perfume.review.1", "Review")}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="w-[360px] max-w-full text-xs text-gray-700">
          {tr("perfume.review.listFilter", "Vendor list")}
          <Combobox
            ariaLabel={tr("perfume.review.listFilter", "Vendor list")}
            allowClear
            value={listId}
            onChange={(v) => { setListId((v as string | null) || null); setPage(1); }}
            options={listOptions}
            placeholder={tr("perfume.review.allLists", "All vendors")}
            dataTestId="perfume-review-list-filter"
          />
        </label>
      </div>
      <div className="text-xs text-gray-600">
        {total.toLocaleString()} {tr("perfume.review.2", "lines need you. A line links to an item only when you confirm it — then every future list from that vendor with the same spelling or SKU links by itself. Nothing here counts in any price until confirmed.")}
      </div>
      {/* TABLE_DATE_OMIT: review queue is unresolved import lines waiting for owner confirm — no per-row event date. */}
      <ParityTable<PerfumeReviewRow>
        rows={q.data?.rows ?? []}
        rowKey={(r) => r.id}
        loading={q.isLoading}
        storageKey="perfume-desk-review-v1"
        hidePager
        page={1}
        pageSize={Math.max(1, q.data?.rows?.length ?? PAGE)}
        emptyText="Nothing to review."
        columns={[
          { key: "vendor_name", label: "Vendor", sortable: true },
          { key: "row_no", label: "Row", sortable: true, kind: "number" },
          { key: "upc", label: "UPC", sortable: true },
          { key: "sku", label: "Vendor code", sortable: true },
          { key: "brand_name", label: "Brand", sortable: true, render: (r) => r.brand_name ?? "—" },
          { key: "model", label: "Model", sortable: true, allowWrap: true, minWidth: 180, render: (r) => r.model ?? "—" },
          { key: "size_ml", label: "Size ml", sortable: true, kind: "number", render: (r) => (r.size_ml == null ? "—" : String(r.size_ml)) },
          { key: "conc", label: "Type", sortable: true, render: (r) => r.conc || "—" },
          { key: "gender", label: "Gender", sortable: true, render: (r) => r.gender || "—" },
          { key: "category", label: "Category", sortable: true, render: (r) => r.category || "—" },
          { key: "flags", label: "Tester / set", sortable: true, render: (r) => r.flags || "—" },
          { key: "country", label: "Country", sortable: true, render: (r) => r.country ?? "—" },
          { key: "case_pack", label: "Case pack", sortable: true, kind: "number", render: (r) => (r.case_pack == null ? "—" : String(r.case_pack)) },
          { key: "description", label: "Their line", sortable: true, allowWrap: true, minWidth: 220 },
          { key: "price_cents", label: "Price", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.price_cents) },
          { key: "suggestions", label: "Best suggestion", allowWrap: true, minWidth: 280, sortValue: (r) => r.suggestions[0]?.score ?? 0,
            render: (r) => (r.suggestions[0] ? <span>{r.suggestions[0].display_name} <span className="text-gray-500">({Math.round(r.suggestions[0].score * 100)}{tr("perfume.review.3", "% alike ·")} {r.suggestions[0].why})</span></span> : <span className="text-gray-500">{tr("perfume.review.4", "No close item")}</span>) },
        ]}
        rowActions={(r) => <ConfirmControls row={r} />}
        rowActionsWidth={420}
      />
      <div className="flex items-center justify-end gap-1 text-xs text-gray-600">
        <span className="mr-2">{tr("perfume.review.5", "page")} {page} {tr("perfume.review.6", "of")} {pages}</span>
        <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tr("perfume.review.7", "Previous")}</Button>
        <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={page >= pages} onClick={() => setPage(page + 1)}>{tr("perfume.review.8", "Next")}</Button>
      </div>
    </section>
  );
}

function ConfirmControls({ row }: { row: PerfumeReviewRow }) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [pick, setPick] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const hits = useQuery({ queryKey: ["perfume", "items", search], queryFn: () => searchPerfumeItems(search), enabled: search.trim().length >= 2 });
  const options = [
    ...row.suggestions.map((s) => ({ value: s.item_id, label: s.display_name, sublabel: `${Math.round(s.score * 100)}% alike` })),
    ...(hits.data?.items ?? []).filter((h) => !row.suggestions.some((s) => s.item_id === h.id)).map((h) => ({ value: h.id, label: h.display_name, sublabel: h.upcs?.join(" ") ?? "" })),
  ];
  const go = async (target: { item_id: string } | { create_new: true }) => {
    try {
      const r = await confirmPerfumeRow(row.id, target);
      await qc.invalidateQueries({ queryKey: ["perfume"] });
      pushToast(`Linked ${r.rows_linked} line${r.rows_linked === 1 ? "" : "s"}`, "success");
    } catch (e) { pushToast(userFacingApiError(e, "Not linked"), "error"); }
  };
  return (
    <span className="flex items-center gap-1">
      <span className="w-[240px]">
        <Combobox ariaLabel="Item" size="sm" value={pick} onChange={setPick} onSearch={setSearch} options={options} placeholder={tr("perfume.review.9", "Pick or search the item")} />
      </span>
      <Button type="button" className="h-[34px] px-2 text-xs" disabled={!pick} onClick={() => pick && void go({ item_id: pick })}>{tr("perfume.review.10", "Confirm")}</Button>
      <Button type="button" variant="secondary" className="h-[34px] px-2 text-xs" onClick={() => void go({ create_new: true })}>{tr("perfume.review.11", "New item")}</Button>
    </span>
  );
}
