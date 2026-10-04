export default {
  name: "verify:pm-writers-exclude-sample-units",
  run(ctx) {
    ctx.run("node", ["scripts/verify-pm-writers-exclude-sample-units.mjs"]);
  },
};
