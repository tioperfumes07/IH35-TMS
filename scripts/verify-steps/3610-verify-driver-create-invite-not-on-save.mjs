// verify-steps wrapper — LV-DRIVER-CREATE-AUTO-SENDS-WHATSAPP-INVITE · claim 3610
export default {
  name: "verify-driver-create-invite-not-on-save",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-create-invite-not-on-save.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-create-invite-not-on-save.mjs"]);
  },
};
