import { Link } from "react-router-dom";
import type { SettlementReference } from "../../api/driverFinance";

export function SettlementReferenceCell({ reference }: { reference?: SettlementReference | null }) {
  const id = reference?.settlement_id ?? reference?.presettlement_id;
  const label = reference?.settlement_display_id ?? reference?.presettlement_display_id;
  // ACCT-F20260911: an open pre-settlement has no AlwaysTrack number yet — link it, label it "Open".
  if (!id) return <span data-testid="settlement-reference-cell">—</span>;
  if (!label) {
    return (
      <Link className="font-medium text-[#2563EB] hover:underline" data-testid="settlement-reference-cell" to={`/settlements/${id}`}>
        {reference?.settlement_id ? "—" : "Open"}
      </Link>
    );
  }
  return (
    <Link
      className="font-medium text-[#2563EB] hover:underline"
      data-testid="settlement-reference-cell"
      to={`/settlements/${id}`}
    >
      {reference?.settlement_id ? label : `Presettlement ${label}`}
    </Link>
  );
}
