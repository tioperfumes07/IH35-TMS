import { Link } from "react-router-dom";
import { closeSettlementHref } from "../../lib/closeSettlementHref";

/** ROUND 443.293-B — one label, one wizard. 28px box, 12px, square corners. */
export function CloseSettlementLink({
  driverId,
  settlementId,
  testId = "dispatch-close-settlement",
}: {
  driverId: string;
  settlementId?: string | null;
  testId?: string;
}) {
  if (!driverId.trim()) return null;
  return (
    <Link
      to={closeSettlementHref(driverId, settlementId)}
      data-testid={testId}
      onClick={(event) => event.stopPropagation()}
      className="inline-flex h-7 items-center rounded-sm border border-[#E5E7EB] bg-white px-2 text-xs font-semibold text-[#14314F]"
    >
      Close settlement
    </Link>
  );
}
