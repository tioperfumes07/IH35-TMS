import { DateTime } from "luxon";
import { resolveAllocation, type AllocationRow } from "../accounting/allocation.js";
import type { InsuranceCoverageType } from "./policy.shared.js";

export const INSURANCE_PS_CATEGORY = "Insurance";
export const DEFAULT_DOWN_PAYMENT_INSTALLMENTS = 4;
export const DEFAULT_REMAINDER_INSTALLMENTS = 12;

export type DispersalCadence = "weekly" | "biweekly" | "monthly" | "quarterly";

export type InsuranceDispersalPolicy = {
  id: string;
  policy_number: string;
  insurer_name: string;
  coverage_type: InsuranceCoverageType | string;
  effective_date: string;
  expiry_date: string;
  total_premium_cents: number;
  down_payment_cents: number;
  installment_count: number;
  due_day: number | null;
  pay_day: number | null;
};

export type InsuranceDispersalUnit = {
  asset_id: string;
  insured_value_cents: number;
};

export type InsuranceDispersalOptions = {
  down_payment_installment_count?: number;
  down_payment_cadence?: DispersalCadence;
  remainder_cadence?: DispersalCadence;
  remainder_installment_count?: number;
};

export type InsuranceDispersalBill = {
  sequence: number;
  phase: "down_payment" | "remainder";
  amount_cents: number;
  due_date: string;
  scheduled_payment_date: string;
  ps_category: typeof INSURANCE_PS_CATEGORY;
  ps_item: string;
  vendor_name: string;
  policy_id: string;
  memo: string;
  allocations: AllocationRow[];
};

export type InsuranceDispersalResult = {
  bills: InsuranceDispersalBill[];
  total_count: number;
  total_amount_cents: number;
};

const COVERAGE_PS_ITEM: Record<string, string> = {
  auto_liability: "Auto Liability Premium",
  physical_damage: "Physical Damage Premium",
  cargo: "Cargo Premium",
  general_liability: "General Liability Premium",
  workers_comp: "Workers Comp Premium",
  trailer_interchange: "Trailer Interchange Premium",
  bobtail: "Bobtail Premium",
  non_trucking_liability: "Non-Trucking Liability Premium",
  umbrella: "Umbrella Premium",
  excess_liability: "Excess Liability Premium",
  occupational_accident: "Occupational Accident Premium",
  garage_keepers: "Garage Keepers Premium",
  reefer_breakdown: "Reefer Breakdown Premium",
  pollution: "Pollution Premium",
  cyber_liability: "Cyber Liability Premium",
};

export function coverageTypeToPsItem(coverageType: string) {
  return COVERAGE_PS_ITEM[coverageType] ?? "Insurance Premium";
}

export function splitCentsExact(totalCents: number, installmentCount: number) {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error("dispersal_total_cents_invalid");
  }
  if (!Number.isInteger(installmentCount) || installmentCount <= 0) {
    throw new Error("dispersal_installment_count_invalid");
  }
  const base = Math.floor(totalCents / installmentCount);
  const remainder = totalCents - base * installmentCount;
  return Array.from({ length: installmentCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

function clampDay(day: number, date: DateTime) {
  return Math.min(Math.max(day, 1), date.daysInMonth ?? 28);
}

function withDay(date: DateTime, day: number) {
  return date.set({ day: clampDay(day, date) });
}

function addCadence(date: DateTime, cadence: DispersalCadence, steps: number) {
  if (cadence === "weekly") return date.plus({ weeks: steps });
  if (cadence === "biweekly") return date.plus({ weeks: steps * 2 });
  if (cadence === "monthly") return date.plus({ months: steps });
  return date.plus({ months: steps * 3 });
}

function cadenceStepDays(cadence: DispersalCadence) {
  if (cadence === "weekly") return 7;
  if (cadence === "biweekly") return 14;
  return 30;
}

function buildScheduleDates(input: {
  startDate: string;
  count: number;
  cadence: DispersalCadence;
  dueDay: number;
  payDay: number;
  phase: "down_payment" | "remainder";
}) {
  const anchor = DateTime.fromISO(input.startDate, { zone: "utc" });
  if (!anchor.isValid) throw new Error("dispersal_start_date_invalid");

  const rows: Array<{ due_date: string; scheduled_payment_date: string }> = [];
  for (let index = 0; index < input.count; index += 1) {
    if (input.phase === "down_payment" && input.cadence === "weekly") {
      const due = anchor.plus({ days: index * cadenceStepDays(input.cadence) });
      const payOffset = Math.max(0, input.payDay - input.dueDay);
      const scheduled = due.plus({ days: payOffset });
      rows.push({
        due_date: due.toISODate()!,
        scheduled_payment_date: scheduled.toISODate()!,
      });
      continue;
    }

    const monthBase = addCadence(anchor, input.cadence, index);
    const due = withDay(monthBase, input.dueDay);
    const scheduled = withDay(monthBase, input.payDay);
    rows.push({
      due_date: due.toISODate()!,
      scheduled_payment_date: scheduled.toISODate()!,
    });
  }
  return rows;
}

function allocateBill(
  amountCents: number,
  coveredUnits: InsuranceDispersalUnit[]
): AllocationRow[] {
  return resolveAllocation(
    "by_value",
    coveredUnits.map((unit) => ({
      id: unit.asset_id,
      insured_value_cents: unit.insured_value_cents,
    })),
    amountCents
  );
}

export function computeInsuranceDispersal(
  policy: InsuranceDispersalPolicy,
  coveredUnits: InsuranceDispersalUnit[],
  options: InsuranceDispersalOptions = {}
): InsuranceDispersalResult {
  if (!Array.isArray(coveredUnits) || coveredUnits.length === 0) {
    throw new Error("dispersal_covered_units_required");
  }
  if (!Number.isInteger(policy.total_premium_cents) || policy.total_premium_cents <= 0) {
    throw new Error("dispersal_total_premium_invalid");
  }
  if (policy.down_payment_cents < 0 || policy.down_payment_cents > policy.total_premium_cents) {
    throw new Error("dispersal_down_payment_invalid");
  }

  const dueDay = policy.due_day ?? 5;
  const payDay = policy.pay_day ?? 10;
  const downPaymentCadence = options.down_payment_cadence ?? "weekly";
  const remainderCadence = options.remainder_cadence ?? "monthly";
  const downPaymentInstallments =
    policy.down_payment_cents > 0
      ? options.down_payment_installment_count ?? DEFAULT_DOWN_PAYMENT_INSTALLMENTS
      : 0;
  const remainderInstallments =
    options.remainder_installment_count ??
    (policy.installment_count > 0 ? policy.installment_count : DEFAULT_REMAINDER_INSTALLMENTS);

  const remainderCents = policy.total_premium_cents - policy.down_payment_cents;
  const downAmounts =
    downPaymentInstallments > 0 ? splitCentsExact(policy.down_payment_cents, downPaymentInstallments) : [];
  const remainderAmounts =
    remainderCents > 0 ? splitCentsExact(remainderCents, remainderInstallments) : [];

  const downDates =
    downAmounts.length > 0
      ? buildScheduleDates({
          startDate: policy.effective_date,
          count: downAmounts.length,
          cadence: downPaymentCadence,
          dueDay,
          payDay,
          phase: "down_payment",
        })
      : [];

  const remainderStart = DateTime.fromISO(policy.effective_date, { zone: "utc" }).plus({
    weeks: downAmounts.length,
  });
  const remainderDates =
    remainderAmounts.length > 0
      ? buildScheduleDates({
          startDate: remainderStart.toISODate()!,
          count: remainderAmounts.length,
          cadence: remainderCadence,
          dueDay,
          payDay,
          phase: "remainder",
        })
      : [];

  const psItem = coverageTypeToPsItem(String(policy.coverage_type));
  const bills: InsuranceDispersalBill[] = [];
  let sequence = 1;

  for (let index = 0; index < downAmounts.length; index += 1) {
    const amountCents = downAmounts[index]!;
    bills.push({
      sequence,
      phase: "down_payment",
      amount_cents: amountCents,
      due_date: downDates[index]!.due_date,
      scheduled_payment_date: downDates[index]!.scheduled_payment_date,
      ps_category: INSURANCE_PS_CATEGORY,
      ps_item: psItem,
      vendor_name: policy.insurer_name,
      policy_id: policy.id,
      memo: `insurance_policy_id=${policy.id}; ${policy.policy_number} down-payment ${index + 1}/${downAmounts.length}`,
      allocations: allocateBill(amountCents, coveredUnits),
    });
    sequence += 1;
  }

  for (let index = 0; index < remainderAmounts.length; index += 1) {
    const amountCents = remainderAmounts[index]!;
    bills.push({
      sequence,
      phase: "remainder",
      amount_cents: amountCents,
      due_date: remainderDates[index]!.due_date,
      scheduled_payment_date: remainderDates[index]!.scheduled_payment_date,
      ps_category: INSURANCE_PS_CATEGORY,
      ps_item: psItem,
      vendor_name: policy.insurer_name,
      policy_id: policy.id,
      memo: `insurance_policy_id=${policy.id}; ${policy.policy_number} remainder ${index + 1}/${remainderAmounts.length}`,
      allocations: allocateBill(amountCents, coveredUnits),
    });
    sequence += 1;
  }

  const totalAmountCents = bills.reduce((sum, bill) => sum + bill.amount_cents, 0);
  return {
    bills,
    total_count: bills.length,
    total_amount_cents: totalAmountCents,
  };
}

export function buildInsuranceGenerateBillsResponse(result: InsuranceDispersalResult) {
  return {
    bills: result.bills,
    total_count: result.total_count,
    total_amount: result.total_amount_cents / 100,
    total_amount_cents: result.total_amount_cents,
  };
}
