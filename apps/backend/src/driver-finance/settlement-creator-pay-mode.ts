import type { SettlementCreatorDraft, SettlementCreatorLoadBlock } from "./settlement-creator.types.js";
import { SettlementCreatorError } from "./settlement-creator-error.js";

/** Explicit per-load wages, never inferred from zero document miles or a driver's rate card. */
export function creatorAdditionalOnlyPay(draft: SettlementCreatorDraft, load: SettlementCreatorLoadBlock) {
  if (load.driver_pay_mode !== "additional_pay_only") return null;
  if (draft.salaried || Number(load.line_haul_rate_cents ?? 0) !== 0 || Number(load.empty_rate_cents ?? 0) !== 0) {
    throw new SettlementCreatorError("additional_only_mileage_conflict", `Load ${load.load_number}: additional-pay-only cannot also carry mileage rates or a weekly salary.`);
  }
  const lines = (draft.additional_pay ?? []).filter(p => (p.load_number?.trim() || (draft.loads.length === 1 ? draft.loads[0]!.load_number : "")) === load.load_number);
  if (!lines.length || lines.some(p => !p.item_id || !Number.isSafeInteger(p.amount_cents) || p.amount_cents <= 0)) {
    throw new SettlementCreatorError("additional_only_itemized_pay_required", `Load ${load.load_number}: additional-pay-only requires positive, itemized pay assigned to this load.`);
  }
  if (lines.length !== 1) throw new SettlementCreatorError("additional_only_one_item_required", `Load ${load.load_number}: additional-pay-only currently requires one itemized flat pay line.`);
  const amountCents = lines.reduce((n, p) => n + p.amount_cents, 0);
  if (!Number.isSafeInteger(amountCents)) throw new SettlementCreatorError("additional_only_amount_invalid", "Additional pay total is outside supported cents.");
  return { mode: "additional_pay_only" as const, amount_cents: amountCents,
    lines: lines.map(p => ({ item_id: p.item_id!, amount_cents: p.amount_cents, description: p.description || `${p.pay_kind ?? "other"} pay` })),
    reason: `Signed settlement ${draft.settlement_no}: itemized additional pay only, no mileage wages` };
}
