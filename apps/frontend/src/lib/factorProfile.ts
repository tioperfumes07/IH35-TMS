/**
 * FACT-kpi-vs-profile / CLS-DUAL-PATH — factor profile reads/writes
 * factoring.factor columns (advance_rate / fee_rate / reserve_rate /
 * remittance_details / fee_schedule / reserve_schedule), never vendor notes.
 */
import type { Factor } from "../api/factoring";

export type FactorRemittanceDetails = {
  telephone?: string;
  address?: string;
  generalEmail?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  accountingContact?: string;
  disputesContact?: string;
  /** Optional extras not modeled as flat columns (display/edit only). */
  lateFeesPct?: string;
  chargebacksPct?: string;
  escrowReservesPct?: string;
};

export type FactorFeeTier = {
  from_day: number;
  to_day: number | null;
  fee_rate: number;
};

export type FactorReserveTier = {
  from_day: number;
  to_day: number | null;
  reserve_rate: number;
};

export type FactorProfileForm = {
  advanceRatePct: string;
  feeRatePct: string;
  reserveRatePct: string;
  recourseDays: string;
  telephone: string;
  address: string;
  generalEmail: string;
  primaryContactName: string;
  primaryContactEmail: string;
  accountingContact: string;
  disputesContact: string;
  lateFeesPct: string;
  chargebacksPct: string;
  escrowReservesPct: string;
  /** Aged fee tiers as percent strings (optional; empty = keep flat fee_rate only). */
  fee31To60Pct: string;
  fee61To90Pct: string;
  reserve31To60Pct: string;
  reserve61To90Pct: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function str(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

/** DB stores 0–1 fractions; UI edits percent (0–100). */
export function rateToPctString(rate: number | null | undefined): string {
  if (rate == null || Number.isNaN(Number(rate))) return "";
  return String(Number((Number(rate) * 100).toFixed(4)));
}

export function pctStringToRate(pct: string): number | null {
  const trimmed = pct.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n / 100;
}

export function parseRemittanceDetails(raw: unknown): FactorRemittanceDetails {
  const r = asRecord(raw);
  return {
    telephone: str(r.telephone),
    address: str(r.address),
    generalEmail: str(r.generalEmail ?? r.general_email),
    primaryContactName: str(r.primaryContactName ?? r.primary_contact_name),
    primaryContactEmail: str(r.primaryContactEmail ?? r.primary_contact_email),
    accountingContact: str(r.accountingContact ?? r.accounting_contact),
    disputesContact: str(r.disputesContact ?? r.disputes_contact),
    lateFeesPct: str(r.lateFeesPct ?? r.late_fees_pct),
    chargebacksPct: str(r.chargebacksPct ?? r.chargebacks_pct),
    escrowReservesPct: str(r.escrowReservesPct ?? r.escrow_reserves_pct),
  };
}

function tierFeePct(schedule: unknown, fromDay: number, toDay: number | null): string {
  if (!Array.isArray(schedule)) return "";
  const hit = schedule.find((t) => {
    const row = asRecord(t);
    return Number(row.from_day) === fromDay && (toDay == null ? row.to_day == null : Number(row.to_day) === toDay);
  });
  if (!hit) return "";
  return rateToPctString(Number(asRecord(hit).fee_rate));
}

function tierReservePct(schedule: unknown, fromDay: number, toDay: number | null): string {
  if (!Array.isArray(schedule)) return "";
  const hit = schedule.find((t) => {
    const row = asRecord(t);
    return Number(row.from_day) === fromDay && (toDay == null ? row.to_day == null : Number(row.to_day) === toDay);
  });
  if (!hit) return "";
  return rateToPctString(Number(asRecord(hit).reserve_rate));
}

/** Resolve factoring.factor row for profile panel — prefer canonical profile id from summary KPI. */
export function resolveActiveFactorFromSummary(
  summary:
    | {
        active_factor_profile_id?: string | null;
        active_factor_id?: string | null;
        active_factor_name?: string | null;
      }
    | undefined
    | null,
  factors: Factor[]
): Factor | null {
  if (factors.length === 0) return null;
  const profileId = summary?.active_factor_profile_id?.trim();
  if (profileId) {
    const byProfile = factors.find((factor) => factor.id === profileId);
    if (byProfile) return byProfile;
  }
  const vendorId = summary?.active_factor_id?.trim();
  if (vendorId) {
    const byVendorId = factors.find((factor) => factor.id === vendorId);
    if (byVendorId) return byVendorId;
  }
  const targetName = summary?.active_factor_name?.trim();
  if (targetName) {
    const exact = factors.find((factor) => factor.name === targetName);
    if (exact) return exact;
    const lower = targetName.toLowerCase();
    const fuzzy = factors.find((factor) => factor.name.toLowerCase().includes(lower) || lower.includes(factor.name.toLowerCase()));
    if (fuzzy) return fuzzy;
  }
  const activeFactors = factors.filter((factor) => factor.active);
  return activeFactors[0] ?? null;
}

export function factorToProfileForm(factor: Factor): FactorProfileForm {
  const remit = parseRemittanceDetails(factor.remittance_details);
  return {
    advanceRatePct: rateToPctString(factor.advance_rate),
    feeRatePct: rateToPctString(factor.fee_rate),
    reserveRatePct: rateToPctString(factor.reserve_rate),
    recourseDays: String(factor.recourse_days ?? ""),
    telephone: remit.telephone ?? "",
    address: remit.address ?? "",
    generalEmail: remit.generalEmail ?? "",
    primaryContactName: remit.primaryContactName ?? "",
    primaryContactEmail: remit.primaryContactEmail ?? "",
    accountingContact: remit.accountingContact ?? "",
    disputesContact: remit.disputesContact ?? "",
    lateFeesPct: remit.lateFeesPct ?? "",
    chargebacksPct: remit.chargebacksPct ?? "",
    escrowReservesPct: remit.escrowReservesPct ?? "",
    fee31To60Pct: tierFeePct(factor.fee_schedule, 31, 60),
    fee61To90Pct: tierFeePct(factor.fee_schedule, 61, 90),
    reserve31To60Pct: tierReservePct(factor.reserve_schedule, 31, 60),
    reserve61To90Pct: tierReservePct(factor.reserve_schedule, 61, 90),
  };
}

function buildFeeSchedule(form: FactorProfileForm, baseFeeRate: number): FactorFeeTier[] | null {
  const t31 = pctStringToRate(form.fee31To60Pct);
  const t61 = pctStringToRate(form.fee61To90Pct);
  if (t31 == null && t61 == null) return null;
  const tiers: FactorFeeTier[] = [
    { from_day: 0, to_day: 31, fee_rate: baseFeeRate },
    { from_day: 31, to_day: 61, fee_rate: t31 ?? baseFeeRate },
    { from_day: 61, to_day: 91, fee_rate: t61 ?? t31 ?? baseFeeRate },
    { from_day: 91, to_day: null, fee_rate: t61 ?? t31 ?? baseFeeRate },
  ];
  return tiers;
}

function buildReserveSchedule(form: FactorProfileForm, baseReserveRate: number): FactorReserveTier[] | null {
  const t31 = pctStringToRate(form.reserve31To60Pct);
  const t61 = pctStringToRate(form.reserve61To90Pct);
  if (t31 == null && t61 == null) return null;
  return [
    { from_day: 0, to_day: 31, reserve_rate: baseReserveRate },
    { from_day: 31, to_day: 61, reserve_rate: t31 ?? baseReserveRate },
    { from_day: 61, to_day: 91, reserve_rate: t61 ?? t31 ?? baseReserveRate },
    { from_day: 91, to_day: null, reserve_rate: t61 ?? t31 ?? baseReserveRate },
  ];
}

export function profileFormToFactorPatch(form: FactorProfileForm): {
  advance_rate: number;
  fee_rate: number;
  reserve_rate: number;
  recourse_days: number;
  remittance_details: FactorRemittanceDetails;
  fee_schedule: FactorFeeTier[] | null;
  reserve_schedule: FactorReserveTier[] | null;
} {
  const advance = pctStringToRate(form.advanceRatePct);
  const fee = pctStringToRate(form.feeRatePct);
  const reserve = pctStringToRate(form.reserveRatePct);
  if (advance == null || fee == null || reserve == null) {
    throw new Error("Advance, fee, and reserve rates are required (percent 0–100)");
  }
  const recourse = Number(form.recourseDays);
  if (!Number.isInteger(recourse) || recourse < 1) {
    throw new Error("Recourse days must be a positive integer");
  }
  return {
    advance_rate: advance,
    fee_rate: fee,
    reserve_rate: reserve,
    recourse_days: recourse,
    remittance_details: {
      telephone: form.telephone.trim(),
      address: form.address.trim(),
      generalEmail: form.generalEmail.trim(),
      primaryContactName: form.primaryContactName.trim(),
      primaryContactEmail: form.primaryContactEmail.trim(),
      accountingContact: form.accountingContact.trim(),
      disputesContact: form.disputesContact.trim(),
      lateFeesPct: form.lateFeesPct.trim(),
      chargebacksPct: form.chargebacksPct.trim(),
      escrowReservesPct: form.escrowReservesPct.trim(),
    },
    fee_schedule: buildFeeSchedule(form, fee),
    reserve_schedule: buildReserveSchedule(form, reserve),
  };
}
