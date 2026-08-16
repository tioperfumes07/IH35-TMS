// verify-steps wrapper — LV-WO-DISPLAY-ID-V5-IS-HARDCODED-PEND0 · claim 3622
export default {
  name: "verify-wo-create-refreshes-v5",
  run(ctx) {
    ctx.run("node", ["scripts/verify-wo-create-refreshes-v5.mjs"]);
  },
};
