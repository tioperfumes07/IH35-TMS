import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useState } from "react";
import { convertOcrIntakeToBookLoad, getOcrIntakeQueue, type OcrIntakeQueueItem } from "../../api/dispatch";
import { PageHeader } from "../../components/layout/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { BookLoadModal } from "./components/BookLoadModal";
import { buildTemplateJsonFromOcrItem } from "./ocr-book-load-prefill";

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.max(0, cents) / 100);
}

function ExtractedSummary({ item }: { item: OcrIntakeQueueItem }) {
  const f = item.extracted_fields ?? {};
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-700">
      <dt className="text-slate-500">Customer</dt>
      <dd>{f.customer_name_raw ?? "—"}</dd>
      <dt className="text-slate-500">Lane</dt>
      <dd>
        {[f.origin_city, f.origin_state].filter(Boolean).join(", ") || "—"} →{" "}
        {[f.destination_city, f.destination_state].filter(Boolean).join(", ") || "—"}
      </dd>
      <dt className="text-slate-500">Pickup</dt>
      <dd>{f.pickup_date ?? "—"}</dd>
      <dt className="text-slate-500">Delivery</dt>
      <dd>{f.delivery_date ?? "—"}</dd>
      <dt className="text-slate-500">Rate</dt>
      <dd>{f.rate_cents ? formatMoney(Number(f.rate_cents)) : "—"}</dd>
      <dt className="text-slate-500">Confidence</dt>
      <dd>{item.confidence_score != null ? `${Math.round(Number(item.confidence_score) * 100)}%` : "—"}</dd>
    </dl>
  );
}

function QueueRow({
  item,
  companyId,
  onConvert,
}: {
  item: OcrIntakeQueueItem;
  companyId: string;
  onConvert: (prefill: Record<string, unknown>) => void;
}) {
  const convertM = useMutation({
    mutationFn: () => convertOcrIntakeToBookLoad(item.id, { operating_company_id: companyId }),
    onSuccess: (res) => onConvert(res.book_load_prefill),
  });

  const canConvert = item.status === "ready_review";

  return (
    <tr className="border-b last:border-b-0" data-testid={`ocr-queue-row-${item.id}`}>
      <td className="px-3 py-2">
        <div className="font-medium">{item.email_subject || item.attachment_filename || "Rate con PDF"}</div>
        <div className="text-xs text-slate-500">{item.email_from ?? item.source}</div>
      </td>
      <td className="px-3 py-2">
        <StatusBadge status={item.status} />
        {item.error_message ? <div className="mt-1 text-xs text-red-700">{item.error_message}</div> : null}
      </td>
      <td className="px-3 py-2">
        {item.status === "ready_review" ? <ExtractedSummary item={item} /> : null}
        {item.status === "pending_ocr" || item.status === "processing" ? (
          <span className="text-xs text-amber-800">OCR processing…</span>
        ) : null}
      </td>
      <td className="px-3 py-2">
        {canConvert ? (
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
            disabled={convertM.isPending}
            onClick={() => convertM.mutate()}
            data-testid={`ocr-convert-${item.id}`}
          >
            Convert to load
          </button>
        ) : null}
      </td>
    </tr>
  );
}

export function OcrQueuePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [bookOpen, setBookOpen] = useState(false);
  const [bookPrefill, setBookPrefill] = useState<Record<string, unknown> | null>(null);

  const queueQ = useQuery({
    queryKey: ["dispatch", "ocr-intake-queue", companyId],
    queryFn: () => getOcrIntakeQueue(companyId),
    enabled: Boolean(companyId),
    refetchInterval: 15_000,
  });

  if (!companyId) {
    return <div className="rounded border bg-white p-4 text-sm text-slate-600">Select an operating company.</div>;
  }

  const items = queueQ.data?.items ?? [];

  return (
    <div data-testid="dispatch-ocr-queue-page" className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="OCR queue"
        subtitle="Email-forwarded rate cons · async OCR · review · convert to Book Load"
        actions={
          <Link to="/dispatch" className="rounded border px-3 py-1.5 text-sm">
            Dispatch home
          </Link>
        }
      />

      <p className="text-xs text-slate-600">
        Forward rate confirmations to your company intake address. Items appear here after OCR; use{" "}
        <strong>Convert to load</strong> to open Book Load with extracted fields. ARCHIVE-not-DELETE: Book Load dropzone
        remains for ad-hoc uploads — this page is the dedicated inbox (B21-D7).
      </p>

      <section className="overflow-x-auto rounded border bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Intake</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Extracted</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {queueQ.isLoading ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                  Loading OCR queue…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                  No pending OCR items. Forward a rate confirmation PDF to the intake webhook to enqueue.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <QueueRow
                  key={item.id}
                  item={item}
                  companyId={companyId}
                  onConvert={(prefill) => {
                    setBookPrefill(prefill);
                    setBookOpen(true);
                    void queryClient.invalidateQueries({ queryKey: ["dispatch", "ocr-intake-queue", companyId] });
                  }}
                />
              ))
            )}
          </tbody>
        </table>
      </section>

      <BookLoadModal
        open={bookOpen}
        operatingCompanyId={companyId}
        templatePrefillJson={bookPrefill}
        onClose={() => {
          setBookOpen(false);
          setBookPrefill(null);
        }}
        onCreated={() => {
          setBookOpen(false);
          setBookPrefill(null);
          void queryClient.invalidateQueries({ queryKey: ["dispatch", "ocr-intake-queue", companyId] });
        }}
      />
    </div>
  );
}

/** Exported for tests — maps queue row to template JSON without opening modal. */
export { buildTemplateJsonFromOcrItem };
