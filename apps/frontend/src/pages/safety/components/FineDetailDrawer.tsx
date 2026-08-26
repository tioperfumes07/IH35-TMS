import { useCallback, useEffect, useRef, useState } from "react";
import { formatDateUS } from "../../../lib/formatDate";
import { useEscapeKey } from "../../../hooks/useEscapeKey";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { FineConvertConfirmModal } from "./FineConvertConfirmModal";
import { FineLifecycleActions } from "./FineLifecycleActions";
import { FinePaymentLinkBanner } from "./FinePaymentLinkBanner";
import { entityLabel } from "../../../lib/entity-label";

type Props = {
  open: boolean;
  fine: Record<string, unknown> | null;
  operatingCompanyId: string;
  converting?: boolean;
  onClose: () => void;
  onConvertToLiability: (fineId: string) => void;
  onUpdated: () => void;
};

const DRAWER_TITLE = "Fine Detail";

export function FineDetailDrawer({
  open,
  fine,
  operatingCompanyId,
  converting,
  onClose,
  onConvertToLiability,
  onUpdated,
}: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setConfirmOpen(false);
  }, [open, operatingCompanyId, fine?.id]);

  const handleClose = useCallback(() => {
    setConfirmOpen(false);
    onClose();
  }, [onClose]);

  useEscapeKey(handleClose, open && Boolean(fine));

  useEffect(() => {
    if (!open || !fine) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, fine]);

  useEffect(() => {
    if (!open || !fine) return;
    const firstInput = panelRef.current?.querySelector<HTMLElement>("button, input, select, textarea");
    firstInput?.focus();
  }, [open, fine]);

  if (!open || !fine) return null;

  const fineId = String(fine.id ?? "");
  const canConvert =
    String(fine.subject_type ?? "") === "driver" &&
    !fine.converted_to_liability_id &&
    ["open", "reduced"].includes(String(fine.status ?? ""));

  return (
    <>
      {/* SAF-F25: was a bespoke <aside> with its own backdrop, z-index, width, escape handling and
          focus behaviour — a second drawer implementation living beside the shared one, so every
          fix to drawer chrome had to be made twice and this copy silently drifted. ParityDrawer is
          the single surface (Law §3). The panel ref stays for the existing focus behaviour. */}
      <ParityDrawer open onClose={handleClose} title={DRAWER_TITLE}>
        <div ref={panelRef as React.RefObject<HTMLDivElement>} data-testid="fine-detail-drawer">
        <div className="mt-3 space-y-2 text-sm">
          <div><strong>Status:</strong> {String(fine.status ?? "open")}</div>
          <div><strong>Subject:</strong> {String(fine.subject_type ?? "—")}</div>
          {fine.subject_driver_id ? (
            <div>
              <strong>Driver:</strong>{" "}
              <EntityLink
                kind="driver"
                id={String(fine.subject_driver_id)}
                label={entityLabel(fine.subject_driver_name, String(fine.subject_driver_id), "Driver")}
              />
            </div>
          ) : null}
          <div><strong>Violation:</strong> {String(fine.violation_description ?? "—")}</div>
          <div><strong>Authority:</strong> {String(fine.issued_by_authority ?? "—")}</div>
          {/* SAF-F19: the fine has always been able to name the load and unit it came from
              (safety.civil_fines.related_load_id / related_unit_id, migration 0050) and the drawer
              never showed either — so an overweight ticket could not be traced to the truck or the
              trip that earned it. Both drill through; absent values say so rather than rendering an
              empty row that looks like missing data. */}
          <div>
            <strong>Related unit:</strong>{" "}
            {fine.related_unit_id ? (
              <EntityLink
                kind="unit"
                id={String(fine.related_unit_id)}
                label={entityLabel(fine.related_unit_number, String(fine.related_unit_id), "Unit")}
                data-testid="fine-related-unit-link"
              />
            ) : (
              "—"
            )}
          </div>
          <div>
            <strong>Related load:</strong>{" "}
            {fine.related_load_id ? (
              <EntityLink
                kind="load"
                id={String(fine.related_load_id)}
                label={entityLabel(fine.related_load_number, String(fine.related_load_id), "Load")}
                data-testid="fine-related-load-link"
              />
            ) : (
              "—"
            )}
          </div>
          <div><strong>Issued date:</strong> {formatDateUS(fine.issued_date)}</div>
          <div><strong>Amount:</strong> ${(Number(fine.amount_cents ?? 0) / 100).toFixed(2)}</div>
          <div>
            <strong>Converted liability:</strong>{" "}
            {fine.converted_to_liability_id ? (
              <EntityLink
                kind="liability"
                id={String(fine.converted_to_liability_id)}
                label="Liability"
              />
            ) : (
              "No"
            )}
          </div>
          {/* gl_je column-wave (2026-08-12): the company-paid expense leg posts to the GL
              (accounting/safety-fine-posting/poster.service.ts) but the id was write-only until
              fines.routes.ts started joining accounting.civil_fine_postings back in — same
              reverse-drill discipline as EscrowPage.tsx / BillDetailPage.tsx. Absent (driver-recovery
              fine, unpaid fine, or flag off) says so rather than rendering an empty row. */}
          <div>
            <strong>Expense journal entry:</strong>{" "}
            {fine.journal_entry_id ? (
              <EntityLink
                kind="journal_entry"
                id={String(fine.journal_entry_id)}
                label="Journal entry"
                data-testid="fine-journal-entry-link"
              />
            ) : (
              "—"
            )}
          </div>
        </div>

        <div className="mt-3">
          <FinePaymentLinkBanner
            bankTransactionId={String(fine.paid_via_bank_transaction_id ?? "") || null}
            paidDate={String(fine.paid_date ?? "") || null}
            paidAmountCents={Number(fine.paid_amount_cents ?? 0)}
          />
        </div>

        {canConvert ? (
          <div className="mt-4 rounded-sm border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <p>Converting this fine creates a driver liability and locks violation/amount fields.</p>
            <button
              type="button"
              className="mt-2 rounded-sm bg-slate-700 px-3 py-1 font-semibold text-white"
              onClick={() => setConfirmOpen(true)}
            >
              Convert to Driver Liability
            </button>
          </div>
        ) : null}

        {/* SAF-B12: contest / dismiss / reduce / link-payment. These four routes have existed and been
            audited in apps/backend/src/safety/fines.routes.ts since BT-3-SAFETY-GAPS-FILL and had ZERO
            frontend callers — the drawer's only action was "Convert to Driver Liability", so a wrongly
            issued authority citation could not be contested or dismissed at all. Every state gate inside
            is transcribed from the route handler; the server rule is mirrored, never replaced. */}
        <FineLifecycleActions
          fine={fine}
          operatingCompanyId={operatingCompanyId}
          onUpdated={onUpdated}
        />
        </div>
      </ParityDrawer>

      <FineConvertConfirmModal
        open={confirmOpen}
        amountCents={Number(fine.amount_cents ?? 0)}
        driverLabel={(fine.subject_driver_name as string | undefined)?.trim() || "driver"}
        loading={converting}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          onConvertToLiability(fineId);
          setConfirmOpen(false);
        }}
      />
    </>
  );
}
