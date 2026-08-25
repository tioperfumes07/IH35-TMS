export default {
  name: "verify-outbox-handler-parity",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:outbox-handler-parity"]) !== 0) {
      process.exit(1);
    }
    if (ctx.run("node", ["scripts/verify-shipper-milestone-email-durability.mjs"]) !== 0) {
      process.exit(1);
    }
    if (ctx.run("node", ["scripts/verify-shipper-portal-password-reset-durability.mjs"]) !== 0) {
      process.exit(1);
    }
    if (ctx.run("node", ["scripts/verify-engine-fault-notification-durability.mjs"]) !== 0) {
      process.exit(1);
    }
  },
};
