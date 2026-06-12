export type FeeTier = {
  from_day: number;
  to_day: number | null;
  fee_rate: number;
};

export type ReserveTier = {
  from_day: number;
  to_day: number | null;
  reserve_rate: number;
};

export type FeeApplicationMode = "replace" | "segmented" | "additive";
export const FEE_APPLICATION_MODES: FeeApplicationMode[] = ["replace", "segmented", "additive"];

export class TierValidationError extends Error {
  constructor(readonly field: string, message: string) {
    super(message);
    this.name = "TierValidationError";
  }
}

function validateTiers(
  tiers: unknown,
  field: "fee_schedule" | "reserve_schedule",
  rateKey: "fee_rate" | "reserve_rate"
): void {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    throw new TierValidationError(field, `${field}: must be a non-empty array`);
  }

  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i] as Record<string, unknown>;

    if (typeof t.from_day !== "number" || !Number.isInteger(t.from_day) || t.from_day < 0) {
      throw new TierValidationError(field, `${field}[${i}].from_day must be a non-negative integer`);
    }
    if (t.to_day !== null && t.to_day !== undefined) {
      if (typeof t.to_day !== "number" || !Number.isInteger(t.to_day) || (t.to_day as number) <= t.from_day) {
        throw new TierValidationError(
          field,
          `${field}[${i}].to_day must be an integer greater than from_day, or null`
        );
      }
    }

    const rate = t[rateKey];
    if (typeof rate !== "number" || rate < 0 || rate > 1) {
      throw new TierValidationError(field, `${field}[${i}].${rateKey} must be a number in [0, 1]`);
    }

    const isLast = i === tiers.length - 1;
    if (isLast && t.to_day !== null && t.to_day !== undefined) {
      throw new TierValidationError(
        field,
        `${field}: last tier must have to_day = null (open-ended, "and beyond")`
      );
    }
    if (!isLast && (t.to_day === null || t.to_day === undefined)) {
      throw new TierValidationError(
        field,
        `${field}[${i}]: only the last tier may have to_day = null`
      );
    }
  }

  const first = tiers[0] as Record<string, unknown>;
  if (first.from_day !== 0) {
    throw new TierValidationError(field, `${field}: first tier must start at from_day = 0`);
  }

  for (let i = 1; i < tiers.length; i++) {
    const prev = tiers[i - 1] as Record<string, unknown>;
    const curr = tiers[i] as Record<string, unknown>;
    if (curr.from_day !== prev.to_day) {
      throw new TierValidationError(
        field,
        `${field}: gap or overlap between tier[${i - 1}].to_day=${prev.to_day} and tier[${i}].from_day=${curr.from_day} — tiers must be contiguous`
      );
    }
  }
}

export function validateFeeSchedule(tiers: unknown): void {
  validateTiers(tiers, "fee_schedule", "fee_rate");
}

export function validateReserveSchedule(tiers: unknown): void {
  validateTiers(tiers, "reserve_schedule", "reserve_rate");
}

export function validateFeeApplicationMode(mode: unknown): void {
  if (!FEE_APPLICATION_MODES.includes(mode as FeeApplicationMode)) {
    throw new TierValidationError(
      "fee_application_mode",
      `fee_application_mode must be one of: ${FEE_APPLICATION_MODES.join(", ")}`
    );
  }
}
