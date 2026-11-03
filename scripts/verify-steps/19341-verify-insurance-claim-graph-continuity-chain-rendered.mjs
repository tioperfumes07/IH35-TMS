export default {
  name: "verify:insurance-claim-graph-continuity-chain-rendered",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-claim-graph-continuity-chain-rendered.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-insurance-claim-graph-continuity-chain-rendered.mjs"]);
  },
};
