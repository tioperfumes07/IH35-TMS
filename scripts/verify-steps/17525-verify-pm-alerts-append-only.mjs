export default {
  name: "verify:pm-alerts-append-only",
  run(ctx) {
    ctx.run("node", ["scripts/verify-pm-alerts-append-only.mjs"]);
  },
};
