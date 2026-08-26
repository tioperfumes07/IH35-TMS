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
    ctx.run("node", ["scripts/verify-identity-user-password-setup-delivery-durable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-identity-user-password-setup-delivery-durable.mjs"]);
    ctx.run("node", ["scripts/verify-onboarding-team-invite-delivery-durable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-onboarding-team-invite-delivery-durable.mjs"]);
    ctx.run("node", ["scripts/verify-identity-password-reset-delivery-durable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-identity-password-reset-delivery-durable.mjs"]);
    ctx.run("node", ["scripts/verify-legal-attorney-decision-delivery-durable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-legal-attorney-decision-delivery-durable.mjs"]);
    ctx.run("node", ["scripts/verify-legal-contract-sign-delivery-atomic.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-legal-contract-sign-delivery-atomic.mjs"]);
    ctx.run("node", ["scripts/verify-launch-toggle-notification-scope.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-launch-toggle-notification-scope.mjs"]);
    ctx.run("node", ["scripts/verify-launch-toggle-action-snapshot.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-launch-toggle-action-snapshot.mjs"]);
  },
};
