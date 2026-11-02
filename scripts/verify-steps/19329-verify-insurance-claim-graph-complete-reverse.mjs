export default {
  name: "verify:insurance-claim-graph-complete-reverse",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-claim-graph-complete-reverse.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-insurance-claim-graph-complete-reverse.mjs"]);
  },
};
