/** PERFUME-DESK — lines that did not link on their own. The owner confirms once; the desk remembers it. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Combobox } from "../../components/Combobox";
import { ParityTable } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { confirmPerfumeRow, getPerfumeReview, searchPerfumeItems, type PerfumeReviewRow } from "../../api/perfume";

const PAGE = 100;
const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PerfumeReviewPanel() {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ["perfume", "review", page], queryFn: () => getPerfumeReview((page - 1) * PAGE, PAGE), placeholderData: (p) => p });
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  return (
    <section className="space-y-2" aria-label="Review">
      <div className="text-xs text-gray-600">
        {total.toLocaleString()} lines need you. A line links to an item only when you confirm it — then every future list from that vendor with the
        same spelling or SKU links by itself. Nothing here counts in any price until confirmed.
      </div>
      <ParityTable<PerfumeReviewRow>
        rows={q.data?.rows ?? []}
        rowKey={(r) => r.id}
        loading={q.isLoading}
        storageKey="perfume-desk-review-v1"
        hidePager
        page={1}
        pageSize={Math.max(1, q.data?.rows.length ?? PAGE)}
        emptyText="Nothing to review."
        columns={[
          { key: "vendor_name", label: "Vendor", sortable: true },
          { key: "row_no", label: "Row", sortable: true, kind: "number" },
          { key: "upc", label: "UPC", sortable: true },
          { key: "sku", label: "SKU", sortable: true },
          { key: "description", label: "Their line", sortable: true, allowWrap: true, minWidth: 260 },
          { key: "price_cents", label: "Price", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.price_cents) },
          { key: "suggestions", label: "Best suggestion", allowWrap: true, minWidth: 280, sortValue: (r) => r.suggestions[0]?.score ?? 0,
            render: (r) => (r.suggestions[0] ? <span>{r.suggestions[0].display_name} <span className="text-gray-500">({Math.round(r.suggestions[0].score * 100)}% alike · {r.suggestions[0].why})</span></span> : <span className="text-gray-500">No close item</span>) },
        ]}
        rowActions={(r) => <ConfirmControls row={r} />}
        rowActionsWidth={420}
      />
      <div className="flex items-center justify-end gap-1 text-xs text-gray-600">
        <span className="mr-2">page {page} of {pages}</span>
        <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
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
        <Combobox ariaLabel="Item" size="sm" value={pick} onChange={setPick} onSearch={setSearch} options={options} placeholder="Pick or search the item" />
      </span>
      <Button type="button" className="h-[34px] px-2 text-xs" disabled={!pick} onClick={() => pick && void go({ item_id: pick })}>Confirm</Button>
      <Button type="button" variant="secondary" className="h-[34px] px-2 text-xs" onClick={() => void go({ create_new: true })}>New item</Button>
    </span>
  );
}
