export default {
  name: "verify:pm-schedule-generate-active-unit",
  run(ctx) {
    ctx.run("node", ["scripts/verify-pm-schedule-generate-active-unit.mjs"]);
  },
};
