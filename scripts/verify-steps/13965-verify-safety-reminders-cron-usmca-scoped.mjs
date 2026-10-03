export default {
  name: "verify:safety-reminders-cron-usmca-scoped",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-reminders-cron-usmca-scoped.mjs"]);
  },
};
