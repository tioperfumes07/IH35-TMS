import { useMemo } from "react";
import type { AllocationMethod } from "../../api/insurance";

export type CostPerVehicleResult = {
  costPerVehiclePerMonthCents: number[];
  totalMonthlyPremiumCents: number;
  costPerVehicleDisplay: string;
};

function splitCentsExact(totalCents: number, count: number): number[] {
  if (count <= 0 || totalCents <= 0) return Array(count).fill(0);
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function useCostPerVehicle(
  totalPremiumCents: number,
  termMonths: number,
  unitCount: number,
  allocationMethod: AllocationMethod
): CostPerVehicleResult {
  return useMemo(() => {
    if (totalPremiumCents <= 0 || termMonths <= 0 || unitCount <= 0) {
      return {
        costPerVehiclePerMonthCents: [],
        totalMonthlyPremiumCents: 0,
        costPerVehicleDisplay: "$0.00 / vehicle / mo",
      };
    }

    const monthlyTotal = Math.round(totalPremiumCents / termMonths);

    let perUnit: number[];
    if (allocationMethod === "equal_split" || allocationMethod === "pro_rata") {
      perUnit = splitCentsExact(monthlyTotal, unitCount);
    } else {
      perUnit = splitCentsExact(monthlyTotal, unitCount);
    }

    const representativeCents = perUnit[0] ?? 0;
    const allSame = perUnit.every((c) => c === representativeCents);
    const display = allSame
      ? `${formatCurrency(representativeCents)} / vehicle / mo`
      : `~${formatCurrency(representativeCents)} / vehicle / mo (varies)`;

    return {
      costPerVehiclePerMonthCents: perUnit,
      totalMonthlyPremiumCents: monthlyTotal,
      costPerVehicleDisplay: display,
    };
  }, [totalPremiumCents, termMonths, unitCount, allocationMethod]);
}
