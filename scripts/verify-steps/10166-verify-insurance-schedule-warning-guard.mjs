export default {
  name: "verify:insurance-schedule-warning-guard",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-schedule-warning-guard.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-insurance-schedule-warning-guard.mjs"]);
  },
};
