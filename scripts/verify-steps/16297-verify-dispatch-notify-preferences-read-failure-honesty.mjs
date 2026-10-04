export default {
  name: "verify:dispatch-notify-preferences-read-failure-honesty",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-notify-preferences-read-failure-honesty.mjs"]);
  },
};
