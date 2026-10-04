export default {
  name: "verify:dispatch-inline-claim-human-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-inline-claim-human-labels.mjs"]);
  },
};
