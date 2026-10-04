export default {
  name: "verify:returning-dispatcher-exact-history-counts",
  run(ctx) {
    ctx.run("node", ["scripts/verify-returning-dispatcher-exact-history-counts.mjs"]);
  },
};
