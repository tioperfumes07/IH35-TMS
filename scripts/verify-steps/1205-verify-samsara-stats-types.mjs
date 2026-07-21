export default {
  name: "verify:samsara-stats-types",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-stats-types.mjs"]);
  },
};
