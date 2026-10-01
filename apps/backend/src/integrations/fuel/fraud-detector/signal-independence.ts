/**
 * ROUND 306 E-21 — the fraud detector never flags a fuel purchase on one signal.
 *
 * Owner's standard: two independent signals agreeing is a FINDING; one alone is a SUSPICION.
 * Independence is decided by the evidence each rule reads, not by the rule's name: the GPS-mismatch
 * and inactive-truck rules both read the truck's own GPS, so together they are still one signal.
 *
 * A suspicion is still recorded (severity capped at 'warn') so a reviewer can see it, but it never
 * reaches dispatchCriticalFuelFraudAlerts. Only a finding may carry its rule's own severity.
 *
 * Pump-time rules are skipped for a date-only fuel row (no time of day in its source): asking
 * "where was the truck at 00:00:00" of a row whose source never had a time manufactures evidence.
 */
import type { RuleMatch } from "./rules.service.js";

export const RULE_SOURCES: Record<string, string[]> = {
  RULE_GPS_MISMATCH: ["unit_gps_positions"],
  RULE_INACTIVE_TRUCK: ["unit_gps_positions"],
  RULE_TANK_OVERFLOW: ["card_gallons", "unit_tank_capacity"],
  RULE_OFF_DUTY: ["hos_duty_status"],
  RULE_RAPID_MULTI: ["other_card_transactions"],
};

/** Rules that ask where/what the truck or driver was doing at the pump's time of day. */
export const PUMP_TIME_RULES = new Set(["RULE_GPS_MISMATCH", "RULE_INACTIVE_TRUCK", "RULE_OFF_DUTY", "RULE_RAPID_MULTI"]);

export type FraudClassification = {
  classification: "finding" | "suspicion" | "none";
  basis: string;
  /** Matches to record, each with the classification stamped into its evidence. */
  matches: RuleMatch[];
  skipped_rules: string[];
};

export function classifyFraudMatches(matches: RuleMatch[], opts: { dateOnly: boolean }): FraudClassification {
  const skipped: string[] = [];
  const kept = matches.filter((m) => {
    if (opts.dateOnly && PUMP_TIME_RULES.has(m.rule_id)) {
      skipped.push(m.rule_id);
      return false;
    }
    return true;
  });
  if (kept.length === 0) {
    return { classification: "none", basis: skipped.length ? `only pump-time rules matched on a date-only row (${skipped.join(", ")}) — skipped` : "no rule matched", matches: [], skipped_rules: skipped };
  }

  let pair: [RuleMatch, RuleMatch] | null = null;
  for (let i = 0; i < kept.length && !pair; i++) {
    for (let j = i + 1; j < kept.length; j++) {
      const a = RULE_SOURCES[kept[i].rule_id] ?? [kept[i].rule_id];
      const b = RULE_SOURCES[kept[j].rule_id] ?? [kept[j].rule_id];
      if (!a.some((s) => b.includes(s))) {
        pair = [kept[i], kept[j]];
        break;
      }
    }
  }

  const classification = pair ? "finding" : "suspicion";
  const basis = pair
    ? `${pair[0].rule_id} and ${pair[1].rule_id} agree from independent sources`
    : kept.length === 1
      ? `only ${kept[0].rule_id} matched — one signal is a suspicion`
      : `${kept.map((m) => m.rule_id).join(", ")} matched but share evidence — still one signal`;

  const stamped = kept.map((m) => ({
    ...m,
    severity: classification === "finding" ? m.severity : m.severity === "critical" ? "warn" : m.severity,
    evidence: {
      ...m.evidence,
      classification,
      classification_basis: basis,
      signal_sources: RULE_SOURCES[m.rule_id] ?? [m.rule_id],
      rules_matched_on_this_purchase: kept.map((k) => k.rule_id),
      rules_skipped_date_only: skipped,
    },
  })) as RuleMatch[];

  return { classification, basis, matches: stamped, skipped_rules: skipped };
}
