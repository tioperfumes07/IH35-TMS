import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  convertOcrIntakeToBookLoad,
  finalizeOcrIntakeConversion,
  getOcrIntakeQueue,
  reprocessOcrIntakeItem,
  type OcrIntakeQueueItem,
} from "../../api/dispatch";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { StatusBadge } from "../../components/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { BookLoadModal } from "./components/BookLoadModal";
import { buildTemplateJsonFromOcrItem } from "./ocr-book-load-prefill";
import { formatUsdCents } from "../../lib/money";
import { formatDateUS } from "../../lib/formatDate";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { entityLabel } from "../../lib/entity-label";

function formatMoney(cents: number): string {
  return formatUsdCents(Math.max(0, cents));
}

function ExtractedSummary({ item }: { item: OcrIntakeQueueItem }) {
  const f = item.extracted_fields ?? {};
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-700">
      <dt className="text-slate-500">Customer</dt>
      <dd>
        {f.customer_id ? (
          <EntityLinkOrTombstone kind="customer" id={f.customer_id} name={f.customer_name_raw} noun="Customer" />
        ) : (
          entityLabel(f.customer_name_raw, null, "Customer")
        )}
      </dd>
      <dt className="text-slate-500">Lane</dt>
      <dd>
        {[f.origin_city, f.origin_state].filter(Boolean).join(", ") || "—"} →{" "}
        {[f.destination_city, f.destination_state].filter(Boolean).join(", ") || "—"}
      </dd>
      <dt className="text-slate-500">Pickup</dt>
      <dd>{formatDateUS(f.pickup_date) || "—"}</dd>
      <dt className="text-slate-500">Delivery</dt>
      <dd>{formatDateUS(f.delivery_date) || "—"}</dd>
      <dt className="text-slate-500">Rate</dt>
      <dd>{f.rate_cents ? formatMoney(Number(f.rate_cents)) : "—"}</dd>
      <dt className="text-slate-500">Confidence</dt>
      <dd>{item.confidence_score != null ? `${Math.round(Number(item.confidence_score) * 100)}%` : "—"}</dd>
    </dl>
  );
}

// Per-row action button — kept as its own component (not a plain column render) so the convert
// mutation's hooks are scoped to a stable per-row instance, same as the original QueueRow.
function canReprocessOcrItem(item: OcrIntakeQueueItem): boolean {
  return item.status === "failed" || Boolean(item.error_message);
}

function RowActions({
  item,
  companyId,
  onConvert,
  onReprocessed,
}: {
  item: OcrIntakeQueueItem;
  companyId: string;
  onConvert: (itemId: string, prefill: Record<string, unknown>) => void;
  onReprocessed: () => void;
}) {
  const convertM = useMutation({
    mutationFn: () => convertOcrIntakeToBookLoad(item.id, { operating_company_id: companyId }),
    onSuccess: (res) => onConvert(item.id, res.book_load_prefill),
  });
  const reprocessM = useMutation({
    mutationFn: () => reprocessOcrIntakeItem(item.id, companyId),
    onSuccess: () => onReprocessed(),
  });

  return (
    <div className="flex flex-wrap gap-2">
      {item.converted_load_id ? (
        <EntityLinkOrTombstone kind="load" id={item.converted_load_id} name={null} noun="Load" />
      ) : null}
      {item.status === "ready_review" ? (
        <button
          type="button"
          className="rounded-sm border border-slate-300 px-2 py-1 text-xs text-slate-700"
          disabled={convertM.isPending}
          onClick={() => convertM.mutate()}
          data-testid={`ocr-convert-${item.id}`}
        >
          Convert to load
        </button>
      ) : null}
      {canReprocessOcrItem(item) ? (
        <button
          type="button"
          className="rounded-sm border border-slate-300 bg-slate-100 px-2 py-1 text-xs text-slate-700"
          disabled={reprocessM.isPending}
          onClick={() => reprocessM.mutate()}
          data-testid={`ocr-reprocess-${item.id}`}
        >
          {reprocessM.isPending ? "Reprocessing…" : "Reprocess OCR"}
        </button>
      ) : null}
    </div>
  );
}

export function OcrQueuePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [bookOpen, setBookOpen] = useState(false);
  const [bookPrefill, setBookPrefill] = useState<Record<string, unknown> | null>(null);
  const [bookSourceItemId, setBookSourceItemId] = useState<string | null>(null);

  const queueQ = useQuery({
    queryKey: ["dispatch", "ocr-intake-queue", companyId],
    queryFn: () => getOcrIntakeQueue(companyId),
    enabled: Boolean(companyId),
    refetchInterval: 15_000,
  });

  if (!companyId) {
    return <div className="rounded-sm border bg-white p-4 text-sm text-slate-600">Select an operating company.</div>;
  }

  const items = queueQ.data?.items ?? [];
  type OcrRow = (typeof items)[number];

  const handleConvert = (itemId: string, prefill: Record<string, unknown>) => {
    setBookSourceItemId(itemId);
    setBookPrefill(prefill);
    setBookOpen(true);
    void queryClient.invalidateQueries({ queryKey: ["dispatch", "ocr-intake-queue", companyId] });
  };

  // Migrated to the shared QBO-parity grid — columns, order, and per-row convert action preserved
  // verbatim (§7 additive-only).
  const columns: Array<ParityColumn<OcrRow>> = [
    {
      key: "email_subject",
      label: "Intake",
      sortable: true,
      render: (item) => (
        <>
          <div className="font-medium">{item.email_subject || item.attachment_filename || "Rate con PDF"}</div>
          <div className="text-xs text-slate-500">{item.email_from ?? item.source}</div>
        </>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (item) => (
        <>
          <StatusBadge status={item.status} />
          {item.error_message ? <div className="mt-1 text-xs text-red-700">{item.error_message}</div> : null}
        </>
      ),
    },
    {
      key: "confidence_score",
      label: "Extracted",
      render: (item) => (
        <>
          {item.status === "ready_review" ? <ExtractedSummary item={item} /> : null}
          {item.status === "pending_ocr" || item.status === "processing" ? (
            <span className="text-xs text-slate-700">OCR processing…</span>
          ) : null}
        </>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      alwaysVisible: true,
      render: (item) => (
        <RowActions
          item={item}
          companyId={companyId}
          onConvert={handleConvert}
          onReprocessed={() => {
            void queryClient.invalidateQueries({ queryKey: ["dispatch", "ocr-intake-queue", companyId] });
          }}
        />
      ),
    },
  ];

  return (
    <div data-testid="dispatch-ocr-queue-page" className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="OCR queue"
        subtitle="Email-forwarded rate cons · async OCR · review · convert to Book Load"
        actions={
          <Link to="/dispatch" className="rounded-sm border px-3 py-1.5 text-sm">
            Dispatch home
          </Link>
        }
      />

      <p className="text-xs text-slate-600">
        Forward rate confirmations to your company intake address. Items appear here after OCR; use{" "}
        <strong>Convert to load</strong> to open Book Load with extracted fields, or{" "}
        <strong>Reprocess OCR</strong> when extraction failed. ARCHIVE-not-DELETE: Book Load dropzone remains for ad-hoc
        uploads — this page is the dedicated inbox (B21-D7).
      </p>

      {/* CLS-LIST-ERROR-STATE-UNGUARDED: a failed query fell through to the empty state — an outage presenting as no documents awaiting OCR. */}
      {queueQ.isError ? (
        <ListErrorState
          title="Couldn't load the OCR queue"
          status={0}
          message={(queueQ.error as Error)?.message}
          onRetry={() => void queueQ.refetch()}
        />
      ) : (
      <ParityTable<OcrRow>
        columns={columns}
        rows={items}
        rowKey={(item) => item.id}
        loading={queueQ.isLoading}
        emptyText="No pending OCR items. Forward a rate confirmation PDF to the intake webhook to enqueue."
        storageKey="dispatch-ocr-queue"
        rowTestId={(item) => `ocr-queue-row-${item.id}`}
      />
      )}

      <BookLoadModal
        open={bookOpen}
        operatingCompanyId={companyId}
        templatePrefillJson={bookPrefill}
        onClose={() => {
          setBookOpen(false);
          setBookPrefill(null);
          setBookSourceItemId(null);
        }}
        onCreated={(created) => {
          if (!created?.id || !bookSourceItemId) return;
          void finalizeOcrIntakeConversion(bookSourceItemId, {
            operating_company_id: companyId,
            load_id: created.id,
          }).then(() => {
            setBookOpen(false);
            setBookPrefill(null);
            setBookSourceItemId(null);
            void queryClient.invalidateQueries({ queryKey: ["dispatch", "ocr-intake-queue", companyId] });
          });
        }}
      />
    </div>
  );
}

/** Exported for tests — maps queue row to template JSON without opening modal. */
export { buildTemplateJsonFromOcrItem };
