export default {
  name: "verify:bill-lines-account-id-required",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bill-lines-account-id-required.mjs"]);
  },
};
