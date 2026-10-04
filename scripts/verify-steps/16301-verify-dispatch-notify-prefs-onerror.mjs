export default {
  name: "verify:dispatch-notify-prefs-onerror",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-notify-prefs-onerror.mjs"]);
  },
};
