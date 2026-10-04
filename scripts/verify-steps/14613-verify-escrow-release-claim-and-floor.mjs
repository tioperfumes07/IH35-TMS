// Lead ruling 2026-10-04: driver escrow over-release (2100-00-027 / -002 / -004). A release names its claim, a repeat is a
// no-op, and neither the account nor the settlement's own held amount may go below zero — refused by the engine, not
// only by the commit-time trigger.
export default {
  name: "verify:escrow-release-claim-and-floor",
  run(ctx) {
    ctx.run("node", ["scripts/verify-escrow-release-claim-and-floor.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-escrow-release-claim-and-floor.mjs"]);
  },
};
