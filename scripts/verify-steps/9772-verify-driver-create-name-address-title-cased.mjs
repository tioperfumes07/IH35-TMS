export default {
  name: "verify-driver-create-name-address-title-cased",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-driver-create-name-address-title-cased.mjs"]) !== 0) {
      throw new Error("verify-driver-create-name-address-title-cased failed");
    }
  },
};
