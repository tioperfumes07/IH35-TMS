import { Link } from "react-router-dom";
import type { SettlementReference } from "../../api/driverFinance";

export function SettlementReferenceCell({ reference }: { reference?: SettlementReference | null }) {
  const id = reference?.settlement_id ?? reference?.presettlement_id;
  const label = reference?.settlement_display_id ?? reference?.presettlement_display_id;
  if (!id || !label) return <span data-testid="settlement-reference-cell">—</span>;
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
