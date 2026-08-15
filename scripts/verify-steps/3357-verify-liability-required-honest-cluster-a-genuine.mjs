// LINK-F5187 — liability Required-column honesty audit, cluster A genuine-gap batch
// (settlements/safety/factoring, CC-1's own core money lane).
// (verify-step 3357 — CC-1 band, claimed in commit 51b2041de "FINDING: claim verify-step
// 3357 (cc-1 band)" #6983).
export default {
  name: "liability-required-honest-cluster-a-genuine",
  run(ctx) {
    ctx.run("node", ["scripts/verify-liability-required-honest-cluster-a-genuine.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-liability-required-honest-cluster-a-genuine.mjs"]);
  },
};
