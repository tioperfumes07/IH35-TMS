export default {
  name: "verify:pm-due-live-odometer",
  run(ctx) {
    ctx.run("node", ["scripts/verify-pm-due-live-odometer.mjs"]);
  },
};
