/**
 * LEAD 443.243 — open fuel-question count badge (Load Costs + Fuel module nav).
 */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { countOpenFuelAssignmentQuestions } from "../../../api/fuelAssignmentQuestions";

type Props = {
  operatingCompanyId: string;
  /** Destination when clicked. Default: Fuel questions tab. */
  href?: string;
  className?: string;
};

export function FuelQuestionsBadge({
  operatingCompanyId,
  href = "/fuel/questions",
  className = "",
}: Props) {
  const countQuery = useQuery({
    queryKey: ["fuel", "assignment-questions", "open-count", operatingCompanyId],
    queryFn: () => countOpenFuelAssignmentQuestions(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
    refetchInterval: 60_000,
  });
  const count = countQuery.data?.count ?? 0;
  if (!operatingCompanyId) return null;

  return (
    <Link
      to={href}
      className={`inline-flex items-center gap-1 rounded-sm border border-[#C7D2DC] bg-[#EEF2F6] px-2 text-xs font-semibold text-[#1F2A44] hover:bg-[#E5E7EB] ${className}`}
      style={{ height: 28 }}
      data-testid="fuel-questions-badge"
      title="Open fuel assignment questions"
    >
      Fuel questions
      <span
        className="inline-block min-w-[1.25rem] rounded-sm bg-[#14314F] px-1 text-center text-section-header font-bold text-white"
        data-testid="fuel-questions-badge-n"
      >
        {count}
      </span>
    </Link>
  );
}
