// LINK-F5187 — liability Required-column honesty audit, cluster A false-required batch
// (settlements/safety/factoring, CC-1's own core money lane).
// (verify-step 3353 — CC-1 band, claimed in commit c20540035 "FINDING: claim verify-step
// 3353 (cc-1 band)" #6975).
export default {
  name: "liability-required-honest-cluster-a-false-required",
  run(ctx) {
    ctx.run("node", ["scripts/verify-liability-required-honest-cluster-a-false-required.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-liability-required-honest-cluster-a-false-required.mjs"]);
  },
};
