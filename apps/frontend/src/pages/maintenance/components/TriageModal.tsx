import type { InTransitIssue } from "../../../api/maintenance";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";

type Props = {
  open: boolean;
  issue: InTransitIssue | null;
  onClose: () => void;
  onConvertToWo: (issue: InTransitIssue) => void;
  onConvertToDamage: (issue: InTransitIssue) => void;
};

export function TriageModal({ open, issue, onClose, onConvertToWo, onConvertToDamage }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="In-Transit Issue Triage">
      {!issue ? null : (
        <div className="space-y-3 text-sm">
          <div className="rounded-sm border border-gray-200 bg-gray-50 p-2">
            <div><span className="font-semibold">Unit:</span> <EntityLink kind="unit" id={issue.unit_id} label={entityLabel(issue.unit_display_id, issue.unit_id, "Unit")} /></div>
            <div><span className="font-semibold">Driver:</span> <EntityLink kind="driver" id={issue.driver_id} label={entityLabel(issue.driver_full_name, issue.driver_id, "Driver")} /></div>
            <div><span className="font-semibold">Category:</span> {issue.issue_category}</div>
            <div><span className="font-semibold">Description:</span> {issue.issue_description}</div>
            <div><span className="font-semibold">GPS:</span> {issue.gps_lat ?? "-"}, {issue.gps_lng ?? "-"} {issue.gps_label ?? ""}</div>
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={() => onConvertToWo(issue)}>Convert to Work Order</Button>
            <Button type="button" variant="secondary" onClick={() => onConvertToDamage(issue)}>Convert to Damage Report</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
