/**
 * ROW 203 (live 11-03, rows 13563 / 13544 / Fuel question 13689) — what a Settlement/Tour cell says when the load
 * has NO settlement. A bare "—" told the owner nothing: it could mean "not linked yet", "salaried, none expected"
 * or "a driver bill is waiting". The board API now sends the facts (load-costs-board.routes.ts: salaried_load,
 * unsettled_driver_bill_id / _number) and every no-settlement cell renders one of these words.
 *
 * Measured 11-03 on prod (USMCA): 13544 and 13563 (Rafael, local yard moves 08-24 / 09-01) sit on no settlement and
 * on none of Rafael's three settlements (5780 08-18..08-21, 5816 09-10..09-11, 5856 10-21..10-24); each still carries
 * one OPEN, unsettled driver bill (bill 13544 $3.46, bill 13563 $3.24). So the honest cell is "Not settled · bill 13544"
 * linking to that bill -- never a dash, never a settlement number that does not exist.
 */
export type NoSettlementFacts = {
  /** The load carries the 0-rate "Salaried …" pay override (weekly salary on the settlement, no per-load pay). */
  salaried_load?: boolean | null;
  /** The newest live driver bill on the load that is not on any settlement. */
  unsettled_driver_bill_id?: string | null;
  unsettled_driver_bill_number?: string | null;
};

export function noSettlementLabel(f: NoSettlementFacts): string {
  if (f.unsettled_driver_bill_id) {
    return f.unsettled_driver_bill_number ? `Not settled · bill ${f.unsettled_driver_bill_number}` : "Not settled · driver bill";
  }
  if (f.salaried_load) return "Salaried · no settlement";
  return "No settlement";
}

/** Fuel questions: the live settlement number when the question's load has one; words when it does not. */
export function fuelQuestionSettlementLabel(r: {
  proposed_settlement_ref: string | null;
  proposed_load_id: string | null;
  answered_load_id?: string | null;
}): string {
  if (r.proposed_settlement_ref) return r.proposed_settlement_ref;
  return r.proposed_load_id || r.answered_load_id ? "Not settled" : "No load";
}
