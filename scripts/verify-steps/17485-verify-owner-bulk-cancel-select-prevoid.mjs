export default {
  name: "verify:owner-bulk-cancel-select-prevoid",
  run(ctx) {
    ctx.run("node", ["scripts/verify-owner-bulk-cancel-select-prevoid.mjs"]);
  },
};
