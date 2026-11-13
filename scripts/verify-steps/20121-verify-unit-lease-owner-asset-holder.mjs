export default {
  name: "verify:unit-lease-owner-asset-holder",
  run(ctx) {
    ctx.run("node", ["scripts/verify-unit-lease-owner-asset-holder.mjs"]);
    ctx.run("node", ["scripts/verify-unit-lease-owner-asset-holder.mjs", "--selftest"]);
  },
};
