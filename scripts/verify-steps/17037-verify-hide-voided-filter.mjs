export default {
  name: "verify:hide-voided-filter",
  run(ctx) {
    ctx.run("node", ["scripts/verify-hide-voided-filter.mjs"]);
  },
};
