// 443.99 C lane 3 — four guards landed without a CI caller (verify-wiring-law-guard-registry-batch: "unaccounted guard
// census 4 exceeds 3"): 443.86 #1 deadhead, 443.86 #2 zip-center stops, R443.54-7 related-party bank pair + relay fill.
// Each runs its --selftest and its real check.
const GUARDS = [
  "scripts/verify-deadhead-where-previous-load.mjs",
  "scripts/verify-zip-center-stops-resolved-by-gps.mjs",
  "scripts/verify-related-party-bank-pair-suggestions.mjs",
  "scripts/verify-relay-fill-not-a-bank-match-candidate.mjs",
];

export default {
  name: "verify:orphan-guards-443-86-443-54",
  run(ctx) {
    for (const g of GUARDS) {
      ctx.run("node", [g, "--selftest"]);
      ctx.run("node", [g]);
    }
  },
};
