export default {
  name: "verify:1099-recipient-shared-driver-identity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-1099-recipient-shared-driver-identity.mjs"]);
  },
};
