// Rule 17 — BANK-F08 deep-wizard DoD structural guard (verify-steps only).
export default {
  name: "bank-f08-categorization-rules-automatch",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-bank-f08-categorization-rules-automatch.mjs", "--selftest"]) !== 0) {
      return 1;
    }
    if (ctx.run("node", ["scripts/verify-bank-f08-categorization-rules-automatch.mjs"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
