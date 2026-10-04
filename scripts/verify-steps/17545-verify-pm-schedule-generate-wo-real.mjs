export default {
  name: "verify:pm-schedule-generate-wo-real",
  run(ctx) {
    ctx.run("node", ["scripts/verify-pm-schedule-generate-wo-real.mjs"]);
  },
};
