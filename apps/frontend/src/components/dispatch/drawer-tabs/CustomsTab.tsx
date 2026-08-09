import { entityLabel } from "../../../lib/entity-label";

type Props = { loadId: string; operatingCompanyId: string; canEdit: boolean };

/** Stub — cross-border customs UI delivered by Lane B Block 8. Only shown for loads with a border stop. */
export function CustomsTab({ loadId }: Props) {
  return (
    <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600" data-testid="drawer-customs-tab-stub">
      Customs &amp; border compliance for load <span className="text-xs">{entityLabel(null, loadId, "Load")}</span> — content ships in Block 8.
    </div>
  );
}
