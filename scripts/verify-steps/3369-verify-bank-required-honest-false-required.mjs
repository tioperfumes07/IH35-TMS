// LINK-F5190 — bank Required-column honesty audit, false-required batch (banking + accounting
// + cash-flow + factoring + form_425 + home + system).
// (verify-step 3369 — CC-1 band, claimed in commit 07d7d4e4f "FINDING: claim verify-steps
// 3369, 3373 (cc-1 band)").
export default {
  name: "bank-required-honest-false-required",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-required-honest-false-required.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-bank-required-honest-false-required.mjs"]);
  },
};
