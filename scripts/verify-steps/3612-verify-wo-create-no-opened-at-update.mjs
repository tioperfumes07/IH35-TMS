// verify-steps wrapper — LV-WO-CREATE-500-OPENED-AT · claim 3612
export default {
  name: "verify-wo-create-no-opened-at-update",
  run(ctx) {
    ctx.run("node", ["scripts/verify-wo-create-no-opened-at-update.mjs"]);
  },
};
