/**
 * LEAD 443.243 — "Fuel questions" list (Fuel module tab + Load Costs surface).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listFuelAssignmentQuestions,
  type FuelAssignmentQuestion,
} from "../../../api/fuelAssignmentQuestions";
import { FuelAssignmentPopup } from "./FuelAssignmentPopup";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { userFacingApiError } from "../../../lib/api-error-message";
import { QBO_MONEY_CELL_CLASS } from "../../../design/qbo-parity";

type Props = {
  operatingCompanyId: string;
  /** Optional load filter (Load Costs drawer / board). */
  loadId?: string;
};

function money(cents: string | null): string {
  if (cents == null || cents === "") return "—";
  const n = Number(cents);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
}

export function FuelQuestionsPanel({ operatingCompanyId, loadId }: Props) {
  const queryClient = useQueryClient();
  const [active, setActive] = useState<FuelAssignmentQuestion | null>(null);

  const listQuery = useQuery({
    queryKey: ["fuel", "assignment-questions", operatingCompanyId, "open", loadId ?? ""],
    queryFn: () =>
      listFuelAssignmentQuestions(operatingCompanyId, {
        status: "open",
        loadId,
        limit: 100,
      }),
    enabled: Boolean(operatingCompanyId),
    refetchInterval: 60_000,
  });

  const rows = listQuery.data?.rows ?? [];
  const total = listQuery.data?.total ?? 0;

  return (
    <div className="space-y-3" data-testid="fuel-questions-panel">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-section-header font-bold uppercase text-[#4B5563]">
          Fuel questions
          <span
            className="ml-2 inline-block rounded-sm border border-[#C7D2DC] bg-[#EEF2F6] px-2 py-px font-bold text-[#1F2A44]"
            data-testid="fuel-questions-badge-count"
          >
            {total}
          </span>
        </h2>
      </div>

      {listQuery.isError ? (
        <ListErrorBanner message={userFacingApiError(listQuery.error, "Could not load fuel questions")} />
      ) : null}

      {listQuery.isLoading ? (
        <p className="text-xs text-[#6B7280]">Loading open fuel questions…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-sm border border-dashed border-[#E5E7EB] bg-[#F7F8FA] p-3 text-xs text-[#6B7280]" data-testid="fuel-questions-empty">
          No open fuel assignment questions. When a fill is not 100% certain, it appears here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" data-testid="fuel-questions-table">
            <thead>
              <tr>
                {[
                  "Fill (Central)",
                  "Station",
                  "Gallons",
                  "Amount",
                  "Card truck",
                  "Proposed truck",
                  "Proposed load",
                  "Settlement",
                  "",
                ].map((h) => (
                  <th
                    key={h || "act"}
                    className="border border-[#E5E7EB] bg-[#F7F8FA] px-2 py-1.5 text-center text-section-header font-bold uppercase text-[#4B5563]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-testid={`fuel-question-row-${r.id}`}>
                  <td className="border border-[#E5E7EB] px-2 py-1.5 text-center text-xs whitespace-nowrap">
                    {r.fill_moment_ct ?? "—"}
                  </td>
                  <td className="border border-[#E5E7EB] px-2 py-1.5 text-center text-xs">{r.station ?? "—"}</td>
                  <td className="border border-[#E5E7EB] px-2 py-1.5 text-center text-xs">{r.gallons ?? "—"}</td>
                  <td className={`border border-[#E5E7EB] px-2 py-1.5 text-xs whitespace-nowrap ${QBO_MONEY_CELL_CLASS}`}>
                    {money(r.amount_cents)}
                  </td>
                  <td className="border border-[#E5E7EB] px-2 py-1.5 text-center text-xs font-semibold">
                    {r.card_unit_number ?? "—"}
                  </td>
                  <td className="border border-[#E5E7EB] px-2 py-1.5 text-center text-xs">
                    {r.proposed_unit_number ?? "—"}
                  </td>
                  <td className="border border-[#E5E7EB] px-2 py-1.5 text-center text-xs font-semibold">
                    {r.proposed_load_number ?? "—"}
                  </td>
                  <td className="border border-[#E5E7EB] px-2 py-1.5 text-center text-xs">
                    {r.proposed_settlement_ref ?? "—"}
                  </td>
                  <td className="border border-[#E5E7EB] px-2 py-1.5 text-center">
                    <button
                      type="button"
                      className="rounded-sm border border-[#14314F] bg-[#14314F] px-2 text-xs font-semibold text-white"
                      style={{ height: 28 }}
                      data-testid={`fuel-question-open-${r.id}`}
                      onClick={() => setActive(r)}
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FuelAssignmentPopup
        open={active != null}
        operatingCompanyId={operatingCompanyId}
        question={active}
        onClose={() => setActive(null)}
        onAnswered={() => {
          setActive(null);
          void queryClient.invalidateQueries({ queryKey: ["fuel", "assignment-questions"] });
        }}
      />
    </div>
  );
}
