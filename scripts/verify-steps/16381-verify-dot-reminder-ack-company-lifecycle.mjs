export default {
  name: "verify:dot-reminder-ack-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dot-reminder-ack-company-lifecycle.mjs"]);
  },
};
