export default {
  name: "verify:pm-due-engine-no-fleet-average-no-samsara-call",
  run(ctx) {
    ctx.run("node", ["scripts/verify-pm-due-engine-no-fleet-average-no-samsara-call.mjs"]);
  },
};
