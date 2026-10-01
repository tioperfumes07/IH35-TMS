/**
 * R313 Cursor item 2 — /factoring/advances/:id drawer.
 * Both-way EntityLinks: load · invoice(s) · bank wire. Closes back to /factoring/advances.
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { getFactoringAdvance, type FactoringAdvanceDetail } from "../../api/accounting";
import { ParityDrawer } from "../../components/parity/ParityDrawer";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorState } from "../../components/ListErrorState";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { entityLabel } from "../../lib/entity-label";
import { formatUsdCents } from "../../lib/money";
import { formatDateUS } from "../../lib/formatDate";

/** Locked section header — GLOBAL-TYPE-SIZE-BASELINE via .text-section-header (11px), no raw text-[Npx]. */
const SECTION_HEADER_CLASS = "text-section-header font-bold uppercase tracking-wide text-[#4B5563]";

function money(cents: number | string | null | undefined) {
  return formatUsdCents(Number(cents ?? 0));
}

function loadIdFromDetail(detail: FactoringAdvanceDetail): string | null {
  if (detail.source_load_id) return detail.source_load_id;
  return null;
}

export function FactoringAdvanceDrawer({
  advanceId,
  open,
  onClose,
}: {
  advanceId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { selectedCompanyId } = useCompanyContext();
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ["factoring", "advance-drawer", selectedCompanyId, advanceId],
    queryFn: () => getFactoringAdvance(advanceId, selectedCompanyId!),
    enabled: Boolean(open && advanceId && selectedCompanyId),
  });

  const detail = query.data;
  const loadId = detail ? loadIdFromDetail(detail) : null;
  const loadLabel = detail?.source_load_number ?? (loadId ? loadId.slice(0, 8) : null);

  return (
    <ParityDrawer
      open={open}
      size="wide"
      title={detail ? entityLabel(detail.display_id, detail.id, "Advance") : "Factoring advance"}
      subtitle={detail ? `Factor: ${detail.factoring_company_name}` : undefined}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/accounting/factoring/${advanceId}`)}
            data-testid="factoring-advance-drawer-full-page"
          >
            Open full page
          </Button>
          <Button size="sm" variant="secondary" onClick={onClose} data-testid="factoring-advance-drawer-close">
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-xs" data-testid="factoring-advance-drawer-body">
        {query.isPending ? <p className="text-gray-500">Loading advance…</p> : null}
        {query.isError ? (
          <ListErrorState
            title="Couldn't load factoring advance"
            status={0}
            message={(query.error as Error | undefined)?.message}
            onRetry={() => void query.refetch()}
          />
        ) : null}
        {detail ? (
          <>
            <div className="rounded-sm border border-[#E5E7EB] bg-white p-3" data-testid="factoring-advance-drawer-links">
              <div className={`mb-2 ${SECTION_HEADER_CLASS}`}>Linked both ways</div>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-gray-600">Load</span>
                  {loadId ? (
                    <EntityLink kind="load" id={loadId} label={entityLabel(loadLabel, loadId, "Load")} data-testid="factoring-advance-drawer-load" />
                  ) : (
                    <span className="text-gray-500" data-testid="factoring-advance-drawer-load-empty">
                      — (no source load on this advance)
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-gray-600">Invoice(s)</span>
                  {detail.invoices.length === 0 ? (
                    <span className="text-gray-500" data-testid="factoring-advance-drawer-invoice-empty">
                      — (pre-invoice purchase or none linked)
                    </span>
                  ) : (
                    detail.invoices.map((inv) => (
                      <EntityLink
                        key={inv.id}
                        kind="invoice"
                        id={inv.id}
                        label={entityLabel(inv.display_id, inv.id, "Invoice")}
                        data-testid={`factoring-advance-drawer-invoice-${inv.id}`}
                      />
                    ))
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-gray-600">Bank wire</span>
                  {detail.matched_bank_transaction_id ? (
                    <EntityLink
                      kind="bank_transaction"
                      id={detail.matched_bank_transaction_id}
                      label={
                        detail.matched_bank_transaction_description
                          ? `${detail.matched_bank_transaction_date ? formatDateUS(String(detail.matched_bank_transaction_date)) + " · " : ""}${detail.matched_bank_transaction_description}${detail.matched_bank_transaction_amount_cents != null ? ` · ${money(detail.matched_bank_transaction_amount_cents)}` : ""}`
                          : entityLabel(null, detail.matched_bank_transaction_id, "Bank wire")
                      }
                      data-testid="factoring-advance-drawer-bank-wire"
                    />
                  ) : (
                    <span className="text-gray-500" data-testid="factoring-advance-drawer-bank-wire-empty">
                      — (no matched bank line yet)
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-sm border border-[#E5E7EB] bg-white p-3">
                <div className={SECTION_HEADER_CLASS}>Amounts</div>
                <div className="mt-2 space-y-1 text-gray-900">
                  <div className="flex justify-between gap-2"><span className="text-gray-600">Invoice total</span><span>{money(detail.invoice_total_cents)}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-gray-600">Advance</span><span>{money(detail.advance_amount_cents)}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-gray-600">Reserve</span><span>{money(detail.reserve_amount_cents)}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-gray-600">Fee</span><span>{money(detail.factor_fee_cents)}</span></div>
                </div>
              </div>
              <div className="rounded-sm border border-[#E5E7EB] bg-white p-3">
                <div className={SECTION_HEADER_CLASS}>Status</div>
                <div className="mt-2 space-y-1 text-gray-900">
                  <div className="flex justify-between gap-2"><span className="text-gray-600">Status</span><span className="capitalize">{detail.status.replaceAll("_", " ")}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-gray-600">Submitted</span><span>{formatDateUS(detail.submitted_at)}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-gray-600">Batch ref</span><span>{detail.submission_batch_ref ?? "—"}</span></div>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </ParityDrawer>
  );
}

export function FactoringAdvanceDrawerRoute() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  return (
    <FactoringAdvanceDrawer
      advanceId={id}
      open={Boolean(id)}
      onClose={() => navigate("/factoring/advances")}
    />
  );
}
