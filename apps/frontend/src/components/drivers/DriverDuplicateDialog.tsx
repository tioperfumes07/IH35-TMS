/**
 * LEAD 11-03 (owner 9:38 AM CT: "when a driver appears as near duplicate we should be asked, instead of creating a new
 * one … window etc pop up up to size"). Shown when POST /api/v1/mdata/drivers answers 409 roster_duplicate_detected.
 * One driver profile per person: the default action is to open the existing profile (an inactive one is reopened
 * there); creating a second profile needs an explicit "different person" confirmation.
 * Size: owner popup standard 443.295 — review + decide = md (720px).
 */
import { useState } from "react";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { EntityLink } from "../shared/EntityLink";
import { formatDateUS } from "../../lib/formatDate";

export type DriverDuplicateCandidate = {
  driver_id: string;
  full_name: string;
  cdl_number: string | null;
  created_at: string;
  matched_on: string;
  reasons?: string[];
  strength?: "hard" | "strong" | "possible";
  state?: "active" | "inactive" | "deactivated" | "archived";
  status?: string | null;
  phone_last4?: string | null;
};

const REASON_LABEL: Record<string, string> = {
  cdl_exact: "Same CDL",
  curp_exact: "Same CURP",
  passport_exact: "Same passport",
  phone_exact: "Same phone",
  name_exact: "Same name",
  name_reordered: "Same name, different order",
  name_contains: "Shorter / longer form of the name",
  name_typo: "Name one or two letters apart",
  cdl_one_char: "CDL one character apart",
};

const STATE_LABEL: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  deactivated: "Deactivated",
  archived: "Archived",
};

export function reasonsLabel(c: DriverDuplicateCandidate): string {
  const list = c.reasons && c.reasons.length > 0 ? c.reasons : [c.matched_on];
  return list.map((r) => REASON_LABEL[r] ?? r).join(" · ");
}

type Props = {
  open: boolean;
  attemptedName: string;
  candidates: DriverDuplicateCandidate[];
  onOpenExisting: (driverId: string) => void;
  onCreateAnyway: () => void;
  onCancel: () => void;
};

export function DriverDuplicateDialog({ open, attemptedName, candidates, onOpenExisting, onCreateAnyway, onCancel }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const needsConfirm = candidates.some((c) => c.strength !== "possible");
  return (
    <Modal open={open} onClose={onCancel} title="This driver may already exist" size="md">
      <div className="space-y-3 text-xs text-[#0F1219]" data-testid="driver-duplicate-dialog">
        <p>
          {candidates.length === 1 ? "One existing driver profile" : `${candidates.length} existing driver profiles`} may be the same
          person as <strong>{attemptedName || "this driver"}</strong>. Each person has only one driver profile — open the existing one
          (an inactive profile can be reactivated there) instead of creating another.
        </p>
        <div className="overflow-x-auto rounded-sm border border-[#E5E7EB]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F7F8FA] text-[#4B5563]">
              <tr>
                <th className="px-2 py-1.5 font-medium">Driver</th>
                <th className="px-2 py-1.5 font-medium">Status</th>
                <th className="px-2 py-1.5 font-medium">CDL</th>
                <th className="px-2 py-1.5 font-medium">Phone</th>
                <th className="px-2 py-1.5 font-medium">Created</th>
                <th className="px-2 py-1.5 font-medium">Why it matched</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.driver_id} className="border-t border-[#E5E7EB]" data-testid={`driver-duplicate-row-${c.driver_id}`}>
                  <td className="px-2 py-1.5">
                    <EntityLink kind="driver" id={c.driver_id} label={c.full_name} />
                  </td>
                  <td className="px-2 py-1.5">{STATE_LABEL[c.state ?? "active"] ?? c.status ?? "—"}</td>
                  <td className="px-2 py-1.5">{c.cdl_number ? `…${c.cdl_number.slice(-4)}` : "—"}</td>
                  <td className="px-2 py-1.5">{c.phone_last4 ? `…${c.phone_last4}` : "—"}</td>
                  <td className="px-2 py-1.5">{formatDateUS(c.created_at)}</td>
                  <td className="px-2 py-1.5">{reasonsLabel(c)}</td>
                  <td className="px-2 py-1.5 text-right">
                    <Button type="button" size="sm" onClick={() => onOpenExisting(c.driver_id)} data-testid={`driver-duplicate-open-${c.driver_id}`}>
                      {c.state && c.state !== "active" ? "Open & reactivate" : "Use this driver"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {needsConfirm ? (
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              data-testid="driver-duplicate-confirm-different"
            />
            <span>I checked these profiles — this is a different person.</span>
          </label>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={needsConfirm && !confirmed}
            onClick={onCreateAnyway}
            data-testid="driver-duplicate-create-anyway"
          >
            Different person — create new driver
          </Button>
        </div>
      </div>
    </Modal>
  );
}
