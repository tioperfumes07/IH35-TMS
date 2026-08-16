// verify-steps wrapper for scripts/verify-load-stops-save-wired.mjs (LV-STOPS-NOSAVE · claim 3604)
export default {
  name: "verify-load-stops-save-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-stops-save-wired.mjs"]);
  },
};
