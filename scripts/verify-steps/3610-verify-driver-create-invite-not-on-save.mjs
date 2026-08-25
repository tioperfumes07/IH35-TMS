// verify-steps wrapper — LV-DRIVER-CREATE-AUTO-SENDS-WHATSAPP-INVITE · claim 3610
export default {
  name: "verify-driver-create-invite-not-on-save",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-create-invite-not-on-save.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-create-invite-not-on-save.mjs"]);
    ctx.run("node", ["scripts/verify-work-order-approval-email-durability.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-work-order-approval-email-durability.mjs"]);
    ctx.run("node", ["scripts/verify-auth-email-verification-delivery-durable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-auth-email-verification-delivery-durable.mjs"]);
  },
};
