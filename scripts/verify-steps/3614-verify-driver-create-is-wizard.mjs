// verify-steps wrapper — LV-DRIVER-CREATE-IS-NOT-A-WIZARD · claim 3614
export default {
  name: "verify-driver-create-is-wizard",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-create-is-wizard.mjs"]);
  },
};
