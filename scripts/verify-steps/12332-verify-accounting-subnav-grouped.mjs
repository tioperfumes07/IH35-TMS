export default {
  name: "verify:accounting-subnav-grouped",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-subnav-grouped.mjs"]);
  },
};
