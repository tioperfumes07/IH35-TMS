export default {
  name: "verify:maintenance-decision-log-wo-event-prefix",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-decision-log-wo-event-prefix.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-maintenance-decision-log-wo-event-prefix.mjs"]);
  },
};
