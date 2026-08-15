// LINK-F5187 — liability Required-column honesty audit, cluster B
// (fleet/finance/insurance/cash-flow/accounting/legal/reports).
// (verify-step 3349 — CC-1 band, claimed in commit d649a4eb3 "FINDING: claim
// verify-step 3349 (cc-1 band)").
export default {
  name: "liability-required-honest-cluster-b",
  run(ctx) {
    ctx.run("node", ["scripts/verify-liability-required-honest-cluster-b.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-liability-required-honest-cluster-b.mjs"]);
  },
};
