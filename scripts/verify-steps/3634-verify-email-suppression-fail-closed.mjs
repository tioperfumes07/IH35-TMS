// verify-steps wrapper — LV-EMAIL-SUPPRESSION-FAILS-OPEN · claim 3634
export default {
  name: "verify-email-suppression-fail-closed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-email-suppression-fail-closed.mjs"]);
  },
};
