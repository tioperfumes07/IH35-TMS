export default {
  name: "verify:samsara-driver-messaging-flag-off-one-store",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-driver-messaging-flag-off-one-store.mjs"]);
  },
};
