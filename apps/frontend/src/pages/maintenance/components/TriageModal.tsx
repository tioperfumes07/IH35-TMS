import type { InTransitIssue } from "../../../api/maintenance";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { formatTriageLocation } from "../triage-location";

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
            <div><span className="font-semibold">Unit:</span> <EntityLinkOrTombstone kind="unit" id={issue.unit_id} name={issue.unit_display_id} noun="Unit" /></div>
            <div><span className="font-semibold">Driver:</span> <EntityLinkOrTombstone kind="driver" id={issue.driver_id} name={issue.driver_full_name} noun="Driver" /></div>
            <div><span className="font-semibold">Category:</span> {issue.issue_category}</div>
            <div><span className="font-semibold">Description:</span> {issue.issue_description}</div>
            {formatTriageLocation(issue) ? <div>{formatTriageLocation(issue)}</div> : null}
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
