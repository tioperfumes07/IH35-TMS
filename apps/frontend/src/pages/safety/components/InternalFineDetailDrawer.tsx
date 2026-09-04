import { formatDateUS } from "../../../lib/formatDate";
import { formatUsd } from "../../../lib/money";
import { internalFineDisplayId } from "../../../lib/internal-fine-display";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { entityLabel } from "../../../lib/entity-label";

type Props = {
  open: boolean;
  fine: Record<string, unknown> | null;
  onClose: () => void;
};

function toStatusLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "pending") return "Pending";
  if (normalized === "approved") return "Approved";
  if (normalized === "denied") return "Denied";
  if (normalized === "paid") return "Paid";
  if (normalized === "disputed") return "Disputed";
  if (normalized === "converted_to_liability") return "Converted to Liability";
  if (normalized === "voided") return "Voided";
  return value || "Pending";
}

export function InternalFineDetailDrawer({ open, fine, onClose }: Props) {
  if (!open || !fine) return null;

  const fineId = String(fine.id ?? "");
  const displayId = internalFineDisplayId(fine);

  return (
    <ParityDrawer open onClose={onClose} title="Internal Fine Detail" subtitle={displayId}>
      <div className="space-y-2 text-xs" data-testid="internal-fine-detail-drawer">
        <div><strong>Fine #:</strong> {displayId}</div>
        <div><strong>Date:</strong> {formatDateUS(fine.imposed_date)}</div>
        <div>
          <strong>Driver:</strong>{" "}
          <EntityLink
            kind="driver"
            id={fine.driver_id as string | undefined}
            label={entityLabel((fine.driver_name as string | undefined)?.trim(), String(fine.driver_id ?? ""), "Driver")}
          />
        </div>
        <div><strong>Reason:</strong> {String(fine.reason_name ?? fine.reason_code ?? "—")}</div>
        <div><strong>Amount:</strong> {formatUsd(fine.amount as string | number | null | undefined)}</div>
        <div><strong>Status:</strong> {toStatusLabel(String(fine.status ?? "pending"))}</div>
        <div>
          <strong>Related load:</strong>{" "}
          {fine.related_load_id ? (
            <EntityLink
              kind="load"
              id={String(fine.related_load_id)}
              label={entityLabel(fine.related_load_number, String(fine.related_load_id), "Load")}
              data-testid="internal-fine-related-load-link"
            />
          ) : (
            "—"
          )}
        </div>
        <div>
          <strong>Liability:</strong>{" "}
          {fine.driver_liability_id ? (
            <EntityLink kind="liability" id={String(fine.driver_liability_id)} label="Liability" />
          ) : (
            "—"
          )}
        </div>
        <div>
          <strong>Settlement deduction:</strong>{" "}
          {fine.settlement_deduction_id ? (
            <EntityLink kind="settlement_deduction" id={String(fine.settlement_deduction_id)} label="Deduction" />
          ) : (
            "—"
          )}
        </div>
        <div>
          <strong>Settlement:</strong>{" "}
          {fine.applied_to_settlement_id ? (
            <EntityLink kind="settlement" id={String(fine.applied_to_settlement_id)} label="Settlement" />
          ) : (
            "—"
          )}
        </div>
        {fine.notes ? (
          <div><strong>Notes:</strong> {String(fine.notes)}</div>
        ) : null}
        <div className="pt-2 text-xs text-slate-500">Record id: {fineId}</div>
      </div>
    </ParityDrawer>
  );
}
