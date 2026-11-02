export default {
  name: "verify:period-and-date-guard",
  run(ctx) {
    ctx.run("node", ["scripts/verify-period-and-date-guard.mjs"]);
  },
};
