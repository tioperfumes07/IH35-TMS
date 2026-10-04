export default {
  name: "verify:cash-flow-projection-snapshot-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-flow-projection-snapshot-wired.mjs"]);
  },
};
