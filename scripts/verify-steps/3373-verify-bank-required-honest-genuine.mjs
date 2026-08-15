// LINK-F5190 — bank Required-column honesty audit, genuine-gap batch (banking).
// (verify-step 3373 — CC-1 band, claimed in commit 07d7d4e4f "FINDING: claim verify-steps
// 3369, 3373 (cc-1 band)").
export default {
  name: "bank-required-honest-genuine",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-required-honest-genuine.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-bank-required-honest-genuine.mjs"]);
  },
};
